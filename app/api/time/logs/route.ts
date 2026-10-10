import { NextRequest } from 'next/server';
import { route, ok, body, HttpError, must } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { estimate, verdict, judgeReason, aiSecondLook, approversFor, visibleUsers, canDecideTime, detectKind, KINDS, Kind, fmtMins, brisbaneDate, isWeek } from '@/lib/time';

/** Looks up the task or meeting being reported so the estimate uses its real details. */
async function source(type: string | null, id: string | null) {
  if (!type || !id) return null;
  const db = getSupabaseAdmin();
  if (type === 'task') { const { data } = await db.from('tasks').select('id,title,description,project_id,completed_at,assigned_to,created_by').eq('id', id).maybeSingle(); return data ? { kind: 'task' as Kind, title: data.title, description: data.description, project_id: data.project_id, when: data.completed_at, scheduled: null, location: null } : null; }
  if (type === 'event') { const { data } = await db.from('calendar_events').select('id,title,description,location,starts_at,ends_at,project_id').eq('id', id).maybeSingle(); if (!data) return null; const sched = data.ends_at ? Math.round((new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) / 60_000) : null; return { kind: detectKind(data.title, data.description, data.location, 'meeting'), title: data.title, description: data.description, project_id: data.project_id, when: data.starts_at, scheduled: sched, location: data.location }; }
  return null;
}

/**
 * Report time for real-world work. Steps:
 *  1. { reported_minutes } → counted straight away when reasonable; otherwise { status: 'need_reason', question }.
 *  2. { reported_minutes, justification } → counted when the reason is reasonable; a weak reason gets one follow-up question ('need_more').
 *  3. { reported_minutes, justification, attempt: 2 } → still weak: saved and sent to the time approver ('pending_approval').
 *  { skip: true } records that no time was spent, so the app stops asking.
 */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  const db = getSupabaseAdmin();
  const sourceType = b.source_type === 'task' || b.source_type === 'event' ? b.source_type : null;
  const sourceId = sourceType && typeof b.source_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.source_id) ? b.source_id : null;
  const src = await source(sourceType, sourceId);
  if (sourceType && !src) throw new HttpError(404, 'That task or meeting no longer exists');
  if (sourceId) { const { data: had } = await db.from('time_logs').select('id,status').eq('user_id', actor.id).eq('source_type', sourceType).eq('source_id', sourceId).maybeSingle(); if (had && had.status !== 'skipped') throw new HttpError(409, 'You have already reported time for this'); if (had) await db.from('time_logs').delete().eq('id', had.id); }

  const title = String(src?.title || b.title || '').trim().slice(0, 200);
  must(title, 'Say what the work was');
  const kind: Kind = KINDS.includes(b.kind) ? b.kind : src?.kind || 'other';
  const occurred = typeof b.occurred_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.occurred_on) ? b.occurred_on : brisbaneDate(src?.when || new Date());
  const base = { user_id: actor.id, kind, source_type: sourceType, source_id: sourceId, title, occurred_on: occurred, project_id: src?.project_id || (typeof b.project_id === 'string' ? b.project_id : null) };

  if (b.skip) {
    const est = estimate({ kind, title, description: src?.description, location: src?.location, scheduled_minutes: src?.scheduled });
    const { data, error } = await db.from('time_logs').insert({ ...base, estimated_minutes: est.minutes, reported_minutes: 0, counted_minutes: 0, status: 'skipped' }).select().single(); if (error) throw error;
    return ok({ status: 'skipped', log: data });
  }

  const reported = Math.round(Number(b.reported_minutes));
  if (!Number.isFinite(reported) || reported < 1) throw new HttpError(400, 'How many minutes did it take?');
  if (reported > 960) throw new HttpError(400, 'That is more than 16 hours — split it into separate days.');
  const est = estimate({ kind, title, description: src?.description || b.description, location: src?.location || b.location, scheduled_minutes: src?.scheduled ?? (Number(b.scheduled_minutes) || null) });
  const v = verdict(est.minutes, reported);
  const save = async (row: Record<string, any>) => { const { data, error } = await db.from('time_logs').insert({ ...base, estimated_minutes: est.minutes, reported_minutes: reported, verdict: v, ...row }).select().single(); if (error) throw error; return data; };

  if (v === 'ok') { const log = await save({ status: 'accepted', counted_minutes: reported }); return ok({ status: 'accepted', log, estimate: est, message: `${fmtMins(reported)} added to this week.` }); }

  const reason = String(b.justification || '').trim().slice(0, 1500);
  const extra = reported - est.minutes;
  if (!reason) return ok({ status: 'need_reason', estimate: est, verdict: v, question: v === 'very_long'
    ? `That is much longer than expected — we'd expect about ${fmtMins(est.minutes)} (${est.basis}), and you spent ${fmtMins(reported)}. What happened? Please give the main reasons (for example travel, waiting, extra work that came up, a problem).`
    : `That took longer than expected — about ${fmtMins(est.minutes)} is usual (${est.basis}). What took the extra ${fmtMins(extra)}?` });

  let j = judgeReason(reason, v);
  let note = j.note;
  if (!j.reasonable) { const ai = await aiSecondLook({ title, kind, estimated: est.minutes, reported, reason }); if (ai?.reasonable) { j = { ...j, reasonable: true }; note = `Reason accepted: ${ai.note}`; } }
  if (j.reasonable) { const log = await save({ status: 'justified', counted_minutes: reported, justification: reason, check_note: note }); await writeAudit({ actorId: actor.id, action: 'time.justified', entityType: 'time_log', entityId: log.id, metadata: { title, estimated: est.minutes, reported } }); return ok({ status: 'justified', log, estimate: est, message: `Thanks — that explains it. ${fmtMins(reported)} added to this week.` }); }

  if (Number(b.attempt || 1) < 2) return ok({ status: 'need_more', estimate: est, verdict: v, note, question: `Could you add a little more detail? ${note} For example: who or what held you up, what extra work came up, or how far you had to travel.` });

  const approvers = await approversFor(actor.id);
  const log = await save({ status: 'pending_approval', counted_minutes: 0, justification: reason, check_note: note, approver_id: approvers[0] || null });
  let who = 'your manager';
  if (approvers[0]) { const { data: p } = await db.from('profiles').select('full_name,email').eq('id', approvers[0]).maybeSingle(); if (p) who = p.full_name || p.email; }
  await writeAudit({ actorId: actor.id, action: 'time.needs_approval', entityType: 'time_log', entityId: log.id, metadata: { title, estimated: est.minutes, reported, approver: approvers[0] || null } });
  return ok({ status: 'pending_approval', log, estimate: est, approver: who, message: `Recorded. Because ${fmtMins(reported)} is well over the usual ${fmtMins(est.minutes)} and the reason isn't clear enough, ${who} needs to approve it before it counts in your weekly hours.` });
});

/** Time logs: ?scope=approve (waiting for me), or ?user=…&week=YYYY-MM-DD (my own by default). */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const sp = req.nextUrl.searchParams; const db = getSupabaseAdmin();
  const sel = 'id,user_id,kind,source_type,source_id,title,occurred_on,estimated_minutes,reported_minutes,counted_minutes,status,verdict,justification,check_note,approver_id,decided_by,decided_at,decision_note,created_at';
  if (sp.get('scope') === 'approve') {
    const { data, error } = await db.from('time_logs').select(sel).eq('status', 'pending_approval').order('created_at').limit(200); if (error) throw error;
    const mine = [];
    for (const l of data || []) if (l.approver_id === actor.id || (l.user_id !== actor.id && await canDecideTime(actor, l.user_id))) mine.push(l);
    return ok({ logs: mine });
  }
  const user = sp.get('user') || actor.id;
  if (user !== actor.id) { const v = await visibleUsers(actor); if (!v.ids.includes(user)) throw new HttpError(403, "You can't see this person's hours"); }
  let q = db.from('time_logs').select(sel).eq('user_id', user).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(300);
  const week = sp.get('week'); if (isWeek(week)) { const end = new Date(new Date(`${week}T00:00:00Z`).getTime() + 6 * 864e5).toISOString().slice(0, 10); q = q.gte('occurred_on', week).lte('occurred_on', end); }
  const { data, error } = await q; if (error) throw error;
  return ok({ logs: data || [], can_decide: await canDecideTime(actor, user) });
});
