/**
 * Saving Weekly Board Meeting Records. Each record is a PDF in the documents table (category 'board_minutes'):
 * - metadata.board_meeting = the form data (so it can be re-opened and re-generated)
 * - metadata.board_layout  = where each signature block's signature / name / date boxes are (for e-signing)
 * No extra table or migration is needed.
 *
 * Editing a record re-generates its PDF in place, unless it has already been sent for signature: then the change
 * is saved as a new version (a new document), so what people were asked to sign never changes under them.
 */
import { getSupabaseAdmin } from './supabase';
import { ingestDocument } from './documents';
import { getLetterhead } from './letterhead';
import { HttpError } from './http';
import { renderBoardRecordPdf } from './board-meeting-pdf';
import { BOARD_CATEGORY, BOARD_TITLE, BoardLayout, BoardRecord, boardRecordFileName, normaliseBoardRecord } from './board-meeting';

export const DOC_FIELDS = 'id,name,category,metadata,project_id,deal_id,authority,storage_path,created_at,updated_at,created_by';

export async function renderBoardRecord(rec: BoardRecord) {
  return renderBoardRecordPdf(rec, await getLetterhead());
}

/** A board record document (not a signed copy of one). */
export async function loadBoardRecord(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Board meeting record not found');
  const { data, error } = await getSupabaseAdmin().from('documents').select(DOC_FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || data.category !== BOARD_CATEGORY || !data.metadata?.board_meeting) throw new HttpError(404, 'Board meeting record not found');
  return data as any;
}

/** Sign requests sent for a document (empty when online signing is not set up). */
export async function signRequestsFor(documentIds: string[]) {
  if (!documentIds.length) return [] as any[];
  const { data, error } = await getSupabaseAdmin().from('sign_requests').select('id,document_id,title,signer_name,signer_email,status,fields,expires_at,viewed_at,signed_at,signed_document_id,declined_reason,created_at').in('document_id', documentIds).order('created_at', { ascending: true });
  return error ? [] : (data || []);
}

const meta = (rec: BoardRecord, layout: BoardLayout, extra: Record<string, unknown>) => ({ board_meeting: rec, board_layout: layout, board_title: BOARD_TITLE, ...extra });

export async function createBoardRecord(input: unknown, actorId: string) {
  const rec = normaliseBoardRecord(input);
  const { bytes, layout } = await renderBoardRecord(rec);
  const r = await ingestDocument({ bytes, name: boardRecordFileName(rec), mimeType: 'application/pdf', source: 'upload', category: BOARD_CATEGORY, actorId, extraMeta: meta(rec, layout, { board_version: 1 }) });
  return { document: r.document, record: rec, layout, new_version: false };
}

export async function updateBoardRecord(id: string, input: unknown, actorId: string) {
  const old = await loadBoardRecord(id);
  if (old.metadata?.board_superseded_by) throw new HttpError(409, 'A newer version of this record exists — open the latest version to change it.');
  const rec = normaliseBoardRecord(input);
  const { bytes, layout } = await renderBoardRecord(rec);
  const sent = (await signRequestsFor([id])).filter((s: any) => s.status !== 'cancelled');
  const version = Number(old.metadata?.board_version) || 1;
  const common = { bytes, name: boardRecordFileName(rec), mimeType: 'application/pdf', projectId: old.project_id, dealId: old.deal_id, source: 'upload', category: BOARD_CATEGORY, authority: old.authority || 'draft' };
  if (!sent.length) {
    const r = await ingestDocument({ ...common, existingId: id, extraMeta: meta(rec, layout, { board_version: version, ...(old.metadata?.board_previous ? { board_previous: old.metadata.board_previous } : {}) }) });
    return { document: r.document, record: rec, layout, new_version: false };
  }
  // Already sent for signature: keep that PDF exactly as it was and save the change as the next version.
  const r = await ingestDocument({ ...common, actorId, extraMeta: meta(rec, layout, { board_version: version + 1, board_previous: id }) });
  const db = getSupabaseAdmin();
  await db.from('documents').update({ metadata: { ...old.metadata, board_superseded_by: r.document.id } }).eq('id', id);
  return { document: r.document, record: rec, layout, new_version: true };
}
