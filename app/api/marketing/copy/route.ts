import { brandBookExcerpt } from '@/lib/brand-book';
import { aiInstructions, getBrand, possessive, AI_NAME, SEARCH_NAME, APP_NAME } from '@/lib/brand';
import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { contentFromProject } from '@/lib/designer';
import { chat, extractJson, isProvider, providerStatus, providerReady } from '@/lib/providers';
import { getSetting } from '@/lib/settings';
import { EntityDetails } from '@/lib/templates/store';

/** Designer copy: rules-based from project data, or AI-written (JSON) when a provider is chosen. */
export const POST = route(async (req: NextRequest) => {
  await requireWriter(req);
  const b = await body(req);
  const db = getSupabaseAdmin();
  const project = b.project_id ? (await db.from('projects').select('*').eq('id', b.project_id).single()).data : null;
  const entity = await getSetting<EntityDetails>('rhc_entity_details') || {};
  const names = await getSetting<string[]>('rhc_entity_names');
  const B = await getBrand();
  const base = contentFromProject(project || {}, { name: entity.signatory_name, email: entity.email, phone: entity.phone }, entity.name || B.business_name || names?.[0]);
  if (!b.provider || b.provider === 'none') return ok({ content: base, engine: 'rules' });
  if (!providerReady(b.provider)) throw new HttpError(409, `${b.provider} is not configured on the Infinity Planet server`);
  const raw = await chat(b.provider, {
    system: `${await aiInstructions()}${await brandBookExcerpt(3000).then(t => t ? `\n\nBRAND BOOK — follow its tone, naming and rules:\n${t}` : '').catch(() => '')}`,
    messages: [{ role: 'user', content: `Write design copy for a ${B.business_name} ${b.layout || 'flyer'}${b.purpose ? ` (${b.purpose})` : ''}. Use ONLY these facts; never invent numbers, returns, approvals or dates.\nFACTS: ${JSON.stringify({ project: project && { name: project.name, location: project.location, type: project.project_type, description: project.description, highlights: project.highlights, value: project.deal_value }, current: base })}\nReturn JSON only: {"eyebrow": string, "headline": string (max 8 words), "subheadline": string (max 14 words), "body": string (max 70 words), "bullets": [up to 5 short strings], "cta": string (max 5 words)}` }],
    maxTokens: 800,
  });
  const j = extractJson<any>(raw);
  if (!j) throw new HttpError(502, 'The AI response was not valid JSON — try again');
  return ok({ content: { ...base, ...Object.fromEntries(Object.entries(j).filter(([k, v]) => ['eyebrow', 'headline', 'subheadline', 'body', 'bullets', 'cta'].includes(k) && v)) }, engine: b.provider });
});
