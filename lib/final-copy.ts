/**
 * When a written document is approved, a final PDF on the business letterhead is filed in Documents
 * (linked to its project), so the approved version is always easy to find, search and share.
 */
import { getSupabaseAdmin } from './supabase';
import { getLetterhead, pdfWithLetterhead } from './letterhead';
import { ingestDocument } from './documents';

export async function fileFinalCopy(type: string, id: string, actorId: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  let title = '', text = '', projectId: string | null = null, dealId: string | null = null;
  if (type === 'marketing_asset') {
    const { data: a } = await db.from('marketing_assets').select('title,content,kind,project_id,design').eq('id', id).maybeSingle();
    if (!a || a.kind === 'design') return null;
    if (a.kind === 'deck') {
      const { normalizeDeck } = await import('./deck'); const { deckToPdf } = await import('./deck-render');
      const pdf = await deckToPdf(normalizeDeck(a.design, a.title));
      const { data: prevDeck } = await db.from('documents').select('id').eq('source', 'final_copy').eq('external_id', `${type}:${id}`).maybeSingle();
      const res = await ingestDocument({ bytes: pdf, name: `${String(a.title).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'Presentation'} (final).pdf`, mimeType: 'application/pdf', projectId: a.project_id, source: 'final_copy', externalId: `${type}:${id}`, authority: 'approved', category: 'marketing', actorId, existingId: prevDeck?.id || null, extraMeta: { final_of: { type, id } } });
      return res.document.id;
    }
    if (!String(a.content || '').trim()) return null;
    title = a.title; text = a.content; projectId = a.project_id;
  } else if (type === 'generated_document') {
    const { data: g } = await db.from('generated_documents').select('title,body,project_id,deal_id').eq('id', id).maybeSingle();
    if (!g || !String(g.body || '').trim()) return null;
    title = g.title; text = g.body; projectId = g.project_id; dealId = g.deal_id;
  } else return null;
  const pdf = await pdfWithLetterhead(title, text, await getLetterhead(), { final: true });
  const { data: prev } = await db.from('documents').select('id').eq('source', 'final_copy').eq('external_id', `${type}:${id}`).maybeSingle();
  const name = `${String(title).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'Document'} (final).pdf`;
  const res = await ingestDocument({ bytes: pdf, name, mimeType: 'application/pdf', projectId, dealId, source: 'final_copy', externalId: `${type}:${id}`, authority: 'approved', category: type === 'marketing_asset' ? 'marketing' : 'contract', actorId, existingId: prev?.id || null, extraMeta: { final_of: { type, id } } });
  return res.document.id;
}
