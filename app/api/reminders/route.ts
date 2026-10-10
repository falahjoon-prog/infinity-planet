import { NextRequest } from 'next/server';
import { route, ok, body, must, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const { data, error } = await getSupabaseAdmin().from('reminders').select('*, project:projects(name), task:tasks(title), recipient:profiles!reminders_recipient_id_fkey(full_name)').eq('status', 'pending').or(`recipient_id.eq.${actor.id},recipient_id.is.null`).order('remind_at').limit(100);
  if (error) throw error;
  return ok({ reminders: data || [] });
});
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.title, 'Title is required'); must(b.remind_at, 'Reminder time is required');
  if (isNaN(new Date(b.remind_at).getTime())) throw new HttpError(400, 'Invalid reminder time');
  const { data, error } = await getSupabaseAdmin().from('reminders').insert({ ...pick(b, ['title', 'remind_at', 'project_id', 'task_id', 'event_id']), recipient_id: b.recipient_id === 'everyone' ? null : b.recipient_id || actor.id, status: 'pending' }).select().single();
  if (error) throw error;
  return ok({ reminder: data }, 201);
});
