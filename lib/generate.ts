import { getBrand, aiInstructions, possessive } from './brand';
import { getSupabaseAdmin } from './supabase';
import { writeAudit } from './audit';
import { renderTemplate, docDateText, ensureDocDate } from './templates/render';
import { templateValues, ensureSeeded } from './templates/store';
import { providerReady, resolveProvider, PROVIDER_LABEL, Provider } from './providers';
import { factSheet, kindFor, writeDocument, senderParty, letterFrame, Party, Length } from './doc-writer';
import { HttpError } from './http';

export type GenerateInput = { template_id?: string | null; template_name?: string | null; project_id?: string | null; deal_id?: string | null; inputs?: Record<string, any>; provider?: string | null; instructions?: string | null; title?: string | null; recipient?: Party | null; sender_id?: string | null; length?: Length | null; /** YYYY-MM-DD printed on the document; today when not given */ doc_date?: string | null };

/** Generate an MOU / offer / letter / contract / HoA / proposal / report from a business template (+ optional AI drafting). Shared by Drafting and the AI bot. */
export async function generateFromTemplate(actorId: string, b: GenerateInput) {
  const db = getSupabaseAdmin();
  let tpl: any = null;
  if (b.template_id) tpl = (await db.from('document_templates').select('*').eq('id', b.template_id).maybeSingle()).data;
  else if (b.template_name) {
    await ensureSeeded().catch(() => {});
    const { data: all } = await db.from('document_templates').select('*').neq('kind', 'marketing');
    const want = String(b.template_name).toLowerCase();
    const score = (t: any) => { const n = `${t.name} ${t.category}`.toLowerCase(); return (n.includes(want) ? 10 : 0) + want.split(/\s+/).filter(w => w.length > 1 && n.includes(w)).length + (t.status === 'approved' ? 0.5 : 0); };
    tpl = (all || []).map(t => ({ t, s: score(t) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0]?.t || null;
  }
  if (!tpl) throw new HttpError(404, 'Template not found');
  const [project, deal, clauses] = await Promise.all([
    b.project_id ? db.from('projects').select('*').eq('id', b.project_id).single().then(r => r.data) : null,
    b.deal_id ? db.from('deals').select('*').eq('id', b.deal_id).single().then(r => r.data) : null,
    db.from('legal_clauses').select('id,name,category,clause_text,preferred_position,status,authority').then(r => r.data || []),
  ]);
  const recipient: Party | null = b.recipient && Object.values(b.recipient).some(v => v && String(v).trim()) ? b.recipient : null;
  const sender = await senderParty(b.sender_id === 'company' ? null : (b.sender_id || actorId));
  // The recipient and sender fill the template's own fields too (used when no AI writes the document).
  const fromParties: Record<string, any> = {};
  if (recipient?.name) fromParties.recipient_name = recipient.name;
  if (recipient?.company || recipient?.name) fromParties.counterparty = recipient.company || recipient.name;
  if (recipient?.address) fromParties.counterparty_address = recipient.address;
  if (recipient?.abn) fromParties.counterparty_abn = recipient.abn;
  if (sender.name && b.sender_id && b.sender_id !== 'company') { fromParties.signatory_name = sender.name; if (sender.title) fromParties.signatory_title = sender.title; }
  const dateText = docDateText(b.doc_date);
  const values = await templateValues({ project, deal, inputs: { ...fromParties, ...(b.inputs || {}), date: dateText, document_date: dateText } });
  const rendered = renderTemplate(tpl.body, values, clauses);
  let text = rendered.text; let engine = 'template'; let provider: string | null = null; let aiError: string | null = null; let warning: string | null = null;
  const B = await getBrand();
  const want: Provider | null = b.provider && b.provider !== 'none' ? (b.provider === 'auto' ? await resolveProvider('auto') : b.provider as Provider) : null;
  if (want && !providerReady(want)) aiError = `${PROVIDER_LABEL[want] || want} is not connected — template output only. Add a key in Settings → AI.`;
  else if (want) {
    try {
      const kind = kindFor(tpl);
      const facts = await factSheet({ project, deal, extra: b.inputs });
      const banner = rendered.text.split('\n')[0].startsWith('DRAFT') ? rendered.text.split('\n')[0] : null;
      const usedIds = new Set(rendered.clausesUsed.filter(c => c.id).map(c => c.id));
      const verbatim = clauses.filter((c: any) => usedIds.has(c.id) && (c.clause_text || c.preferred_position)).map((c: any) => ({ name: c.name, text: String(c.clause_text || c.preferred_position) }));
      const asLetter = kind === 'letter';
      const subject = values.subject || (b.title ? String(b.title) : `${tpl.name}${project ? ` — ${project.name}` : ''}`);
      const w = await writeDocument({
        provider: want, kind, docName: tpl.name, templateText: rendered.text.replace(/\s*\[Starter wording — no approved clause for this topic yet\]/g, ''), facts: facts.text,
        recipient: recipient || (deal ? { name: deal.contact_name, company: deal.counterparty, email: deal.contact_email } : null), sender, subject,
        instructions: b.instructions, verbatimClauses: verbatim, actorId, date: dateText, length: (b.length || (kind === 'legal' ? 'standard' : 'standard')) as Length, letterFormat: asLetter, draftBanner: banner,
      });
      text = asLetter ? letterFrame({ recipient: recipient || (deal ? { name: deal.contact_name, company: deal.counterparty } : {}), sender, subject, body: w.text.replace(/^# .*\n+/, ''), signOff: 'Yours sincerely,', date: dateText }) : w.text;
      if (asLetter && banner) text = `${banner}\n\n${text}`;
      warning = w.warning; engine = 'template+ai'; provider = want;
      if (facts.richness < 3) warning = (warning ? `${warning} ` : '') + 'Very few facts were available — missing details are marked [●]. Add them to the project or deal, or type them into the form, and regenerate.';
    } catch (e: any) { aiError = e?.message || 'AI drafting failed — template output kept'; }
  }
  if (engine === 'template') text = ensureDocDate(text, dateText);
  void B; void possessive; void aiInstructions;
  const title = String(b.title || `${tpl.name}${project ? ` — ${project.name}` : ''}${values.counterparty ? ` — ${values.counterparty}` : ''}`).slice(0, 200);
  const { data, error } = await db.from('generated_documents').insert({
    project_id: b.project_id || null, deal_id: b.deal_id || null, template_id: tpl.id, doc_type: tpl.category, title, body: text,
    inputs: { ...(b.inputs || {}), doc_date: b.doc_date || undefined, document_date: dateText, recipient: recipient || undefined, sender_id: b.sender_id || undefined, missing_fields: rendered.missing, clauses_used: rendered.clausesUsed, template_status: tpl.status, template_version: tpl.version },
    clause_ids: rendered.clausesUsed.filter(c => c.id).map(c => c.id), engine, provider, status: 'draft', created_by: actorId,
  }).select().single();
  if (error) throw error;
  await writeAudit({ actorId, action: 'document.generated', entityType: 'generated_document', entityId: data.id, metadata: { template: tpl.name, engine, project_id: b.project_id || null } });
  return { generated: data, missing_fields: rendered.missing, clauses_used: rendered.clausesUsed, template_status: tpl.status, template_name: tpl.name, ai_error: aiError, warning };
}
