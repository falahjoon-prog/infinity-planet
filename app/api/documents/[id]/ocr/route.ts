import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { BUCKET, replaceChunks } from '@/lib/documents';
import { readImage, ocrPdfWithAI } from '@/lib/ocr';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** OCR for scanned documents: images via built-in Tesseract, scanned PDFs via a vision-capable AI provider. */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const db = getSupabaseAdmin();
  const { data: doc } = await db.from('documents').select('*').eq('id', id).maybeSingle();
  if (!doc) throw new HttpError(404, 'Document not found');
  if (!doc.storage_path) throw new HttpError(400, 'Document has no stored file');
  const file = await db.storage.from(BUCKET).download(doc.storage_path);
  if (file.error) throw file.error;
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const isPdf = doc.mime_type === 'application/pdf' || /\.pdf$/i.test(doc.name);
  const r: any = isPdf ? await ocrPdfWithAI(bytes, b.provider) : await readImage(bytes, b.provider);
  const text = r.text.trim();
  if (!text) {
    if (r.unreadable) {
      // Don't keep junk: clear any earlier garbled reading
      await db.from('documents').update({ content_text: '', status: 'needs_ocr', metadata: { ...(doc.metadata || {}), ocr: { status: 'unclear', method: r.method, confidence: r.confidence ?? null } }, updated_at: new Date().toISOString() }).eq('id', id);
      await replaceChunks(id, doc.project_id, '', r.method).catch(() => 0);
      throw new HttpError(422, 'This picture could not be read clearly by the built-in reader. Add an AI key in Settings → AI and press “Read text” again — the AI reads screenshots and photos far better. You can still see the picture itself.');
    }
    throw new HttpError(422, 'No readable text was found in this file');
  }
  const metadata = { ...(doc.metadata || {}), ocr: { status: 'complete', method: r.method, confidence: r.confidence ?? null, completed_at: new Date().toISOString() } };
  const { data, error } = await db.from('documents').update({ content_text: text, status: 'indexed', metadata, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  const chunks = await replaceChunks(id, doc.project_id, text, r.method);
  await writeAudit({ actorId: actor.id, action: 'document.ocr_completed', entityType: 'document', entityId: id, metadata: { method: r.method, chunks } });
  return ok({ document: data, ocr: { method: r.method, confidence: r.confidence ?? null, characters: text.length, chunks } });
});
