import { getSupabaseAdmin } from '../supabase';
import { HttpError } from '../http';

/** The reviewed contract's original text (from the stored document, or the text pasted/attached at review time). */
export async function reviewSource(id: string) {
  const db = getSupabaseAdmin();
  const { data: r } = await db.from('contract_reviews').select('id,title,document_id,project_id,analysis,extracted_facts,status').eq('id', id).maybeSingle();
  if (!r) throw new HttpError(404, 'Review not found');
  let text = '';
  if (r.document_id) text = String((await db.from('documents').select('content_text').eq('id', r.document_id).maybeSingle()).data?.content_text || '');
  if (!text) text = String((r.extracted_facts as any)?.source_text || '');
  return { review: r, text };
}
