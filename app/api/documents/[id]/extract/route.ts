import { NextRequest } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { extractDocumentText } from '@/lib/extract';
import { BUCKET, replaceChunks } from '@/lib/documents';
export const runtime = 'nodejs';

/** Re-extract and re-index a stored document. */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: doc } = await db.from('documents').select('*').eq('id', id).maybeSingle();
  if (!doc) throw new HttpError(404, 'Document not found');
  if (!doc.storage_path) throw new HttpError(400, 'Document has no stored file');
  const file = await db.storage.from(BUCKET).download(doc.storage_path);
  if (file.error) throw file.error;
  const ex = await extractDocumentText(Buffer.from(await file.data.arrayBuffer()), doc.mime_type || 'application/octet-stream', doc.name);
  const metadata = { ...(doc.metadata || {}), extraction: ex.method, pages: ex.pages || null, extracted_at: new Date().toISOString(), ...(ex.needsOcr ? { ocr: { status: 'needed' } } : {}) };
  const { data, error } = await db.from('documents').update({ content_text: ex.text, status: ex.status, metadata, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  const chunks = await replaceChunks(id, doc.project_id, ex.text, ex.method);
  await writeAudit({ actorId: actor.id, action: 'document.extracted', entityType: 'document', entityId: id, metadata: { status: ex.status, method: ex.method, chunks } });
  return ok({ document: data, extraction: { ...ex, text: undefined, chunks } });
});
