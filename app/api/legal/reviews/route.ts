import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { runContractReview } from '@/lib/legal/review';
export const maxDuration = 300;

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('contract_reviews').select('id,title,status,risk_rating,risk_score,engine,provider,project_id,document_id,ai_error,created_by,created_at,updated_at, project:projects(name), author:profiles!contract_reviews_created_by_fkey(full_name)').order('created_at', { ascending: false }).limit(100);
  for (const k of ['project_id', 'document_id', 'status', 'risk_rating']) if (sp.get(k)) q = q.eq(k, sp.get(k)!);
  const { data, error } = await q;
  if (error) throw error;
  return ok({ reviews: data || [] });
});

/** Run a review: built-in rules engine always; AI provider optional. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const result = await runContractReview(actor.id, { document_id: b.document_id, text: b.text || b.document, title: b.title, project_id: b.project_id, provider: b.provider, rhc_role: b.rhc_role, save: b.save });
  return ok(result, 201);
});
