import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { signFileLink } from '@/lib/file-links';
import { BoardLayout, blockOfFields, boardRecordTitle, signFieldsForBlock } from '@/lib/board-meeting';
import { loadBoardRecord, signRequestsFor, updateBoardRecord } from '@/lib/board-meeting-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pdfLink = (d: { storage_path: string; name: string }, dl = false) => signFileLink({ k: 'storage', p: d.storage_path, n: d.name, m: 'application/pdf', ...(dl ? { dl: 1 as const } : {}) }, 7200);

/** One record: the form data, its PDF, each signature block's e-signing boxes, and who has been asked to sign / has signed. */
export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const doc = await loadBoardRecord(id);
  const layout: BoardLayout = doc.metadata.board_layout || { pages: 0, blocks: [] };
  const reqs = await signRequestsFor([id]);
  const requests = reqs.map(({ fields, ...r }: any) => ({ ...r, block: blockOfFields(layout, fields) }));
  const signed = reqs.filter((r: any) => r.status === 'signed' && r.signed_document_id).sort((a: any, b: any) => String(b.signed_at).localeCompare(String(a.signed_at)));
  let latest: any = null;
  if (signed[0]) {
    const { data } = await getSupabaseAdmin().from('documents').select('id,name,storage_path').eq('id', signed[0].signed_document_id).maybeSingle();
    if (data?.storage_path) latest = { document_id: data.id, name: data.name, url: pdfLink(data), download_url: pdfLink(data, true), signatures: signed.length };
  }
  return ok({
    document: { id: doc.id, name: doc.name, created_at: doc.created_at, updated_at: doc.updated_at, project_id: doc.project_id },
    record: doc.metadata.board_meeting, title: boardRecordTitle(doc.metadata.board_meeting), version: doc.metadata.board_version || 1,
    superseded_by: doc.metadata.board_superseded_by || null, previous_version: doc.metadata.board_previous || null,
    layout, blocks: (layout.blocks || []).map((b, i) => ({ index: i, page: b.page, fields: signFieldsForBlock(b) })),
    pdf_url: doc.storage_path ? pdfLink(doc) : null, download_url: doc.storage_path ? pdfLink(doc, true) : null,
    requests, signed: latest,
  });
});

/** Saves changes and re-generates the PDF (as a new version when it has already been sent for signature). */
export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const out = await updateBoardRecord(id, b.record ?? b, actor.id);
  await writeAudit({ actorId: actor.id, action: out.new_version ? 'board_record.new_version' : 'board_record.updated', entityType: 'document', entityId: out.document.id, metadata: { from: id, meeting_no: out.record.meeting_no } });
  return ok({ document: { id: out.document.id, name: out.document.name }, record: out.record, layout: out.layout, new_version: out.new_version });
});
