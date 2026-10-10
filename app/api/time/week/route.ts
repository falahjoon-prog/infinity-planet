import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { canDecideTime, isWeek, weekStart, signoffs } from '@/lib/time';

/** The approver signs off a member's week (their counted hours are final), or reopens it. */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  if (!isWeek(b.week) || weekStart(`${b.week}T12:00:00+10:00`) !== b.week) throw new HttpError(400, 'Choose a week (its Monday)');
  if (typeof b.user_id !== 'string') throw new HttpError(400, 'Choose the member');
  if (!(await canDecideTime(actor, b.user_id))) throw new HttpError(403, b.user_id === actor.id ? "You can't sign off your own week" : "You're not the approver for this person's hours");
  const list = await signoffs(); const key = `${b.user_id}:${b.week}`;
  if (b.action === 'reopen') delete list[key];
  else list[key] = { by: actor.id, at: new Date().toISOString(), minutes: Math.max(0, Math.round(Number(b.minutes) || 0)), note: b.note ? String(b.note).slice(0, 300) : null };
  const keys = Object.keys(list); if (keys.length > 3000) for (const k of keys.sort().slice(0, keys.length - 3000)) delete list[k];
  const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: 'time_week_signoffs', value: list, updated_at: new Date().toISOString() }); if (error) throw error;
  await writeAudit({ actorId: actor.id, action: b.action === 'reopen' ? 'time.week_reopened' : 'time.week_signed_off', entityType: 'profile', entityId: b.user_id, metadata: { week: b.week } });
  return ok({ signoff: list[key] || null });
});
