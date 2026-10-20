import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { mailClient, googleCall, header } from '@/lib/google';
import { ingestDocument } from '@/lib/documents';
import { extractDocumentText } from '@/lib/extract';
import { autoProvider, chat, extractJson } from '@/lib/providers';
export const runtime = 'nodejs';
export const maxDuration = 120;

const CATS = ['agreement', 'mou', 'contract', 'correspondence', 'financial', 'planning', 'marketing', 'design', 'due_diligence', 'report', 'template', 'board_minutes'];
const MAX = 25 * 1024 * 1024;

/** Quick guess from the file name when no AI is available. */
function guess(name: string, mime: string): string {
  const n = name.toLowerCase();
  if (/invoice|receipt|statement|quote|budget|payroll|remittance|tax/.test(n)) return 'financial';
  if (/\bmou\b|memorandum/.test(n)) return 'mou';
  if (/contract|deed|lease/.test(n)) return 'contract';
  if (/agreement|nda/.test(n)) return 'agreement';
  if (/minutes|board/.test(n)) return 'board_minutes';
  if (/report|survey|valuation/.test(n)) return 'report';
  if (/plan|schedule|program|timeline/.test(n)) return 'planning';
  if (/logo|brand|design|drawing|render|artwork|\.dwg|\.psd|\.ai$/.test(n) || /^image\//.test(mime)) return 'design';
  if (/brochure|flyer|campaign|marketing/.test(n)) return 'marketing';
  return 'correspondence';
}
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * POST { action: 'suggest' | 'save', items: [{ id, filename, mimeType, project_id?, category? }] }
 * suggest → a one-line summary + suggested category and project for each attachment (nothing is stored).
 * save    → stores the attachments in Documents (read and searchable), once each.
 */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const b = await body(req);
  const action = b.action === 'save' ? 'save' : 'suggest';
  const items: any[] = (Array.isArray(b.items) ? b.items : []).filter((x: any) => x?.id && x?.filename).slice(0, 15);
  if (!items.length) throw new HttpError(400, 'No attachments to read.');
  const { auth, provider } = await mailClient(actor.id);
  const gmail = google.gmail({ version: 'v1', auth });
  const db = getSupabaseAdmin();
  const meta = (await googleCall(provider, () => gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }))).data;
  const from = header(meta.payload?.headers, 'From'), subject = header(meta.payload?.headers, 'Subject');
  const fetchBytes = async (aid: string) => {
    const a = (await googleCall(provider, () => gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: aid }))).data;
    return Buffer.from(String(a.data || ''), 'base64url');
  };
  const { data: projs } = await db.from('projects').select('id,name').order('updated_at', { ascending: false }).limit(200);
  const projects = projs || [];

  if (action === 'suggest') {
    const rows: any[] = []; const forAi: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; const mime = String(it.mimeType || 'application/octet-stream');
      const row: any = { id: it.id, filename: it.filename, mimeType: mime, size: Number(it.size) || 0, summary: '', category: guess(it.filename, mime), project_id: null, saved: false };
      try {
        const { data: dup } = await db.from('documents').select('id').eq('source', 'email').eq('external_id', `${id}:${it.id}`.slice(0, 300)).maybeSingle();
        if (dup) row.saved = true;
        const bytes = await fetchBytes(it.id);
        row.size = bytes.length;
        if (bytes.length > MAX) row.summary = `Large file (${kb(bytes.length)}) – too big to read here.`;
        else {
          const ex = await extractDocumentText(bytes, mime, it.filename).catch(() => null);
          const text = (ex?.text || '').replace(/\s+/g, ' ').trim().slice(0, 2500);
          row.excerpt = text;
          if (!text) row.summary = `${mime.split('/')[1] || 'File'} · ${kb(bytes.length)}${/^image\//.test(mime) ? ' · photo/picture (read on save)' : ''}`;
          forAi.push({ i, name: it.filename, text });
        }
      } catch (e: any) { row.summary = 'Could not read this file.'; }
      const hit = projects.find((p: any) => p.name && (subject + ' ' + it.filename).toLowerCase().includes(String(p.name).toLowerCase()));
      if (hit) row.project_id = hit.id;
      rows.push(row);
    }
    const prov = forAi.length ? await autoProvider().catch(() => null) : null;
    if (prov) {
      try {
        const raw = await chat(prov, {
          system: 'You file email attachments for a property development company. Reply with JSON only.',
          maxTokens: 1500, timeoutMs: 60_000,
          messages: [{ role: 'user', content: `Email subject: ${subject}\nFrom: ${from}\n\nProjects: ${JSON.stringify(projects.slice(0, 60).map((p: any) => ({ id: p.id, name: p.name })))}\nCategories: ${CATS.join(', ')}\n\nAttachments:\n${forAi.map(f => `#${f.i} ${f.name}\n${f.text || '(no readable text)'}`).join('\n---\n')}\n\nReturn {"items":[{"i":number,"summary":"one plain sentence (max 25 words) saying what the file is","category":"one of the categories","project_id":"id from Projects or null"}]}` }],
        });
        const j = extractJson<{ items: any[] }>(raw);
        for (const r of j?.items || []) {
          const row = rows[Number(r.i)]; if (!row) continue;
          if (r.summary) row.summary = String(r.summary).slice(0, 220);
          if (CATS.includes(r.category)) row.category = r.category;
          if (r.project_id && projects.some((p: any) => p.id === r.project_id)) row.project_id = r.project_id;
        }
      } catch { /* the quick guesses stay */ }
    }
    for (const r of rows) { if (!r.summary) r.summary = `${r.mimeType.split('/')[1] || 'File'} · ${kb(r.size)}`; delete r.excerpt; }
    return ok({ items: rows, ai: !!prov });
  }

  // save
  const saved: any[] = []; const skipped: string[] = [];
  for (const it of items) {
    const key = `${id}:${it.id}`.slice(0, 300);
    const { data: dup } = await db.from('documents').select('id').eq('source', 'email').eq('external_id', key).maybeSingle();
    if (dup) { skipped.push(it.filename); continue; }
    const bytes = await fetchBytes(it.id);
    if (!bytes.length || bytes.length > MAX) { skipped.push(it.filename); continue; }
    const category = CATS.includes(it.category) ? it.category : null;
    const projectId = projects.some((p: any) => p.id === it.project_id) ? it.project_id : null;
    const r = await ingestDocument({
      bytes, name: it.filename, mimeType: String(it.mimeType || 'application/octet-stream'), projectId, source: 'email', externalId: key,
      category, actorId: actor.id, authority: 'draft', extraMeta: { gmail_message_id: id, email_from: from.slice(0, 300), email_subject: subject.slice(0, 300), summary: it.summary ? String(it.summary).slice(0, 300) : undefined },
    });
    saved.push({ id: it.id, document_id: r.document.id, status: r.extraction.status });
  }
  await writeAudit({ actorId: actor.id, action: 'email.attachments.filed', entityType: 'document', metadata: { message: id, saved: saved.length, skipped: skipped.length } });
  return ok({ saved, skipped });
});
