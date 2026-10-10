import { aiInstructions, getBrand, possessive, AI_NAME, SEARCH_NAME, APP_NAME } from '@/lib/brand';
import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { executiveData, rulesSummary } from '@/lib/executive';
import { chat, isProvider, providerStatus, providerReady } from '@/lib/providers';
import { getSetting } from '@/lib/settings';
export const maxDuration = 120;

/** AI executive summary from live metrics (real provider call). */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  if (!isProvider(b.provider)) throw new HttpError(400, 'Choose an AI provider');
  if (!providerReady(b.provider)) throw new HttpError(409, `${b.provider} is not configured on the Infinity Planet server`);
  const d = await executiveData(actor.id);
  const B = await getBrand();
  const facts = {
    kpis: d.kpis, high_risk_projects: d.highRiskProjects.map(p => ({ name: p.name, risk: p.risk, status: p.status, next_action: p.next_action })),
    deadlines: d.deadlines, pipeline: d.pipeline, overdue: d.overdueTasks.map((t: any) => ({ title: t.title, due: t.due_at, project: t.project?.name })),
    legal_risks: d.legalRisks.map(r => ({ title: r.title, rating: r.risk_rating, project: r.project })), meetings: d.meetings.map(m => ({ title: m.title, at: m.starts_at, project: m.project })),
    approvals: d.approvals.map(a => ({ title: a.title, category: a.category })),
  };
  const text = await chat(b.provider, {
    system: await aiInstructions(actor.id),
    messages: [{ role: 'user', content: `Write a crisp executive briefing for ${possessive(B.business_name)} directors from these live operating facts. 5-8 short bullet points: what matters most today, risks, decisions needed, and recommended next actions. Use only these facts; do not invent numbers. Values are AUD.\n\n${JSON.stringify(facts)}` }],
    maxTokens: 900,
  });
  return ok({ summary: { text, engine: b.provider, rules: rulesSummary(d, B.business_name) } });
});
