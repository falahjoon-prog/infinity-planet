import { chat, extractJson, Provider } from '../providers';
import { Finding, LegalAnalysis, MissingProtection, Severity } from './engine';

const SEV: Severity[] = ['critical', 'high', 'medium', 'low'];
const sev = (s: any): Severity => (SEV.includes(String(s).toLowerCase() as Severity) ? String(s).toLowerCase() as Severity : 'medium');
const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
const str = (x: any) => (typeof x === 'string' ? x : x == null ? '' : JSON.stringify(x));

/**
 * Deepens the rules-engine analysis with an external AI provider. The rules
 * output is passed to the model as a baseline and the model's additions are
 * merged in, labelled source:'ai'. If the provider fails, the caller keeps the
 * rules analysis and records the error.
 */
export async function enhanceWithAI(provider: Provider, text: string, base: LegalAnalysis, ctx: { rhcNames: string[]; rhcRole?: string | null; home: string; library: any[]; instructions: string; ourName?: string; businessName?: string }) {
  const limit = provider === 'ollama' ? 24_000 : 150_000;
  const doc = text.length > limit ? `${text.slice(0, limit)}\n\n[Document truncated at ${limit} characters]` : text;
  const baseline = {
    document_type: base.document_type, binding_status: base.binding_status, parties: base.parties, overall_risk: base.overall_risk,
    findings: base.findings.map(f => ({ severity: f.severity, title: f.title, clause_ref: f.clause_ref, issue: f.issue })),
    missing_protections: base.missing_protections.map(m => m.label),
  };
  const us = ctx.ourName || 'RHC', biz = ctx.businessName || 'RHC City';
  const system = `${ctx.instructions}\n\nYou are ${biz}'s senior contract-review engine. You act ONLY for ${us} (${ctx.rhcNames.join(' / ')}${ctx.rhcRole ? `, defined in the document as "${ctx.rhcRole}"` : ''}). Home jurisdiction: ${ctx.home}, Australia. Never invent facts that are not in the document. Quote clause numbers exactly. Never treat an old or signed agreement as an approved ${us} position: only clauses marked APPROVED in the ${us} clause library are approved positions; PREFERRED/FALLBACK are negotiation positions; HISTORICAL PRECEDENT is reference only; DRAFT is unapproved.`;
  const prompt = `A deterministic rules engine has already reviewed this agreement. Its baseline findings are below. Review the FULL document yourself, confirm or correct the baseline, and add anything it missed (especially commercial nuance, drafting ambiguities, interaction between clauses, and risks hidden in definitions or schedules).

Return ONLY a JSON object with these keys:
{
 "executive_summary": string (5-8 sentences, ${us} perspective),
 "key_terms": [{"label": string, "value": string, "clause_ref": string}],
 "findings": [{"severity": "critical|high|medium|low", "category": "financial|termination|liability|commercial|legal|drafting", "title": string, "clause_ref": string, "excerpt": string, "issue": string, "recommendation": string, "negotiation_point": string, "solicitor_question": string, "proposed_wording": string}],
 "missing_protections": [{"label": string, "severity": "...", "why": string, "recommendation": string, "proposed_wording": string}],
 "conditions_precedent": [{"text": string, "clause_ref": string}],
 "due_diligence": [{"item": string, "reason": string}],
 "negotiation_points": [string],
 "solicitor_questions": [string],
 "overall_risk": {"rating": "Low|Medium|High|Critical", "rationale": [string]},
 "disagreements_with_baseline": [string]
}
Only include findings that are NEW or that correct the baseline — do not repeat baseline items unchanged.

${us.toUpperCase()} CLAUSE LIBRARY (authority-labelled):
${JSON.stringify(ctx.library.map(c => ({ name: c.name, category: c.category, authority: c.authority, status: c.status, preferred: c.preferred_position, fallback: c.fallback_position, prohibited: c.prohibited_position })).slice(0, 60))}

RULES-ENGINE BASELINE:
${JSON.stringify(baseline)}

DOCUMENT:
${doc}`;
  const raw = await chat(provider, { system, messages: [{ role: 'user', content: prompt }], maxTokens: 6000, timeoutMs: 240_000 });
  const ai = extractJson<any>(raw);
  if (!ai) throw new Error('The AI response was not valid JSON; the rules-engine analysis was kept.');

  const merged: LegalAnalysis = JSON.parse(JSON.stringify(base));
  merged.engine = 'rules+ai';
  merged.provider = provider;
  let n = 0;
  const seen = new Set(merged.findings.map(f => f.title.toLowerCase()));
  for (const f of arr(ai.findings)) {
    const title = str(f.title).trim(); if (!title || seen.has(title.toLowerCase())) continue; seen.add(title.toLowerCase());
    merged.findings.push({ id: `A${++n}`, severity: sev(f.severity), category: (['financial', 'termination', 'liability', 'commercial', 'legal', 'drafting'].includes(f.category) ? f.category : 'legal') as Finding['category'], title, clause_ref: str(f.clause_ref) || undefined, excerpt: str(f.excerpt) || undefined, issue: str(f.issue), recommendation: str(f.recommendation), negotiation_point: str(f.negotiation_point) || undefined, solicitor_question: str(f.solicitor_question) || undefined, proposed_wording: str(f.proposed_wording) || undefined, source: 'ai' });
  }
  const seenM = new Set(merged.missing_protections.map(m => m.label.toLowerCase()));
  for (const m of arr(ai.missing_protections)) {
    const label = str(m.label).trim(); if (!label || seenM.has(label.toLowerCase())) continue; seenM.add(label.toLowerCase());
    merged.missing_protections.push({ topic: 'ai', label, severity: sev(m.severity), why: str(m.why), recommendation: str(m.recommendation), proposed_wording: str(m.proposed_wording) || undefined, source: 'ai' } as MissingProtection);
  }
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  merged.findings.sort((a, b) => order[a.severity] - order[b.severity]);
  if (str(ai.executive_summary)) merged.executive_summary = `${str(ai.executive_summary)}\n\nRules engine: ${base.executive_summary}`;
  for (const k of arr(ai.key_terms)) if (k?.label && !merged.key_terms.some(x => x.label.toLowerCase() === str(k.label).toLowerCase())) merged.key_terms.push({ label: str(k.label), value: str(k.value), clause_ref: str(k.clause_ref) || undefined });
  for (const c of arr(ai.conditions_precedent)) if (c?.text && !merged.conditions_precedent.some(x => x.text === c.text)) merged.conditions_precedent.push({ text: str(c.text), clause_ref: str(c.clause_ref) });
  for (const d of arr(ai.due_diligence)) if (d?.item && !merged.due_diligence.some(x => x.item === d.item)) merged.due_diligence.push({ item: str(d.item), reason: str(d.reason) });
  merged.negotiation_points = [...new Set([...merged.negotiation_points, ...arr(ai.negotiation_points).map(str)])].filter(Boolean);
  merged.solicitor_questions = [...new Set([...merged.solicitor_questions, ...arr(ai.solicitor_questions).map(str)])].filter(Boolean);
  for (const f of merged.findings.filter(f => f.source === 'ai' && f.proposed_wording)) merged.recommended_amendments.push({ clause_ref: f.clause_ref || 'General', issue: f.title, proposed: f.proposed_wording! });
  const byCat = (cat: string) => merged.findings.filter(f => f.category === cat).map(f => `${f.title}${f.clause_ref ? ` (${f.clause_ref})` : ''} — ${f.issue}`);
  merged.financial_risks = byCat('financial'); merged.termination_risks = byCat('termination'); merged.liability_risks = byCat('liability');
  // Overall rating: take the more severe of rules and AI; keep the rules score.
  const ratings = ['Low', 'Medium', 'High', 'Critical'];
  const aiRating = ratings.includes(ai.overall_risk?.rating) ? ai.overall_risk.rating : null;
  if (aiRating && ratings.indexOf(aiRating) > ratings.indexOf(merged.overall_risk.rating)) merged.overall_risk.rating = aiRating;
  merged.overall_risk.rationale = [...merged.overall_risk.rationale, ...arr(ai.overall_risk?.rationale).map((r: any) => `AI: ${str(r)}`)];
  const dis = arr(ai.disagreements_with_baseline).map(str).filter(Boolean);
  if (dis.length) merged.ai_notes = dis.join('\n');
  return merged;
}
