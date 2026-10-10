import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { aiKeyStatus, saveAiKey, removeAiKey, setAiModel, isKeyProvider, AI_KEY_FIELDS } from '@/lib/ai-keys';
import { writeAudit } from '@/lib/audit';
import { chat } from '@/lib/providers';

/** Admin-only: which AI keys are set (never the keys themselves). */
export const GET = route(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'director']);
  return ok({ keys: await aiKeyStatus() });
});

/** Save a key ({ provider, key, model? }), change the model ({ provider, model }), or test ({ provider, test: true }). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const b = await body<{ provider?: string; key?: string; model?: string | null; test?: boolean }>(req);
  if (!isKeyProvider(b.provider)) throw new HttpError(400, 'Choose Anthropic, OpenAI or Gemini');
  const label = AI_KEY_FIELDS[b.provider].label;
  if (b.test) {
    try { const t = await chat(b.provider, { messages: [{ role: 'user', content: 'Reply with the single word: ready' }], maxTokens: 20, timeoutMs: 30_000 }); return ok({ ok: true, message: `${label} is working (replied “${t.trim().slice(0, 40)}”).` }); }
    catch (e: any) {
      const m = String(e?.message || e);
      const why = /ACCESS_TOKEN_TYPE_UNSUPPORTED|API_KEY_INVALID|API key not valid|invalid.?api.?key|401/i.test(m) ? 'Google/the provider says this key is not valid. Copy the key again with the “Copy key” button (the whole line), or create a new key and paste that.'
        : /PERMISSION_DENIED|403|not been used|disabled|SERVICE_DISABLED/i.test(m) ? 'The key works but the AI service is switched off for its project. In Google AI Studio create the key with “Create API key in new project”, or enable the Generative Language API for that project.'
        : /quota|RESOURCE_EXHAUSTED|429|billing|credit/i.test(m) ? 'The key is fine but its free allowance or credit has run out. Check billing/credit with the provider, or try again later.'
        : /model|not found|404/i.test(m) ? 'The key works but the model name is wrong. Clear the “Model” box to use the recommended model.'
        : /fetch failed|ENOTFOUND|ECONNREFUSED|timeout|Timeout/i.test(m) ? 'The server could not reach the provider. Check this PC’s internet connection.' : '';
      return ok({ ok: false, message: `${label} did not work. ${why}`.trim() + ` (Details: ${m.slice(0, 220)})` });
    }
  }
  try {
    if (b.key) await saveAiKey(b.provider, b.key, b.model, actor.id);
    else if ('model' in b) await setAiModel(b.provider, b.model ?? null, actor.id);
    else throw new HttpError(400, 'Paste the key first');
  } catch (e: any) { if (e instanceof HttpError) throw e; throw new HttpError(400, e.message); }
  await writeAudit({ actorId: actor.id, action: b.key ? 'ai_key.saved' : 'ai_key.model_changed', metadata: { provider: b.provider } });
  return ok({ keys: await aiKeyStatus() });
});

export const DELETE = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const p = req.nextUrl.searchParams.get('provider');
  if (!isKeyProvider(p)) throw new HttpError(400, 'Unknown provider');
  await removeAiKey(p, actor.id);
  await writeAudit({ actorId: actor.id, action: 'ai_key.removed', metadata: { provider: p } });
  return ok({ keys: await aiKeyStatus() });
});
