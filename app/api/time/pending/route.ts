import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { detectKind } from '@/lib/time';
export const dynamic = 'force-dynamic';

/** Finished work the signed-in person hasn't reported time for yet: tasks they completed and meetings that have ended (last 3 days). */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - 3 * 864e5).toISOString(); const now = new Date().toISOString();
  const [tasks, events, logs] = await Promise.all([
    db.from('tasks').select('id,title,completed_at,assigned_to,created_by').eq('status', 'done').gte('completed_at', since).or(`assigned_to.eq.${actor.id},and(assigned_to.is.null,created_by.eq.${actor.id})`).order('completed_at', { ascending: false }).limit(20),
    db.from('calendar_events').select('id,title,starts_at,ends_at,location,description,created_by,attendees,all_day').gte('starts_at', since).lte('starts_at', now).order('starts_at', { ascending: false }).limit(40),
    db.from('time_logs').select('source_type,source_id').eq('user_id', actor.id).gte('created_at', new Date(Date.now() - 10 * 864e5).toISOString()),
  ]);
  if (logs.error) return ok({ items: [], needs_update: /time_logs/.test(logs.error.message) });
  const done = new Set((logs.data || []).map((l: any) => `${l.source_type}:${l.source_id}`));
  const email = (actor.email || '').toLowerCase();
  const items = [
    ...(tasks.data || []).filter((t: any) => !done.has(`task:${t.id}`)).map((t: any) => ({ source_type: 'task', source_id: t.id, title: t.title, kind: 'task', at: t.completed_at })),
    ...(events.data || []).filter((e: any) => !e.all_day && !done.has(`event:${e.id}`) && new Date(e.ends_at || new Date(new Date(e.starts_at).getTime() + 3600_000)).getTime() < Date.now()
      && (e.created_by === actor.id || (Array.isArray(e.attendees) && e.attendees.some((a: string) => String(a).toLowerCase() === email))))
      .map((e: any) => ({ source_type: 'event', source_id: e.id, title: e.title, kind: detectKind(e.title, e.description, e.location, 'meeting'), at: e.ends_at || e.starts_at, location: e.location })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
  return ok({ items });
});
