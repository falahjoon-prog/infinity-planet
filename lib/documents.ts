import { getSupabaseAdmin } from './supabase';
import { extractDocumentText } from './extract';
import { chunkText } from './chunks';

export const BUCKET = 'rhc-documents';
export function safeName(name: string) { return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180) || 'document'; }

export async function ensureBucket() {
  const db = getSupabaseAdmin();
  const { data } = await db.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await db.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  }
}

export async function replaceChunks(documentId: string, projectId: string | null, text: string | null, method: string) {
  const db = getSupabaseAdmin();
  await db.from('document_chunks').delete().eq('document_id', documentId);
  if (!text) return 0;
  const chunks = chunkText(text).map(c => ({ document_id: documentId, project_id: projectId, ordinal: c.ordinal, content: c.content, char_start: c.start, char_end: c.end, metadata: { method } }));
  for (let i = 0; i < chunks.length; i += 200) {
    const { error } = await db.from('document_chunks').insert(chunks.slice(i, i + 200));
    if (error) throw error;
  }
  return chunks.length;
}

export type IngestInput = {
  bytes: Buffer; name: string; mimeType: string;
  projectId?: string | null; dealId?: string | null; source?: string; externalId?: string | null;
  webUrl?: string | null; externalModifiedAt?: string | null; authority?: string; category?: string | null;
  actorId?: string | null; existingId?: string | null; extraMeta?: Record<string, unknown>;
};

/** Store a file, extract its text, index it into chunks. Used by uploads and Google Drive sync. */
export async function ingestDocument(i: IngestInput) {
  const db = getSupabaseAdmin();
  await ensureBucket();
  const path = `${i.projectId || 'unassigned'}/${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}-${safeName(i.name)}`;
  const up = await db.storage.from(BUCKET).upload(path, i.bytes, { contentType: i.mimeType || 'application/octet-stream', upsert: false });
  if (up.error) throw up.error;
  const extraction = await extractDocumentText(i.bytes, i.mimeType, i.name);
  // Photo reader: images are read with the built-in OCR straight away (offline, no AI key).
  if (extraction.needsOcr && extraction.method === 'image' && i.bytes.byteLength <= 15 * 1024 * 1024 && process.env.RHC_AUTO_OCR !== 'false') {
    try {
      const { readImage } = await import('./ocr');
      const r = await readImage(i.bytes);
      if (r.text && r.text.replace(/\s+/g, '').length >= 8) Object.assign(extraction, { text: r.text.slice(0, 500_000), status: 'indexed', method: r.method, needsOcr: false });
      else if (r.unreadable) (extraction as any).unclear = true;
    } catch { /* keep needs_ocr: the user can retry OCR from Documents */ }
  }
  const metadata = { original_name: i.name, size_bytes: i.bytes.byteLength, uploaded_at: new Date().toISOString(), extraction: extraction.method, bucket: BUCKET, pages: extraction.pages || null, ...(extraction.needsOcr ? { ocr: { status: (extraction as any).unclear ? 'unclear' : 'needed' } } : extraction.method.startsWith('ocr') || extraction.method.includes('tesseract') ? { ocr: { status: 'done', method: extraction.method } } : {}), ...(i.extraMeta || {}) };
  const row: Record<string, any> = {
    name: i.name, mime_type: i.mimeType || 'application/octet-stream', project_id: i.projectId || null, deal_id: i.dealId || null,
    storage_path: path, source: i.source || 'upload', external_id: i.externalId || null, web_url: i.webUrl || null,
    external_modified_at: i.externalModifiedAt || null, content_text: extraction.text, status: extraction.status, metadata,
    authority: i.authority || 'draft', category: i.category || null, updated_at: new Date().toISOString(),
  };
  let doc: any;
  if (i.existingId) {
    const { data: old } = await db.from('documents').select('storage_path').eq('id', i.existingId).single();
    const r = await db.from('documents').update(row).eq('id', i.existingId).select().single();
    if (r.error) throw r.error; doc = r.data;
    if (old?.storage_path && old.storage_path !== path) await db.storage.from(BUCKET).remove([old.storage_path]);
  } else {
    const r = await db.from('documents').insert({ ...row, created_by: i.actorId || null }).select().single();
    if (r.error) { await db.storage.from(BUCKET).remove([path]); throw r.error; }
    doc = r.data;
  }
  const chunks = await replaceChunks(doc.id, doc.project_id, extraction.text, extraction.method);
  return { document: doc, extraction: { status: extraction.status, method: extraction.method, pages: extraction.pages || null, chunks, needsOcr: !!extraction.needsOcr } };
}
