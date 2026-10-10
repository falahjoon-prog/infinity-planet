import { getSupabaseAdmin } from './supabase';
import { BUCKET } from './documents';
import { extractDocumentText } from './extract';
import type { Attachment } from './agent';

/** Reads files attached to a chat message so the AI bot can use them: PDF, Word, Excel, text and photos (built-in OCR). */
export async function readAttachments(files: { path: string; name: string; mime: string; size?: number }[]): Promise<Attachment[]> {
  const db = getSupabaseAdmin();
  const out: Attachment[] = [];
  for (const f of files.slice(0, 5)) {
    try {
      const { data } = await db.storage.from(BUCKET).download(f.path);
      if (!data) { out.push({ name: f.name, text: '' }); continue; }
      const bytes = Buffer.from(await data.arrayBuffer());
      const ex = await extractDocumentText(bytes, f.mime, f.name);
      let text = ex.text || '';
      if (!text && ex.needsOcr && ex.method === 'image') { const { readImage } = await import('./ocr'); text = (await readImage(bytes)).text || ''; }
      if (!text && ex.needsOcr && ex.method === 'pdf-text') { try { const { ocrPdfWithAI } = await import('./ocr'); text = (await ocrPdfWithAI(bytes)).text || ''; } catch {} }
      out.push({ name: f.name, text: text.slice(0, 200_000) });
    } catch { out.push({ name: f.name, text: '' }); }
  }
  return out;
}
