import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { translate } from '@/lib/translate';

/** Translate text English ⇄ Farsi. Body: { text, to?: 'en' | 'fa', provider? } — "to" defaults to the other language. */
export const POST = route(async (req: NextRequest) => {
  await getActor(req);
  const b = await body(req);
  return ok(await translate(String(b.text || ''), b.to, b.provider || 'auto'));
});
