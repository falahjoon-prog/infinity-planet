import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

const FIELDS = ['name', 'category', 'authority', 'clause_text', 'preferred_position', 'fallback_position', 'prohibited_position', 'keywords', 'notes', 'source_document_id'];
const SUBSTANTIVE = ['authority', 'clause_text', 'preferred_position', 'fallback_position', 'prohibited_position'];

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), FIELDS);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  if (typeof patch.keywords === 'string') patch.keywords = patch.keywords.split(',').map((s: string) => s.trim()).filter(Boolean);
  // Any substantive change voids a previous approval.
  const voids = Object.keys(patch).some(k => SUBSTANTIVE.includes(k));
  const { data, error } = await getSupabaseAdmin().from('legal_clauses').update({ ...patch, ...(voids ? { status: 'draft', approved_by: null } : {}), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'legal_clause.updated', entityType: 'legal_clause', entityId: id, metadata: { fields: Object.keys(patch), approval_voided: voids } });
  return ok({ clause: data, approval_voided: voids });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  if (!['admin', 'director', 'legal'].includes(actor.role)) throw new HttpError(403, 'Only legal or executives can delete clauses');
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('legal_clauses').delete().eq('id', id);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'legal_clause.deleted', entityType: 'legal_clause', entityId: id });
  return ok({ deleted: true });
});
