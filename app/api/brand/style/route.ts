import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireRole } from '@/lib/auth';
import { styleRules, addRule, removeRule, approvedSamples } from '@/lib/house-style';
import { writeAudit } from '@/lib/audit';

/** House writing style: standing rules (learned or added) and how many approved samples the writer can learn from. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const [rules, legal, letters, marketing] = await Promise.all([styleRules(), approvedSamples('legal', 50), approvedSamples('letter', 50), approvedSamples('marketing', 50)]);
  return ok({ rules, samples: { legal: legal.length, letters: letters.length, marketing: marketing.length } });
});
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director', 'manager']);
  const b = await body(req); const text = String(b.text || '').trim();
  if (text.length < 4) throw new HttpError(400, 'Write the rule, e.g. "Always sign letters as Managing Director"');
  if (text.length > 300) throw new HttpError(400, 'Keep the rule under 300 characters');
  const rules = await addRule(text, actor.id);
  await writeAudit({ actorId: actor.id, action: 'settings.style_rule_added', metadata: { text } });
  return ok({ rules });
});
export const DELETE = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director', 'manager']);
  const id = req.nextUrl.searchParams.get('id'); if (!id) throw new HttpError(400, 'Which rule?');
  const rules = await removeRule(id, actor.id);
  await writeAudit({ actorId: actor.id, action: 'settings.style_rule_removed', metadata: { id } });
  return ok({ rules });
});
