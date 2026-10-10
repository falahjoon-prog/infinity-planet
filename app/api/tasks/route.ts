import { NextRequest } from 'next/server';
import { route, ok, body, must, pick } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

const TASK_FIELDS = ['title', 'description', 'assigned_to', 'status', 'priority', 'due_at', 'project_id', 'deal_id'];

export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('tasks').select('*, project:projects(id,name), assignee:profiles!tasks_assigned_to_fkey(id,full_name), creator:profiles!tasks_created_by_fkey(full_name)').order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(500);
  for (const k of ['project_id', 'deal_id', 'status', 'priority']) if (sp.get(k)) q = q.eq(k, sp.get(k)!);
  if (sp.get('assigned') === 'me') q = q.eq('assigned_to', actor.id);
  else if (sp.get('assigned_to')) q = q.eq('assigned_to', sp.get('assigned_to')!);
  if (sp.get('open') === '1') q = q.neq('status', 'done');
  if (sp.get('overdue') === '1') q = q.neq('status', 'done').lt('due_at', new Date().toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return ok({ tasks: data || [] });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.title, 'Task title is required');
  const row = pick(b, TASK_FIELDS);
  if (row.priority && !['low', 'normal', 'high', 'urgent'].includes(row.priority)) row.priority = 'normal';
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('tasks').insert({ ...row, status: row.status || 'todo', priority: row.priority || 'normal', created_by: actor.id }).select().single();
  if (error) throw error;
  if (b.remind_at) await db.from('reminders').insert({ title: `Task: ${data.title}`, remind_at: b.remind_at, task_id: data.id, project_id: data.project_id, recipient_id: data.assigned_to || actor.id });
  await writeAudit({ actorId: actor.id, action: 'task.created', entityType: 'task', entityId: data.id, metadata: { title: data.title, project_id: data.project_id, assigned_to: data.assigned_to } });
  return ok({ task: data }, 201);
});
