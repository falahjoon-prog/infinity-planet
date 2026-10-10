/**
 * Amends a reviewed contract: applies the Legal AI's recommended amendments and missing protections
 * to the original text, and produces a clean amended version plus a redline (what was added/removed).
 *  - Built-in (no AI key): replaces the quoted clause wording where a finding points at it; otherwise
 *    inserts the proposed wording straight after the referenced clause; general items and missing
 *    protections are added as new numbered clauses before the signing block.
 *  - With an AI provider: the model rewrites the contract applying the chosen amendments; the redline is
 *    then computed by comparing the texts.
 * The result is a DRAFT for the business and its solicitors to review — it is not legal advice.
 */
import { LegalAnalysis, segmentClauses } from './engine';

export type AmendItem = { key: string; kind: 'finding' | 'missing'; title: string; severity: string; clause_ref?: string | null; excerpt?: string | null; wording: string; include: boolean; has_wording: boolean };
export type Change = { key: string; type: 'replace' | 'insert' | 'add'; ref: string; title: string; before?: string; after: string; located: boolean };

/** The amendments a user can choose from, built from the analysis (critical/high/medium ticked by default). */
export function amendmentItems(a: LegalAnalysis): AmendItem[] {
  const items: AmendItem[] = [];
  (a.findings || []).forEach((f, i) => items.push({ key: `f${i}`, kind: 'finding', title: f.title, severity: f.severity, clause_ref: f.clause_ref || null, excerpt: f.excerpt || null, wording: f.proposed_wording || '', has_wording: !!f.proposed_wording, include: !!f.proposed_wording && f.severity !== 'low' }));
  (a.missing_protections || []).forEach((m, i) => items.push({ key: `m${i}`, kind: 'missing', title: m.label, severity: m.severity, clause_ref: null, excerpt: null, wording: m.proposed_wording || `[Insert ${m.label.toLowerCase()} clause: ${m.recommendation}]`, has_wording: !!m.proposed_wording, include: m.severity !== 'low' }));
  return items;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Finds the excerpt in the text, tolerant of whitespace and a trailing "…". Returns [start, end] or null. */
export function locate(text: string, excerpt: string): [number, number] | null {
  const ex = String(excerpt || '').replace(/[…]|\.\.\.$/g, '').replace(/^["“'‘\s]+|["”'’\s]+$/g, '').trim();
  if (ex.length < 12) return null;
  const words = ex.split(/\s+/).filter(Boolean).slice(0, 60);
  const re = new RegExp(words.map(escRe).join('\\s+'), 'i');
  const m = text.match(re);
  if (!m || m.index === undefined) return null;
  let start = m.index; let end = m.index + m[0].length;
  // Keep a clause heading line (e.g. "4. Indemnity") when the excerpt starts with it
  const nl = m[0].indexOf('\n');
  if (nl > 0 && nl < 70 && /^\s*(\d+(\.\d+)*[.)]?\s+)?[A-Z][^\n]{0,60}$/.test(m[0].slice(0, nl)) && m[0].slice(nl).trim().length > 20) start += nl + 1;
  // Extend to the end of the sentence when the excerpt was clipped
  if (/[…]|\.\.\.$/.test(excerpt)) { const rest = text.slice(end); const stop = rest.search(/[.;](\s|$)|\n\s*\n/); end += stop >= 0 ? stop + 1 : 0; }
  return [start, end];
}

/** Applies the chosen amendments without AI. */
export function applyAmendments(original: string, items: AmendItem[], opts: { ourName?: string } = {}): { text: string; changes: Change[] } {
  let text = String(original || '').replace(/\r\n?/g, '\n');
  const chosen = items.filter(i => i.include && i.wording.trim());
  const changes: Change[] = [];
  const additions: AmendItem[] = [];
  // 1) Replace quoted wording; 2) insert after the referenced clause
  for (const it of chosen) {
    const wording = it.wording.trim();
    if (it.kind === 'finding' && it.excerpt) {
      const at = locate(text, it.excerpt);
      if (at) { const before = text.slice(at[0], at[1]); text = text.slice(0, at[0]) + wording + text.slice(at[1]); changes.push({ key: it.key, type: 'replace', ref: it.clause_ref || 'General', title: it.title, before, after: wording, located: true }); continue; }
    }
    if (it.kind === 'finding' && it.clause_ref && /^cl\s/i.test(it.clause_ref)) {
      const clauses = segmentClauses(text);
      const c = clauses.find(x => x.ref.toLowerCase() === it.clause_ref!.toLowerCase());
      const pos = c ? text.indexOf(c.text) : -1;
      if (c && pos >= 0) {
        const num = c.ref.replace(/^cl\s*/i, '');
        const ins = `\n\n${num}A\t${wording}`;
        const end = pos + c.text.length;
        text = text.slice(0, end) + ins + text.slice(end);
        changes.push({ key: it.key, type: 'insert', ref: `${c.ref}A (new)`, title: it.title, after: `${num}A ${wording}`, located: true });
        continue;
      }
    }
    additions.push(it);
  }
  // 3) New clauses before the signing block
  if (additions.length) {
    const clauses = segmentClauses(text);
    const tops = clauses.map(c => Number((c.ref.match(/^cl\s*(\d+)/i) || [])[1])).filter(n => n > 0);
    let n = tops.length ? Math.max(...tops) + 1 : 0;
    const head = n ? `${n}.\tADDITIONAL PROVISIONS` : 'ADDITIONAL PROVISIONS';
    const body = additions.map((it, k) => `${n ? `${n}.${k + 1}` : `${k + 1}.`}\t${it.title.replace(/^Missing:\s*/i, '')}\n${it.wording.trim()}`).join('\n\n');
    const block = `\n\n${head}\n\n${body}\n`;
    const sign = text.search(/\n\s*(EXECUTED|SIGNED|SIGNING|EXECUTION|IN WITNESS|Executed as an agreement|Signed for and on behalf|SIGNATURES?)\b/);
    if (sign > text.length * 0.4) text = text.slice(0, sign) + block + text.slice(sign);
    else text = text.replace(/\s*$/, '') + block;
    additions.forEach((it, k) => changes.push({ key: it.key, type: 'add', ref: n ? `cl ${n}.${k + 1} (new)` : 'New clause', title: it.title, after: it.wording.trim(), located: false }));
  }
  return { text: text.replace(/\n{4,}/g, '\n\n\n'), changes };
}

// ------------------------------------------------------------------ redline (diff)
export type Seg = { t: 'same' | 'ins' | 'del'; s: string };
function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return []; // too large: fall back to paragraph replace
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: [number, number][] = []; let i = 0, j = 0;
  while (i < n && j < m) { if (eq(a[i], b[j])) { out.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return out;
}
function wordDiff(a: string, b: string): Seg[] {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const pairs = lcs(A, B, (x, y) => x === y);
  // Mostly rewritten: show the old text struck through and the new text in full (easier to read than word confetti)
  const words = (xs: string[]) => xs.filter(x => x.trim()).length;
  if (pairs.filter(([i]) => A[i].trim()).length < 0.4 * Math.min(words(A), words(B))) return [{ t: 'del', s: a }, { t: 'same', s: ' ' }, { t: 'ins', s: b }];
  const segs: Seg[] = []; let i = 0, j = 0;
  const push = (t: Seg['t'], s: string) => { if (!s) return; const l = segs[segs.length - 1]; if (l && l.t === t) l.s += s; else segs.push({ t, s }); };
  for (const [pi, pj] of [...pairs, [A.length, B.length] as [number, number]]) {
    push('del', A.slice(i, pi).join('')); push('ins', B.slice(j, pj).join(''));
    if (pi < A.length) push('same', A[pi]);
    i = pi + 1; j = pj + 1;
  }
  return segs;
}
/** Paragraph-level diff, refined to word level where a paragraph was edited. */
export function redline(a: string, b: string): Seg[] {
  const P = (s: string) => String(s || '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const A = P(a), B = P(b);
  const pairs = lcs(A, B, (x, y) => x.trim() === y.trim());
  if (!pairs.length && (A.length * B.length > 4_000_000)) return [{ t: 'del', s: a }, { t: 'ins', s: b }];
  const out: Seg[] = []; let i = 0, j = 0;
  const emit = (segs: Seg[]) => { for (const s of segs) { const l = out[out.length - 1]; if (l && l.t === s.t) l.s += s.s; else out.push({ ...s }); } };
  for (const [pi, pj] of [...pairs, [A.length, B.length] as [number, number]]) {
    const dels = A.slice(i, pi), inss = B.slice(j, pj);
    const k = Math.min(dels.length, inss.length);
    for (let x = 0; x < k; x++) emit([...wordDiff(dels[x], inss[x]), { t: 'same', s: '\n\n' }]);
    for (const d of dels.slice(k)) emit([{ t: 'del', s: d }, { t: 'same', s: '\n\n' }]);
    for (const s of inss.slice(k)) emit([{ t: 'ins', s }, { t: 'same', s: '\n\n' }]);
    if (pi < A.length) emit([{ t: 'same', s: A[pi] + '\n\n' }]);
    i = pi + 1; j = pj + 1;
  }
  return out;
}
export const redlineStats = (segs: Seg[]) => ({ inserted_words: segs.filter(s => s.t === 'ins').reduce((n, s) => n + s.s.split(/\s+/).filter(Boolean).length, 0), deleted_words: segs.filter(s => s.t === 'del').reduce((n, s) => n + s.s.split(/\s+/).filter(Boolean).length, 0) });
