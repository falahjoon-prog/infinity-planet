/**
 * Finance and payroll: money in and out, invoices we receive (uploaded or from email attachments), and weekly pay.
 *
 * PAYG withholding uses the ATO's "Schedule 1 – Statement of formulas for calculating amounts to be withheld"
 * (NAT 1004) for payments made from 1 July 2026, weekly coefficients:
 *   x = weekly earnings, ignoring cents, plus 99 cents;  y = a·x − b, rounded to the nearest dollar.
 * Super guarantee: 12% of ordinary-time earnings (from 1 July 2025). From 1 July 2026 super is due with each pay ("payday super").
 */
import { getSupabaseAdmin } from './supabase';
import { extractDocumentText } from './extract';
import { HttpError } from './http';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from './payroll';

export * from './payroll';

// ------------------------------------------------------------------ categories (rules)
const RULES: [string, RegExp][] = [
  ['legal', /\b(law(yers?)?|legal|solicitors?|barristers?|conveyanc)/i],
  ['accounting', /\b(accountan|accounting|bookkeep|audit(or)?s?|tax agent|BAS agent|chartered)/i],
  ['engineering', /\b(engineer|geotech|structural|civil|surveyors?|hydraulic)/i],
  ['architecture_design', /\b(architect|design studio|landscape|interior|render(ing)?s?\b|urban design)/i],
  ['planning_approvals', /\b(town planning|planning consult|development application|DA lodg|council|approvals?)/i],
  ['marketing', /\b(marketing|advertis|media|printing|branding|social media|PR agency|photograph)/i],
  ['software', /\b(software|subscription|SaaS|microsoft|google workspace|adobe|hosting|domain|godaddy|render\.com|supabase|openai|anthropic|IT services)/i],
  ['office_rent', /\b(rent|lease|office space|co-?working|regus)/i],
  ['utilities', /\b(electricity|energy|water|telstra|optus|vodafone|internet|nbn|mobile plan|phone bill)/i],
  ['travel', /\b(qantas|virgin australia|jetstar|airline|flight|hotel|uber|taxi|accommodation|travel)/i],
  ['insurance', /\b(insurance|insurer|premium|policy no)/i],
  ['government_fees', /\b(ASIC|ATO\b|australian taxation office|state revenue|stamp duty|registration fee|licen[cs]e fee)/i],
  ['bank_fees', /\b(bank fee|merchant fee|account fee)/i],
  ['consultancy', /\b(consult|advisory|advisor|professional services|project manag)/i],
];
export function categorise(text: string): string {
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'other';
}

// ------------------------------------------------------------------ reading an invoice (built in, no AI key needed)
export type InvoiceRead = { supplier: string | null; abn: string | null; reference: string | null; invoice_date: string | null; due_date: string | null; total_cents: number | null; gst_cents: number | null; amount_cents: number | null; category: string; is_invoice: boolean; confidence: 'high' | 'medium' | 'low' };

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
function toIso(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); // Australian day/month/year
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); const d = Number(m[1]), mo = Number(m[2]); if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m) { const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`; }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${String(MONTHS[m[1].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return s;
  return null;
}
const DATE_RE = '(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{4}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})';
const MONEY_RE = '(?:AUD|A\\$|\\$)?\\s?(-?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})|-?\\d+(?:\\.\\d{2}))';
const cents = (s: string) => Math.round(parseFloat(s.replace(/,/g, '')) * 100);

function findMoney(text: string, labels: string): number | null {
  const re = new RegExp(`(?:${labels})[^\\n\\d$-]{0,40}${MONEY_RE}`, 'gi');
  let best: number | null = null; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const v = cents(m[1]); if (Number.isFinite(v) && v > 0) best = v; } // the last match is usually the final total
  return best;
}
function findDate(text: string, labels: string): string | null {
  const m = text.match(new RegExp(`(?:${labels})[^\\n\\d]{0,25}${DATE_RE}`, 'i'));
  return m ? toIso(m[1]) : null;
}

export function readInvoiceText(text: string, hint: { from?: string | null; subject?: string | null; fileName?: string | null } = {}): InvoiceRead {
  const t = (text || '').replace(/ /g, ' ');
  const all = `${hint.subject || ''}\n${hint.fileName || ''}\n${t}`;
  const is_invoice = /\b(tax invoice|invoice|bill|statement of account|amount due|receipt|remittance)\b/i.test(all);
  let total = findMoney(t, 'total\\s*(?:amount\\s*)?(?:due|payable)|amount\\s*(?:due|payable)|balance\\s*due|total\\s*\\(?inc(?:l\\.?|luding)?\\s*gst\\)?|total\\s*aud|invoice\\s*total|grand\\s*total')
    ?? findMoney(t, '\\btotal\\b');
  let gst = findMoney(t, 'gst(?:\\s*\\(?10%\\)?)?|total\\s*gst|tax\\s*\\(?10%\\)?');
  let ex = findMoney(t, 'sub-?\\s*total|total\\s*\\(?ex(?:cl\\.?|cluding)?\\s*gst\\)?|amount\\s*ex(?:cl)?\\.?\\s*gst');
  if (gst && total && gst >= total) gst = null;
  if (total && !gst && ex && total > ex) gst = total - ex;
  if (total && gst && !ex) ex = total - gst;
  if (!total && ex && gst) total = ex + gst;
  const abnM = t.match(/\bA\.?B\.?N\.?[:\s#]*((?:\d\s?){11})\b/i);
  const refM = t.match(/(?:invoice|inv|bill|reference|ref)\.?\s*(?:no\.?|number|num\.?|#)\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-\/]{1,24})/i) || t.match(/(?:invoice|inv|reference|ref)\s*[:#]\s*([A-Z0-9][A-Z0-9\-\/]{1,24})/i);
  if (refM && !/\d/.test(refM[1])) refM.splice(0);
  const invoice_date = findDate(t, 'invoice\\s*date|date\\s*of\\s*issue|issue\\s*date|issued|tax\\s*point|\\bdate\\b');
  const due_date = findDate(t, 'due\\s*date|payment\\s*due|due\\s*by|pay\\s*by|due');
  // supplier: the sender's display name, or the first strong line of the document
  const fromName = (hint.from || '').replace(/<[^>]+>/, '').replace(/["']/g, '').trim();
  const firstLine = t.split('\n').map(x => x.trim()).find(x => x.length > 2 && x.length < 70 && !/invoice|tax|date|page|abn|^\d/i.test(x)) || null;
  const supplier = (fromName && !/no-?reply|notifications?|billing@|accounts@|invoice/i.test(fromName) ? fromName : null) || firstLine;
  const category = categorise(`${supplier || ''}\n${hint.subject || ''}\n${t.slice(0, 4000)}`);
  const found = [total, invoice_date, refM].filter(Boolean).length;
  return {
    supplier: supplier ? supplier.slice(0, 120) : null, abn: abnM ? abnM[1].replace(/\s/g, '') : null, reference: refM ? refM[1].slice(0, 40) : null,
    invoice_date, due_date: due_date && due_date !== invoice_date ? due_date : null, total_cents: total, gst_cents: gst, amount_cents: ex ?? (total && gst ? total - gst : total),
    category, is_invoice, confidence: found >= 3 ? 'high' : found === 2 ? 'medium' : 'low',
  };
}

/** Read an invoice file (PDF, Word, photo) with the built-in reader. */
export async function readInvoiceFile(bytes: Buffer, mime: string, name: string, hint: { from?: string | null; subject?: string | null } = {}) {
  const ex = await extractDocumentText(bytes, mime, name);
  let text = ex.text || '';
  if (!text.trim() && /^image\//.test(mime)) { try { const { readImage } = await import('./ocr'); text = (await readImage(bytes)).text || ''; } catch { /* unreadable photo */ } }
  return { text, read: readInvoiceText(text, { ...hint, fileName: name }) };
}

// ------------------------------------------------------------------ files (private bucket, separate from the shared Library)
export const FIN_BUCKET = 'rhc-finance';
export async function storeFinanceFile(bytes: Buffer, name: string, mime: string): Promise<string> {
  const db = getSupabaseAdmin();
  const { data } = await db.storage.getBucket(FIN_BUCKET);
  if (!data) await db.storage.createBucket(FIN_BUCKET, { public: false });
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 150)}`;
  const up = await db.storage.from(FIN_BUCKET).upload(path, bytes, { contentType: mime || 'application/octet-stream', upsert: false });
  if (up.error) throw up.error;
  return path;
}

/** Find or create a party by name (case-insensitive). */
export async function partyId(name: string | null | undefined, kind: string, extra: { abn?: string | null; email?: string | null } = {}, actorId?: string | null): Promise<string | null> {
  const n = (name || '').trim(); if (!n) return null;
  const db = getSupabaseAdmin();
  const { data: found } = await db.from('finance_parties').select('id,abn,email').ilike('name', n.replace(/[%_]/g, '\\$&')).maybeSingle();
  if (found) { if ((!found.abn && extra.abn) || (!found.email && extra.email)) await db.from('finance_parties').update({ abn: found.abn || extra.abn || null, email: found.email || extra.email || null }).eq('id', found.id); return found.id; }
  const { data, error } = await db.from('finance_parties').insert({ name: n.slice(0, 160), kind, abn: extra.abn || null, email: extra.email || null, created_by: actorId || null }).select('id').single();
  if (error) { const { data: again } = await db.from('finance_parties').select('id').ilike('name', n).maybeSingle(); return again?.id || null; }
  return data.id;
}

// ------------------------------------------------------------------ entries
export const ENTRY_FIELDS = ['kind', 'category', 'party_id', 'party_name', 'description', 'reference', 'amount_cents', 'gst_cents', 'total_cents', 'entry_date', 'due_date', 'status', 'paid_date', 'is_invoice', 'needs_review', 'project_id', 'notes'];

export function cleanEntry(b: any) {
  const out: Record<string, any> = {};
  for (const k of ENTRY_FIELDS) if (k in b) out[k] = b[k] === '' ? null : b[k];
  for (const k of ['amount_cents', 'gst_cents', 'total_cents']) if (k in out) out[k] = Math.round(Number(out[k]) || 0);
  if (out.kind && !['income', 'expense'].includes(out.kind)) throw new HttpError(400, 'kind must be income or expense');
  if (out.category && ![...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].includes(out.category)) out.category = out.kind === 'income' ? 'other_income' : 'other';
  // amounts: keep total = amount + GST whichever two were given
  if ('total_cents' in out || 'amount_cents' in out || 'gst_cents' in out) {
    const a = out.amount_cents ?? null, g = out.gst_cents ?? 0, t = out.total_cents ?? null;
    if (t != null && (a == null || a === 0)) out.amount_cents = t - g; else if (a != null && (t == null || t === 0)) out.total_cents = a + g;
  }
  return out;
}

