import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { composeEmail } from '@/lib/email-compose';

/** "Read by Infinity AI": what the email says, questions, requests, dates, earlier related emails and the linked project. */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  const r = await composeEmail(actor, { thread_id: b.thread_id, message_id: b.message_id, original: b.original, thread: b.thread, related: b.related, use_history: b.use_history, provider: null });
  return ok({ reading: r.reading, insights: r.insights, related: r.related, project: r.project, reply_to: r.reply_to, note: r.note });
});
