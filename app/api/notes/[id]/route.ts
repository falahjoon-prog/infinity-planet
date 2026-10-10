import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), ['title', 'body', 'important', 'project_id', 'deal_id', 'tags', 'assigned_to']);
  if ('assigned_to' in patch && !patch.assigned_to) patch.assigned_to = null;
  const before = 'assigned_to' in patch ? (await getSupabaseAdmin().from('notes').select('assigned_to').eq('id', id).maybeSingle()).data : null;
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  const { data, error } = await getSupabaseAdmin().from('notes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw /assigned_to/.test(error.message) ? new HttpError(409, 'Assigning notes needs the 4.3 database update (supabase/migrations/006_email_options_4_3.sql).') : error;
  if (patch.assigned_to && patch.assigned_to !== before?.assigned_to && patch.assigned_to !== actor.id) { const { notifyNote } = await import('@/lib/notes-notify'); await notifyNote(patch.assigned_to, data, actor); }
  await writeAudit({ actorId: actor.id, action: 'note.updated', entityType: 'note', entityId: id });
  return ok({ note: data });
});
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('notes').delete().eq('id', id);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'note.deleted', entityType: 'note', entityId: id });
  return ok({ deleted: true });
});
