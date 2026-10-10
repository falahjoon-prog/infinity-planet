import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor, canApprove } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

/** Items needing the signed-in user's attention (drives the bell and desktop notifications). */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 15 * 60_000).toISOString();
  const [reminders, approvals, overdue, mentions, events] = await Promise.all([
    db.from('reminders').select('id,title,remind_at,project_id,task_id,event_id').eq('status', 'pending').lte('remind_at', soon).or(`recipient_id.eq.${actor.id},recipient_id.is.null`).order('remind_at').limit(30),
    db.from('approvals').select('id,title,category,created_at,reviewer_id,requested_by,approvers').eq('status', 'pending').neq('entity_type', 'email_draft').order('created_at', { ascending: false }).limit(50),
    db.from('tasks').select('id,title,due_at,project_id').eq('assigned_to', actor.id).neq('status', 'done').lt('due_at', now).order('due_at').limit(20),
    db.from('team_messages').select('id,channel,body,created_at').ilike('body', `%@${(actor.full_name || actor.email || '').split(/[ @]/)[0]}%`).gte('created_at', new Date(Date.now() - 2 * 864e5).toISOString()).neq('sender_id', actor.id).limit(10),
    db.from('calendar_events').select('id,title,starts_at,location,reminder_minutes').gte('starts_at', now).lte('starts_at', new Date(Date.now() + 2 * 3600_000).toISOString()).order('starts_at').limit(10),
  ]);
  const myApprovals = (approvals.data || []).filter((a: any) => (Array.isArray(a.approvers) && a.approvers.length ? a.approvers.includes(actor.id) : a.reviewer_id ? a.reviewer_id === actor.id : canApprove(actor, a.category || 'general')) && a.requested_by !== actor.id);
  const hours = await db.from('time_logs').select('id,title,reported_minutes,estimated_minutes,created_at,user:profiles!time_logs_user_id_fkey(full_name,email)').eq('status', 'pending_approval').eq('approver_id', actor.id).order('created_at').limit(30).then(r => r.error ? [] : (r.data || []));
  const copies = await import('@/lib/org').then(m => m.copiesFor(actor.id)).catch(() => []);
  const eventsDue = (events.data || []).filter(e => new Date(e.starts_at).getTime() - Date.now() <= (e.reminder_minutes ?? 30) * 60_000);
  let access: any[] = [];
  if (['admin', 'director'].includes(actor.role)) {
    const { data: off } = await db.from('profiles').select('id,full_name,email,created_at').eq('active', false);
    if (off?.length) { const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 }); const pend = new Set((list?.users || []).filter(u => u.user_metadata?.access_request === 'pending').map(u => u.id)); access = off.filter(p => pend.has(p.id)); }
  }
  const items = [
    ...access.map(p => ({ id: `acc-${p.id}`, ref: p.id, type: 'access', title: `Access request: ${p.full_name || p.email} (${p.email})`, at: p.created_at, href: '/system?tab=team' })),
    ...(reminders.data || []).map(r => ({ id: `rem-${r.id}`, ref: r.id, type: 'reminder', title: r.title, at: r.remind_at, href: r.task_id ? `/tasks?open=${r.task_id}` : r.project_id ? `/projects/${r.project_id}` : '/calendar' })),
    ...eventsDue.map(e => ({ id: `evt-${e.id}`, ref: e.id, type: 'meeting', title: `${e.title}${e.location ? ` · ${e.location}` : ''}`, at: e.starts_at, href: '/calendar' })),
    ...myApprovals.map(a => ({ id: `apr-${a.id}`, ref: a.id, type: 'approval', title: a.title || 'Approval requested', at: a.created_at, href: `/approvals?open=${a.id}` })),
    ...hours.map((h: any) => ({ id: `hrs-${h.id}`, ref: h.id, type: 'hours', title: `Hours to approve: ${h.user?.full_name || h.user?.email || 'A team member'} — ${h.title} (${h.reported_minutes} min, usual ${h.estimated_minutes})`, at: h.created_at, href: '/activity?tab=approve' })),
    ...copies.map(c => ({ id: `cc-${c.id}`, ref: c.approval_id, type: 'approval', title: `For your information (your team's request): ${c.title}`, at: c.at, href: `/approvals?open=${c.approval_id}` })),
    ...(overdue.data || []).map(t => ({ id: `task-${t.id}`, ref: t.id, type: 'overdue', title: `Overdue: ${t.title}`, at: t.due_at, href: `/tasks?open=${t.id}` })),
    ...(mentions.data || []).map(m => ({ id: `msg-${m.id}`, ref: m.id, type: 'mention', title: `Mentioned in #${m.channel}: ${m.body.slice(0, 80)}`, at: m.created_at, href: `/team?channel=${m.channel}` })),
  ];
  return ok({ items, counts: { hours: hours.length, approvals: myApprovals.length, overdue: (overdue.data || []).length, reminders: (reminders.data || []).length } });
});
