import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { readThread } from '@/lib/email-history';
import { stripQuoted } from '@/lib/email-craft';
import { tidyEmailText } from '@/lib/email-clean';

/** The whole Gmail conversation, oldest first, with quoted history removed from each message. */
export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const msgs = await readThread(id, actor.id);
  return ok({ messages: msgs.map(m => ({ ...m, clean: tidyEmailText(stripQuoted(m.body)).slice(0, 20_000), body: m.body.slice(0, 60_000) })) });
});
