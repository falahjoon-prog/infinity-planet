/**
 * RHC City built-in Legal AI — deterministic rules engine.
 *
 * Works with NO external AI key. It segments an agreement into clauses,
 * extracts parties, amounts, dates and durations, recognises ~40 legal topics,
 * applies RHC-perspective risk rules, detects missing protections, compares
 * wording to the RHC clause library (respecting APPROVED / PREFERRED /
 * FALLBACK / HISTORICAL PRECEDENT / DRAFT authority), and produces a scored
 * risk rating with negotiation points, amendments and solicitor questions.
 *
 * When an AI provider is configured, lib/legal/ai.ts deepens this analysis;
 * the rules output is always kept so results never depend on an external key.
 */
import { TOPICS } from './topics';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Authority = 'approved' | 'preferred' | 'fallback' | 'historical_precedent' | 'draft';
export const AUTHORITY_LABEL: Record<Authority, string> = {
  approved: 'APPROVED', preferred: 'PREFERRED', fallback: 'FALLBACK', historical_precedent: 'HISTORICAL PRECEDENT', draft: 'DRAFT',
};

export type Clause = { ref: string; heading: string; text: string; topics: string[] };
export type Finding = {
  id: string; severity: Severity; category: 'financial' | 'termination' | 'liability' | 'commercial' | 'legal' | 'drafting';
  title: string; clause_ref?: string; excerpt?: string; issue: string; recommendation: string;
  negotiation_point?: string; solicitor_question?: string; proposed_wording?: string; source: 'rules' | 'ai';
};
export type MissingProtection = { topic: string; label: string; severity: Severity; why: string; recommendation: string; proposed_wording?: string; source: 'rules' | 'ai' };
export type ClauseComparison = {
  library_clause_id: string; library_clause: string; category: string; authority: Authority; library_status: string;
  is_approved_position: boolean; matched_clause_ref: string | null;
  result: 'consistent_with_preferred' | 'at_fallback' | 'deviates' | 'prohibited_present' | 'not_addressed';
  severity: Severity | null; note: string;
};
export type LibraryClause = { id: string; name: string; category: string; preferred_position?: string | null; fallback_position?: string | null; prohibited_position?: string | null; status?: string | null; authority?: string | null; keywords?: string[] | null };

export type LegalAnalysis = {
  engine: 'rules' | 'rules+ai';
  engine_version: string;
  provider?: string | null;
  document_type: string;
  binding_status: 'binding' | 'non_binding' | 'mixed' | 'unclear';
  executive_summary: string;
  parties: { name: string; identifier?: string; is_rhc: boolean; defined_as?: string }[];
  rhc: { identified: boolean; names: string[]; aliases: string[]; note: string };
  key_terms: { label: string; value: string; clause_ref?: string }[];
  amounts: string[]; dates: string[]; durations: string[]; percentages: string[];
  outline: { ref: string; heading: string; topics: string[] }[];
  findings: Finding[];
  missing_protections: MissingProtection[];
  financial_risks: string[]; termination_risks: string[]; liability_risks: string[];
  conditions_precedent: { text: string; clause_ref: string }[];
  due_diligence: { item: string; reason: string }[];
  negotiation_points: string[];
  recommended_amendments: { clause_ref: string; issue: string; proposed: string }[];
  solicitor_questions: string[];
  clause_comparisons: ClauseComparison[];
  authority: { document_authority: Authority; label: string; note: string };
  overall_risk: { rating: 'Low' | 'Medium' | 'High' | 'Critical'; score: number; rationale: string[] };
  stats: { clauses: number; words: number; topics_found: string[] };
  ai_notes?: string;
  disclaimer: string;
};

export type EngineInput = {
  text: string;
  rhcNames?: string[];         // e.g. ["RHC City", "RHC"]
  rhcRole?: string | null;     // e.g. "Purchaser", "Developer" — the defined term RHC holds
  homeJurisdiction?: string;   // e.g. "Queensland"
  documentAuthority?: Authority;
  library?: LibraryClause[];
  ourName?: string;            // how reports refer to the business (Settings → Business details short name), default "RHC"
};

export const ENGINE_VERSION = 'rhc-legal-rules-1.0';
const SEV_WEIGHT: Record<Severity, number> = { critical: 25, high: 12, medium: 5, low: 2 };
const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ------------------------------------------------------------------ helpers
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clip = (s: string, n = 260) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const uniq = <T,>(a: T[]) => [...new Set(a)];
function sentences(text: string) { return text.replace(/\s+/g, ' ').split(/(?<=[.;:])\s+(?=[A-Z(“"'])/).map(s => s.trim()).filter(s => s.length > 3); }

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, sixty: 60, ninety: 90 };
function durationDays(s: string): number | null {
  const m = s.match(/\b(\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|fifteen|twenty|thirty|forty|forty-five|sixty|ninety)\s*(?:\(\d+\)\s*)?(business\s+)?(days?|weeks?|months?|years?)\b/i);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1].toLowerCase()] || 0;
  const unit = m[3].toLowerCase();
  return unit.startsWith('day') ? n * (m[2] ? 1.4 : 1) : unit.startsWith('week') ? n * 7 : unit.startsWith('month') ? n * 30 : n * 365;
}

// ------------------------------------------------------------- segmentation
export function segmentClauses(text: string): Clause[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const heads: { i: number; ref: string; heading: string }[] = [];
  const numbered = /^\s*(?:clause\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})[.)]?\s+([A-Z][^\n]{0,140})$/i;
  const schedule = /^\s*(SCHEDULE|ANNEXURE|APPENDIX|ATTACHMENT|EXHIBIT)\s*([A-Z0-9]*)\b(.*)$/i;
  const caps = /^\s*([A-Z][A-Z &,'()/-]{3,60})\s*$/;
  lines.forEach((line, i) => {
    let m = line.match(numbered);
    if (m && !/^\d/.test(m[2])) { heads.push({ i, ref: m[1], heading: m[2].replace(/[.:]\s*$/, '').slice(0, 90) }); return; }
    m = line.match(schedule);
    if (m) { heads.push({ i, ref: `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`.trim(), heading: (m[3] || '').replace(/^[\s:–-]+/, '').slice(0, 90) || m[1] }); return; }
    m = line.match(caps);
    if (m && !/^(AND|BETWEEN|PARTIES|WHEREAS|NOW|THE|DATED|EXECUTED)$/.test(m[1].trim())) heads.push({ i, ref: m[1].trim().slice(0, 40), heading: m[1].trim() });
  });
  let clauses: Clause[] = [];
  if (heads.length >= 2) {
    const preamble = lines.slice(0, heads[0].i).join('\n').trim();
    if (preamble.length > 20) clauses.push({ ref: 'Preamble', heading: 'Preamble / parties', text: preamble, topics: [] });
    heads.forEach((h, k) => {
      const end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
      const body = lines.slice(h.i, end).join('\n').trim();
      if (body) clauses.push({ ref: /^\d/.test(h.ref) ? `cl ${h.ref}` : h.ref, heading: h.heading, text: body, topics: [] });
    });
  } else {
    const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 15);
    clauses = paras.map((p, i) => ({ ref: `para ${i + 1}`, heading: clip(p.split('\n')[0], 70), text: p, topics: [] }));
  }
  for (const c of clauses) {
    const hay = `${c.heading}\n${c.text}`;
    c.topics = Object.entries(TOPICS).filter(([, t]) => t.re.test(hay)).map(([k]) => k);
  }
  return clauses;
}

// --------------------------------------------------------------- extraction
const ENTITY_RE = /\b([A-Z][A-Za-z0-9&'’.\- ]{1,70}?\s(?:(?:Holdings|Group|Corporation|Investments|Properties|Developments|Capital)\s(?:Pty\.?\s?Ltd\.?|Pty\.?\s?Limited|Limited|Ltd\.?)|Pty\.?\s?Ltd\.?|Pty\.?\s?Limited|Limited|Ltd\.?|Inc\.?|LLC|Trust|Corporation|Council|Holdings|Group))(?=[\s,.;:()"“”']|$)/g;
function cleanEntity(n: string) {
  return n.replace(/^(?:and|between|by|of|the|to|with|from|for|that|this|party|parties)\s+/i, '').replace(/^(?:and|between|by|of|the|to|with|from|for)\s+/i, '').replace(/\s+/g, ' ').trim();
}

function extractParties(text: string, rhcRe: RegExp) {
  const head = text.slice(0, 6000);
  const found = new Map<string, { name: string; identifier?: string; defined_as?: string }>();
  for (const m of head.matchAll(ENTITY_RE)) {
    let name = cleanEntity(m[1]);
    const tail = head.slice((m.index || 0) + m[0].length).match(/^\s+(Pty\.?\s?Ltd\.?|Pty\.?\s?Limited|Limited|Ltd\.?)/);
    if (tail && !/(Pty|Ltd|Limited)\.?$/i.test(name)) name = `${name} ${tail[1]}`;
    if (name.length < 5 || name.split(' ').length > 9 || /^(Pty|Ltd|Limited)\b/i.test(name)) continue;
    if ([...found.values()].some(f => f.name.includes(name) || name.includes(f.name))) { const k = [...found.entries()].find(([, f]) => name.includes(f.name)); if (k) found.set(k[0], { name }); continue; }
    const key = name.toLowerCase().replace(/[.\s]/g, '');
    if (!found.has(key)) found.set(key, { name });
  }
  // ABN / ACN near names
  for (const p of found.values()) {
    const near = head.match(new RegExp(`${esc(p.name)}[^\\n]{0,60}?\\b(A[BC]N)[:\\s]*([\\d ]{9,14})`, 'i'));
    if (near) p.identifier = `${near[1].toUpperCase()} ${near[2].trim()}`;
    const def = head.match(new RegExp(`${esc(p.name)}[^()]{0,120}\\((?:the\\s+|hereinafter\\s+)?[“"']?([A-Z][A-Za-z ]{1,30})[”"']?\\)`));
    if (def) p.defined_as = def[1].trim();
  }
  // RHC may appear without a company suffix
  const rhcMatch = head.match(rhcRe);
  if (rhcMatch && ![...found.values()].some(p => rhcRe.test(p.name))) {
    const def = head.slice(rhcMatch.index!).match(/^[^()]{0,120}\((?:the\s+)?[“"']?([A-Z][A-Za-z ]{1,30})[”"']?\)/);
    found.set('rhc', { name: rhcMatch[0], defined_as: def?.[1]?.trim() });
  }
  // Defined parties like ("Vendor") without entity suffix
  const roles = uniq([...head.matchAll(/\((?:the\s+)?[“"']([A-Z][a-z]+(?: [A-Z][a-z]+)?)[”"']\)/g)].map(m => m[1]))
    .filter(r => /^(Purchaser|Vendor|Developer|Owner|Investor|Buyer|Seller|Lessor|Lessee|Landlord|Tenant|Consultant|Contractor|Principal|Client|Supplier|Company|Partner|Lender|Borrower|Guarantor|Recipient|Discloser|Disclosing Party|Receiving Party|Agent|Manager|Proponent|Joint Venturer)s?$/.test(r));
  return { parties: [...found.values()].slice(0, 8), roles };
}

function extractAll(text: string) {
  const flat = text.replace(/\s+/g, ' ');
  const amounts = uniq((flat.match(/(?:A?\$|AUD\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|m|k|billion|bn)\b)?/gi) || []).map(s => s.trim())).slice(0, 25);
  const percentages = uniq(flat.match(/\b\d{1,3}(?:\.\d+)?\s?(?:%|per ?cent)/gi) || []).slice(0, 15);
  const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
  const dates = uniq(flat.match(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${months})\\s+\\d{4}\\b|\\b(?:${months})\\s+\\d{1,2},?\\s+\\d{4}\\b|\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b`, 'g')) || []).slice(0, 20);
  const durations = uniq((flat.match(/\b(?:\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|fifteen|twenty|thirty|forty|forty-five|sixty|ninety)\s*(?:\(\d+\)\s*)?(?:business\s+)?(?:days?|weeks?|months?|years?)\b/gi) || []).map(s => s.toLowerCase())).slice(0, 25);
  return { amounts, percentages, dates, durations };
}

function detectType(text: string) {
  const t = text.slice(0, 4000);
  const checks: [RegExp, string][] = [
    [/memorandum of understanding|\bMOU\b/i, 'Memorandum of Understanding (MOU)'],
    [/heads of (agreement|terms)/i, 'Heads of Agreement'],
    [/term sheet/i, 'Term Sheet'],
    [/letter of (intent|offer)|\bLOI\b/i, 'Letter of Intent / Offer'],
    [/non[- ]disclosure|confidentiality (agreement|deed)/i, 'Confidentiality / Non-Disclosure Agreement'],
    [/joint venture/i, 'Joint Venture Agreement'],
    [/development (management )?agreement/i, 'Development Agreement'],
    [/contract (for the )?(sale|purchase) of|sale of land|purchase price/i, 'Contract of Sale'],
    [/\blease\b|lessor|lessee|landlord|tenant/i, 'Lease'],
    [/loan agreement|facility agreement|borrower|lender/i, 'Loan / Finance Agreement'],
    [/(consultancy|services|consulting) agreement|scope of services/i, 'Services / Consultancy Agreement'],
    [/shareholders'? agreement|unitholders'? agreement/i, 'Shareholders / Unitholders Agreement'],
    [/deed\b/i, 'Deed'],
  ];
  for (const [re, label] of checks) if (re.test(t)) return label;
  return /agreement|contract/i.test(t) ? 'Commercial Agreement' : 'Document (type unclear)';
}

function detectBinding(text: string): LegalAnalysis['binding_status'] {
  const non = /\b(non[- ]?binding|not (intended to be )?(legally )?binding|not intended to create legal relations|subject to (formal )?contract)\b/i.test(text);
  const partial = /\b(following (clauses|provisions|paragraphs) (are|will be|shall be) (legally )?binding|(clauses?|paragraphs?)\s[\d, and]+\s(are|is) (legally )?binding|only .{0,40}(are|is) binding)\b/i.test(text);
  const bind = /\b(legally binding|binding (on|upon) the parties|this (agreement|deed) is binding)\b/i.test(text);
  if (non && (partial || bind)) return 'mixed';
  if (non) return 'non_binding';
  if (bind || /\b(agreement|deed|contract)\b/i.test(text.slice(0, 1500))) return 'binding';
  return 'unclear';
}

// ---------------------------------------------------------------- direction
type Who = 'rhc' | 'counterparty' | 'mutual' | 'unknown';
function makeWho(rhcRe: RegExp, rhcAliases: string[], otherAliases: string[]) {
  const rhcAliasRe = rhcAliases.length ? new RegExp(`\\b(?:the\\s+)?(?:${rhcAliases.map(esc).join('|')})\\b`, 'i') : null;
  const otherRe = otherAliases.length ? new RegExp(`\\b(?:the\\s+)?(?:${otherAliases.map(esc).join('|')})\\b`, 'i') : null;
  const mutualRe = /\b(each party|either party|both parties|the parties|each of the parties|neither party)\b/i;
  return (sentence: string, verb: RegExp): Who => {
    const m = sentence.match(verb);
    if (!m || m.index === undefined) return 'unknown';
    const before = sentence.slice(Math.max(0, m.index - 160), m.index);
    // The subject is the party mentioned closest before the verb.
    const pos = (re: RegExp | null) => { if (!re) return -1; let last = -1; const g = new RegExp(re.source, 'gi'); let x; while ((x = g.exec(before))) last = x.index; return last; };
    const pm = pos(mutualRe), pr = Math.max(pos(rhcRe), pos(rhcAliasRe)), po = pos(otherRe);
    const best = Math.max(pm, pr, po);
    if (best < 0) return 'unknown';
    return best === pm ? 'mutual' : best === pr ? 'rhc' : 'counterparty';
  };
}

// ------------------------------------------------------------------ engine
export function analyseAgreement(input: EngineInput): LegalAnalysis {
  return rebrandAnalysis(analyseCore(input), input.ourName || 'RHC');
}

function analyseCore(input: EngineInput): LegalAnalysis {
  const text = input.text.replace(/\u0000/g, '').trim();
  const rhcNames = uniq((input.rhcNames?.length ? input.rhcNames : ['RHC City', 'RHC']).map(s => s.trim()).filter(Boolean));
  const rhcWord = new RegExp(`\\b(?:${rhcNames.slice().sort((a, b) => b.length - a.length).map(esc).join('|')})\\b`, 'i');
  const rhcRe = new RegExp(`\\b(?:${rhcNames.sort((a, b) => b.length - a.length).map(esc).join('|')})\\b[A-Za-z0-9 .&]{0,40}?(?:Pty\\.?\\s?Ltd\\.?|Limited|Ltd\\.?)?`, 'i');
  const home = input.homeJurisdiction || 'Queensland';
  const docAuthority: Authority = input.documentAuthority || 'draft';

  const clauses = segmentClauses(text);
  const { parties: rawParties, roles } = extractParties(text, rhcRe);
  const ex = extractAll(text);
  const docType = detectType(text);
  const binding = detectBinding(text);
  const isPreliminary = /MOU|Heads|Term Sheet|Intent/.test(docType);

  // RHC + counterparty aliases (defined terms)
  const rhcAliases = uniq([...(input.rhcRole ? [input.rhcRole] : []), ...rawParties.filter(p => rhcRe.test(p.name) && p.defined_as).map(p => p.defined_as!)]);
  const otherAliases = uniq([...rawParties.filter(p => !rhcRe.test(p.name)).flatMap(p => [p.name, ...(p.defined_as ? [p.defined_as] : [])]), ...roles.filter(r => !rhcAliases.includes(r))]);
  const who = makeWho(rhcRe, rhcAliases, otherAliases);
  const rhcIdentified = rhcRe.test(text) || rhcAliases.length > 0;
  const parties = rawParties.map(p => ({ ...p, is_rhc: rhcRe.test(p.name) || (!!p.defined_as && rhcAliases.includes(p.defined_as)) }));

  const findings: Finding[] = [];
  let fid = 0;
  const add = (f: Omit<Finding, 'id' | 'source'>) => {
    if (findings.some(x => x.title === f.title && x.clause_ref === f.clause_ref)) return;
    findings.push({ ...f, id: `R${++fid}`, source: 'rules' });
  };
  const has = (topic: string) => clauses.some(c => c.topics.includes(topic));
  const clausesWith = (topic: string) => clauses.filter(c => c.topics.includes(topic));
  const sentencesIn = (c: Clause) => sentences(c.text);
  const counterpartyLabel = otherAliases[0] ? `the ${otherAliases.find(a => /^[A-Z][a-z]/.test(a) && a.split(' ').length <= 2) || 'counterparty'}` : 'the counterparty';

  // 1. Indemnities
  let rhcIndemnifies = false, counterIndemnifies = false;
  for (const c of clausesWith('indemnity')) for (const s of sentencesIn(c)) {
    const w = who(s, /\b(must|shall|will|agrees? to|hereby)\s+(fully\s+)?indemnif|\bindemnifies\b/i);
    if (w === 'rhc') {
      rhcIndemnifies = true;
      const broad = /\b(any and all|all|any)\s+(loss|losses|claims?|liabilit)/i.test(s) && !/\b(to the extent|caused by|arising from (its|the) (negligen|breach))/i.test(s);
      add({ severity: broad ? 'critical' : 'high', category: 'liability', title: broad ? 'Broad indemnity given by RHC' : 'Indemnity given by RHC', clause_ref: c.ref, excerpt: clip(s),
        issue: broad ? 'RHC indemnifies against any and all losses without being limited to losses caused by RHC\'s own breach or negligence.' : 'RHC gives an indemnity to the other party.',
        recommendation: 'Limit the indemnity to losses directly caused by RHC\'s breach or negligent act, reduce proportionately for the other party\'s contribution, exclude consequential loss and include it within the liability cap.',
        negotiation_point: 'Make any RHC indemnity proportionate, fault-based and capped — or delete it.',
        solicitor_question: `Is the indemnity in ${c.ref} enforceable as drafted, and how does it interact with the limitation of liability?`,
        proposed_wording: 'RHC indemnifies the Counterparty against Loss to the extent that the Loss is directly caused by a breach of this agreement or a negligent act or omission of RHC, reduced proportionately to the extent the Counterparty or its personnel contributed to the Loss. This indemnity is subject to clause [Limitation of Liability].' });
    } else if (w === 'counterparty') counterIndemnifies = true;
  }
  if (rhcIndemnifies && !counterIndemnifies) add({ severity: 'medium', category: 'liability', title: 'Indemnities are one-sided against RHC', issue: 'RHC gives an indemnity but receives no reciprocal indemnity.', recommendation: 'Seek a reciprocal indemnity from the counterparty for its breach, negligence and third-party claims.', negotiation_point: 'Ask for a mutual indemnity regime.' });

  // 2. Liability cap
  const capClauses = clausesWith('liability_cap');
  const unlimited = /\b(unlimited liability|without limit(ation)? (as to|of) (amount|liability)|liability (is|shall be) unlimited)\b/i.exec(text);
  if (unlimited) add({ severity: 'high', category: 'liability', title: 'Unlimited liability', excerpt: clip(text.slice(Math.max(0, unlimited.index - 120), unlimited.index + 160)), issue: 'The document refers to unlimited liability.', recommendation: 'Introduce an aggregate cap on RHC\'s liability (for example, the fees or consideration under the agreement) with standard carve-outs only for fraud and wilful misconduct.', negotiation_point: 'Cap RHC\'s aggregate liability.', solicitor_question: 'What is RHC\'s maximum realistic exposure under this document?' });
  for (const c of capClauses) for (const s of sentencesIn(c)) {
    const w = who(s, /\b(liability|aggregate liability)\b/i);
    if (w === 'counterparty' && /\b(limited to|shall not exceed|will not exceed|capped)\b/i.test(s) && !/\beach party|either party/i.test(s)) {
      add({ severity: 'medium', category: 'liability', title: 'Only the counterparty\'s liability is capped', clause_ref: c.ref, excerpt: clip(s), issue: 'The cap protects the counterparty but RHC\'s liability is not equally limited.', recommendation: 'Make the limitation of liability mutual.', negotiation_point: 'Mutual liability cap.' });
    }
  }

  // 3. Termination
  let rhcCanTerminate = false; let counterConvenience: { c: Clause; s: string } | null = null;
  for (const c of clausesWith('termination')) for (const s of sentencesIn(c)) {
    const w = who(s, /\b(may|can|is entitled to|has the right to)\s+(immediately\s+)?terminat/i);
    if (w === 'rhc' || w === 'mutual') rhcCanTerminate = true;
    if ((w === 'counterparty') && /\b(for convenience|without cause|at any time|for any reason|without (giving )?(any )?reason|in its (sole|absolute) discretion)\b/i.test(s)) counterConvenience = counterConvenience || { c, s };
    if (w === 'counterparty') {
      const d = durationDays(s);
      if (d !== null && d < 30 && /notice/i.test(s)) add({ severity: 'medium', category: 'termination', title: 'Short termination notice for the counterparty', clause_ref: c.ref, excerpt: clip(s), issue: `The counterparty can terminate on short notice (about ${Math.round(d)} days).`, recommendation: 'Extend the notice period and add payment of RHC\'s committed costs on termination.', negotiation_point: 'Longer notice + recovery of RHC\'s costs on termination.' });
    }
  }
  if (counterConvenience) add({ severity: 'high', category: 'termination', title: `${counterpartyLabel[4].toUpperCase()}${counterpartyLabel.slice(5)} can terminate for convenience`, clause_ref: counterConvenience.c.ref, excerpt: clip(counterConvenience.s),
    issue: 'The counterparty may walk away without cause, leaving RHC with sunk costs and lost opportunity.', recommendation: 'Delete the right, make it mutual, or require a break fee / reimbursement of RHC\'s costs and a minimum notice period.',
    negotiation_point: 'Remove one-sided termination for convenience or attach a break fee.', solicitor_question: 'What can RHC recover if the counterparty terminates for convenience?',
    proposed_wording: 'Either party may terminate this agreement for convenience by giving not less than [60] days\' written notice, in which case the terminating party must reimburse the other party\'s reasonable costs committed up to the termination date.' });
  if (has('termination') && !rhcCanTerminate) add({ severity: 'medium', category: 'termination', title: 'No clear termination right for RHC', issue: 'The termination provisions do not clearly give RHC a right to terminate (for breach, insolvency or failure of conditions).', recommendation: 'Add RHC termination rights for material breach not remedied within a cure period, insolvency events and failure of conditions by the sunset date.', negotiation_point: 'Mutual termination rights for breach and insolvency.', proposed_wording: 'RHC may terminate this agreement by written notice if the Counterparty (a) commits a material breach that is not remedied within [14] days of notice, or (b) suffers an Insolvency Event.' });

  // 4. Exclusivity / restraint
  for (const c of clausesWith('exclusivity')) for (const s of sentencesIn(c)) {
    if (!/\bexclusiv(e|ely|ity)\b(?!\s+(of|jurisdiction))/i.test(s)) continue;
    const w = who(s, /\b(must not|shall not|will not|agrees? not to|grants?|is granted|deal exclusively|exclusively)\b/i);
    const timeBound = durationDays(s) !== null || /\b(until|expir|end date|sunset)\b/i.test(s);
    if (w === 'rhc' || (w === 'unknown' && rhcWord.test(s))) add({ severity: timeBound ? 'medium' : 'high', category: 'commercial', title: timeBound ? 'Exclusivity binds RHC' : 'Open-ended exclusivity binds RHC', clause_ref: c.ref, excerpt: clip(s), issue: timeBound ? 'RHC is restricted from dealing with others for a period.' : 'RHC is restricted from dealing with others and no end date is stated.', recommendation: 'Limit exclusivity to a short, fixed period that ends automatically if milestones are missed, and make it mutual where appropriate.', negotiation_point: 'Short, fixed-term exclusivity that falls away on missed milestones.' });
  }
  for (const c of clausesWith('non_compete')) for (const s of sentencesIn(c)) {
    const w = who(s, /\b(must not|shall not|will not|agrees? not to|is restrained)\b/i);
    if (w === 'rhc' || w === 'mutual') add({ severity: 'high', category: 'commercial', title: 'Restraint / non-compete on RHC', clause_ref: c.ref, excerpt: clip(s), issue: 'RHC is restrained from competing or carrying on business, which may restrict future projects.', recommendation: 'Delete, or narrow to a specific site, short period and defined activity; confirm enforceability.', negotiation_point: 'Remove or narrowly confine the restraint.', solicitor_question: `Is the restraint in ${c.ref} reasonable and enforceable, and what does it prevent RHC from doing?` });
  }

  // 5. Guarantees & security
  for (const c of clausesWith('security_guarantee')) for (const s of sentencesIn(c)) {
    if (/\b(personal guarantee|director'?s'? guarantee|guarantor)\b/i.test(s)) {
      const w = who(s, /\b(guarant|must provide|shall provide|procure)\b/i);
      add({ severity: w === 'counterparty' ? 'low' : 'critical', category: 'financial', title: w === 'counterparty' ? 'Guarantee from the counterparty (protective)' : 'Personal / director guarantee may be required from RHC', clause_ref: c.ref, excerpt: clip(s), issue: w === 'counterparty' ? 'The counterparty provides a guarantee — confirm the guarantor\'s financial capacity.' : 'A personal or director guarantee exposes individuals behind RHC to unlimited personal liability.', recommendation: w === 'counterparty' ? 'Verify the guarantor\'s assets and capacity.' : 'Refuse personal guarantees; offer limited corporate security instead.', negotiation_point: w === 'counterparty' ? undefined : 'No personal guarantees from RHC directors.', solicitor_question: w === 'counterparty' ? undefined : 'Who exactly would be giving the guarantee and what is the exposure?' });
    } else if (/\b(security interest|mortgage|charge over|PPSA)\b/i.test(s) && who(s, /\b(grants?|must grant|shall grant|charges?|mortgages?)\b/i) === 'rhc') {
      add({ severity: 'high', category: 'financial', title: 'RHC grants security over its assets', clause_ref: c.ref, excerpt: clip(s), issue: 'RHC is granting security, which may conflict with financier requirements and puts assets at risk.', recommendation: 'Limit security to specific project assets, check against existing finance covenants, and ensure release on completion.', solicitor_question: 'Does this security conflict with RHC\'s existing finance or other securities (PPSR)?' });
    }
  }

  // 6. Financial terms
  for (const c of clausesWith('deposit')) for (const s of sentencesIn(c)) {
    if (/non[- ]?refundable/i.test(s) && who(s, /\b(pay|paid|payable|provide)\b/i) !== 'counterparty') add({ severity: 'high', category: 'financial', title: 'Non-refundable deposit', clause_ref: c.ref, excerpt: clip(s), issue: 'A deposit is non-refundable, so RHC may lose it even if conditions fail for reasons outside its control.', recommendation: 'Make the deposit refundable if any condition precedent is not satisfied, and held in a trust account.', negotiation_point: 'Refundable deposit held in trust until conditions are satisfied.' });
    if (/deposit/i.test(s) && /\b(released|paid)\s+to\s+the\s+(vendor|seller|developer|owner)/i.test(s) && !/trust/i.test(s)) add({ severity: 'medium', category: 'financial', title: 'Deposit released before completion', clause_ref: c.ref, excerpt: clip(s), issue: 'The deposit may be released to the other party before completion rather than held in trust.', recommendation: 'Require the deposit to be held in a solicitor\'s or agent\'s trust account until completion.' });
  }
  for (const c of clausesWith('late_interest')) for (const s of sentencesIn(c)) {
    const p = s.match(/(\d{1,2}(?:\.\d+)?)\s?(?:%|per ?cent)/i);
    if (p && Number(p[1]) >= 10 && who(s, /\b(pay|payable|accrue|charge)\b/i) !== 'counterparty') add({ severity: 'medium', category: 'financial', title: `High default interest (${p[1]}%)`, clause_ref: c.ref, excerpt: clip(s), issue: `Default interest of ${p[1]}% is high and could compound RHC\'s exposure on any late payment.`, recommendation: 'Reduce to a commercial rate (for example the RBA cash rate plus 2–4%) and apply only after written demand.' });
  }
  for (const c of clausesWith('payment')) for (const s of sentencesIn(c)) {
    const d = durationDays(s); if (d === null) continue;
    const w = who(s, /\b(must pay|shall pay|will pay|pays?|is payable|are payable)\b/i);
    if (w === 'counterparty' && d > 45) add({ severity: 'medium', category: 'financial', title: 'Long payment terms in RHC\'s favour', clause_ref: c.ref, excerpt: clip(s), issue: `Payment to RHC is due only after about ${Math.round(d)} days, affecting cash flow.`, recommendation: 'Reduce to 14–30 days with default interest for late payment.', negotiation_point: 'Shorter payment terms to RHC.' });
  }
  if (new RegExp(`\\b(costs?|expenses?|fees?)\\b[^.]{0,80}\\b(borne|paid) by (?:${rhcNames.slice().sort((a, b) => b.length - a.length).map(esc).join('|')})\\b|\\b(?:${rhcNames.slice().sort((a, b) => b.length - a.length).map(esc).join('|')}) (must|shall|will) (pay|bear|reimburse) (all|any)[^.]{0,40}(costs|expenses|fees)`, 'i').test(text)) add({ severity: 'medium', category: 'financial', title: 'RHC bears all costs', issue: 'RHC appears to bear all or most transaction costs.', recommendation: 'Each party should bear its own costs; any shared costs should be capped and agreed in advance.', negotiation_point: 'Each party bears its own costs.' });

  // 7. Discretion, variation, set-off, time, renewal, waiver, step-in, LDs
  let discretionCount = 0;
  for (const c of clausesWith('discretion')) for (const s of sentencesIn(c)) {
    if (!/\b(sole|absolute|unfettered) discretion\b/i.test(s) || discretionCount >= 3) continue;
    const w = who(s, /\b(sole|absolute|unfettered) discretion\b/i);
    if (w !== 'rhc') { discretionCount++; add({ severity: 'medium', category: 'commercial', title: 'Counterparty decision in its sole discretion', clause_ref: c.ref, excerpt: clip(s), issue: 'A key decision is left to the other party\'s absolute discretion, which RHC cannot challenge.', recommendation: 'Require the discretion to be exercised reasonably and in good faith, with reasons, and within a set time.', negotiation_point: '"Acting reasonably" standard for counterparty decisions.' }); }
  }
  for (const cl of clauses) for (const s of sentencesIn(cl)) {
    if (/\bmay\s+(unilaterally\s+)?(vary|amend|change|modify)\b[^.]{0,80}\b(this (agreement|deed|mou)|the terms|these terms)/i.test(s) && who(s, /\bmay\s+(unilaterally\s+)?(vary|amend|change|modify)/i) === 'counterparty')
      add({ severity: 'high', category: 'legal', title: 'Counterparty can vary the terms unilaterally', clause_ref: cl.ref, excerpt: clip(s), issue: 'The other party can change the agreement without RHC\'s written consent.', recommendation: 'All variations must be in writing and signed by both parties.', negotiation_point: 'No variation without RHC\'s written agreement.', proposed_wording: 'This agreement may only be varied by a document signed by or on behalf of each party.' });
    if (/\b(releases?|waives?|forgoes?)\b[^.]{0,60}\b(all|any)?\s*(claims?|rights?|remed)/i.test(s) && who(s, /\b(releases?|waives?|forgoes?)\b/i) === 'rhc')
      add({ severity: 'high', category: 'legal', title: 'RHC releases or waives rights', clause_ref: cl.ref, excerpt: clip(s), issue: 'RHC gives up claims or rights, potentially including unknown future claims.', recommendation: 'Delete or limit the release to specific, known matters.', solicitor_question: 'What claims would RHC be giving up under this release?' });
  }
  for (const c of clausesWith('set_off')) for (const s of sentencesIn(c)) if (/set[- ]?off/i.test(s) && who(s, /\b(may|is entitled to|can)\b/i) === 'counterparty' && !/\bnot\b/i.test(s.slice(0, s.search(/set[- ]?off/i))))
    add({ severity: 'medium', category: 'financial', title: 'Counterparty may set off against RHC', clause_ref: c.ref, excerpt: clip(s), issue: 'The counterparty may deduct disputed amounts from payments due to RHC.', recommendation: 'Remove the set-off right or make it mutual and limited to undisputed, due amounts.' });
  if (has('time_essence')) add({ severity: 'medium', category: 'legal', title: 'Time is of the essence', clause_ref: clausesWith('time_essence')[0]?.ref, issue: 'Any delay by RHC could allow immediate termination.', recommendation: 'Limit "time is of the essence" to payment and settlement dates, with a notice-to-complete mechanism for other obligations.' });
  for (const c of clausesWith('term_renewal')) for (const s of sentencesIn(c)) if (/\bautomatic(ally)?\s+(renew|extend|roll)/i.test(s))
    add({ severity: 'medium', category: 'commercial', title: 'Automatic renewal', clause_ref: c.ref, excerpt: clip(s), issue: 'The agreement renews automatically unless notice is given, which can lock RHC in.', recommendation: 'Require renewal by mutual written agreement, or diarise the notice window.' });
  for (const c of clausesWith('liquidated_damages')) for (const s of sentencesIn(c)) {
    const w = who(s, /\b(pay|payable|liable)\b/i);
    if (w === 'rhc' || (w === 'unknown' && rhcWord.test(s))) add({ severity: 'high', category: 'financial', title: 'Liquidated damages / penalty payable by RHC', clause_ref: c.ref, excerpt: clip(s), issue: 'RHC may be liable for pre-set damages or penalties.', recommendation: 'Cap liquidated damages, make them the sole remedy for the delay, and confirm they are a genuine pre-estimate of loss.', solicitor_question: 'Could these amounts be challenged as a penalty, and are they RHC\'s sole liability for delay?' });
  }
  for (const c of clausesWith('step_in')) add({ severity: 'medium', category: 'commercial', title: 'Step-in rights', clause_ref: c.ref, excerpt: clip(c.text), issue: 'A party (or financier) may step in and take over performance.', recommendation: 'Confirm who holds step-in rights, the triggers, and that RHC\'s accrued entitlements are protected.' });
  for (const c of clausesWith('assignment')) for (const s of sentencesIn(c)) {
    if (/\bmay\s+(freely\s+)?assign\b/i.test(s) && /\bwithout\b[^.]{0,30}\bconsent\b/i.test(s) && who(s, /\bmay\s+(freely\s+)?assign/i) === 'counterparty')
      add({ severity: 'medium', category: 'legal', title: 'Counterparty can assign without consent', clause_ref: c.ref, excerpt: clip(s), issue: 'RHC could end up contracting with an unknown or weaker party.', recommendation: 'Require RHC\'s prior written consent (not to be unreasonably withheld) for any assignment or change of control.' });
  }

  // 8. Governing law
  const glClause = clausesWith('governing_law')[0];
  if (glClause) {
    const states = ['Queensland', 'New South Wales', 'Victoria', 'South Australia', 'Western Australia', 'Tasmania', 'Northern Territory', 'Australian Capital Territory', 'Singapore', 'England', 'Hong Kong', 'New Zealand', 'Delaware', 'New York', 'California', 'Dubai', 'United Arab Emirates', 'China'];
    const law = states.find(st => new RegExp(`\\b${esc(st)}\\b`, 'i').test(glClause.text));
    if (law && law.toLowerCase() !== home.toLowerCase()) add({ severity: /Queensland|New South Wales|Victoria|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory/.test(law) ? 'low' : 'medium', category: 'legal', title: `Governing law is ${law}, not ${home}`, clause_ref: glClause.ref, excerpt: clip(glClause.text), issue: `Disputes would be decided under ${law} law and possibly in ${law} courts, increasing cost for RHC.`, recommendation: `Change governing law and exclusive jurisdiction to ${home}.`, negotiation_point: `${home} law and courts.` });
  }

  // 9. Drafting quality
  // Signature/date lines ("____") are normal in agreements and are not counted as unresolved terms.
  const blanks = text.match(/\[\s*(?:insert[^\]]*|●|•|\.{3,}|_+|TBC|TBA|\s*)\]|\bTBC\b|\bTBA\b|\bto be (agreed|confirmed|determined)\b/gi) || [];
  if (blanks.length) add({ severity: blanks.length > 5 ? 'high' : 'medium', category: 'drafting', title: `${blanks.length} incomplete or unresolved term${blanks.length > 1 ? 's' : ''}`, excerpt: uniq(blanks).slice(0, 6).join('  ·  '), issue: 'Blanks, placeholders or "to be agreed" terms mean the commercial deal is not settled.', recommendation: 'Complete every placeholder before signing; anything "to be agreed" is generally unenforceable and creates leverage for the other side.' });
  if (!rhcIdentified) add({ severity: 'medium', category: 'drafting', title: 'RHC is not clearly identified as a party', issue: `None of RHC's names (${rhcNames.join(', ')}) were found and no RHC role was specified.`, recommendation: 'Confirm the correct RHC contracting entity (with ACN/ABN) is named, or set RHC\'s role in the review so the engine can assess direction of obligations.' });
  if (isPreliminary && binding === 'unclear') add({ severity: 'high', category: 'legal', title: 'Binding effect is unclear', issue: `This ${docType} does not clearly say which parts are binding.`, recommendation: 'State expressly that the document is non-binding except for named clauses (confidentiality, exclusivity, costs, governing law).', solicitor_question: 'Could a court treat this preliminary document as a binding contract?', proposed_wording: 'Except for clauses [Confidentiality], [Exclusivity], [Costs] and [Governing Law], which are legally binding, this document is not intended to create legal relations and is subject to the parties entering into formal agreements.' });
  if (isPreliminary && binding === 'mixed') add({ severity: 'low', category: 'legal', title: 'Partly binding preliminary document', issue: 'Some clauses are binding while the rest are not — check that RHC is comfortable with every binding clause.', recommendation: 'Confirm the binding clauses are limited to confidentiality, exclusivity (time-limited), costs and governing law.' });

  // 10. Conditions precedent
  const conditions: { text: string; clause_ref: string }[] = [];
  for (const c of clauses) for (const s of sentencesIn(c)) if (/\b(conditions? precedent|conditional (up)?on|subject to (the )?(satisfaction|finance|due diligence|board|approval|FIRB|council|.*approval)|is subject to)\b/i.test(s) && conditions.length < 15) conditions.push({ text: clip(s, 320), clause_ref: c.ref });
  if (conditions.length && !has('sunset')) add({ severity: 'medium', category: 'commercial', title: 'Conditions have no sunset date', issue: 'There are conditions precedent but no date by which they must be satisfied, leaving RHC tied up indefinitely.', recommendation: 'Add a sunset date after which either party (or RHC) may terminate and recover any deposit.', negotiation_point: 'Sunset date for all conditions.', proposed_wording: 'If any Condition is not satisfied or waived by [date] (Sunset Date), either party may terminate this agreement by notice and any deposit must be refunded to RHC.' });

  // ------------------------------------------------ missing protections
  const missing: MissingProtection[] = [];
  const need = (topic: string, severity: Severity, why: string, recommendation: string, proposed_wording?: string) => { if (!has(topic)) missing.push({ topic, label: TOPICS[topic]?.label || topic, severity, why, recommendation, proposed_wording, source: 'rules' }); };
  const isNda = /Non-Disclosure|Confidentiality/.test(docType);
  const isContract = !isPreliminary && !isNda;
  need('governing_law', 'medium', 'Without a governing law clause, disputes about which law applies add cost and uncertainty.', `Add ${home} governing law and exclusive jurisdiction.`, `This agreement is governed by the laws of ${home}, and each party submits to the exclusive jurisdiction of the courts of ${home}.`);
  need('confidentiality', isNda ? 'critical' : isPreliminary ? 'high' : 'medium', 'RHC\'s commercial information, pricing and strategy may be shared without protection.', 'Add mutual confidentiality obligations that survive termination.');
  if (isContract) {
    need('liability_cap', 'high', 'RHC\'s liability is uncapped.', 'Add a mutual aggregate cap on liability with carve-outs only for fraud and wilful misconduct.', 'Each party\'s aggregate liability arising out of or in connection with this agreement is limited to [amount/the fees paid under this agreement], except for liability for fraud or wilful misconduct.');
    need('consequential', 'medium', 'RHC could be liable for indirect losses such as the other party\'s lost profits.', 'Exclude consequential and indirect loss for both parties.', 'Neither party is liable for any Consequential Loss, however arising.');
    need('termination', 'high', 'There is no mechanism to end the agreement for breach or insolvency.', 'Add termination rights for material breach (with cure period) and insolvency.');
    need('dispute', 'medium', 'No dispute resolution process — disputes go straight to court.', 'Add a negotiation → mediation → court/expert determination process.');
    need('force_majeure', 'low', 'RHC may be in breach if events outside its control prevent performance.', 'Add a mutual force majeure clause.');
    need('notices', 'low', 'No agreed way to give formal notices.', 'Add a notices clause with addresses and email.');
    need('entire_agreement', 'low', 'Earlier discussions or representations could be argued to form part of the deal.', 'Add an entire agreement clause.');
    need('variation', 'low', 'No requirement that changes be in writing.', 'Require variations to be in writing signed by both parties.');
    if (/Services|Development|Joint Venture|Lease/.test(docType)) need('insurance', 'medium', 'No insurance requirements for the counterparty.', 'Require public liability and professional indemnity (and contract works where relevant) with RHC noted where appropriate.');
  }
  if (ex.amounts.length && !isNda) need('gst', 'medium', 'Amounts are stated but GST treatment is not addressed — prices may be read as GST-inclusive.', 'State whether amounts exclude GST and require a valid tax invoice.', 'All amounts are exclusive of GST unless stated otherwise. If GST is payable on a supply under this agreement, the recipient must pay an additional amount equal to the GST on receipt of a valid tax invoice.');
  if (isPreliminary) {
    if (binding !== 'unclear') need('binding', 'high', 'It is unclear whether this document is binding.', 'Expressly state which clauses are binding.');
    need('costs', 'low', 'No agreement on who bears transaction costs if the deal does not proceed.', 'State that each party bears its own costs.');
    if (has('exclusivity') && !clausesWith('exclusivity').some(c => durationDays(c.text) !== null)) missing.push({ topic: 'exclusivity', label: 'Exclusivity period', severity: 'high', why: 'Exclusivity is referred to but no period is stated.', recommendation: 'Fix a short exclusivity period with automatic expiry.', source: 'rules' });
  }
  if (/Contract of Sale/.test(docType)) {
    need('deposit', 'medium', 'Deposit terms are not addressed.', 'Specify the deposit amount, stakeholder and trust arrangements.');
    need('settlement', 'medium', 'No settlement/completion date or mechanism.', 'Define the settlement date and process.');
    if (!has('due_diligence') && !has('finance')) missing.push({ topic: 'conditions_precedent', label: 'Due diligence / finance conditions', severity: 'high', why: 'RHC has no due diligence or finance condition to rely on.', recommendation: 'Add due diligence and finance conditions in RHC\'s favour with a right to terminate and recover the deposit.', source: 'rules' });
  }
  if (isNda) need('term_renewal', 'low', 'No confidentiality period stated.', 'State how long confidentiality obligations last (and that they survive termination).');

  // ------------------------------------------------ due diligence
  const dd: { item: string; reason: string }[] = [];
  for (const p of parties.filter(p => !p.is_rhc)) {
    if (/Pty|Ltd|Limited/i.test(p.name)) dd.push({ item: `ASIC company search, ABN check and insolvency/director search for ${p.name}${p.identifier ? ` (${p.identifier})` : ''}`, reason: 'Confirm the counterparty exists, is solvent and that signatories have authority.' });
    if (/Trust/i.test(p.name)) dd.push({ item: `Obtain the trust deed for ${p.name} and confirm the trustee\'s power to enter this transaction`, reason: 'Trustee capacity and right of indemnity from trust assets.' });
  }
  if (!parties.some(p => !p.is_rhc)) dd.push({ item: 'Confirm the full legal name, ACN/ABN and authority of the counterparty', reason: 'The counterparty could not be identified from the document.' });
  if (/\b(lot \d+|title reference|certificate of title|land|property|premises|site|real property)\b/i.test(text)) {
    dd.push({ item: 'Title search, registered encumbrances, easements and covenants', reason: 'The document relates to land or property.' });
    dd.push({ item: 'Zoning, planning scheme and existing approvals check with council', reason: 'Confirm the intended use and development potential.' });
    dd.push({ item: 'Contaminated land / environmental register searches', reason: 'Identify remediation liabilities.' });
  }
  if (has('planning')) dd.push({ item: 'Verify development approval status, conditions and lapse dates', reason: 'The deal depends on planning outcomes.' });
  if (has('firb')) dd.push({ item: 'Confirm FIRB approval requirements and timing', reason: 'Foreign investment approval is referenced.' });
  if (has('finance')) dd.push({ item: 'Confirm financier requirements and timing align with the finance condition', reason: 'A finance condition is referenced.' });
  if (has('security_guarantee')) dd.push({ item: 'PPSR search and review of existing securities', reason: 'Guarantees or security interests are referenced.' });
  if (ex.amounts.length) dd.push({ item: 'Validate pricing against RHC feasibility / valuation', reason: `Key amounts: ${ex.amounts.slice(0, 3).join(', ')}.` });
  dd.push({ item: 'Confirm internal RHC approvals and authorised signatories before execution', reason: 'Governance and authority to sign.' });

  // ------------------------------------------------ clause library comparison
  const comparisons: ClauseComparison[] = [];
  const tokens = (s: string) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !['shall', 'must', 'will', 'party', 'parties', 'agreement', 'this', 'that', 'with', 'which', 'other', 'under', 'clause'].includes(w)));
  const JURIS = /\b(Queensland|New South Wales|Victoria|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory|Singapore|England|Hong Kong|New Zealand)\b/gi;
  const jurisConflict = (a: string, b: string) => { const ja = new Set((a.match(JURIS) || []).map(x => x.toLowerCase())); const jb = new Set((b.match(JURIS) || []).map(x => x.toLowerCase())); return ja.size > 0 && jb.size > 0 && ![...ja].some(x => jb.has(x)); };
  const sim = (a: string, b: string) => { if (jurisConflict(a, b)) return 0; const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / Math.min(A.size, B.size); };
  for (const lc of input.library || []) {
    const authority = (lc.authority || 'draft') as Authority;
    const isApproved = lc.status === 'approved' && authority !== 'historical_precedent' && authority !== 'draft';
    const topic = lc.category in TOPICS ? lc.category : Object.keys(TOPICS).find(k => TOPICS[k].label.toLowerCase() === String(lc.category).toLowerCase()) || lc.category;
    const matches = clausesWith(topic);
    const base = { library_clause_id: lc.id, library_clause: lc.name, category: topic, authority, library_status: lc.status || 'draft', is_approved_position: isApproved };
    const authorityNote = isApproved ? `RHC ${AUTHORITY_LABEL[authority]} position.` : authority === 'historical_precedent' ? 'HISTORICAL PRECEDENT — reference only, not an approved RHC position.' : `${AUTHORITY_LABEL[authority]} (${lc.status || 'draft'}) — not yet approved; reference only.`;
    if (!matches.length) { comparisons.push({ ...base, matched_clause_ref: null, result: 'not_addressed', severity: isApproved ? 'medium' : null, note: `The document has no ${TOPICS[topic]?.label || topic} clause. ${authorityNote}` }); continue; }
    const best = matches.map(c => ({ c, pref: lc.preferred_position ? sim(lc.preferred_position, c.text) : 0, fb: lc.fallback_position ? sim(lc.fallback_position, c.text) : 0, pro: lc.prohibited_position ? sim(lc.prohibited_position, c.text) : 0, kw: (lc.keywords || []).filter(k => new RegExp(esc(k), 'i').test(c.text)).length })).sort((a, b) => (b.pref + b.fb) - (a.pref + a.fb))[0];
    let result: ClauseComparison['result']; let severity: Severity | null = null;
    if (lc.prohibited_position && best.pro >= 0.5) { result = 'prohibited_present'; severity = isApproved ? 'high' : 'medium'; }
    else if (best.pref >= 0.35) result = 'consistent_with_preferred';
    else if (best.fb >= 0.35) { result = 'at_fallback'; severity = 'low'; }
    else { result = 'deviates'; severity = isApproved ? 'medium' : 'low'; }
    const resultText = { consistent_with_preferred: 'Broadly consistent with the preferred wording.', at_fallback: 'Closer to the fallback position than the preferred position.', deviates: 'Differs materially from the library wording — review.', prohibited_present: 'Contains wording that matches a PROHIBITED position.', not_addressed: '' }[result];
    comparisons.push({ ...base, matched_clause_ref: best.c.ref, result, severity, note: `${resultText} ${authorityNote}` });
    if (result === 'prohibited_present' && isApproved) add({ severity: 'high', category: 'legal', title: `Prohibited position present: ${lc.name}`, clause_ref: best.c.ref, excerpt: clip(best.c.text), issue: `The clause matches RHC's prohibited position for "${lc.name}".`, recommendation: lc.preferred_position ? `Replace with RHC's preferred position: ${clip(lc.preferred_position, 300)}` : 'Replace with an RHC-approved position.', proposed_wording: lc.preferred_position || undefined });
  }

  // ------------------------------------------------ scoring
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  missing.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const score = Math.min(100, Math.round(findings.reduce((n, f) => n + SEV_WEIGHT[f.severity], 0) + missing.reduce((n, m) => n + SEV_WEIGHT[m.severity] * 0.8, 0)));
  const crit = findings.filter(f => f.severity === 'critical').length + missing.filter(m => m.severity === 'critical').length;
  const high = findings.filter(f => f.severity === 'high').length + missing.filter(m => m.severity === 'high').length;
  const rating: LegalAnalysis['overall_risk']['rating'] = crit > 0 || score >= 60 ? 'Critical' : high >= 2 || score >= 30 ? 'High' : score >= 12 ? 'Medium' : 'Low';
  const rationale = [
    `${findings.length} risk finding${findings.length === 1 ? '' : 's'} (${crit} critical, ${high} high including missing protections).`,
    `${missing.length} missing protection${missing.length === 1 ? '' : 's'}.`,
    ...findings.slice(0, 3).map(f => `${f.severity.toUpperCase()}: ${f.title}${f.clause_ref ? ` (${f.clause_ref})` : ''}`),
  ];

  // ------------------------------------------------ derived lists
  const byCat = (cat: Finding['category']) => findings.filter(f => f.category === cat).map(f => `${f.title}${f.clause_ref ? ` (${f.clause_ref})` : ''} — ${f.issue}`);
  const negotiation = uniq([...findings.filter(f => f.negotiation_point && f.severity !== 'low').map(f => f.negotiation_point!), ...missing.filter(m => m.severity !== 'low').map(m => `Add ${m.label.toLowerCase()}: ${m.recommendation}`)]).slice(0, 15);
  const amendments = [
    ...findings.filter(f => f.proposed_wording).map(f => ({ clause_ref: f.clause_ref || 'General', issue: f.title, proposed: f.proposed_wording! })),
    ...missing.filter(m => m.proposed_wording).map(m => ({ clause_ref: 'New clause', issue: `Missing: ${m.label}`, proposed: m.proposed_wording! })),
  ];
  const questions = uniq([
    ...findings.filter(f => f.solicitor_question).map(f => f.solicitor_question!),
    ...(isPreliminary ? ['Which clauses of this document are legally binding on RHC today?'] : []),
    ...(ex.amounts.length ? ['How should GST and stamp duty apply to this transaction?'] : []),
    'Is the correct RHC entity contracting, and are the execution blocks valid (s127 Corporations Act or authorised signatory)?',
  ]).slice(0, 12);

  const keyTerms: LegalAnalysis['key_terms'] = [];
  keyTerms.push({ label: 'Document type', value: docType });
  keyTerms.push({ label: 'Binding status', value: { binding: 'Binding', non_binding: 'Non-binding', mixed: 'Partly binding', unclear: 'Unclear' }[binding] });
  if (parties.length) keyTerms.push({ label: 'Parties', value: parties.map(p => `${p.name}${p.defined_as ? ` ("${p.defined_as}")` : ''}`).join('; ') });
  if (ex.amounts.length) keyTerms.push({ label: 'Amounts', value: ex.amounts.slice(0, 6).join(', ') });
  if (ex.percentages.length) keyTerms.push({ label: 'Percentages', value: ex.percentages.slice(0, 6).join(', ') });
  if (ex.dates.length) keyTerms.push({ label: 'Dates', value: ex.dates.slice(0, 6).join(', ') });
  if (ex.durations.length) keyTerms.push({ label: 'Periods', value: ex.durations.slice(0, 8).join(', ') });
  if (glClause) keyTerms.push({ label: 'Governing law', value: clip(glClause.text.replace(/^[^\n]*\n/, ''), 140), clause_ref: glClause.ref });
  for (const t of ['deposit', 'settlement', 'exclusivity', 'termination', 'sunset']) { const c = clausesWith(t)[0]; if (c) keyTerms.push({ label: TOPICS[t].label, value: clip(c.text.replace(/^[^\n]*\n/, ''), 160), clause_ref: c.ref }); }

  const authorityNote = docAuthority === 'historical_precedent'
    ? 'This document is a HISTORICAL PRECEDENT. Its terms are NOT approved RHC positions, even if the agreement was signed in the past. Do not reuse its wording without fresh approval.'
    : docAuthority === 'approved' ? 'This document is marked APPROVED in RHC City. Approval applies to this version only — re-review any changes.'
    : `This document is classified ${AUTHORITY_LABEL[docAuthority]}. It is not an approved RHC position. A signed or old agreement is never treated as approved automatically.`;

  const rhcNote = rhcIdentified ? `RHC identified${rhcAliases.length ? ` (defined as ${rhcAliases.map(a => `"${a}"`).join(', ')})` : ''}.` : 'RHC was not found in the document text — direction-of-obligation checks are less reliable. Set RHC\'s role in the review.';
  const summary = [
    `This appears to be a ${docType} (binding status: ${keyTerms[1].value.toLowerCase()})${parties.length ? ` involving ${parties.slice(0, 3).map(p => p.name).join(', ')}` : ''}.`,
    rhcNote,
    ex.amounts.length ? `Key amounts: ${ex.amounts.slice(0, 3).join(', ')}.` : 'No dollar amounts were found.',
    `The RHC rules engine found ${findings.length} risk${findings.length === 1 ? '' : 's'} and ${missing.length} missing protection${missing.length === 1 ? '' : 's'}; overall risk is ${rating.toUpperCase()} (score ${score}/100).`,
    findings.length ? `Priority issues: ${findings.slice(0, 3).map(f => f.title).join('; ')}.` : '',
    conditions.length ? `${conditions.length} condition${conditions.length === 1 ? '' : 's'} precedent identified.` : '',
  ].filter(Boolean).join(' ');

  return {
    engine: 'rules', engine_version: ENGINE_VERSION, provider: null, document_type: docType, binding_status: binding, executive_summary: summary,
    parties, rhc: { identified: rhcIdentified, names: rhcNames, aliases: rhcAliases, note: rhcNote },
    key_terms: keyTerms, amounts: ex.amounts, dates: ex.dates, durations: ex.durations, percentages: ex.percentages,
    outline: clauses.map(c => ({ ref: c.ref, heading: c.heading, topics: c.topics })),
    findings, missing_protections: missing,
    financial_risks: byCat('financial'), termination_risks: byCat('termination'), liability_risks: byCat('liability'),
    conditions_precedent: conditions, due_diligence: dd, negotiation_points: negotiation, recommended_amendments: amendments,
    solicitor_questions: questions, clause_comparisons: comparisons,
    authority: { document_authority: docAuthority, label: AUTHORITY_LABEL[docAuthority], note: authorityNote },
    overall_risk: { rating, score, rationale },
    stats: { clauses: clauses.length, words: (text.match(/\S+/g) || []).length, topics_found: uniq(clauses.flatMap(c => c.topics)) },
    disclaimer: 'RHC City Legal AI provides structured analysis to assist RHC and its solicitors. It is not legal advice. Final positions must be confirmed by qualified Australian legal counsel.',
  };
}

// ------------------------------------------------------------------ business naming
/** Reports are written about "RHC"; swap in the business's own short name (Settings → Business details). Quoted document text is never changed. */
export function rebrandAnalysis(a: LegalAnalysis, ourName: string): LegalAnalysis {
  const poss = /s$/i.test(ourName) ? `${ourName}'` : `${ourName}'s`;
  const fix = (t?: string | null) => typeof t !== 'string' ? t as any : t
    .replace(/\bRHC City Legal AI\b/g, 'Infinity Planet Legal AI')
    .replace(/\bmarked APPROVED in RHC City\b/g, 'marked APPROVED in Infinity Planet')
    .replace(/\bThe RHC rules engine\b/g, 'The built-in rules engine')
    .replace(/\bRHC's\b/g, poss)
    .replace(/\bRHC\b/g, ourName);
  if (ourName === 'RHC') { a.disclaimer = fix(a.disclaimer); a.authority.note = fix(a.authority.note); a.executive_summary = fix(a.executive_summary); return a; }
  const arr = (x: string[]) => x.map(fix);
  for (const f of a.findings) { f.title = fix(f.title); f.issue = fix(f.issue); f.recommendation = fix(f.recommendation); f.negotiation_point = fix(f.negotiation_point); f.proposed_wording = fix(f.proposed_wording); f.solicitor_question = fix(f.solicitor_question); }
  for (const m of a.missing_protections) { m.why = fix(m.why); m.recommendation = fix(m.recommendation); m.proposed_wording = fix(m.proposed_wording); }
  for (const d of a.due_diligence) { d.item = fix(d.item); d.reason = fix(d.reason); }
  for (const r of a.recommended_amendments) { r.issue = fix(r.issue); r.proposed = fix(r.proposed); }
  for (const c of a.clause_comparisons) c.note = fix(c.note);
  a.financial_risks = arr(a.financial_risks); a.termination_risks = arr(a.termination_risks); a.liability_risks = arr(a.liability_risks);
  a.negotiation_points = arr(a.negotiation_points); a.solicitor_questions = arr(a.solicitor_questions);
  a.overall_risk.rationale = arr(a.overall_risk.rationale);
  a.authority.note = fix(a.authority.note); a.rhc.note = fix(a.rhc.note); a.executive_summary = fix(a.executive_summary); a.disclaimer = fix(a.disclaimer);
  return a;
}
