import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireWriter, canApprove } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requestApproval, isEntityType, mayDecide } from '@/lib/approvals';

export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('approvals').select('*, requester:profiles!approvals_requested_by_fkey(full_name), reviewer:profiles!approvals_reviewer_id_fkey(full_name), decider:profiles!approvals_decided_by_fkey(full_name), project:projects(id,name)').order('created_at', { ascending: false }).limit(200);
  q = q.neq('entity_type', 'email_draft'); // emails no longer go through approval
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  if (sp.get('entity_type')) q = q.eq('entity_type', sp.get('entity_type')!);
  if (sp.get('entity_id')) q = q.eq('entity_id', sp.get('entity_id')!);
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  const { data, error } = await q;
  if (error) throw error;
  const routes = await import('@/lib/org').then(m => m.routesFor((data || []).filter((a: any) => a.status === 'pending').map((a: any) => a.id))).catch(() => ({} as Record<string, any>));
  const approvals = (data || []).map((a: any) => ({ ...a, can_decide: mayDecide(actor, a), assigned_to_me: Array.isArray(a.approvers) && a.approvers.includes(actor.id), route: routes[a.id] ? { step: routes[a.id].step, total: routes[a.id].total, explain: routes[a.id].explain } : null }));
  return ok({ approvals });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  if (!isEntityType(b.entity_type)) throw new HttpError(400, 'Unknown entity_type');
  if (!b.entity_id) throw new HttpError(400, 'entity_id is required');
  const approval = await requestApproval(actor, b.entity_type, b.entity_id, { summary: b.summary, reviewer_id: b.reviewer_id, approvers: Array.isArray(b.approvers) ? b.approvers : null });
  return ok({ approval }, 201);
});
