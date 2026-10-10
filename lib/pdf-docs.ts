import { getSupabaseAdmin } from './supabase';
import { BUCKET } from './documents';
import { HttpError } from './http';

/** Loads a stored document's PDF bytes (PDF files only). */
export async function loadPdf(documentId: string) {
  const db = getSupabaseAdmin();
  const { data: d } = await db.from('documents').select('id,name,mime_type,storage_path,project_id,deal_id,category,authority').eq('id', documentId).maybeSingle();
  if (!d) throw new HttpError(404, 'Document not found');
  if (!/pdf/i.test(d.mime_type || '') && !/\.pdf$/i.test(d.name)) throw new HttpError(415, 'Only PDF files can be edited and signed. Export the document to PDF first.');
  if (!d.storage_path) throw new HttpError(409, 'This document has no stored file');
  const { data, error } = await db.storage.from(BUCKET).download(d.storage_path);
  if (error || !data) throw new HttpError(404, 'The PDF file could not be read');
  return { doc: d, bytes: new Uint8Array(await data.arrayBuffer()) };
}
export const derivedName = (name: string, suffix: string) => `${name.replace(/\.pdf$/i, '')} (${suffix}).pdf`;
