import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { renderTemplate, docDateText } from '@/lib/templates/render';
import { templateValues } from '@/lib/templates/store';
import { providerReady, resolveProvider, PROVIDER_LABEL, Provider } from '@/lib/providers';
import { factSheet, kindFor, writeDocument, senderParty, letterFrame, preparedHeader, Party, Length } from '@/lib/doc-writer';
export const maxDuration = 300;

const party = (x: any): Party | null => x && typeof x === 'object' ? { name: x.name || null, title: x.title || null, company: x.company || null, address: x.address || null, email: x.email || null, phone: x.phone || null } : null;
const filled = (p: Party | null) => !!p && Object.values(p).some(v => v && String(v).trim());

/**
 * Writes a complete marketing piece or letter from a template + everything known about the project.
 * Body: { template_id, project_id?, provider ('auto' | id | 'none'), instructions?, recipient?, sender_id?, format? ('document'|'letter'), length?, subject? }
 * Returns a draft (not saved).
 */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const db = getSupabaseAdmin();
  const { data: tpl } = await db.from('document_templates').select('*').eq('id', b.template_id).maybeSingle();
  if (!tpl) throw new HttpError(404, 'Template not found');
  const project = b.project_id ? (await db.from('projects').select('*').eq('id', b.project_id).maybeSingle()).data : null;
  const recipient = party(b.recipient); const sender = await senderParty(b.sender_id === 'company' ? null : (b.sender_id || actor.id));
  const dateText = docDateText(b.doc_date);
  const values = await templateValues({ project, inputs: { date: dateText, document_date: dateText, ...(b.inputs || {}), ...(sender.name ? { contact_name: sender.name } : {}), ...(sender.email ? { contact_email: sender.email } : {}), ...(sender.phone ? { contact_phone: sender.phone } : {}) } });
  const r = renderTemplate(tpl.body, values, [], { markMissing: false });
  const kind = kindFor(tpl);
  const asLetter = b.format === 'letter' && kind !== 'social';
  const title = String(b.title || `${tpl.name}${project ? ` — ${project.name}` : ''}${recipient?.company || recipient?.name ? ` — ${recipient.company || recipient.name}` : ''}`).slice(0, 200);
  const subject = b.subject || `${tpl.name}${project ? ` — ${project.name}` : ''}`;

  let content = ''; let engine = 'template'; let aiError: string | null = null; let warning: string | null = null;
  const provider: Provider | null = b.provider && b.provider !== 'none' ? (b.provider === 'auto' ? await resolveProvider('auto') : b.provider) : null;
  if (provider && !providerReady(provider)) aiError = `${PROVIDER_LABEL[provider as Provider] || provider} is not connected — showing the template version. Add a key in Settings → AI.`;
  else if (provider) {
    try {
      const facts = await factSheet({ project, extra: b.inputs });
      const w = await writeDocument({ provider, kind, docName: tpl.name, templateText: r.text, facts: facts.text, recipient, sender, subject, instructions: b.instructions, length: (['brief', 'standard', 'comprehensive'].includes(b.length) ? b.length : 'standard') as Length, letterFormat: asLetter, actorId: actor.id, date: dateText });
      content = w.text; warning = w.warning; engine = `template+${provider}`;
      if (facts.richness < 3) warning = (warning ? `${warning} ` : '') + (project ? `"${project.name}" has very little information recorded (description, highlights, value, documents). Add details to the project for a stronger document — missing facts are marked [●].` : 'No project chosen — missing facts are marked [●].');
    } catch (e: any) { aiError = e?.message || 'AI writing failed — showing the template version'; }
  }
  if (!content) {
    // Template version (no AI): the filled template, framed properly.
    const body = r.text.replace(/^([A-Z][A-Z0-9 &,'’()/—–.:-]{3,})$/gm, (m) => m.length < 80 ? `## ${m.charAt(0) + m.slice(1).toLowerCase()}` : m);
    content = asLetter ? body : `${preparedHeader(title, recipient, sender, dateText)}\n\n${body.replace(/^## .*\n/, '')}`;
  }
  if (asLetter) content = letterFrame({ recipient: recipient || {}, sender, subject, body: content.replace(/^# .*\n+/, ''), signOff: 'Kind regards,', date: dateText });
  return ok({ content, engine, ai_error: aiError, warning, missing_fields: r.missing, title, kind, recipient_set: filled(recipient) });
});
