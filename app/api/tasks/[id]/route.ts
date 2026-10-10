import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

const FIELDS = ['title', 'description', 'assigned_to', 'status', 'priority', 'due_at', 'project_id', 'deal_id'];
export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const patch = pick(b, FIELDS);
  if (patch.status && !['todo', 'in_progress', 'blocked', 'done'].includes(patch.status)) throw new HttpError(400, 'Invalid status');
  if (!Object.keys(patch).length && b.remind_at === undefined) throw new HttpError(400, 'No editable fields supplied');
  if (patch.status) patch.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  if (b.remind_at || b.remind_at === null) await db.from('reminders').update({ status: 'cancelled' }).eq('task_id', id).eq('status', 'pending'); // one live reminder per task
  if (b.remind_at) await db.from('reminders').insert({ title: `Task: ${data.title}`, remind_at: b.remind_at, task_id: id, project_id: data.project_id, recipient_id: data.assigned_to || actor.id });
  if (patch.status === 'done') await db.from('reminders').update({ status: 'cancelled' }).eq('task_id', id).eq('status', 'pending');
  await writeAudit({ actorId: actor.id, action: patch.status === 'done' ? 'task.completed' : 'task.updated', entityType: 'task', entityId: id, metadata: patch });
  return ok({ task: data });
});
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('tasks').delete().eq('id', id);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'task.deleted', entityType: 'task', entityId: id });
  return ok({ deleted: true });
});
