/**
 * Tiny, safe template renderer (no code execution).
 *   {{field}}                  value or a visible [● field] marker if missing
 *   {{#field}} … {{/field}}    section shown only when field has a value
 *   {{^field}} … {{/field}}    section shown only when field is empty
 *   {{clause:topic}}           approved clause-library wording for a topic, else the starter text in {{clause:topic|starter}}
 */
export type RenderResult = { text: string; missing: string[]; clausesUsed: { topic: string; id: string | null; name: string; authority: string }[] };
export type ClauseLike = { id: string; name: string; category: string; clause_text?: string | null; preferred_position?: string | null; status?: string | null; authority?: string | null };

const get = (vals: Record<string, any>, k: string) => { const v = k.split('.').reduce<any>((o, p) => (o == null ? undefined : o[p]), vals); return v; };
const empty = (v: any) => v == null || v === '' || (Array.isArray(v) && !v.length);

export function renderTemplate(body: string, values: Record<string, any>, clauses: ClauseLike[] = [], opts: { markMissing?: boolean } = {}): RenderResult {
  const missing = new Set<string>();
  const clausesUsed: RenderResult['clausesUsed'] = [];
  let out = body;
  // sections (non-nested, repeated until stable)
  for (let i = 0; i < 4; i++) {
    out = out.replace(/\{\{([#^])([\w.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_m, mode, key, inner) => {
      const v = get(values, key);
      return (mode === '#' ? !empty(v) : empty(v)) ? inner : '';
    });
  }
  // business names first, so they can appear inside clause starter text
  out = out.replace(/\{\{(short|business|business_tag)\}\}/g, (_m, key) => String(values[key] ?? (key === 'short' ? 'RHC' : '')));
  // clauses: {{clause:topic|starter text}}
  out = out.replace(/\{\{clause:([\w]+)(?:\|([\s\S]*?))?\}\}/g, (_m, topic, starter) => {
    const approved = clauses.filter(c => c.category === topic && c.status === 'approved' && (c.authority === 'approved' || c.authority === 'preferred'))
      .sort((a, b) => (a.authority === 'approved' ? -1 : 1) - (b.authority === 'approved' ? -1 : 1))[0];
    if (approved && (approved.clause_text || approved.preferred_position)) {
      clausesUsed.push({ topic, id: approved.id, name: approved.name, authority: approved.authority || 'approved' });
      return String(approved.clause_text || approved.preferred_position).trim();
    }
    clausesUsed.push({ topic, id: null, name: 'Starter wording', authority: 'draft' });
    return (starter || '').trim() + (opts.markMissing === false ? '' : ' [Starter wording — no approved clause for this topic yet]');
  });
  out = out.replace(/\{\{([\w.]+)\}\}/g, (_m, key) => {
    const v = get(values, key);
    if (empty(v)) { missing.add(key); return opts.markMissing === false ? '' : `[● ${key.replace(/_/g, ' ')}]`; }
    return Array.isArray(v) ? v.join(', ') : String(v);
  });
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, missing: [...missing], clausesUsed };
}

export function money(v: any) {
  const n = Number(v); if (!isFinite(n) || v === null || v === '') return '';
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

export function longDate(d = new Date()) { return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }); }
/** The date printed on a document: the date chosen before writing (YYYY-MM-DD), otherwise today's date (Brisbane). */
export function docDateText(v?: unknown): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const d = new Date(`${v}T12:00:00+10:00`); if (!isNaN(d.getTime())) return longDate(d); }
  return longDate();
}
/**
 * Makes sure the document date appears and no date is left blank:
 * fills "[● date]"-style gaps and "Dated: [●]" lines, and adds "Date: …" under the title (after any "Prepared for / by" lines) when it is missing.
 * Signature-block dates (signed on the day) are left for signing.
 */
export function ensureDocDate(text: string, date: string, opts: { addLine?: boolean } = {}): string {
  let t = String(text || '');
  t = t.replace(/\[\s*●?\s*(?:insert\s+)?(?:today'?s\s+|document\s+|letter\s+|issue\s+)?date(?:\s+of\s+(?:this\s+)?(?:document|letter|agreement|deed))?\s*\]/gi, date)
    .replace(/\{\{\s*(?:date|today|document_date)\s*\}\}/gi, date)
    .replace(/^(\s*(?:\*\*)?(?:dated|date of (?:this )?(?:agreement|deed|document|letter|proposal|report)|document date|issue date)(?:\*\*)?\s*:?\s*(?:\*\*)?\s*)\[●[^\]\n]*\]/gim, `$1${date}`);
  const lines = t.split('\n');
  if (opts.addLine === false) return t;
  const h = lines.findIndex(l => /^#\s+/.test(l));
  if (h < 0 || h > 8) return lines.slice(0, 6).some(l => l.includes(date)) ? t : `Date: ${date}\n\n${t}`;
  let at = h + 1;
  for (let i = h + 1; i < lines.length && i < h + 8; i++) { if (/^(prepared (for|by)|attention|re)\s*:/i.test(lines[i])) at = i + 1; else if (lines[i].trim()) break; }
  // already dated in the title block (title, "Prepared for / by", or the line just after)
  if (lines.slice(0, at + 2).some(l => l.includes(date))) return t;
  lines.splice(at, 0, `Date: ${date}`);
  return lines.join('\n');
}

export function bulletList(v: any) {
  if (!v) return '';
  const items = Array.isArray(v) ? v : String(v).split(/\n|•|;/).map(s => s.replace(/^[-*\s]+/, '').trim()).filter(Boolean);
  return items.map(i => `• ${i}`).join('\n');
}
