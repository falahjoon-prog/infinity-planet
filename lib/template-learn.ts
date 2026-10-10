/**
 * Turns the business's own documents (e.g. a signed RHC MOU from Google Drive) into reusable templates,
 * or updates an existing template to follow them. Rules engine works without a key; an AI provider
 * does a fuller job (keeps wording, finds every variable fact). Results are always saved as a new
 * draft version that must be approved before use.
 */
import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';
import { getBrand, aiInstructions } from './brand';
import { chat, providerReady, Provider } from './providers';
import { HttpError } from './http';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CATS: [RegExp, string, string][] = [
  [/memorandum of understanding|\bMOU\b/i, 'mou', 'Memorandum of Understanding'], [/heads of (agreement|terms)/i, 'heads_of_agreement', 'Heads of Agreement'],
  [/letter of offer|offer to (purchase|lease)/i, 'offer', 'Letter of Offer'], [/confidentiality|non-disclosure|\bNDA\b/i, 'nda', 'Confidentiality Agreement'],
  [/services agreement|consultancy|consultant/i, 'contract', 'Services Agreement'], [/proposal/i, 'proposal', 'Proposal'],
  [/status report|progress report|monthly report/i, 'report', 'Report'], [/dear\s|yours (sincerely|faithfully)|kind regards/i, 'letter', 'Letter'],
];
export function guessCategory(text: string, name = '') { const hit = CATS.find(([re]) => re.test(name) || re.test(text.slice(0, 1500))); return hit ? { category: hit[1], label: hit[2] } : { category: 'general', label: 'Document' }; }

/** Rules: replace the business's own details and the other party's details with placeholders. */
export async function templatiseByRules(text: string) {
  const [brand, entity, names] = await Promise.all([getBrand(), getSetting<any>('rhc_entity_details'), getSetting<string[]>('rhc_entity_names')]);
  const e = entity || {};
  let out = String(text || '').replace(/\r/g, '');
  const used = new Set<string>();
  const sub = (re: RegExp, ph: string) => { if (re.test(out)) { out = out.replace(re, `{{${ph}}}`); used.add(ph); } };
  // Our own details
  const ours = [...new Set([e.name, ...(names || []), brand.business_name].filter(Boolean))].sort((a, b) => b.length - a.length);
  if (e.abn) sub(new RegExp(esc(String(e.abn)).replace(/\\ /g, '\\s?').replace(/ /g, '\\s?'), 'g'), 'rhc_abn');
  if (e.address) sub(new RegExp(esc(String(e.address)), 'gi'), 'rhc_address');
  for (const n of ours) sub(new RegExp(`\\b${esc(n)}(?:\\s+Pty\\.?\\s?Ltd\\.?)?\\b`, 'g'), 'rhc_entity');
  // The other party: the first other company name and its ABN/ACN
  const other = out.match(/\b([A-Z][A-Za-z0-9&'.\- ]{1,60}?\s(?:Pty\.?\s?Ltd\.?|Limited|Ltd\.?))(?=[\s,.(;]|$)/);
  if (other) { sub(new RegExp(esc(other[1].replace(/^(?:between|and|by|for|of|the|to)\s+/i, '').trim()), 'g'), 'counterparty'); }
  out = out.replace(/\b(ABN|ACN)[:\s#]*((?:\d[\s-]?){9,11})\b/g, (m, kind) => { used.add('counterparty_abn'); return `${kind} {{counterparty_abn}}`; });
  // Dates → {{date}} (first one), signatory lines keep their wording
  const dateRe = /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/;
  if (dateRe.test(out)) { out = out.replace(dateRe, '{{date}}'); used.add('date'); }
  // Dollar amounts stay visible but are flagged for the user to confirm
  const amounts = (out.match(/\$\s?\d[\d,]*(?:\.\d{2})?(?:\s?(?:million|m|k))?/gi) || []).slice(0, 10);
  return { body: out.trim(), placeholders: [...used], amounts_left_in_text: [...new Set(amounts)] };
}

/** AI: produce a clean template from example documents (optionally updating an existing template). */
export async function templatiseByAI(provider: Provider, examples: { name: string; text: string }[], current?: { name: string; body: string } | null) {
  const brand = await getBrand();
  const system = `${await aiInstructions()}\n\nYou convert ${brand.business_name}'s real documents into reusable document templates for its drafting system.`;
  const prompt = `${current ? `Update the EXISTING TEMPLATE so it follows ${brand.short_name}'s own style, structure, headings and standard wording shown in the EXAMPLE DOCUMENTS. Keep any {{clause:topic|...}} blocks and keep the DRAFT banner line if present.` : `Turn the EXAMPLE DOCUMENT into a reusable template.`}
Rules:
- Keep ${brand.short_name}'s wording verbatim wherever it is standard; do not invent new clauses, numbers or obligations.
- Replace facts that change per deal with placeholders: {{rhc_entity}}, {{rhc_abn}}, {{rhc_address}}, {{counterparty}}, {{counterparty_abn}}, {{counterparty_address}}, {{project_name}}, {{project_location}}, {{date}}, {{consideration}}, {{deposit}}, {{signatory_name}}, {{signatory_title}}, {{recipient_name}}, {{governing_law}}. You may add other snake_case placeholders for deal-specific facts.
- Optional sections may use {{#field}}…{{/field}}.
- Return ONLY the template text, no commentary.
${current ? `\nEXISTING TEMPLATE (${current.name}):\n${current.body}\n` : ''}
${examples.map((x, i) => `\nEXAMPLE DOCUMENT ${i + 1} (${x.name}):\n${x.text.slice(0, current ? 25_000 : 60_000)}`).join('\n')}`;
  const out = await chat(provider, { system, messages: [{ role: 'user', content: prompt }], maxTokens: 8000, timeoutMs: 240_000 });
  const body = out.replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  if (body.length < 80) throw new Error('The AI returned an empty template');
  return { body, placeholders: [...new Set((body.match(/\{\{([a-z_]+)\}\}/g) || []).map(x => x.slice(2, -2)))] };
}

async function loadDocs(ids: string[]) {
  const { data } = await getSupabaseAdmin().from('documents').select('id,name,content_text').in('id', ids.slice(0, 5));
  const docs = (data || []).filter(d => (d.content_text || '').trim().length > 100);
  if (!docs.length) throw new HttpError(400, 'Those documents have no readable text yet (scanned files need OCR first).');
  return docs.map(d => ({ id: d.id, name: d.name, text: d.content_text as string }));
}

/** Creates a new draft template from one of the business's documents. */
export async function templateFromDocument(actorId: string, opts: { document_id: string; name?: string | null; provider?: string | null }) {
  const [doc] = await loadDocs([opts.document_id]);
  const cat = guessCategory(doc.text, doc.name);
  let body: string; let engine = 'rules'; let aiError: string | null = null; let placeholders: string[] = []; let amounts: string[] = [];
  if (opts.provider && providerReady(opts.provider)) {
    try { const r = await templatiseByAI(opts.provider as Provider, [doc]); body = r.body; placeholders = r.placeholders; engine = opts.provider; }
    catch (e: any) { aiError = e?.message || 'AI failed'; const r = await templatiseByRules(doc.text); body = r.body; placeholders = r.placeholders; amounts = r.amounts_left_in_text; }
  } else { const r = await templatiseByRules(doc.text); body = r.body; placeholders = r.placeholders; amounts = r.amounts_left_in_text; }
  const name = String(opts.name || `${cat.label} — from ${doc.name.replace(/\.[a-z0-9]+$/i, '')}`).slice(0, 160);
  const { data, error } = await getSupabaseAdmin().from('document_templates').insert({ name, category: cat.category, kind: 'document', description: `Built from “${doc.name}” (${engine === 'rules' ? 'built-in engine' : engine}). Check placeholders and amounts, then request approval.`, body, status: 'draft', version: 1, created_by: actorId, metadata: { source_document_id: doc.id, engine, placeholders, amounts_to_check: amounts } }).select().single();
  if (error) throw error;
  return { template: data, placeholders, amounts_to_check: amounts, engine, ai_error: aiError };
}

/** Updates an existing template to follow the business's documents. Saves a new draft version. */
export async function updateTemplateFromDocuments(actorId: string, templateId: string, opts: { document_ids: string[]; provider?: string | null }) {
  const db = getSupabaseAdmin();
  const { data: tpl } = await db.from('document_templates').select('*').eq('id', templateId).maybeSingle();
  if (!tpl) throw new HttpError(404, 'Template not found');
  const docs = await loadDocs(opts.document_ids);
  let body: string; let engine: string;
  if (opts.provider && providerReady(opts.provider)) { body = (await templatiseByAI(opts.provider as Provider, docs, { name: tpl.name, body: tpl.body })).body; engine = opts.provider; }
  else {
    // Without AI the built-in engine adopts the example document's wording in full, with placeholders inserted.
    body = (await templatiseByRules(docs[0].text)).body; engine = 'rules';
    if (/^DRAFT —/m.test(tpl.body) && !/^DRAFT —/m.test(body)) body = `${tpl.body.split('\n')[0]}\n\n${body}`;
  }
  const { data, error } = await db.from('document_templates').update({ body, version: (tpl.version || 1) + 1, status: 'draft', approved_by: null, updated_at: new Date().toISOString(), metadata: { ...(tpl.metadata || {}), learned_from: docs.map(d => ({ id: d.id, name: d.name })), engine, previous_body: tpl.body } }).eq('id', templateId).select().single();
  if (error) throw error;
  return { template: data, engine, learned_from: docs.map(d => d.name) };
}
