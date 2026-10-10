import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { BUCKET, ensureBucket, safeName } from '@/lib/documents';
import { mailClient, googleCall } from '@/lib/google';
import { migrationHint, DraftAttachment } from '@/lib/email-send';

const MAX_TOTAL = 25 * 1024 * 1024; // Gmail limit

async function draft(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('email_drafts').select('id,status,attachments').eq('id', id).maybeSingle();
  if (error) throw migrationHint(error);
  if (!data) throw new HttpError(404, 'Draft not found');
  if (data.status === 'sent') throw new HttpError(409, 'This email has already been sent');
  return data;
}
async function store(id: string, list: DraftAttachment[], add: { name: string; mime: string; bytes: Buffer }[]) {
  const db = getSupabaseAdmin(); await ensureBucket();
  const total = list.reduce((n, a) => n + (a.size || 0), 0) + add.reduce((n, a) => n + a.bytes.length, 0);
  if (total > MAX_TOTAL) throw new HttpError(413, 'Attachments are larger than 25 MB in total (the Gmail limit). Share large files as a Drive link instead.');
  for (const a of add) {
    const path = `email/${id}/${Date.now()}-${safeName(a.name)}`;
    const up = await db.storage.from(BUCKET).upload(path, a.bytes, { contentType: a.mime || 'application/octet-stream', upsert: false });
    if (up.error) throw new HttpError(500, up.error.message);
    list.push({ path, name: a.name, mime: a.mime || 'application/octet-stream', size: a.bytes.length });
  }
  const { error } = await db.from('email_drafts').update({ attachments: list, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw migrationHint(error);
  return list;
}

/**
 * Add attachments: multipart files (from the computer), or JSON { document_ids: [...] } (from Documents),
 * or { gmail_message_id, attachment_ids?: [...] } (forward the original email's attachments).
 */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const d = await draft(id);
  const list: DraftAttachment[] = Array.isArray(d.attachments) ? [...d.attachments] : [];
  const add: { name: string; mime: string; bytes: Buffer }[] = [];
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    for (const f of form.getAll('file')) if (f instanceof File) add.push({ name: f.name, mime: f.type, bytes: Buffer.from(await f.arrayBuffer()) });
  } else {
    const b = await req.json().catch(() => ({}));
    const db = getSupabaseAdmin();
    if (Array.isArray(b.document_ids) && b.document_ids.length) {
      const { data: docs } = await db.from('documents').select('id,name,mime_type,storage_path').in('id', b.document_ids.slice(0, 10));
      for (const doc of docs || []) {
        if (!doc.storage_path) continue;
        const { data } = await db.storage.from(BUCKET).download(doc.storage_path);
        if (data) add.push({ name: doc.name, mime: doc.mime_type || 'application/octet-stream', bytes: Buffer.from(await data.arrayBuffer()) });
      }
    }
    if (b.gmail_message_id) {
      const { auth, provider } = await mailClient(actor.id);
      const gmail = google.gmail({ version: 'v1', auth });
      const m = (await googleCall(provider, () => gmail.users.messages.get({ userId: 'me', id: b.gmail_message_id, format: 'full' }))).data;
      const parts: any[] = []; const walk = (p: any) => { if (!p) return; if (p.filename && p.body?.attachmentId) parts.push(p); (p.parts || []).forEach(walk); }; walk(m.payload);
      for (const p of parts) {
        if (Array.isArray(b.attachment_ids) && !b.attachment_ids.includes(p.body.attachmentId) && !b.attachment_ids.includes(p.filename)) continue;
        const a = await googleCall(provider, () => gmail.users.messages.attachments.get({ userId: 'me', messageId: b.gmail_message_id, id: p.body.attachmentId }));
        add.push({ name: p.filename, mime: p.mimeType, bytes: Buffer.from(a.data.data || '', 'base64url') });
      }
    }
  }
  if (!add.length) throw new HttpError(400, 'No files to attach');
  return ok({ attachments: await store(id, list, add) }, 201);
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const path = req.nextUrl.searchParams.get('path') || '';
  const d = await draft(id);
  const list: DraftAttachment[] = (Array.isArray(d.attachments) ? d.attachments : []).filter((a: DraftAttachment) => a.path !== path);
  if (path.startsWith(`email/${id}/`)) await getSupabaseAdmin().storage.from(BUCKET).remove([path]);
  const { error } = await getSupabaseAdmin().from('email_drafts').update({ attachments: list }).eq('id', id);
  if (error) throw migrationHint(error);
  return ok({ attachments: list });
});
