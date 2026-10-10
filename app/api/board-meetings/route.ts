import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { BOARD_CATEGORY, BOARD_TITLE, boardRecordTitle, newBoardRecord } from '@/lib/board-meeting';
import { createBoardRecord, signRequestsFor } from '@/lib/board-meeting-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sortKey = (d: any) => (/^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : String(d.created_at || '').slice(0, 10)) + String(d.created_at || '');

/** Weekly Board Meeting Records, newest first, with their signing progress — plus a new record pre-filled from the latest one. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const { data, error } = await getSupabaseAdmin().from('documents').select('id,name,metadata,created_at,updated_at, author:profiles!documents_created_by_fkey(full_name)').eq('category', BOARD_CATEGORY).eq('metadata->>board_title', BOARD_TITLE).order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  const docs = (data || []).filter((d: any) => d.metadata?.board_meeting && !d.metadata?.board_superseded_by);
  const reqs = await signRequestsFor(docs.map((d: any) => d.id));
  const records = docs.map((d: any) => {
    const r = d.metadata.board_meeting;
    const rs = reqs.filter((x: any) => x.document_id === d.id && x.status !== 'cancelled');
    const signed = rs.filter((x: any) => x.status === 'signed' && x.signed_document_id).sort((a: any, b: any) => String(b.signed_at).localeCompare(String(a.signed_at)));
    return {
      id: d.id, name: d.name, title: boardRecordTitle(r), created_at: d.created_at, updated_at: d.updated_at, author: d.author?.full_name || null, version: d.metadata.board_version || 1,
      meeting_no: r.meeting_no, date: r.date, time: r.time, location: r.location, note_taker: r.note_taker,
      attendees: (r.attendees || []).length, agenda: (r.agenda || []).length, signature_blocks: r.signature_blocks,
      signing: { sent: rs.length, signed: signed.length, declined: rs.filter((x: any) => x.status === 'declined').length, latest_signed_document_id: signed[0]?.signed_document_id || null },
    };
  }).sort((a: any, b: any) => sortKey(b).localeCompare(sortKey(a)));
  const latest = records[0] ? docs.find((d: any) => d.id === records[0].id)?.metadata.board_meeting : null;
  return ok({ records, template: newBoardRecord(latest) });
});

/** Saves a new record: builds the branded PDF and stores it in Documents (category "board_minutes"). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const out = await createBoardRecord(b.record ?? b, actor.id);
  await writeAudit({ actorId: actor.id, action: 'board_record.created', entityType: 'document', entityId: out.document.id, metadata: { meeting_no: out.record.meeting_no, date: out.record.date } });
  return ok({ document: { id: out.document.id, name: out.document.name }, record: out.record, layout: out.layout }, 201);
});
