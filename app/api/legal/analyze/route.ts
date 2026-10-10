import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { runContractReview } from '@/lib/legal/review';
export const maxDuration = 300;
/** V3 compatibility alias for POST /api/legal/reviews. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  return ok(await runContractReview(actor.id, { document_id: b.document_id, text: b.text || b.document, project_id: b.project_id, provider: b.provider, rhc_role: b.rhc_role, save: b.save }), 201);
});
