/**
 * House writing style — what the business wants its documents to sound like.
 * Learned from three places:
 *  1. Approved documents (agreements, letters, marketing) — used as samples of the house style.
 *  2. The team's change requests while drafting — a request made twice ("more formal", "replace 'client' with 'partner'")
 *     becomes a standing rule.
 *  3. Explicit instructions — "always sign as Managing Director", "never use exclamation marks", "from now on …".
 * Rules can be reviewed and removed in Settings → Business details → Writing style.
 */
import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';

export type StyleRule = { id: string; text: string; source: 'explicit' | 'learned' | 'manual'; count?: number; replace?: [string, string] | null; tone?: 'formal' | 'friendly' | 'concise' | null; created_at: string };
type Store = { rules: StyleRule[]; requests: Record<string, { text: string; count: number; replace?: [string, string] | null; tone?: StyleRule['tone'] }> };

const EMPTY: Store = { rules: [], requests: {} };
async function load(): Promise<Store> { const s = await getSetting<Store>('house_style').catch(() => null); return s && typeof s === 'object' ? { rules: Array.isArray(s.rules) ? s.rules : [], requests: s.requests && typeof s.requests === 'object' ? s.requests : {} } : { ...EMPTY, rules: [], requests: {} }; }
async function save(s: Store, actorId?: string | null) {
  // keep the store small
  const keys = Object.keys(s.requests); if (keys.length > 200) for (const k of keys.sort((a, b) => s.requests[a].count - s.requests[b].count).slice(0, keys.length - 200)) delete s.requests[k];
  s.rules = s.rules.slice(-60);
  await getSupabaseAdmin().from('app_settings').upsert({ key: 'house_style', value: s, updated_by: actorId || null, updated_at: new Date().toISOString() });
}
const rid = () => Math.random().toString(36).slice(2, 10);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Classifies a change request into a reusable style preference (or null for one-off content edits). */
export function styleOf(request: string): { key: string; text: string; replace?: [string, string] | null; tone?: StyleRule['tone']; explicit: boolean } | null {
  const q = request.trim().replace(/\s+/g, ' ');
  const explicit = /^(always|never|from now on|in future|going forward|we (always|never|prefer)|rhc (always|never|prefers)|don'?t ever|do not ever|please always|please never|remember (to|that))\b/i.test(q);
  if (explicit) { const t = q.replace(/^(please\s+)?(remember (to|that)\s+)/i, '').replace(/^from now on,?\s*/i, 'Always ').replace(/^(in future|going forward),?\s*/i, 'Always '); return { key: `x:${t.toLowerCase()}`, text: cap(t.replace(/[.!]+$/, '')) + '.', explicit: true }; }
  let m: RegExpMatchArray | null;
  if ((m = q.match(/^(?:please\s+)?(?:replace|change|swap)\s+["“']?(.+?)["”']?\s+(?:to|with|into|for)\s+["“']?(.+?)["”']?\.?$/i)) && m[1].split(' ').length <= 4 && m[2].split(' ').length <= 6 && !/^\d/.test(m[1]) && !/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d)/i.test(m[1] + m[2])) {
    const a = m[1].trim(), b = m[2].trim(); return { key: `r:${a.toLowerCase()}>${b.toLowerCase()}`, text: `Use “${b}” instead of “${a}”.`, replace: [a, b], explicit: false };
  }
  if (/^(make it |be )?(more )?(formal|firmer|professional|serious)\b/i.test(q)) return { key: 't:formal', text: 'Write in a formal, firm, professional tone.', tone: 'formal', explicit: false };
  if (/^(make it |be )?(more )?(friendly|friendlier|warmer|casual|softer)\b/i.test(q)) return { key: 't:friendly', text: 'Use a warm, friendly tone.', tone: 'friendly', explicit: false };
  if (/^(make it |keep it )?(shorter|more concise|brief|cut it down|trim)\b/i.test(q)) return { key: 't:concise', text: 'Keep documents concise — no filler or pleasantries.', tone: 'concise', explicit: false };
  if (/\b(call to action)\b/i.test(q) && /^add/i.test(q)) return { key: 'c:cta', text: 'Always end with a clear call to action and contact details.', explicit: false };
  if (/\bmore protective of (us|rhc)|protect (us|rhc) more\b/i.test(q)) return { key: 'c:protect', text: 'Draft firmly in our favour — protective positions on liability, termination and payment.', explicit: false };
  if (/^(simplify|plain english|simpler)/i.test(q)) return { key: 't:plain', text: 'Use plain, simple English.', explicit: false };
  return null;
}

/** Records a request made while drafting. Returns a sentence to tell the user when it became (or already is) a rule. */
export async function noteRequest(request: string, actorId?: string | null): Promise<string | null> {
  const st = styleOf(request); if (!st) return null;
  try {
    const s = await load();
    if (s.rules.some(r => r.text.toLowerCase() === st.text.toLowerCase())) return null;
    if (st.explicit) { s.rules.push({ id: rid(), text: st.text, source: 'explicit', created_at: new Date().toISOString() }); await save(s, actorId); return `I'll remember this for future ${'documents'}: "${st.text}" (Settings → Business details → Writing style).`; }
    const r = s.requests[st.key] || { text: st.text, count: 0, replace: st.replace || null, tone: st.tone || null };
    r.count++; s.requests[st.key] = r;
    let said: string | null = null;
    if (r.count >= 2) { s.rules.push({ id: rid(), text: r.text, source: 'learned', count: r.count, replace: r.replace || null, tone: r.tone || null, created_at: new Date().toISOString() }); delete s.requests[st.key]; said = `You've asked for this before, so it's now part of the house style: "${r.text}"`; }
    await save(s, actorId); return said;
  } catch { return null; }
}

export async function styleRules(): Promise<StyleRule[]> { return (await load()).rules; }
export async function addRule(text: string, actorId: string) { const s = await load(); const t = cap(text.trim().replace(/[.]+$/, '')) + '.'; if (!s.rules.some(r => r.text.toLowerCase() === t.toLowerCase())) s.rules.push({ id: rid(), text: t, source: 'manual', created_at: new Date().toISOString() }); await save(s, actorId); return s.rules; }
export async function removeRule(id: string, actorId: string) { const s = await load(); s.rules = s.rules.filter(r => r.id !== id); await save(s, actorId); return s.rules; }

const KIND_TYPES: Record<string, string[]> = { legal: ['mou', 'heads_of_agreement', 'contract', 'nda', 'agreement', 'deed', 'lease'], letter: ['letter', 'correspondence', 'offer'], proposal: ['proposal'], report: ['report'] };

/** Approved documents of the same kind, newest first — samples of how the business writes. */
export async function approvedSamples(kind: string, limit = 2): Promise<{ title: string; text: string }[]> {
  const db = getSupabaseAdmin();
  try {
    if (kind === 'marketing' || kind === 'social') {
      const { data } = await db.from('marketing_assets').select('title,content').eq('status', 'approved').eq('kind', 'copy').order('updated_at', { ascending: false }).limit(limit);
      return (data || []).filter(x => String(x.content || '').length > 200).map(x => ({ title: x.title, text: x.content }));
    }
    let q = db.from('generated_documents').select('title,body,doc_type').in('status', ['approved', 'exported']).order('updated_at', { ascending: false }).limit(limit * 3);
    if (KIND_TYPES[kind]) q = q.in('doc_type', KIND_TYPES[kind]);
    const { data } = await q;
    return (data || []).filter(x => String(x.body || '').length > 200).slice(0, limit).map(x => ({ title: x.title, text: x.body }));
  } catch { return []; }
}

/** The house-style block added to AI writing instructions. */
export async function styleBlock(kind: string, short: string): Promise<string> {
  const [rules, samples] = await Promise.all([styleRules(), approvedSamples(kind, kind === 'legal' ? 1 : 2)]);
  const parts: string[] = [];
  if (rules.length) parts.push(`${short.toUpperCase()} HOUSE STYLE — follow these standing preferences:\n${rules.map(r => `- ${r.text}`).join('\n')}`);
  if (samples.length) parts.push(`APPROVED ${short.toUpperCase()} DOCUMENTS — match their voice, structure, level of detail, terminology and sign-off (never copy their facts, names or figures into the new document):\n${samples.map(s => `<<${s.title}>>\n${s.text.slice(0, kind === 'legal' ? 5000 : 2500)}\n<</${s.title}>>`).join('\n\n')}`);
  return parts.join('\n\n');
}

/** For the built-in writer: apply learned word swaps and tone. */
export async function applyHouseStyle(text: string): Promise<{ text: string; tone: 'formal' | 'friendly' | null; concise: boolean }> {
  const rules = await styleRules().catch(() => [] as StyleRule[]);
  let t = text;
  for (const r of rules) if (r.replace) { const [a, b] = r.replace; t = t.replace(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), b); }
  const tone = rules.some(r => r.tone === 'friendly') ? 'friendly' : rules.some(r => r.tone === 'formal') ? 'formal' : null;
  return { text: t, tone, concise: rules.some(r => r.tone === 'concise') };
}

/** Letter habits from approved letters: how they sign off. */
export async function approvedSignOff(): Promise<string | null> {
  const s = await approvedSamples('letter', 5);
  const counts: Record<string, number> = {};
  for (const x of s) { const m = x.text.match(/^(Yours sincerely|Yours faithfully|Kind regards|Best regards|Warm regards|Regards),?\s*$/mi); if (m) counts[m[1]] = (counts[m[1]] || 0) + 1; }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? `${best[0]},` : null;
}
