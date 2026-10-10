import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { BUCKET } from '@/lib/documents';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('documents').select('*, project:projects(id,name), uploader:profiles!documents_created_by_fkey(full_name)').eq('id', id).maybeSingle();
  if (error) throw error; if (!data) throw new HttpError(404, 'Document not found');
  const [{ count }, reviews, approvals] = await Promise.all([
    db.from('document_chunks').select('id', { count: 'exact', head: true }).eq('document_id', id),
    db.from('contract_reviews').select('id,title,status,risk_rating,risk_score,engine,created_at').eq('document_id', id).order('created_at', { ascending: false }),
    db.from('approvals').select('*').eq('entity_type', 'document').eq('entity_id', id).order('created_at', { ascending: false }),
  ]);
  const text = data.content_text || '';
  return ok({ document: { ...data, content_text: text.slice(0, 200_000), text_truncated: text.length > 200_000, text_length: text.length }, chunk_count: count || 0, reviews: reviews.data || [], approvals: approvals.data || [] });
});

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const patch = pick(b, ['name', 'project_id', 'deal_id', 'authority', 'category']);
  if (patch.authority && !['approved', 'preferred', 'fallback', 'historical_precedent', 'draft'].includes(patch.authority)) throw new HttpError(400, 'Invalid authority');
  if (patch.authority && ['approved', 'preferred', 'fallback'].includes(patch.authority) && !['admin', 'director', 'legal'].includes(actor.role)) throw new HttpError(403, 'Only admin, director or legal can classify a document as APPROVED, PREFERRED or FALLBACK');
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('documents').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  if ('project_id' in patch) await db.from('document_chunks').update({ project_id: patch.project_id }).eq('document_id', id);
  await writeAudit({ actorId: actor.id, action: patch.authority ? 'document.authority_changed' : 'document.updated', entityType: 'document', entityId: id, metadata: patch });
  return ok({ document: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  if (!['admin', 'director', 'manager', 'legal'].includes(actor.role)) throw new HttpError(403, 'Only managers, legal or executives can delete documents');
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: doc, error: e1 } = await db.from('documents').select('id,name,storage_path').eq('id', id).single();
  if (e1) throw new HttpError(404, 'Document not found');
  if (doc.storage_path) await db.storage.from(BUCKET).remove([doc.storage_path]);
  const { error } = await db.from('documents').delete().eq('id', id);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'document.deleted', entityType: 'document', entityId: id, metadata: { name: doc.name } });
  return ok({ deleted: true });
});
