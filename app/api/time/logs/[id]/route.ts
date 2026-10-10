import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { canDecideTime } from '@/lib/time';

/**
 * The time approver decides: approve (counts as reported), adjust (counts the minutes they set), or reject (doesn't count).
 * The member can delete their own log while it is still waiting, or correct a mistake on the same day.
 */
export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params; const b = await body(req); const db = getSupabaseAdmin();
  const { data: log } = await db.from('time_logs').select('*').eq('id', id).maybeSingle();
  if (!log) throw new HttpError(404, 'Time log not found');
  if (!(await canDecideTime(actor, log.user_id))) throw new HttpError(403, log.user_id === actor.id ? "You can't approve your own time" : "You're not the approver for this person's time");
  const note = b.note ? String(b.note).slice(0, 500) : null;
  let patch: Record<string, any>;
  if (b.action === 'approve') patch = { status: 'approved', counted_minutes: log.reported_minutes };
  else if (b.action === 'adjust') { const m = Math.round(Number(b.minutes)); if (!Number.isFinite(m) || m < 0 || m > 960) throw new HttpError(400, 'Minutes to count must be between 0 and 960'); patch = { status: 'adjusted', counted_minutes: m }; }
  else if (b.action === 'reject') { if (!note) throw new HttpError(400, 'Say why, so the member understands'); patch = { status: 'rejected', counted_minutes: 0 }; }
  else throw new HttpError(400, 'Choose approve, adjust or reject');
  const { data, error } = await db.from('time_logs').update({ ...patch, decided_by: actor.id, decided_at: new Date().toISOString(), decision_note: note, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: `time.${patch.status}`, entityType: 'time_log', entityId: id, metadata: { title: log.title, member: log.user_id, reported: log.reported_minutes, counted: patch.counted_minutes } });
  return ok({ log: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params; const db = getSupabaseAdmin();
  const { data: log } = await db.from('time_logs').select('user_id,status,created_at,title').eq('id', id).maybeSingle();
  if (!log) throw new HttpError(404, 'Time log not found');
  const ownFresh = log.user_id === actor.id && (log.status === 'pending_approval' || log.status === 'skipped' || Date.now() - new Date(log.created_at).getTime() < 24 * 3600_000);
  if (!ownFresh && !['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only your own time from the last 24 hours (or still waiting for approval) can be removed');
  const { error } = await db.from('time_logs').delete().eq('id', id); if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'time.deleted', entityType: 'time_log', entityId: id, metadata: { title: log.title } });
  return ok({ deleted: true });
});
