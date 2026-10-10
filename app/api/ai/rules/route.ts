import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { listRules, addRule, updateRule, removeRule, canSetTeamRules } from '@/lib/ai-rules';
import { writeAudit } from '@/lib/audit';

/** AI rules: standing commands Infinity AI follows — the team's, and each person's own. */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  return ok({ rules: await listRules(actor.id), me: actor.id, can_team: canSetTeamRules(actor.role), can_admin: actor.role === 'admin' });
});
const wrap = async <T,>(fn: () => Promise<T>) => { try { return await fn(); } catch (e: any) { throw new HttpError(/only|not found/i.test(e?.message || '') ? 403 : 400, e?.message || 'Could not save the rule'); } };
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req); const text = String(b.text || '').trim();
  if (text.length < 3) throw new HttpError(400, 'Write the rule, e.g. "Always remind me 15 minutes before meetings"');
  if (text.length > 600) throw new HttpError(400, 'Keep the rule under 600 characters');
  const r = await wrap(() => addRule(actor, text, b.scope === 'team' ? 'team' : 'me'));
  if (!r.duplicate) await writeAudit({ actorId: actor.id, action: 'ai.rule_added', metadata: { text: r.rule.text, scope: r.rule.scope } });
  return ok({ rule: r.rule, duplicate: r.duplicate, rules: await listRules(actor.id) });
});
export const PATCH = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req); if (!b.id) throw new HttpError(400, 'Which rule?');
  const rule = await wrap(() => updateRule(actor, String(b.id), { text: typeof b.text === 'string' ? b.text : undefined, scope: b.scope === 'team' || b.scope === 'me' ? b.scope : undefined }));
  await writeAudit({ actorId: actor.id, action: 'ai.rule_changed', metadata: { id: rule.id, text: rule.text, scope: rule.scope } });
  return ok({ rule, rules: await listRules(actor.id) });
});
export const DELETE = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const id = req.nextUrl.searchParams.get('id'); if (!id) throw new HttpError(400, 'Which rule?');
  const rule = await wrap(() => removeRule(actor, id));
  await writeAudit({ actorId: actor.id, action: 'ai.rule_removed', metadata: { id, text: rule.text } });
  return ok({ rules: await listRules(actor.id) });
});
