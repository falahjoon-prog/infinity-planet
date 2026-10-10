import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { rewriteEmail } from '@/lib/email-compose';

/** Polish, proofread, shorten, make more formal or friendlier (mode), or follow a custom instruction (AI). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(String(b.body || '').trim(), 'Write something first');
  return ok(await rewriteEmail(actor, { body: String(b.body).slice(0, 30_000), mode: b.mode, instruction: b.instruction ? String(b.instruction).slice(0, 500) : undefined, provider: b.provider, to: b.to }));
});
