/**
 * Reads the business's own documents (uploaded or synced from Google Drive) and proposes
 * business details: legal name, ABN, ACN, address, phone, email, website, logo and brand colours.
 * Rules first (no AI key needed); an AI provider can add a second opinion. Nothing is saved
 * until an admin applies it.
 */
import { getSupabaseAdmin } from './supabase';
import { extractBrandHints } from './brand-book';
import { getBrand } from './brand';
import { getSetting } from './settings';
import { signFileLink } from './file-links';

export type Candidate = { value: string; count: number; sources: { id: string; name: string }[]; excerpt?: string };
export type BusinessProposal = Record<'legal_name' | 'abn' | 'acn' | 'address' | 'phone' | 'email' | 'website', Candidate[]>;

/** Australian Business Number checksum. */
export function validAbn(abn: string) {
  const d = abn.replace(/\D/g, '').split('').map(Number);
  if (d.length !== 11) return false;
  d[0] -= 1;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  return d.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}
/** Australian Company Number checksum. */
export function validAcn(acn: string) {
  const d = acn.replace(/\D/g, '').split('').map(Number);
  if (d.length !== 9) return false;
  const sum = d.slice(0, 8).reduce((s, x, i) => s + x * (8 - i), 0);
  return (10 - (sum % 10)) % 10 === d[8];
}
const fmtAbn = (s: string) => { const d = s.replace(/\D/g, ''); return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`; };
const fmtAcn = (s: string) => { const d = s.replace(/\D/g, ''); return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`; };
const STATES = 'QLD|NSW|VIC|SA|WA|TAS|NT|ACT|Queensland|New South Wales|Victoria|South Australia|Western Australia|Tasmania';

/**
 * Pulls business facts from one document's text. `names` are the business's names (e.g. RHC City, RHC):
 * facts near those names win over facts belonging to other parties in the same document.
 */
export function extractFacts(text: string, names: string[]) {
  const t = String(text || '').replace(/\r/g, '');
  const nameRe = names.length ? new RegExp(`\\b(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i') : null;
  const near = (idx: number, span = 260) => !nameRe || nameRe.test(t.slice(Math.max(0, idx - span), idx + span));
  const out: Record<string, { value: string; excerpt: string; ours: boolean }[]> = { legal_name: [], abn: [], acn: [], address: [], phone: [], email: [], website: [] };
  const push = (k: string, value: string, idx: number) => out[k].push({ value, excerpt: t.slice(Math.max(0, idx - 80), idx + 120).replace(/\s+/g, ' ').trim(), ours: near(idx) });
  for (const m of t.matchAll(/\b([A-Z][A-Za-z0-9&'.\- ]{1,60}?\s(?:Pty\.?\s?Ltd\.?|Pty\.?\s?Limited|Limited|Ltd\.?))(?=[\s,.(;]|$)/g)) {
    const v = m[1].replace(/\s+/g, ' ').replace(/^.*\b(?:between|and|by|for|of|the|to|from|with)\s+(?=[A-Z])/, '').replace(/^(?:between|and|by|for|of|the|to)\s+/i, '').trim();
    if (v.length >= 6 && (!nameRe || nameRe.test(v))) push('legal_name', v, m.index!);
  }
  for (const m of t.matchAll(/\bABN[:\s#]*((?:\d[\s-]?){11})/gi)) { const d = m[1].replace(/\D/g, ''); if (validAbn(d)) push('abn', fmtAbn(d), m.index!); }
  for (const m of t.matchAll(/\bACN[:\s#]*((?:\d[\s-]?){9})/gi)) { const d = m[1].replace(/\D/g, ''); if (validAcn(d)) push('acn', fmtAcn(d), m.index!); }
  for (const m of t.matchAll(new RegExp(`\\b((?:(?:Level|Suite|Unit|Shop)\\s+\\d+[A-Za-z]?,?\\s+)?\\d{1,5}[A-Za-z]?(?:[-–]\\d{1,5})?\\s+[A-Z][A-Za-z' ]{2,40}\\s(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Parade|Pde|Terrace|Tce|Place|Pl|Lane|Ln|Boulevard|Blvd|Highway|Hwy|Court|Ct|Crescent|Cres|Way|Circuit|Cct)\\.?,?\\s+[A-Z][A-Za-z ]{2,30}?,?\\s+(?:${STATES})\\.?,?\\s+\\d{4})\\b`, 'g'))) push('address', m[1].replace(/\s+/g, ' ').trim(), m.index!);
  for (const m of t.matchAll(/(?:^|[\s(:])((?:\+61\s?|0)[2-478](?:[\s-]?\d){8}|1[38]00(?:[\s-]?\d){6}|13(?:[\s-]?\d){4})(?=$|[\s),.;])/g)) push('phone', m[1].replace(/\s+/g, ' ').trim(), m.index!);
  for (const m of t.matchAll(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g)) push('email', m[1].toLowerCase(), m.index!);
  for (const m of t.matchAll(/\b((?:https?:\/\/)?(?:www\.)[a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi)) push('website', m[1].toLowerCase().replace(/^https?:\/\//, ''), m.index!);
  return out;
}

/** Proposal across the business's documents (newest 200), ranked by how often a value appears next to the business name. */
export async function proposeBusinessDetails() {
  const db = getSupabaseAdmin();
  const [brand, names] = await Promise.all([getBrand(), getSetting<string[]>('rhc_entity_names')]);
  const allNames = [...new Set([brand.business_name, brand.short_name, ...(names || [])].filter(n => n && n.length >= 2))];
  const { data: docs } = await db.from('documents').select('id,name,content_text,mime_type,category,storage_path,updated_at').not('content_text', 'is', null).neq('source', 'final_copy').order('updated_at', { ascending: false }).limit(200);
  const domainHint = allNames.map(n => n.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
  const agg: Record<string, Map<string, Candidate & { score: number }>> = {};
  for (const d of docs || []) {
    const facts = extractFacts(d.content_text || '', allNames);
    for (const [k, list] of Object.entries(facts)) {
      agg[k] ??= new Map();
      for (const f of list) {
        const key = f.value.toLowerCase().replace(/\s+/g, ' ');
        const c = agg[k].get(key) || { value: f.value, count: 0, score: 0, sources: [], excerpt: f.excerpt };
        c.count++; c.score += f.ours ? 3 : 1;
        if (k === 'legal_name' && key.includes(brand.business_name.toLowerCase())) c.score += 25; // the business's current name beats older aliases
        if ((k === 'email' || k === 'website') && domainHint.some(h => key.replace(/[^a-z0-9]/g, '').includes(h))) c.score += 4;
        if (!c.sources.some(s => s.id === d.id)) c.sources.push({ id: d.id, name: d.name });
        agg[k].set(key, c);
      }
    }
  }
  const proposal = {} as BusinessProposal;
  for (const k of ['legal_name', 'abn', 'acn', 'address', 'phone', 'email', 'website'] as const)
    proposal[k] = [...(agg[k]?.values() || [])].sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 4).map(({ score: _s, ...c }) => ({ ...c, sources: c.sources.slice(0, 4) }));
  // Logo candidates: images whose file name says "logo" (uploaded or from Drive)
  const { data: imgs } = await db.from('documents').select('id,name,mime_type,storage_path,updated_at').or('mime_type.eq.image/png,mime_type.eq.image/jpeg,mime_type.eq.image/svg+xml,mime_type.eq.image/webp').ilike('name', '%logo%').order('updated_at', { ascending: false }).limit(12);
  const logos = (imgs || []).map(i => ({ id: i.id, name: i.name, mime: i.mime_type, url: signFileLink({ k: 'storage', p: i.storage_path, n: i.name, m: i.mime_type }) }));
  const brandDocs = (docs || []).filter(d => d.category === 'brand_book' || /brand|style ?guide|guideline/i.test(d.name));
  const style = extractBrandHints(brandDocs.map(d => d.content_text || '').join('\n'));
  return { proposal, logos, style: { ...style, sources: brandDocs.slice(0, 4).map(d => ({ id: d.id, name: d.name })) }, documents_scanned: (docs || []).length, business_names: allNames };
}

/** Builds the values to save from a proposal: the top candidate of each field. */
export function bestOf(p: BusinessProposal) {
  const top = (k: keyof BusinessProposal) => p[k]?.[0]?.value || undefined;
  return { name: top('legal_name'), abn: top('abn'), acn: top('acn'), address: top('address'), phone: top('phone'), email: top('email'), website: top('website') };
}
