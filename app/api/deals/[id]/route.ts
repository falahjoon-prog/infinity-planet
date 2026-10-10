import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

const FIELDS = ['title', 'project_id', 'stage', 'probability', 'counterparty', 'counterparty_id', 'contact_name', 'contact_email', 'contact_phone', 'expected_value', 'next_action', 'next_action_at', 'owner_id', 'notes', 'lost_reason'];
const STAGE_PROBABILITY: Record<string, number> = { lead: 10, opportunity: 25, negotiation: 50, due_diligence: 65, contract: 85, completed: 100, lost: 0 };

export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: deal, error } = await db.from('deals').select('*, project:projects(id,name,status,risk), owner:profiles!deals_owner_id_fkey(full_name)').eq('id', id).maybeSingle();
  if (error) throw error; if (!deal) throw new HttpError(404, 'Deal not found');
  const orProject = (t: any) => deal.project_id ? t.or(`deal_id.eq.${id},project_id.eq.${deal.project_id}`) : t.eq('deal_id', id);
  const [tasks, notes, documents, activity, contacts, emails] = await Promise.all([
    orProject(db.from('tasks').select('id,title,status,priority,due_at,deal_id,project_id')).order('due_at', { ascending: true, nullsFirst: false }),
    orProject(db.from('notes').select('id,title,body,important,deal_id,created_at')).order('created_at', { ascending: false }),
    orProject(db.from('documents').select('id,name,status,authority,review_status,deal_id,updated_at')).order('updated_at', { ascending: false }),
    db.from('audit_events').select('*, actor:profiles!audit_events_actor_id_fkey(full_name)').eq('entity_id', id).order('created_at', { ascending: false }).limit(50),
    deal.counterparty_id ? db.from('contacts').select('*').eq('counterparty_id', deal.counterparty_id) : Promise.resolve({ data: [] }),
    db.from('email_links').select('*').eq('deal_id', id),
  ]);
  return ok({ deal, tasks: tasks.data || [], notes: notes.data || [], documents: documents.data || [], activity: activity.data || [], contacts: (contacts as any).data || [], emails: emails.data || [] });
});

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), FIELDS);
  if (!Object.keys(patch).length) throw new HttpError(400, 'No editable fields supplied');
  const db = getSupabaseAdmin();
  const { data: before } = await db.from('deals').select('stage,probability').eq('id', id).single();
  if (patch.stage && patch.probability === undefined && before && before.probability === (STAGE_PROBABILITY[before.stage] ?? before.probability)) patch.probability = STAGE_PROBABILITY[patch.stage];
  if (patch.stage === 'completed' || patch.stage === 'lost') patch.closed_at = new Date().toISOString();
  if (patch.stage === 'lost' && !patch.lost_reason) { /* allowed, but recorded */ }
  const { data, error } = await db.from('deals').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  const action = patch.stage && before?.stage !== patch.stage ? 'deal.stage_changed' : 'deal.updated';
  await writeAudit({ actorId: actor.id, action, entityType: 'deal', entityId: id, metadata: action === 'deal.stage_changed' ? { from: before?.stage, to: patch.stage } : { fields: Object.keys(patch) } });
  return ok({ deal: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireRole(req, ['admin', 'director', 'manager']);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('deals').delete().eq('id', id);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'deal.deleted', entityType: 'deal', entityId: id });
  return ok({ deleted: true });
});
