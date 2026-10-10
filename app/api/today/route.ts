import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { mayDecide } from '@/lib/approvals';
export const dynamic = 'force-dynamic';

/** Today: what needs this person right now — approvals they can decide, their due tasks, today's meetings and reminders. */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const db = getSupabaseAdmin();
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 86400e3);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
  const tomorrowEnd = new Date(dayEnd.getTime() + 86400e3);
  const [ap, tk, ev, rm] = await Promise.all([
    db.from('approvals').select('id,title,category,status,approvers,reviewer_id,requested_by,entity_type,entity_id,created_at, requester:profiles!approvals_requested_by_fkey(full_name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(60),
    db.from('tasks').select('id,title,status,priority,due_at, project:projects(id,name)').eq('assigned_to', actor.id).neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(40),
    db.from('calendar_events').select('id,title,starts_at,ends_at,location,project_id').gte('starts_at', new Date(now.getTime() - 3600e3).toISOString()).lte('starts_at', tomorrowEnd.toISOString()).order('starts_at').limit(10),
    db.from('reminders').select('id,title,remind_at,status').eq('recipient_id', actor.id).eq('status', 'pending').lte('remind_at', dayEnd.toISOString()).order('remind_at').limit(10),
  ]);
  const approvals = ((ap.data || []) as any[]).filter(a => mayDecide(actor, a)).slice(0, 12).map(a => ({ id: a.id, title: a.title, category: a.category, by: a.requester?.full_name || null, at: a.created_at }));
  const tasks = ((tk.data || []) as any[]).filter(t => (t.due_at && new Date(t.due_at) <= soon) || ['urgent', 'high'].includes(t.priority)).slice(0, 12)
    .map(t => ({ id: t.id, title: t.title, due_at: t.due_at, overdue: !!t.due_at && new Date(t.due_at) < now, priority: t.priority, status: t.status, project: t.project?.name || null }));
  return ok({ approvals, tasks, meetings: ev.data || [], reminders: rm.error ? [] : rm.data || [], open_tasks: (tk.data || []).length });
});
