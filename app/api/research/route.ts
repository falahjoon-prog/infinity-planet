import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { research } from '@/lib/research';
import { writeAudit } from '@/lib/audit';
export const maxDuration = 300;

/** Web research with sources. Uses the AI's own web search (ChatGPT, Claude, Gemini) or the server's search when none is connected. */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  const q = String(b.question || '').trim(); if (q.length < 3) throw new HttpError(400, 'Ask a research question');
  const history = (Array.isArray(b.history) ? b.history : []).filter((h: any) => h && ['user', 'assistant'].includes(h.role) && typeof h.content === 'string');
  try {
    const r = await research(q, { provider: b.provider || 'auto', history, depth: ['quick', 'standard', 'deep'].includes(b.depth) ? b.depth : 'standard' });
    await writeAudit({ actorId: actor.id, action: 'research.run', metadata: { question: q.slice(0, 200), engine: r.engine, sources: r.sources.length } });
    return ok(r);
  } catch (e: any) {
    throw new HttpError(502, /fetch failed|ENOTFOUND|ECONN|timeout/i.test(String(e?.message)) ? 'The web could not be reached from the Infinity Planet server. Check the internet connection and try again.' : String(e?.message || e));
  }
});
