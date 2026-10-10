import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { assertCanAmend } from '@/lib/approvals';

export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data } = await db.from('generated_documents').select('*, project:projects(id,name), template:document_templates(id,name,status,version), author:profiles!generated_documents_created_by_fkey(full_name)').eq('id', id).maybeSingle();
  if (!data) throw new HttpError(404, 'Document not found');
  const { data: approvals } = await db.from('approvals').select('*, decider:profiles!approvals_decided_by_fkey(full_name)').eq('entity_type', 'generated_document').eq('entity_id', id).order('created_at', { ascending: false });
  return ok({ generated: data, approvals: approvals || [] });
});

/** Editing an approved document sends it back to draft (re-approval required). */
export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), ['title', 'body', 'project_id', 'deal_id']);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  const db = getSupabaseAdmin();
  const { data: cur } = await db.from('generated_documents').select('status,version').eq('id', id).single();
  // Under approval: only the assigned approver(s) may amend it (their edit keeps it under review)
  const pending = cur?.status === 'awaiting_approval' ? await assertCanAmend(actor, 'generated_document', id) : null;
  const extra = patch.body && pending ? {} : patch.body ? { status: 'draft', version: (cur?.version || 1) + (cur?.status === 'approved' || cur?.status === 'exported' ? 1 : 0) } : {};
  const { data, error } = await db.from('generated_documents').update({ ...patch, ...extra, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'generated_document.updated', entityType: 'generated_document', entityId: id, metadata: { fields: Object.keys(patch) } });
  return ok({ generated: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('generated_documents').delete().eq('id', id).in('status', ['draft', 'rejected', 'changes_requested']);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'generated_document.deleted', entityType: 'generated_document', entityId: id });
  return ok({ deleted: true });
});
