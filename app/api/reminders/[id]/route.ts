import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Dismiss (done) or snooze a reminder. */
export const PATCH = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, any> = {};
  if (b.snooze_minutes) patch.remind_at = new Date(Date.now() + Number(b.snooze_minutes) * 60_000).toISOString();
  else if (b.status === 'done' || b.status === 'cancelled') { patch.status = b.status; patch.notified_at = new Date().toISOString(); }
  else throw new HttpError(400, 'Provide status=done or snooze_minutes');
  const { data, error } = await getSupabaseAdmin().from('reminders').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return ok({ reminder: data });
});
