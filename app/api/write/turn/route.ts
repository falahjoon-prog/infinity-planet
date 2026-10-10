import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { renderTemplate, docDateText, ensureDocDate } from '@/lib/templates/render';
import { templateValues } from '@/lib/templates/store';
import { providerReady, resolveProvider, PROVIDER_LABEL, Provider } from '@/lib/providers';
import { factSheet, kindFor, writeDocument, reviseDocument, senderParty, letterFrame, Party, Length, DocKind } from '@/lib/doc-writer';
import { builtinDraft, builtinRevise, readRequest, BUILTIN_HELP } from '@/lib/builtin-writer';
import { noteRequest, applyHouseStyle, approvedSignOff } from '@/lib/house-style';
export const maxDuration = 300;

const party = (x: any): Party => x && typeof x === 'object' ? { name: x.name || null, title: x.title || null, company: x.company || null, address: x.address || null, email: x.email || null, phone: x.phone || null, abn: x.abn || null } : {};
const filled = (p: Party) => Object.values(p).some(v => v && String(v).trim());

/**
 * One turn of the writing conversation.
 * No document yet → writes the first draft from the request (+ optional template, project, recipient).
 * Document given → changes it as asked and returns the full new version.
 * Works with an AI writer, or with the built-in writer when no AI is connected.
 */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const message = String(b.message || '').trim();
  if (!message) throw new HttpError(400, 'Type what you want written or changed');
  const db = getSupabaseAdmin();
  const doc = String(b.doc || '');
  const history = (Array.isArray(b.history) ? b.history : []).filter((h: any) => h && ['user', 'assistant'].includes(h.role) && typeof h.content === 'string').slice(-10);
  const [tpl, project, deal] = await Promise.all([
    b.template_id ? db.from('document_templates').select('*').eq('id', b.template_id).maybeSingle().then(r => r.data) : null,
    b.project_id ? db.from('projects').select('*').eq('id', b.project_id).maybeSingle().then(r => r.data) : null,
    b.deal_id ? db.from('deals').select('*').eq('id', b.deal_id).maybeSingle().then(r => r.data) : null,
  ]);
  let recipient = party(b.recipient);
  const sender = await senderParty(b.sender_id === 'company' ? null : (b.sender_id || actor.id));
  const asked = readRequest(message);
  if (!filled(recipient) && asked.recipientName && !doc) recipient = { name: asked.recipientName };

  // What kind of writing this is
  let kind: DocKind = b.kind && ['marketing', 'social', 'letter', 'legal', 'report', 'proposal'].includes(b.kind) ? b.kind : tpl ? kindFor(tpl)
    : asked.kind !== 'letter' && /\b(write|draft|prepare|create|make|need)\b[^.]{0,40}\b(agreement|contract|mou|memorandum|heads of agreement|deed|nda|confidentiality agreement|lease)\b/i.test(message) ? 'legal'
    : /\b(proposal)\b/i.test(message) ? 'proposal' : /\b(report)\b/i.test(message) ? 'report'
    : b.context === 'marketing' && asked.kind !== 'letter' ? 'marketing' : 'letter';
  const asLetter = kind !== 'legal' && kind !== 'social' && (b.format === 'letter' || (b.format !== 'document' && (kind === 'letter' || asked.kind === 'letter')));
  if (asLetter && kind === 'marketing' && b.format !== 'letter' && asked.kind !== 'letter') kind = 'marketing';

  const want: Provider | null = b.provider && b.provider !== 'none' ? (b.provider === 'auto' ? await resolveProvider('auto') : b.provider) : null;
  const useAi = want && providerReady(want) ? want : null;
  const notice = want && !useAi ? `${PROVIDER_LABEL[want as Provider] || want} isn't connected, so I used the built-in writer.` : null;
  const facts = await factSheet({ project, deal, extra: b.inputs });

  // ---------------------------------------------------------------- change an existing document
  if (doc.trim()) {
    const learned = await noteRequest(message, actor.id);
    const plus = (reply: string) => learned ? `${reply}\n\n${learned}` : reply;
    if (useAi) {
      try {
        const r = await reviseDocument({ provider: useAi, kind, doc, request: message, history, facts: facts.text, recipient, sender, actorId: actor.id });
        return ok({ content: r.content, reply: plus(r.reply), engine: useAi, kind });
      } catch (e: any) {
        const r = builtinRevise(doc, message, { asLetter });
        return ok({ content: r?.content ?? null, reply: `${PROVIDER_LABEL[useAi]} didn't answer (${String(e?.message || e).slice(0, 120)}). ${r ? `Built-in writer: ${r.reply}` : BUILTIN_HELP}`, engine: 'builtin', kind });
      }
    }
    const r = builtinRevise(doc, message, { asLetter });
    if (!r) return ok({ content: null, reply: learned || `${notice ? `${notice} ` : ''}${BUILTIN_HELP}`, engine: 'builtin', kind });
    return ok({ content: r.content === doc ? null : r.content, reply: plus(`${notice ? `${notice} ` : ''}${r.reply}`), title: r.title, engine: 'builtin', kind });
  }

  // ---------------------------------------------------------------- first draft
  const dateText = docDateText(b.doc_date);
  const values = tpl ? await templateValues({ project, deal, inputs: { date: dateText, document_date: dateText, ...(recipient.name ? { recipient_name: recipient.name } : {}), ...(recipient.company ? { counterparty: recipient.company } : {}), ...(b.inputs || {}) } }) : null;
  const rendered = tpl && values ? renderTemplate(tpl.body, values, [], { markMissing: false }) : null;
  const subject = asked.subject || (tpl ? `${tpl.name}${project ? ` — ${project.name}` : ''}` : project?.name || null);
  const who = recipient.company || recipient.name;
  const title = String(b.title || (tpl ? `${tpl.name}${project ? ` — ${project.name}` : ''}${who ? ` — ${who}` : ''}` : asLetter ? `Letter${who ? ` to ${who}` : ''}${asked.subject ? ` — ${asked.subject}` : ''}` : asked.subject || 'New document')).slice(0, 200);
  let content = ''; let reply = ''; let engine = 'builtin'; let warning: string | null = null;
  if (useAi) {
    try {
      const instructions = [...history.filter((h: any) => h.role === 'user').map((h: any) => h.content), message].join('\n');
      const w = await writeDocument({ provider: useAi, kind: asLetter ? 'letter' : kind, docName: tpl?.name || (asLetter ? 'letter' : asked.subject || 'document'), templateText: rendered?.text || null, facts: facts.text, recipient, sender, subject, instructions, length: (['brief', 'standard', 'comprehensive'].includes(b.length) ? b.length : 'standard') as Length, letterFormat: asLetter, actorId: actor.id, date: dateText });
      content = asLetter ? letterFrame({ recipient, sender, subject: asked.subject || (tpl ? subject : null), body: w.text.replace(/^# .*\n+/, ''), signOff: 'Kind regards,', date: dateText }) : w.text;
      engine = useAi; warning = w.warning;
      reply = `Here's the first draft${who ? ` for ${who}` : ''}. Tell me what to change — tone, length, a point to add or remove, or any wording.`;
    } catch (e: any) { reply = `${PROVIDER_LABEL[useAi]} didn't answer (${String(e?.message || e).slice(0, 140)}), so the built-in writer made this draft. `; }
  }
  if (!content) {
    const hs = await applyHouseStyle('');
    const d = builtinDraft({ request: message, tone: hs.tone, asLetter, recipient, sender, templateText: rendered?.text || null, docName: tpl?.name || null, projectName: project?.name || null });
    recipient = d.recipient;
    const signOff = (await approvedSignOff().catch(() => null)) || 'Kind regards,';
    content = (await applyHouseStyle(asLetter ? letterFrame({ recipient, sender, subject: d.subject, body: d.body, signOff, date: dateText }) : ensureDocDate(d.body, dateText))).text;
    if (hs.concise) content = content.split('\n\n').filter(p => !/^(I hope you are well\.?|Thank you for your attention to this matter\.?)$/i.test(p.trim())).join('\n\n');
    reply = `${notice ? `${notice} ` : ''}${reply}${d.reply}`;
  }
  const learnedFirst = await noteRequest(message, actor.id); if (learnedFirst) reply = `${reply}\n\n${learnedFirst}`;
  if (facts.richness < 2 && project) warning = (warning ? `${warning} ` : '') + `"${project.name}" has very little information recorded — add details to the project for stronger writing.`;
  return ok({ content, reply, title, engine, kind, recipient, warning });
});
