import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { reviewSource } from '@/lib/legal/amend-store';

/** Saves the amended contract as a draft document (Drafting → Documents) that goes through approval before export. */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  must(String(b.text || '').trim().length > 80 && b.text, 'The amended contract is empty');
  const { review } = await reviewSource(id);
  const title = String(b.title || `Amended — ${review.title || 'contract'}`).slice(0, 200);
  const { data, error } = await getSupabaseAdmin().from('generated_documents').insert({ project_id: review.project_id, doc_type: 'amended_contract', title, body: String(b.text), inputs: { review_id: id, changes: b.changes || [], engine: b.engine || 'rules' }, engine: b.engine === 'rules' || !b.engine ? 'template' : 'ai', provider: b.engine && b.engine !== 'rules' ? b.engine : null, status: 'draft', created_by: actor.id }).select('id,title').single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'contract.amended', entityType: 'contract_review', entityId: id, metadata: { generated_document_id: data.id, changes: (b.changes || []).length } });
  return ok({ document: data }, 201);
});
