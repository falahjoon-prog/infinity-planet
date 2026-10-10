import { NextRequest } from 'next/server';
import { route, ok, body, must, pick } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

const PROJECT_FIELDS = ['name', 'description', 'project_type', 'status', 'risk', 'deal_value', 'owner_id', 'location', 'counterparty', 'next_action', 'next_action_at', 'tags', 'highlights'];

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  const db = getSupabaseAdmin();
  let q = db.from('projects').select('*, owner:profiles!projects_owner_id_fkey(full_name)').order('updated_at', { ascending: false });
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  if (sp.get('risk')) q = q.eq('risk', sp.get('risk')!);
  if (sp.get('q')) q = q.ilike('name', `%${sp.get('q')!.replace(/[%_]/g, '')}%`);
  if (!sp.get('include_archived')) q = q.neq('status', 'archived');
  const { data, error } = await q;
  if (error) throw error;
  const ids = (data || []).map(p => p.id);
  const counts: Record<string, { tasks: number; overdue: number; docs: number }> = {};
  if (ids.length) {
    const [t, d] = await Promise.all([
      db.from('tasks').select('project_id,due_at,status').in('project_id', ids).neq('status', 'done'),
      db.from('documents').select('project_id').in('project_id', ids),
    ]);
    const now = Date.now();
    for (const x of t.data || []) { const c = counts[x.project_id] ||= { tasks: 0, overdue: 0, docs: 0 }; c.tasks++; if (x.due_at && new Date(x.due_at).getTime() < now) c.overdue++; }
    for (const x of d.data || []) { const c = counts[x.project_id] ||= { tasks: 0, overdue: 0, docs: 0 }; c.docs++; }
  }
  return ok({ projects: (data || []).map(p => ({ ...p, counts: counts[p.id] || { tasks: 0, overdue: 0, docs: 0 } })) });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.name, 'Project name is required');
  const row = pick(b, PROJECT_FIELDS);
  const { data, error } = await getSupabaseAdmin().from('projects').insert({ ...row, owner_id: row.owner_id || actor.id, created_by: actor.id }).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'project.created', entityType: 'project', entityId: data.id, metadata: { name: data.name } });
  return ok({ project: data }, 201);
});
