import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data } = await db.from('marketing_assets').select('*, project:projects(id,name), approver:profiles!marketing_assets_approved_by_fkey(full_name)').eq('id', id).maybeSingle();
  if (!data) throw new HttpError(404, 'Asset not found');
  const { data: approvals } = await db.from('approvals').select('*, decider:profiles!approvals_decided_by_fkey(full_name)').eq('entity_type', 'marketing_asset').eq('entity_id', id).order('created_at', { ascending: false });
  return ok({ asset: data, approvals: approvals || [] });
});

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), ['title', 'content', 'project_id', 'layout', 'design', 'channel']);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  const db = getSupabaseAdmin();
  const { data: cur } = await db.from('marketing_assets').select('status,version').eq('id', id).single();
  if (cur?.status === 'awaiting_approval' && (patch.content || patch.design)) throw new HttpError(409, 'This asset is awaiting approval. Cancel the request before editing.');
  const changed = 'content' in patch || 'design' in patch || 'layout' in patch;
  const extra = changed && cur?.status === 'approved' ? { status: 'draft', approved_by: null, version: (cur.version || 1) + 1 } : {};
  const { data, error } = await db.from('marketing_assets').update({ ...patch, ...extra, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'marketing.updated', entityType: 'marketing_asset', entityId: id, metadata: { fields: Object.keys(patch), reapproval_required: !!(extra as any).status } });
  return ok({ asset: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('marketing_assets').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'marketing.archived', entityType: 'marketing_asset', entityId: id });
  return ok({ archived: true });
});
