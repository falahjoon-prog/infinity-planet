/**
 * Product and business identity.
 * - The PRODUCT is Infinity Planet (fixed).
 * - The BUSINESS using it (default RHC City) is set by an admin in Settings → Business details:
 *   name, short name and logo. The AI, Legal AI, drafting and marketing all speak for that business.
 */
import { getSettings } from './settings';

export const APP_NAME = 'Infinity Planet';
export const APP_TAGLINE = 'Business Operating System';
export const AI_NAME = 'Infinity AI';
export const SEARCH_NAME = 'Infinity Search';
export const APP_VERSION = '4.12.0';

export type BrandLogo = { path: string; mime: string; v: number } | null;
export type Brand = { app_name: string; ai_name: string; business_name: string; short_name: string; logo: BrandLogo; logo_url: string | null };

let cache: { at: number; brand: Brand } | null = null;
export function invalidateBrand() { cache = null; }

export async function getBrand(): Promise<Brand> {
  if (cache && Date.now() - cache.at < 30_000) return cache.brand;
  const s = await getSettings();
  const business_name = String(s.business_name || 'RHC City').trim() || 'RHC City';
  const short_name = String(s.business_short_name || '').trim() || business_name;
  const logo = (s.business_logo && typeof s.business_logo === 'object' && (s.business_logo as any).path) ? s.business_logo as BrandLogo : null;
  const brand: Brand = { app_name: APP_NAME, ai_name: AI_NAME, business_name, short_name, logo, logo_url: logo ? `/api/brand/logo?v=${logo.v}` : /\b(rhc|rose heritage)\b/i.test(business_name) ? '/brand/rhc-logo.png' : null };
  cache = { at: Date.now(), brand };
  return brand;
}

/** Replace {{business}}, {{short}}, {{ai}} and {{app}} placeholders. */
export function brandText(text: string, b: Pick<Brand, 'business_name' | 'short_name'>) {
  return String(text || '')
    .replace(/\{\{\s*business\s*\}\}/g, b.business_name)
    .replace(/\{\{\s*short\s*\}\}/g, b.short_name)
    .replace(/\{\{\s*ai\s*\}\}/g, AI_NAME)
    .replace(/\{\{\s*app\s*\}\}/g, APP_NAME);
}

/** Possessive form: "RHC" → "RHC's", "Smiths" → "Smiths'". */
export const possessive = (n: string) => /s$/i.test(n) ? `${n}'` : `${n}'s`;

/** The AI system instructions with business placeholders filled in. */
/** The business's AI instructions plus the standing rules people gave the AI (the team's, and this person's own when known). */
export async function aiInstructions(actorId?: string | null): Promise<string> {
  const { getSetting } = await import('./settings');
  const { rulesBlock } = await import('./ai-rules');
  const [raw, b, rules, company, org] = await Promise.all([getSetting<string>('ai_system_instructions'), getBrand(), rulesBlock(actorId).catch(() => ''), import('./company-records').then(m => m.companyBlock()).catch(() => ''), import('./org').then(m => m.orgBlock()).catch(() => '')]);
  const duties = await import('./duties').then(m => m.dutiesBlock()).catch(() => '');
  return [brandText(raw || '', b), company, org, duties, rules].filter(Boolean).join('\n\n');
}

export type BrandStyle = { primary?: string | null; accent?: string | null; font?: 'serif' | 'sans' | 'modern' | null; footer_text?: string | null; website?: string | null; letterhead?: boolean };
/** Brand colours, font and letterhead/footer details (Settings → Business details). */
export async function getBrandStyle(): Promise<BrandStyle> {
  const { getSetting } = await import('./settings');
  const s = (await getSetting<BrandStyle>('brand_style')) || {};
  const hex = (v: any) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null;
  const { RHC_PRIMARY, RHC_ACCENT, OLD_DEFAULT_COLOURS, isRhc } = await import('./brand-defaults');
  const rhc = isRhc((await getBrand()).business_name);
  const pick = (v: any, dflt: string) => { const h = hex(v); return h && !(rhc && OLD_DEFAULT_COLOURS.includes(h.toLowerCase())) ? h : rhc ? dflt : null; };
  return { primary: pick(s.primary, RHC_PRIMARY), accent: pick(s.accent, RHC_ACCENT), font: ['serif', 'sans', 'modern'].includes(String(s.font)) ? s.font as any : null, footer_text: s.footer_text || null, website: s.website || null, letterhead: s.letterhead !== false };
}
