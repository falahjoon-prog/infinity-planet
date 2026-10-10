/**
 * Professional document writer — used by Marketing and Drafting.
 *
 *  - Gathers everything the business knows (legal entity, project, deals, contacts, notes, documents) into one fact sheet.
 *  - Writes complete documents: marketing pieces, business letters, reports and long-form Australian agreements.
 *  - Letters get a fixed frame (date, recipient block, salutation, subject, sign-off with the sender's details) so names are never wrong.
 *  - Catches bad AI output (prompt echoed back, cut off, far too short) and retries once.
 *
 * Text format (rendered by lib/letterhead.ts into PDF / Word with the business letterhead):
 *   # Title            ## Heading         ### Sub-heading
 *   - bullet           1.1 / (a) / (i) numbered paragraphs     **bold**     ---  (rule)
 */
import { getSupabaseAdmin } from './supabase';
import { displayName } from './people';
import { getSetting } from './settings';
import { getBrand, aiInstructions, possessive } from './brand';
import { brandBookExcerpt } from './brand-book';
import { chat, Provider } from './providers';
import { longDate, money, ensureDocDate } from './templates/render';
import { styleBlock } from './house-style';

export type Party = { name?: string | null; title?: string | null; company?: string | null; address?: string | null; email?: string | null; phone?: string | null; abn?: string | null };
export type DocKind = 'marketing' | 'social' | 'letter' | 'legal' | 'report' | 'proposal';
export type Length = 'brief' | 'standard' | 'comprehensive';

const LEGAL_CATS = ['mou', 'heads_of_agreement', 'contract', 'nda', 'agreement', 'deed', 'lease', 'jv', 'joint_venture'];
const LETTER_CATS = ['letter', 'correspondence', 'offer'];

/** Which writing style a template needs. */
export function kindFor(tpl: { kind?: string; category?: string; name?: string }): DocKind {
  const c = String(tpl.category || '').toLowerCase(); const n = String(tpl.name || '').toLowerCase();
  if (tpl.kind === 'marketing') return c === 'social' || /social/.test(n) ? 'social' : 'marketing';
  if (LEGAL_CATS.includes(c) || /agreement|memorandum|deed|contract|heads of/.test(n)) return 'legal';
  if (c === 'report' || /report/.test(n)) return 'report';
  if (c === 'proposal' || /proposal/.test(n)) return 'proposal';
  if (LETTER_CATS.includes(c) || /letter|offer|proposal|correspondence/.test(n)) return 'letter';
  return 'marketing';
}

const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';
const line = (label: string, v: any) => has(v) ? `${label}: ${String(v).trim()}` : '';
const clip = (s: any, n: number) => { const t = String(s || '').replace(/\s+\n/g, '\n').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** The business itself (from Settings → Business details). */
export async function ourBusiness(): Promise<Party & { website?: string | null; short: string }> {
  const [b, e, style] = await Promise.all([getBrand(), getSetting<any>('rhc_entity_details'), getSetting<any>('brand_style')]);
  const x = e || {};
  return { company: x.name || b.business_name, short: b.short_name || b.business_name, abn: x.abn || null, address: x.address || null, email: x.email || null, phone: x.phone || null, name: x.signatory_name || null, title: x.signatory_title || null, website: style?.website || null };
}

/** The person signing / sending: a team member (name, title, email) with the company's details. */
export async function senderParty(profileId?: string | null): Promise<Party> {
  const biz = await ourBusiness();
  let p: any = null;
  if (profileId) p = (await getSupabaseAdmin().from('profiles').select('full_name,title,email,custom_role').eq('id', profileId).maybeSingle()).data;
  return {
    name: p ? displayName(p) : biz.name || null,
    title: p?.title || p?.custom_role || (p ? null : biz.title) || null,
    company: biz.company, email: p?.email || biz.email || null, phone: biz.phone || null, address: biz.address || null, abn: biz.abn || null,
  };
}

/** Everything known about the project and deal, as a plain fact sheet for the writer. */
export async function factSheet(opts: { project?: any; deal?: any; extra?: Record<string, any> }): Promise<{ text: string; richness: number }> {
  const db = getSupabaseAdmin();
  const biz = await ourBusiness();
  const p = opts.project; const d = opts.deal;
  const out: string[] = [];
  let richness = 0;
  out.push('OUR BUSINESS', line('Legal name', biz.company), line('Short name', biz.short), line('ABN', biz.abn), line('Address', biz.address), line('Phone', biz.phone), line('Email', biz.email), line('Website', (biz as any).website), line('Authorised signatory', [biz.name, biz.title].filter(Boolean).join(', ')));
  if (p) {
    out.push('', 'PROJECT', line('Name', p.name), line('Location', p.location), line('Type', p.project_type), line('Stage', String(p.status || '').replace(/_/g, ' ')), line('Value', p.deal_value ? money(p.deal_value) : ''), line('Counterparty', p.counterparty), line('Next action', p.next_action), line('Tags', (p.tags || []).join(', ')));
    if (has(p.description)) { out.push(`Description: ${clip(p.description, 3000)}`); richness += 2; }
    if (has(p.highlights)) { out.push(`Highlights:\n${clip(Array.isArray(p.highlights) ? p.highlights.join('\n') : p.highlights, 2000)}`); richness += 2; }
    if (has(p.location)) richness++;
    if (p.deal_value) richness++;
    if (p.id) {
      const [deals, contacts, notes, docs, events] = await Promise.all([
        db.from('deals').select('title,counterparty,contact_name,contact_email,stage,expected_value,next_action,notes').eq('project_id', p.id).limit(10).then(r => r.data || [], () => []),
        db.from('contacts').select('full_name,position,email,phone, counterparty:counterparties(name)').eq('project_id', p.id).limit(15).then(r => r.data || [], () => []),
        db.from('notes').select('title,body,important').eq('project_id', p.id).order('important', { ascending: false }).order('updated_at', { ascending: false }).limit(8).then(r => r.data || [], () => []),
        db.from('documents').select('name,content_text').eq('project_id', p.id).eq('status', 'indexed').order('created_at', { ascending: false }).limit(5).then(r => r.data || [], () => []),
        db.from('calendar_events').select('title,starts_at,location').eq('project_id', p.id).gte('starts_at', new Date().toISOString()).order('starts_at').limit(5).then(r => r.data || [], () => []),
      ]);
      if (deals.length) { out.push('', 'DEALS', ...deals.map((x: any) => `- ${x.title || x.counterparty || 'Deal'}${x.counterparty ? ` with ${x.counterparty}` : ''}; stage ${String(x.stage || '').replace(/_/g, ' ')}${x.expected_value ? `; ${money(x.expected_value)}` : ''}${x.contact_name ? `; contact ${x.contact_name}${x.contact_email ? ` <${x.contact_email}>` : ''}` : ''}${x.next_action ? `; next: ${x.next_action}` : ''}${x.notes ? `; notes: ${clip(x.notes, 300)}` : ''}`)); richness += 1; }
      if (contacts.length) out.push('', 'PROJECT CONTACTS', ...contacts.map((x: any) => `- ${x.full_name}${x.position ? `, ${x.position}` : ''}${x.counterparty?.name ? ` (${x.counterparty.name})` : ''}${x.email ? ` <${x.email}>` : ''}${x.phone ? ` ${x.phone}` : ''}`));
      if (notes.length) { out.push('', 'PROJECT NOTES', ...notes.map((x: any) => `- ${x.title}: ${clip(x.body, 600)}`)); richness += 1; }
      if (events.length) out.push('', 'UPCOMING MEETINGS', ...events.map((x: any) => `- ${x.title} — ${new Date(x.starts_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' })}${x.location ? `, ${x.location}` : ''}`));
      const withText = docs.filter((x: any) => has(x.content_text));
      if (withText.length) { out.push('', 'SUPPORTING DOCUMENTS (excerpts — facts may be taken from these)', ...withText.map((x: any) => `[${x.name}]\n${clip(x.content_text, 3500)}`)); richness += 2; }
    }
  }
  if (d) out.push('', 'DEAL', line('Title', d.title), line('Counterparty', d.counterparty), line('Contact', [d.contact_name, d.contact_email, d.contact_phone].filter(Boolean).join(', ')), line('Value', d.expected_value ? money(d.expected_value) : ''), line('Stage', String(d.stage || '').replace(/_/g, ' ')), line('Notes', clip(d.notes, 800)));
  const extra = Object.entries(opts.extra || {}).filter(([, v]) => has(v));
  if (extra.length) { out.push('', 'DETAILS PROVIDED BY THE USER (use these exactly)', ...extra.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v).trim()}`)); richness += Math.min(3, extra.length); }
  return { text: out.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim(), richness };
}

export function partyBlock(p: Party, opts: { withContact?: boolean } = {}): string[] {
  const rows = [p.name, p.title, p.company && p.company !== p.name ? p.company : null, p.address];
  if (opts.withContact) rows.push(p.email, p.phone);
  return rows.filter(has).map(x => String(x).trim());
}
const firstName = (n?: string | null) => String(n || '').trim().split(/\s+/)[0] || '';
export function salutation(r: Party) {
  const n = String(r.name || '').trim();
  if (!n) return 'Dear Sir or Madam,';
  const parts = n.split(/\s+/);
  if (/^(mr|mrs|ms|miss|dr|prof|hon)\.?$/i.test(parts[0]) && parts.length > 1) return `Dear ${parts[0].replace(/\.$/, '')} ${parts[parts.length - 1]},`;
  return `Dear ${firstName(n)},`;
}

/** Wraps a letter body: date, recipient block, salutation, subject line, body, sign-off with the sender's details. */
export function letterFrame(o: { recipient: Party; sender: Party; subject?: string | null; body: string; date?: string; signOff?: string; privacy?: string | null }): string {
  const to = partyBlock(o.recipient);
  const parts: string[] = [];
  if (o.privacy) parts.push(`**${o.privacy}**`, '');
  parts.push(o.date || longDate(), '');
  if (to.length) parts.push(...to, ...(has(o.recipient.email) ? [`By email: ${o.recipient.email}`] : []), '');
  parts.push(salutation(o.recipient), '');
  if (has(o.subject)) parts.push(`**Re: ${String(o.subject).trim()}**`, '');
  parts.push(o.body.trim(), '', o.signOff || 'Yours sincerely,', '', '______________________________');
  parts.push(...partyBlock({ ...o.sender, address: null }), ...[o.sender.email, o.sender.phone].filter(has).map(String));
  return parts.join('\n').replace(/\n{4,}/g, '\n\n\n');
}

const LENGTH: Record<DocKind, Record<Length, string>> = {
  marketing: { brief: '300–450 words', standard: '600–900 words', comprehensive: '1,100–1,600 words' },
  social: { brief: '3 posts', standard: '3 posts plus a longer LinkedIn article intro (150 words)', comprehensive: '5 posts plus a 300-word LinkedIn article' },
  letter: { brief: '200–350 words', standard: '400–650 words', comprehensive: '700–1,100 words' },
  report: { brief: '500–800 words', standard: '900–1,400 words', comprehensive: '1,600–2,500 words' },
  proposal: { brief: '600–900 words', standard: '1,100–1,800 words', comprehensive: '2,000–3,200 words' },
  legal: { brief: 'a concise but complete agreement (about 1,500–2,500 words)', standard: 'a complete long-form agreement (about 3,000–5,000 words)', comprehensive: 'an exhaustive long-form agreement (5,000–8,000 words) with schedules' },
};
const MIN_CHARS: Record<DocKind, number> = { marketing: 1200, social: 500, letter: 700, report: 1800, legal: 6000, proposal: 2400 };

const FORMAT_RULES = `OUTPUT FORMAT — follow exactly, the text is typeset onto the company letterhead:
- Plain text with light markup only: "# " for the document title (once, first line), "## " for section headings, "### " for sub-headings, "- " for bullet points, "**bold**" sparingly for key terms, "---" on its own line for a divider.
- Never use tables, code blocks, emojis, HTML, or placeholder brackets other than [●].
- No preamble or commentary ("Here is…", "Sure", notes to the user). Start with the document itself and end with the document itself.
- Signature and execution blocks: one item per line, each signature line written as "______________________________ Signature of director" (underscores first, then the label). Never put two signature columns side by side.
- Australian English spelling and conventions (organisation, licence, GST, ABN, AUD, DD Month YYYY dates).`;

const FACT_RULES = (short: string) => `FACT DISCIPLINE — the most important rule:
- Use only facts in the FACT SHEET. Never invent figures, prices, returns, yields, approvals, tenants, dates, awards, names, addresses or ABNs.
- Where a fact a professional document needs is missing, write [●] (or "[● description of what is needed]") so ${short} can complete it. A professional placeholder is far better than an invented fact.
- You may write persuasive, polished prose around the facts — framing, structure, benefits, context — as long as no new factual claim is introduced.`;

function systemPrompt(kind: DocKind, short: string, legalName: string, law: string) {
  if (kind === 'legal') return `You are a senior Australian commercial lawyer (partner level, 20+ years in property development, construction, joint ventures and corporate transactions in ${law}). You draft for ${legalName} ("${short}"), your client. You draft complete, carefully structured, execution-quality documents that a top-tier Australian firm would be proud of — never outlines, summaries or short-form templates.

Drafting standard:
- Precise, plain-English modern drafting (no "witnesseth", no archaic doublets). Defined terms in Title Case, defined once in a Definitions clause and used consistently.
- Numbered hierarchy: "## 1. HEADING", then 1.1, (a), (i). Every clause complete, with cross-references that are correct.
- Protect ${possessive(short)} position while staying commercially reasonable and enforceable under Australian law; avoid unfair contract terms (Australian Consumer Law, Part 2-3 of Schedule 2 to the Competition and Consumer Act 2010 (Cth)) where the other side may be a small business.
- Include, where relevant to the document type: parties block with ABN/ACN, background/recitals, definitions and interpretation, conditions precedent, the operative terms, consideration and payment mechanics, GST (A New Tax System (Goods and Services Tax) Act 1999 (Cth)), warranties, indemnities, limitation of liability, insurance, intellectual property, confidentiality, privacy (Privacy Act 1988 (Cth)), default and termination, force majeure, dispute resolution (negotiation → mediation → courts or expert determination), notices (including email), assignment and change of control, costs and stamp duty (Duties Act 2001 (Qld) where ${law} is Queensland), entire agreement, variation, waiver, severance, further assurance, counterparts and electronic execution (Electronic Transactions Act and s127 Corporations Act 2001 (Cth)), governing law and jurisdiction (${law}).
- Execution blocks for companies under s127 Corporations Act (director/director or director/secretary, or sole director), with name, signature and date lines, and a witness block for individuals.
- Schedules for variable commercial details (Item 1, Item 2…) when that makes the document clearer.
- Keep the DRAFT banner line at the very top if one is supplied.`;
  if (kind === 'letter') return `You are ${possessive(short)} most senior business writer — the person who drafts letters for the managing director. Letters are crisp, courteous, confident and specific: a clear opening that states the purpose, well-organised body paragraphs (headings only if the letter is long), a concrete next step with a date or contact, and nothing vague or generic. Australian business register.`;
  if (kind === 'proposal') return `You are ${possessive(short)} business development director. You write formal commercial proposals that win work: an executive summary that states the offer and its value to the recipient, understanding of their needs, the proposal in detail (scope, approach, deliverables, timeline), commercial terms (price, payment, validity, GST), why ${short}, assumptions and exclusions, next steps and acceptance. Confident, specific, Australian business register. State that the proposal is not a binding offer until formal documents are signed.`;
  if (kind === 'report') return `You are a senior analyst preparing board-quality reports for ${short}. Reports are structured, factual and decision-oriented: executive summary, status by area, risks and mitigations, decisions required, next steps with owners and dates. Neutral, precise, Australian business register.`;
  if (kind === 'social') return `You are a senior social media and communications manager for ${short}, a property and development business. You write polished, credible posts for LinkedIn, Instagram and Facebook — professional, specific, never hype, with relevant hashtags.`;
  return `You are the head of marketing and communications for ${short}, an Australian property and development business. You write premium, persuasive, investor-grade marketing documents — the quality of a top-tier agency brochure or information memorandum. Compelling headline, strong opening, clear sections with headings, benefits framed for the reader, credible tone, a precise call to action with contact details, and any required disclaimer. Never hype or vague filler; every paragraph says something specific.`;
}

/** Heuristics for unusable AI output. */
export function badOutput(text: string, kind: DocKind, minChars?: number): string | null {
  const t = String(text || '').trim();
  if (!t) return 'empty';
  if (/(FACT SHEET|TEMPLATE STRUCTURE|PROJECT FACTS:|SUPPORTING DOCUMENT EXCERPTS|Return only the|OUTPUT FORMAT —|FACT DISCIPLINE)/.test(t)) return 'echoed the instructions';
  if (/^\s*[{[]/.test(t) && /"\w+"\s*:/.test(t.slice(0, 200))) return 'returned data instead of a document';
  const need = minChars ?? MIN_CHARS[kind];
  if (t.length < need * 0.55) return 'far too short';
  return null;
}

/** Removes chatter and code fences, normalises bullets and spacing. */
export function tidyOutput(text: string): string {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '');
  t = t.replace(/^(sure|certainly|of course|here(?:'s| is| are)|below is)[^\n]{0,160}:\s*\n+/i, '');
  t = t.replace(/\n+(let me know|i hope this|feel free|if you(?:'d| would) like)[^\n]*$/i, '');
  t = t.replace(/^[ \t]*[*•●▪][ \t]+/gm, '- ').replace(/^(#{1,3})([^ #\n])/gm, '$1 $2');
  t = t.replace(/^#{4,6}\s+/gm, '### ');
  return t.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

export type WriteOptions = {
  provider: Provider; kind: DocKind; docName: string; templateText?: string | null; facts: string;
  recipient?: Party | null; sender?: Party | null; subject?: string | null; instructions?: string | null;
  verbatimClauses?: { name: string; text: string }[]; length?: Length; letterFormat?: boolean; draftBanner?: string | null;
  /** Who asked — their own AI rules are followed too. */ actorId?: string | null;
  /** The date printed on the document (already formatted, e.g. "10 October 2026"). Defaults to today. */ date?: string | null;
};

/** Writes a complete document. Throws if the AI fails twice; returns a warning if the second attempt is still weak. */
export async function writeDocument(o: WriteOptions): Promise<{ text: string; warning: string | null }> {
  const biz = await ourBusiness();
  const law = String((await getSetting<string>('home_jurisdiction')) || 'Queensland');
  const length = o.length || (o.kind === 'legal' ? 'standard' : 'standard');
  const [instr, book] = await Promise.all([aiInstructions(o.actorId).catch(() => ''), brandBookExcerpt(o.kind === 'legal' ? 1500 : 3000).catch(() => '')]);
  const house = await styleBlock(o.kind, biz.short).catch(() => '');
  const system = [systemPrompt(o.kind, biz.short, biz.company || biz.short, law), FACT_RULES(biz.short), FORMAT_RULES, instr ? `BUSINESS INSTRUCTIONS:\n${instr}` : '', book ? `BRAND BOOK — follow its tone, naming and rules:\n${book}` : '', house].filter(Boolean).join('\n\n');

  const bodyOnly = o.letterFormat && o.kind !== 'legal';
  const r = o.recipient && Object.values(o.recipient).some(has) ? o.recipient : null;
  const s = o.sender && Object.values(o.sender).some(has) ? o.sender : null;
  const task: string[] = [];
  task.push(`Write the "${o.docName}" for ${biz.company || biz.short}. Length: ${LENGTH[o.kind][length]}.`);
  if (bodyOnly) task.push(`This is a LETTER BODY. The date, address block, "Dear …" line, subject line and sign-off are added automatically — write ONLY the body paragraphs (no title, no salutation, no closing, no signature). Address the reader directly${r?.name ? ` (${r.name}${r.company ? ` of ${r.company}` : ''})` : ''}.`);
  else if (o.kind !== 'legal' && o.kind !== 'social') task.push(`Start with "# " and a strong, specific title.${r ? ' Directly under the title add the lines "Prepared for: …" and "Prepared by: …" and the date, then a "---" divider.' : ''}`);
  if (o.kind === 'legal') {
    task.push(`Draft the complete agreement. ${o.draftBanner ? `First line must be exactly: ${o.draftBanner}\nThen "# " and the document title.` : 'Start with "# " and the document title.'}`);
    task.push(`Our party: ${[biz.company, biz.abn ? `ABN ${biz.abn}` : '', biz.address].filter(Boolean).join(', ')}. ${r ? `Other party: ${[r.company || r.name, r.abn ? `ABN ${r.abn}` : '', r.address, r.name && r.company ? `attention ${r.name}${r.title ? `, ${r.title}` : ''}` : ''].filter(Boolean).join(', ')}.` : 'Other party: take from the fact sheet, otherwise [●].'}`);
    task.push('Use the template below as the minimum scope — keep every clause it contains (with the same intent and the same numbering order where sensible), then expand it into a full professional agreement: add definitions, mechanics, protections and boilerplate a top-tier firm would include.');
  } else if (o.templateText) task.push('Use the template below as the brief for content and order. Expand it into finished, polished copy — never return it as-is, never leave headings without text.');
  if (o.kind === 'marketing' || o.kind === 'social') task.push(`Close with a clear call to action naming the contact person${s?.name ? ` (${s.name}${s.title ? `, ${s.title}` : ''}${s.email ? `, ${s.email}` : ''}${s.phone ? `, ${s.phone}` : ''})` : ''}. Keep any disclaimer in the template, word for word.`);
  const dateText = o.date || longDate();
  if (o.kind !== 'social') task.push(`DOCUMENT DATE: ${dateText}. Use exactly this date wherever the document is dated (the date under the title, "Dated", the date of the agreement, report or proposal, any cover or reference date). Never leave the document date blank or as [●], and never use a different date. Dates beside signature lines stay blank for the day of signing.`);
  if (o.subject) task.push(`Subject / purpose: ${o.subject}`);
  if (o.verbatimClauses?.length) task.push(`APPROVED CLAUSES — copy each of these into the right place WORD FOR WORD (you may renumber them and replace "{{…}}" style gaps only):\n${o.verbatimClauses.map(c => `[${c.name}]\n${c.text}`).join('\n\n')}`);
  if (r) task.push(`RECIPIENT: ${partyBlock(r, { withContact: true }).join(', ')}`);
  if (s) task.push(`SENDER / CONTACT: ${partyBlock(s, { withContact: true }).join(', ')}`);
  if (o.instructions) task.push(`DIRECTION FROM ${biz.short.toUpperCase()} (follow it): ${o.instructions}`);
  const user = `${task.join('\n\n')}\n\n<<FACT SHEET>>\n${o.facts || '(no facts recorded)'}\n<</FACT SHEET>>${o.templateText ? `\n\n<<TEMPLATE>>\n${o.templateText}\n<</TEMPLATE>>` : ''}`;

  const maxTokens = o.kind === 'legal' ? 16000 : 8000;
  const minChars = bodyOnly ? Math.round(MIN_CHARS.letter * (length === 'brief' ? 0.6 : 1)) : Math.round(MIN_CHARS[o.kind] * (length === 'brief' ? 0.55 : length === 'comprehensive' ? 1.4 : 1));
  let text = tidyOutput(await chat(o.provider, { system, messages: [{ role: 'user', content: user }], maxTokens, timeoutMs: 280_000, reasoning: o.kind === 'legal' ? 'medium' : 'low' }));
  let problem = badOutput(text, o.kind, minChars);
  if (problem) {
    const retry = tidyOutput(await chat(o.provider, { system, maxTokens, timeoutMs: 280_000, reasoning: 'low', messages: [
      { role: 'user', content: user },
      { role: 'assistant', content: text.slice(0, 4000) || '(nothing)' },
      { role: 'user', content: `That attempt is not usable (${problem}). Write the COMPLETE finished document now — ${LENGTH[o.kind][length]} — following every rule. Do not repeat these instructions or the fact sheet; output only the document.` },
    ] }).catch(() => ''));
    const p2 = badOutput(retry, o.kind, minChars);
    if (!p2 || retry.length > text.length) { text = retry; problem = p2; }
  }
  if (problem === 'echoed the instructions' || problem === 'empty' || problem === 'returned data instead of a document') throw new Error(`The AI ${problem}. Try again or choose another AI provider.`);
  if (o.draftBanner && o.kind === 'legal' && !text.startsWith(o.draftBanner.slice(0, 20))) text = `${o.draftBanner}\n\n${text}`;
  if (o.kind !== 'social') text = ensureDocDate(text, dateText, { addLine: !bodyOnly });
  return { text, warning: problem ? `The AI's answer is shorter than expected (${problem}). Add more project details or direction and regenerate.` : null };
}

/** "Prepared for / by" header for non-letter documents when no AI wrote it (template output). */
export function preparedHeader(title: string, recipient: Party | null, sender: Party | null, date?: string | null): string {
  const rows = [`# ${title}`];
  if (recipient && Object.values(recipient).some(has)) rows.push(`Prepared for: ${[recipient.name, recipient.title, recipient.company].filter(has).join(', ')}`);
  if (sender && Object.values(sender).some(has)) rows.push(`Prepared by: ${[sender.name, sender.title, sender.company].filter(has).join(', ')}`);
  rows.push(`Date: ${date || longDate()}`, '---');
  return rows.join('\n');
}

/** Changes an existing document as asked in conversation. Returns the full new document (or null if the AI only answered a question). */
export async function reviseDocument(o: { provider: Provider; kind: DocKind; doc: string; request: string; history?: { role: 'user' | 'assistant'; content: string }[]; facts: string; recipient?: Party | null; sender?: Party | null; actorId?: string | null }): Promise<{ content: string | null; reply: string }> {
  const biz = await ourBusiness();
  const law = String((await getSetting<string>('home_jurisdiction')) || 'Queensland');
  const [instr, book] = await Promise.all([aiInstructions(o.actorId).catch(() => ''), brandBookExcerpt(o.kind === 'legal' ? 1200 : 2000).catch(() => '')]);
  const system = [systemPrompt(o.kind, biz.short, biz.company || biz.short, law), FACT_RULES(biz.short), FORMAT_RULES,
    `YOU ARE EDITING A DOCUMENT WITH THE USER, STEP BY STEP.
- Apply exactly what the user asks in their latest message, and keep everything else as it is (same structure, numbering, names, letter frame and sign-off) unless they ask otherwise.
- If they only ask a question and no change is needed, answer it and do not change the document.
- Reply in this exact format:
NOTE: <one or two short sentences telling the user what you changed, or your answer>
<<<DOCUMENT>>>
<the complete updated document — every line, not just the changed part — or the single word UNCHANGED>`,
    instr ? `BUSINESS INSTRUCTIONS:\n${instr}` : '', book ? `BRAND BOOK:\n${book}` : '', await styleBlock(o.kind, biz.short).catch(() => '')].filter(Boolean).join('\n\n');
  const ctx = [o.recipient && Object.values(o.recipient).some(has) ? `RECIPIENT: ${partyBlock(o.recipient, { withContact: true }).join(', ')}` : '', o.sender ? `SENDER: ${partyBlock(o.sender, { withContact: true }).join(', ')}` : ''].filter(Boolean).join('\n');
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [
    ...(o.history || []).slice(-8).map(h => ({ role: h.role, content: h.content.slice(0, 1500) })),
    { role: 'user', content: `${ctx ? `${ctx}\n\n` : ''}<<FACT SHEET>>\n${o.facts || '(none)'}\n<</FACT SHEET>>\n\n<<CURRENT DOCUMENT>>\n${o.doc}\n<</CURRENT DOCUMENT>>\n\nMY REQUEST: ${o.request}` },
  ];
  // History must start with the user and alternate
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const merged: typeof msgs = []; for (const m of msgs) { const last = merged[merged.length - 1]; if (last && last.role === m.role) last.content += `\n\n${m.content}`; else merged.push({ ...m }); }
  const raw = await chat(o.provider, { system, messages: merged, maxTokens: o.kind === 'legal' ? 16000 : 8000, timeoutMs: 280_000, reasoning: 'low' });
  const note = (raw.match(/NOTE:\s*([\s\S]*?)(?:<<<DOCUMENT>>>|$)/i)?.[1] || '').trim();
  const after = raw.split(/<<<DOCUMENT>>>/i)[1];
  if (after === undefined) {
    // No marker: the model either answered only, or returned the document alone.
    const t = tidyOutput(raw);
    if (t.length > o.doc.length * 0.5 && !badOutput(t, o.kind, Math.min(o.doc.length * 0.5, 600))) return { content: t, reply: 'Done — the document is updated.' };
    return { content: null, reply: t.slice(0, 1500) || 'I could not make that change.' };
  }
  const body = tidyOutput(after);
  if (/^UNCHANGED\b/i.test(body)) return { content: null, reply: note || 'No change needed.' };
  const shorter = /\b(short|shorter|concise|cut|trim|remove|delete|brief)\b/i.test(o.request);
  const problem = badOutput(body, o.kind, shorter ? 200 : Math.min(Math.round(o.doc.length * 0.6), MIN_CHARS[o.kind]));
  if (problem) return { content: null, reply: `I didn't apply that — the AI's version looked wrong (${problem}). Try asking again in different words.` };
  return { content: body, reply: note || 'Done — the document is updated.' };
}
