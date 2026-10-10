import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { composeEmail } from '@/lib/email-compose';

/**
 * Draft an email or a reply. Reads the email/thread (thread_id, message_id, thread[] or original),
 * searches earlier emails with the same sender on the same topic, and writes as the chosen role
 * (persona: admin | coordinator | manager | ceo). provider "none" = built-in writer (no AI key).
 */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const r = await composeEmail(actor, { ...b, persona: 'persona' in b ? (b.persona || null) : undefined });
  return ok(r);
});
