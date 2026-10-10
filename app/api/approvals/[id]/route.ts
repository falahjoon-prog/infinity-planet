import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, canApprove } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { decideApproval, ENTITY, EntityType, mayDecide } from '@/lib/approvals';
import { writeAudit } from '@/lib/audit';

export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: a } = await db.from('approvals').select('*, requester:profiles!approvals_requested_by_fkey(full_name), reviewer:profiles!approvals_reviewer_id_fkey(full_name), decider:profiles!approvals_decided_by_fkey(full_name), project:projects(id,name)').eq('id', id).maybeSingle();
  if (!a) throw new HttpError(404, 'Approval not found');
  const cfg = ENTITY[a.entity_type as EntityType];
  const [entity, comments] = await Promise.all([
    cfg ? db.from(cfg.table).select('*').eq('id', a.entity_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('approval_comments').select('*, author:profiles!approval_comments_author_id_fkey(full_name)').eq('approval_id', id).order('created_at'),
  ]);
  const e: any = (entity as any).data;
  if (e && 'content_text' in e) e.content_text = String(e.content_text || '').slice(0, 20000);
  const can_decide = mayDecide(actor, a);
  const named: string[] = Array.isArray(a.approvers) ? a.approvers : [];
  const { data: people } = named.length ? await db.from('profiles').select('id,full_name,email,role').in('id', named) : { data: [] as any[] };
  return ok({ approval: { ...a, can_decide, approver_people: people || [], can_reassign: a.status === 'pending' && (a.requested_by === actor.id || ['admin', 'director'].includes(actor.role)) }, entity: e, comments: comments.data || [] });
});

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const b = await body(req);
  if (b.status === 'cancelled') {
    const db = getSupabaseAdmin();
    const { data: a } = await db.from('approvals').select('*').eq('id', id).single();
    if (!a || a.status !== 'pending') throw new HttpError(409, 'Only pending approvals can be cancelled');
    if (a.requested_by !== actor.id && !['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only the requester can cancel');
    await db.from('approvals').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
    const cfg = ENTITY[a.entity_type as EntityType];
    if (cfg) await db.from(cfg.table).update({ [cfg.statusField]: a.entity_type === 'document' ? 'unreviewed' : 'draft' }).eq('id', a.entity_id);
    await writeAudit({ actorId: actor.id, action: 'approval.cancelled', entityType: a.entity_type, entityId: a.entity_id, metadata: { approval_id: id } });
    return ok({ cancelled: true });
  }
  if (Array.isArray(b.approvers)) {
    // Change who approves (requester, admin or director)
    const db = getSupabaseAdmin();
    const { data: a } = await db.from('approvals').select('*').eq('id', id).single();
    if (!a || a.status !== 'pending') throw new HttpError(409, 'Only pending approvals can be reassigned');
    if (a.requested_by !== actor.id && !['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only the requester, an admin or a director can change the approvers');
    const ids = [...new Set(b.approvers.filter((x: any) => typeof x === 'string'))] as string[];
    if (!ids.length) throw new HttpError(400, 'Choose at least one approver');
    const { data: ppl } = await db.from('profiles').select('id,role,active').in('id', ids);
    if ((ppl || []).length !== ids.length || (ppl || []).some((p: any) => p.role === 'viewer' || p.active === false)) throw new HttpError(400, 'Approvers must be active team members (not viewers).');
    const { error } = await db.from('approvals').update({ approvers: ids, reviewer_id: ids.length === 1 ? ids[0] : null, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await writeAudit({ actorId: actor.id, action: 'approval.reassigned', entityType: a.entity_type, entityId: a.entity_id, metadata: { approval_id: id, approvers: ids } });
    return ok({ reassigned: true });
  }
  if (!['approved', 'rejected', 'changes_requested'].includes(b.status)) throw new HttpError(400, 'Decision must be approved, rejected or changes_requested');
  if (b.status !== 'approved' && !String(b.note || '').trim()) throw new HttpError(400, 'Please add a comment explaining the decision');
  const approval = await decideApproval(actor, id, b.status, b.note);
  return ok({ approval });
});
