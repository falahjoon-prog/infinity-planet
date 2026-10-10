/**
 * Company records: the business's own constitution, trust deeds, unitholders'/securityholders' agreements,
 * company extracts and structure — filed as APPROVED documents, plus a "company profile" (who's who,
 * ownership, governance, approvals, signing) that Infinity AI and Legal AI follow.
 *
 * Loading: put the files in the app folder's "company-records" sub-folder with a manifest.json
 * (and profile.json / profile.md), then Legal AI → Company records → "Load company records".
 */
import { promises as fs } from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';
import { ingestDocument, replaceChunks } from './documents';

export const FOLDER = path.join(process.cwd(), 'company-records');
export type ManifestItem = { file: string; name: string; kind: 'company_record' | 'agreement' | 'reference' | 'stamp'; category?: string; ocr?: string; note?: string; superseded?: boolean; owner_match?: string };
export type CompanyProfile = { json: any; summary_md: string; sources: string[]; updated_at: string };

export async function getProfile(): Promise<CompanyProfile | null> {
  const v = await getSetting<CompanyProfile>('company_profile').catch(() => null);
  return v && v.json ? v : null;
}

const MIME: Record<string, string> = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.txt': 'text/plain', '.md': 'text/markdown', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

/** What is in the folder, and which of it is already loaded. */
export async function folderStatus() {
  let manifest: ManifestItem[] = [];
  try { manifest = JSON.parse(await fs.readFile(path.join(FOLDER, 'manifest.json'), 'utf8')).files || []; } catch { return { available: false, files: [] as any[] }; }
  const db = getSupabaseAdmin();
  const { data } = await db.from('documents').select('id,name,metadata').eq('source', 'company_records');
  const loaded = new Map((data || []).map((d: any) => [d.metadata?.record_file, d.id]));
  const placed = ((await getSetting<string[]>('company_records_stamps').catch(() => null)) || []);
  return { available: true, files: manifest.map(m => ({ ...m, loaded: m.kind === 'stamp' ? placed.includes(m.file) : loaded.has(m.file), document_id: loaded.get(m.file) || null })) };
}

/** Loads the folder: files into Documents (approved, indexed — scanned ones with their read text), and the profile. */
export async function loadFolder(actorId: string) {
  const st = await folderStatus(); if (!st.available) throw new Error('No company-records folder with a manifest was found in the app folder.');
  const db = getSupabaseAdmin(); const results: { name: string; status: string }[] = [];
  for (const m of st.files) {
    if (m.kind === 'stamp') { results.push({ name: m.name, status: await placeStamp(m).catch((e: any) => `failed: ${e?.message || e}`) }); continue; }
    try {
      const bytes = await fs.readFile(path.join(FOLDER, m.file));
      const ext = path.extname(m.file).toLowerCase();
      const r = await ingestDocument({ bytes, name: m.name, mimeType: MIME[ext] || 'application/octet-stream', source: 'company_records', externalId: `record:${m.file}`, authority: m.kind === 'company_record' && !m.superseded ? 'approved' : m.kind === 'agreement' ? 'draft' : 'historical_precedent', category: m.category || (m.kind === 'company_record' ? 'corporate' : null), actorId, existingId: m.document_id || null, extraMeta: { record_file: m.file, company_record: m.kind === 'company_record', record_note: m.note || null, superseded: !!m.superseded } });
      // Scanned documents: use the text already read from the page images (OCR) when the file itself has none
      if (m.ocr && (!r.document.content_text || r.extraction.needsOcr)) {
        const text = (await fs.readFile(path.join(FOLDER, m.ocr), 'utf8')).replace(/=== PAGE END [^\n]*\n?/g, '\n').slice(0, 500_000);
        await db.from('documents').update({ content_text: text, status: 'indexed', metadata: { ...(r.document.metadata || {}), extraction: 'ocr-tesseract (pre-read)', ocr: { status: 'done', method: 'tesseract' } } }).eq('id', r.document.id);
        await replaceChunks(r.document.id, r.document.project_id, text, 'ocr-tesseract');
      }
      results.push({ name: m.name, status: m.document_id ? 'updated' : 'added' });
    } catch (e: any) { results.push({ name: m.name, status: `failed: ${String(e?.message || e).slice(0, 120)}` }); }
  }
  // the profile (who's who, ownership, governance) — also filed as a readable document
  let profile: CompanyProfile | null = null;
  try {
    const json = JSON.parse(await fs.readFile(path.join(FOLDER, 'profile.json'), 'utf8'));
    const md = await fs.readFile(path.join(FOLDER, 'profile.md'), 'utf8').catch(() => '');
    profile = { json, summary_md: md, sources: st.files.filter(f => f.kind === 'company_record').map(f => f.name), updated_at: new Date().toISOString() };
    await db.from('app_settings').upsert({ key: 'company_profile', value: profile, updated_by: actorId, updated_at: profile.updated_at });
    if (md) {
      const { data: ex } = await db.from('documents').select('id').eq('source', 'company_records').eq('external_id', 'record:profile.md').maybeSingle();
      await ingestDocument({ bytes: Buffer.from(md, 'utf8'), name: 'Company profile — summary of RHC company records.md', mimeType: 'text/markdown', source: 'company_records', externalId: 'record:profile.md', authority: 'approved', category: 'corporate', actorId, existingId: ex?.id || null, extraMeta: { record_file: 'profile.md', company_record: true } });
    }
  } catch { /* profile is optional */ }
  return { results, profile: !!profile };
}

const cut = (s: any, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
/** The block every AI prompt gets: the business's entities, ownership, governance and signing rules. */
export async function companyBlock(maxChars = 9000): Promise<string> {
  const p = await getProfile(); if (!p) return '';
  const j = p.json || {}; const out: string[] = [];
  if (Array.isArray(j.entities)) out.push(`Entities:\n${j.entities.slice(0, 14).map((e: any) => `- ${e.name}${e.acn ? ` (ACN ${e.acn})` : ''}${e.abn ? ` ABN ${e.abn}` : ''} — ${cut(e.role || e.type, 140)}${e.officeholders?.length ? `; officeholders: ${e.officeholders.map((o: any) => `${o.name} (${o.office})`).join(', ')}` : ''}`).join('\n')}`);
  if (Array.isArray(j.trusts)) out.push(`Trusts:\n${j.trusts.slice(0, 8).map((t: any) => `- ${t.name} (${t.type || 'trust'}), trustee ${t.trustee || '?'}${t.unitholders?.length ? `; unitholders: ${t.unitholders.map((u: any) => `${u.name}${u.units ? ` ${u.units}` : ''}${u.percent ? ` (${u.percent})` : ''}`).join(', ')}` : ''}`).join('\n')}`);
  if (Array.isArray(j.signing_authority)) out.push(`Signing documents:\n${j.signing_authority.slice(0, 8).map((s: any) => `- ${s.entity}: ${cut(s.rule, 220)} [${cut(s.source, 60)}]`).join('\n')}`);
  if (Array.isArray(j.reserved_matters)) out.push(`Decisions that need special approval:\n${j.reserved_matters.slice(0, 24).map((r: any) => `- ${cut(r.matter, 140)} → ${cut(r.approval_needed, 120)} [${cut(r.source, 60)}]`).join('\n')}`);
  if (Array.isArray(j.governance)) out.push(`Governance rules:\n${j.governance.slice(0, 30).map((g: any) => `- ${g.topic}${g.applies_to ? ` (${cut(g.applies_to, 60)})` : ''}: ${cut(g.rule, 230)} [${cut(g.source, 60)}]`).join('\n')}`);
  if (Array.isArray(j.uncertain) && j.uncertain.length) out.push(`Open points / conflicts to flag (do not treat as settled):\n${j.uncertain.slice(0, 10).map((u: any) => `- ${cut(typeof u === 'string' ? u : JSON.stringify(u), 200)}`).join('\n')}`);
  let txt = out.join('\n\n'); if (txt.length > maxChars) txt = `${txt.slice(0, maxChars)}…`;
  return `OUR COMPANY RECORDS (approved; from ${p.sources.length} documents — constitution, trust deeds, unitholders'/securityholders' agreements, company extracts). Use them to answer who can sign or approve, who owns what, and to check new deals and contracts against our rules; cite the document and clause; say when something needs Board, unitholder or securityholder approval:\n${txt}`;
}

/** A ready-made stamp for a team member (e.g. the General Manager's seal): saved as their stamp if they don't have one. */
async function placeStamp(m: ManifestItem): Promise<string> {
  const db = getSupabaseAdmin();
  const re = new RegExp(m.owner_match || '^$', 'i');
  const { data: people } = await db.from('profiles').select('id,full_name,email,active');
  const match = (people || []).filter((p: any) => p.active !== false && re.test(`${p.full_name || ''} ${p.email || ''}`));
  if (match.length !== 1) return match.length ? 'skipped: more than one matching team member' : 'skipped: no matching team member yet';
  const { listSignatures, saveSignature } = await import('./signatures');
  const has = (await listSignatures(match[0].id)).some(x => x.owner === 'me' && x.kind === 'stamp');
  const done = ((await getSetting<string[]>('company_records_stamps').catch(() => null)) || []);
  if (!has) { const png = await fs.readFile(path.join(FOLDER, m.file)); await saveSignature(match[0].id, 'stamp', `data:image/png;base64,${png.toString('base64')}`); }
  await db.from('app_settings').upsert({ key: 'company_records_stamps', value: [...new Set([...done, m.file])], updated_at: new Date().toISOString() });
  return has ? 'kept their existing stamp' : `set as ${match[0].full_name || match[0].email}'s stamp`;
}
