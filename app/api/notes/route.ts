import { NextRequest } from 'next/server';
import { route, ok, body, must, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { notifyNote } from '@/lib/notes-notify';

export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const actor = await getActor(req);
  const withAssignee = '*, project:projects(id,name), author:profiles!notes_created_by_fkey(full_name), assignee:profiles!notes_assigned_to_fkey(id,full_name,email,color)';
  const build = (sel: string) => { let q = getSupabaseAdmin().from('notes').select(sel).order('important', { ascending: false }).order('updated_at', { ascending: false }).limit(300);
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  if (sp.get('deal_id')) q = q.eq('deal_id', sp.get('deal_id')!);
  if (sp.get('important') === '1') q = q.eq('important', true);
  if (sp.get('q')) { const s = sp.get('q')!.replace(/[%_,()]/g, ' '); q = q.or(`title.ilike.%${s}%,body.ilike.%${s}%`); }
  const a = sp.get('assigned');
  if (a === 'me') q = q.eq('assigned_to', actor.id); else if (a === 'general') q = q.is('assigned_to', null); else if (a && /^[0-9a-f-]{36}$/.test(a)) q = q.eq('assigned_to', a);
  return q; };
  let { data, error } = await build(withAssignee);
  if (error && /assigned_to|assignee|relationship/i.test(error.message)) ({ data, error } = await build('*, project:projects(id,name), author:profiles!notes_created_by_fkey(full_name)'));
  if (error) throw error;
  return ok({ notes: data || [] });
});
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.title, 'Title is required'); must(b.body, 'Note text is required');
  const row: any = { ...pick(b, ['title', 'body', 'important', 'project_id', 'deal_id', 'tags']), created_by: actor.id };
  if (b.assigned_to) row.assigned_to = b.assigned_to;
  const { data, error } = await getSupabaseAdmin().from('notes').insert(row).select().single();
  if (error) throw /assigned_to/.test(error.message) ? new HttpError(409, 'Assigning notes needs the 4.3 database update (supabase/migrations/006_email_options_4_3.sql).') : error;
  if (row.assigned_to && row.assigned_to !== actor.id) await notifyNote(row.assigned_to, data, actor);
  await writeAudit({ actorId: actor.id, action: 'note.created', entityType: 'note', entityId: data.id, metadata: { title: data.title, project_id: data.project_id } });
  return ok({ note: data }, 201);
});

