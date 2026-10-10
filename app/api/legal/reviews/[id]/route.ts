import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('contract_reviews').select('*, project:projects(id,name), document:documents(id,name,authority), author:profiles!contract_reviews_created_by_fkey(full_name), reviewer:profiles!contract_reviews_reviewed_by_fkey(full_name)').eq('id', id).maybeSingle();
  if (error) throw error; if (!data) throw new HttpError(404, 'Review not found');
  const { data: approvals } = await db.from('approvals').select('*, requester:profiles!approvals_requested_by_fkey(full_name), decider:profiles!approvals_decided_by_fkey(full_name)').eq('entity_type', 'contract_review').eq('entity_id', id).order('created_at', { ascending: false });
  return ok({ review: data, approvals: approvals || [] });
});

/** Edit title/project. Status changes go through the approvals workflow. */
export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), ['title', 'project_id']);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  const { data, error } = await getSupabaseAdmin().from('contract_reviews').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'contract_review.updated', entityType: 'contract_review', entityId: id, metadata: patch });
  return ok({ review: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  // Admins, directors, legal — and the person who ran the review — can delete it (e.g. test reviews).
  const { data: rv } = await db.from('contract_reviews').select('created_by').eq('id', id).maybeSingle();
  if (!rv) throw new HttpError(404, 'Review not found');
  if (!['admin', 'director', 'legal'].includes(actor.role) && rv.created_by !== actor.id) throw new HttpError(403, 'Only the person who ran this review, legal or an admin/director can delete it');
  const { error } = await db.from('contract_reviews').delete().eq('id', id);
  if (error) throw error;
  // Anything still waiting for approval on it is cancelled
  await db.from('approvals').update({ status: 'cancelled', decided_at: new Date().toISOString() }).eq('entity_type', 'contract_review').eq('entity_id', id).eq('status', 'pending');
  await writeAudit({ actorId: actor.id, action: 'contract_review.deleted', entityType: 'contract_review', entityId: id });
  return ok({ deleted: true });
});
