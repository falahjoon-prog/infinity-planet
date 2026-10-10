import { getSupabaseAdmin } from './supabase';

/** Placeholders ({{business}}, {{short}}, {{ai}}) are filled from Settings → Business details when the instructions are used. */
export const DEFAULT_SYSTEM_INSTRUCTIONS = 'You are {{ai}}, the private operating assistant for {{business}}. Act in {{short}}\'s commercial interest. Be concise, factual and specific. Never invent facts, figures, approvals, parties or sources. When you rely on supplied knowledge, cite it with the given [KB-n] or [DOC-n] tag. If information is missing, say so and say what is needed. Legal content is analysis to assist {{short}} and its solicitors, not legal advice.';
/** The V4.0 default (fixed to RHC) — replaced by the template above when it was never customised. */
export const V40_SYSTEM_INSTRUCTIONS = 'You are RHC City AI, the private operating assistant for RHC City. Act in RHC\'s commercial interest. Be concise, factual and specific. Never invent facts, figures, approvals, parties or sources. When you rely on supplied RHC knowledge, cite it with the given [RHC-n] or [DOC-n] tag. If information is missing, say so and say what is needed. Legal content is analysis to assist RHC and its solicitors, not legal advice.';

const DEFAULTS: Record<string, unknown> = {
  ai_system_instructions: DEFAULT_SYSTEM_INSTRUCTIONS,
  email_requires_approval: false, // no longer used: members send their own email without approval
  home_jurisdiction: process.env.RHC_HOME_JURISDICTION || 'Queensland',
  rhc_entity_names: ['RHC City', 'RHC'],
  business_name: 'RHC City',
  business_short_name: 'RHC',
  business_logo: null,
  brand_style: { letterhead: true },
  bot_provider: 'auto',
  approvals_require_approver: true,
  email_style: { branded: true, header: 'logo', show_footer: true, quote_previous: false, default_persona: null, default_tone: 'professional' },
  // Self-service "request access" on the sign-in page, limited to company email domains. Admins approve each request.
  signup: { enabled: !!process.env.SIGNUP_DOMAINS, domains: (process.env.SIGNUP_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean), default_role: 'member' },
};

function normalise(key: string, value: unknown) {
  if (key === 'ai_system_instructions' && value === V40_SYSTEM_INSTRUCTIONS) return DEFAULT_SYSTEM_INSTRUCTIONS;
  return value;
}

export async function getSetting<T = unknown>(key: string): Promise<T> {
  try {
    const { data } = await getSupabaseAdmin().from('app_settings').select('value').eq('key', key).maybeSingle();
    if (data && data.value !== null && data.value !== undefined) return normalise(key, data.value) as T;
  } catch {}
  return DEFAULTS[key] as T;
}

export async function getSettings() {
  const out: Record<string, unknown> = { ...DEFAULTS };
  try {
    const { data } = await getSupabaseAdmin().from('app_settings').select('key,value');
    for (const r of data || []) if (r.value !== null && r.value !== undefined && !String(r.key).startsWith('secret_')) out[r.key] = normalise(r.key, r.value);
  } catch {}
  return out;
}
