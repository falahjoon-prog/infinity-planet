/**
 * Writes emails for the Gmail page and the bot:
 *  - reads the email (and the whole thread when Gmail is connected),
 *  - looks up earlier emails with the same person on the same topic (and the linked project),
 *  - writes the reply as the chosen role (Admin, Project Coordinator, Project Manager, CEO),
 *  - polishes / shortens / formalises drafts.
 * Uses an AI provider when one is chosen and available, otherwise the built-in rules (lib/email-craft).
 */
import { getSupabaseAdmin } from './supabase';
import { chat, providerReady, Provider, PROVIDER_LABEL, resolveProvider } from './providers';
import { aiInstructions, getBrand, possessive } from './brand';
import { getSetting } from './settings';
import { brandBookExcerpt } from './brand-book';
import { readEmail, draftReply, rewrite, describeReading, personaSigner, PERSONAS, Persona, Tone, RewriteMode, ThreadMessage, RelatedEmail, EmailReading, stripQuoted, parseAddress } from './email-craft';
import { getSignature, getEmailStyle } from './email-html';
import { googleConfigured } from './google';
import type { Actor } from './auth';

export type ComposeInput = {
  provider?: string | null; intent?: string; tone?: Tone; persona?: Persona | null;
  original?: { from?: string; subject?: string; body?: string; date?: string; to?: string } | null;
  thread?: ThreadMessage[] | null; thread_id?: string | null; message_id?: string | null;
  project_id?: string | null; subject?: string; to?: string; use_history?: boolean; related?: RelatedEmail[] | null;
};
export type ComposeResult = {
  subject: string; body: string; engine: string; note?: string; reading: EmailReading | null; insights: string[];
  related: RelatedEmail[]; project: { id: string; name: string } | null; persona: Persona | null;
  suggested_cc: { email: string; name: string; source: 'thread' | 'team' | 'earlier'; count: number }[];
  reply_to?: { to: string; cc?: string; in_reply_to?: string; thread_id?: string; quoted?: { from?: string; date?: string; body?: string } };
};

const isPersona = (p: any): p is Persona => ['admin', 'coordinator', 'manager', 'ceo'].includes(p);
const isTone = (t: any): t is Tone => ['professional', 'warm', 'formal', 'brief'].includes(t);

export async function signerFor(actor: Actor, persona: Persona | null, projectName?: string) {
  const [entity, B, sig, prof] = await Promise.all([getSetting<any>('rhc_entity_details'), getBrand(), getSignature(actor.id), getSupabaseAdmin().from('profiles').select('title').eq('id', actor.id).maybeSingle()]);
  const company = entity?.name || B.business_name;
  const name = actor.full_name || actor.email || `${B.short_name} team`;
  if (persona) return personaSigner(`${name}\n${company}`, persona, projectName);
  const title = sig.title || prof.data?.title;
  return [name, title, company].filter(Boolean).join('\n');
}

export async function composeEmail(actor: Actor, b: ComposeInput): Promise<ComposeResult> {
  const db = getSupabaseAdmin();
  const style = await getEmailStyle();
  const sig = await getSignature(actor.id);
  const ruleP = (await (await import('./ai-rules')).ruleDefaults(actor.id).catch(() => ({} as any))).persona;
  const persona: Persona | null = isPersona(b.persona) ? b.persona : b.persona === null ? null : isPersona(ruleP) ? ruleP as Persona : isPersona(sig.persona) ? sig.persona as Persona : isPersona(style.default_persona) ? style.default_persona as Persona : null;
  const tone: Tone = isTone(b.tone) ? b.tone : isTone(style.default_tone) ? style.default_tone as Tone : 'professional';
  const B = await getBrand();

  // 1. The conversation being answered
  let thread: (ThreadMessage & { messageId?: string; references?: string; cc?: string; threadId?: string })[] = (b.thread || []).filter(m => m && m.body);
  let gmailOk = false;
  if (!thread.length && (b.thread_id || b.message_id) && googleConfigured()) {
    try {
      const { readThread, readMessage } = await import('./email-history');
      if (b.thread_id) thread = await readThread(b.thread_id, actor.id);
      else { const m = await readMessage(b.message_id!, actor.id); thread = m.threadId ? await readThread(m.threadId, actor.id) : [m]; }
      gmailOk = true;
    } catch { /* fall back to the supplied original */ }
  }
  if (!thread.length && b.original?.body) thread = [{ from: b.original.from, subject: b.original.subject, body: b.original.body, date: b.original.date, to: b.original.to }];
  // When replying, answer the latest message that was NOT sent by us
  const mailbox = String((await import('./google').then(g => g.mailClient(actor.id)).catch(() => null))?.mailbox || actor.email || '').toLowerCase();
  // "Our side" = the connected mailbox and colleagues at the same company domain. Reply to the latest message from the other side.
  const dom = mailbox.split('@')[1] || '';
  const genericDom = /^(gmail|outlook|hotmail|yahoo|icloud|live)\./i.test(dom);
  const isOurs = (a: string) => !!a && (a === mailbox || (!!dom && !genericDom && a.endsWith(`@${dom}`)));
  let target = thread.length ? thread[thread.length - 1] : null;
  if (thread.length > 1 && mailbox) { const fromThem = [...thread].reverse().find(m => !isOurs(parseAddress(m.from || '').email)); if (fromThem) target = fromThem; }
  const ordered = target ? [...thread.filter(m => m !== target), target] : [];
  const reading = target ? readEmail(ordered) : null;

  // 2. Earlier emails with the same person on this topic, and the linked project
  let related: RelatedEmail[] = (b.related || []).slice(0, 5);
  let project: { id: string; name: string; next_action?: string | null; status?: string; description?: string | null } | null = null;
  let note: string | undefined;
  if (reading && b.use_history !== false && !related.length && reading.sender_email && googleConfigured()) {
    try {
      const { relatedEmails } = await import('./email-history');
      const r = await relatedEmails({ userId: actor.id, email: reading.sender_email, subject: reading.topic, body: reading.cleaned, threadId: (target as any)?.threadId || b.thread_id || undefined });
      related = r.related;
      if (r.project && !b.project_id) b.project_id = r.project.id;
    } catch (e: any) { note = gmailOk ? `Couldn't search earlier emails: ${String(e?.message || e).slice(0, 120)}` : undefined; }
  }
  if (!b.project_id && related.find(r => r.project)) {
    const { data } = await db.from('projects').select('id').eq('name', related.find(r => r.project)!.project!).maybeSingle();
    if (data) b.project_id = data.id;
  }
  if (b.project_id) project = (await db.from('projects').select('id,name,status,next_action,description').eq('id', b.project_id).maybeSingle()).data;

  const signer = await signerFor(actor, persona, project?.name);
  const insights = reading ? describeReading(reading) : [];
  if (related.length) insights.push(`Earlier emails on this topic: ${related.slice(0, 3).map(r => `“${r.subject}”${r.date ? ` (${new Date(r.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}`).join(', ')}.`);
  if (project) insights.push(`Project: ${project.name}.`);
  if (persona) insights.push(`Replying as ${PERSONAS[persona].label}.`);

  const replyTo = target ? (() => {
    const t: any = target;
    const to = parseAddress(t.from || '').email;
    // Keep everyone else on the conversation (their side and our colleagues) in Cc, except the connected mailbox itself.
    const others = [t.to, t.cc].join(',').split(',').map((x: string) => x.trim()).filter(Boolean);
    const cc = [...new Map(others.map((x: string) => [parseAddress(x).email, x])).entries()].filter(([e]) => e && e !== mailbox && e !== to).map(([, x]) => x).join(', ');
    return { to, cc: cc || undefined, in_reply_to: t.messageId || undefined, thread_id: t.threadId || b.thread_id || undefined, quoted: { from: t.from, date: t.date, body: stripQuoted(t.body).slice(0, 6000) } };
  })() : undefined;

  // Cc suggestions: people already on this conversation (most frequent first), then the team.
  const sugg = new Map<string, { email: string; name: string; source: 'thread' | 'team' | 'earlier'; count: number }>();
  const addP = (raw: string, source: 'thread' | 'team' | 'earlier', name?: string) => { const a = parseAddress(raw); if (!a.email || a.email === mailbox || a.email === replyTo?.to || a.email === parseAddress(b.to || '').email) return; const cur = sugg.get(a.email); if (cur) { cur.count++; if (!cur.name && (name || a.name)) cur.name = name || a.name; } else sugg.set(a.email, { email: a.email, name: name || a.name || '', source, count: 1 }); };
  for (const m of thread as any[]) for (const raw of [m.from, ...String(m.to || '').split(','), ...String(m.cc || '').split(',')]) if (raw && raw.trim()) addP(raw, 'thread');
  for (const r of related) if (r.from) addP(r.from, 'earlier');
  const { data: team } = await db.from('profiles').select('full_name,email,active').eq('active', true).not('email', 'is', null);
  for (const t of team || []) if (t.email && t.email !== actor.email) { const e = t.email.toLowerCase(); if (sugg.has(e)) { const c = sugg.get(e)!; c.name = c.name || t.full_name || ''; } else addP(`${t.full_name || ''} <${e}>`, 'team', t.full_name || ''); }
  const order = { thread: 0, earlier: 1, team: 2 } as const;
  const suggested_cc = [...sugg.values()].sort((x, y) => order[x.source] - order[y.source] || y.count - x.count).slice(0, 14);

  // 3. Write it
  const provider = b.provider && b.provider !== 'none' ? (b.provider === 'auto' ? await resolveProvider('auto') : b.provider) : null;
  const rules = () => draftReply({ reading, intent: b.intent, tone, signer, project, recipient: b.to, subject: b.subject, persona, related });
  if (!provider) { const r = rules(); return { ...r, engine: 'rules', reading, insights, related, project, persona, reply_to: replyTo, note, suggested_cc }; }
  if (!providerReady(provider)) { const r = rules(); return { ...r, engine: 'rules', reading, insights, related, project, persona, suggested_cc, reply_to: replyTo, note: `${provider} is not configured on the server, so the built-in writer was used.` }; }
  try {
    const [instructions, book] = await Promise.all([aiInstructions(actor.id), brandBookExcerpt(1500).catch(() => '')]);
    const P = persona ? PERSONAS[persona] : null;
    const conv = ordered.slice(-6).map((m, i, a) => `--- ${i === a.length - 1 ? 'MESSAGE TO REPLY TO' : 'Earlier in thread'} — From: ${m.from || ''} · ${m.date || ''} · Subject: ${m.subject || ''}\n${stripQuoted(m.body).slice(0, i === a.length - 1 ? 8000 : 2000)}`).join('\n\n');
    const hist = related.slice(0, 4).map(r => `--- ${r.date ? new Date(r.date).toDateString() : ''} · "${r.subject}" · ${r.from || ''}${r.project ? ` · project ${r.project}` : ''}\n${(r.body || r.snippet || '').slice(0, 1500)}`).join('\n\n');
    const prompt = `Write ${reading ? 'a reply to the email below' : 'a new email'} on behalf of ${actor.full_name || `a ${B.short_name} team member`} at ${B.business_name}${P ? `, writing as the ${P.label} of ${project ? `the ${project.name} project` : 'the project'}` : ''}.
${P ? `ROLE: ${P.label}. Write with this role's authority and voice: ${persona === 'ceo' ? 'senior, decisive, brief, strategic; agree in principle only, leave detail to the team, subject to formal documentation and approval' : persona === 'manager' ? 'accountable and specific; confirm actions, owners and dates; may commit to operational steps within the project' : persona === 'coordinator' ? 'organised and helpful; handles logistics, scheduling and documents; refers decisions and commercial points to the Project Manager' : 'courteous and administrative; acknowledges, routes to the right person, confirms receipt; makes no commercial or technical commitments'}.\n` : ''}TONE: ${tone}. Write in Australian English. Be clear and professional: short paragraphs, answer every question and request in the email (numbered if more than two), no filler, no emojis.
Protect ${possessive(B.short_name)} commercial position; do not commit ${B.short_name} to anything not in the instructions; never invent facts, figures, dates or attachments — use [square-bracket placeholders] where the sender must fill something in.
${related.length ? `Earlier emails with this person on the same topic are below — refer to them where relevant (e.g. "Further to our email of …"), stay consistent with what was said before, and point out anything that changed.\n` : ''}${project ? `PROJECT: ${JSON.stringify({ name: project.name, status: project.status, next_action: project.next_action, description: project.description?.slice(0, 400) })}\n` : ''}${book ? `BRAND BOOK (tone and naming):\n${book}\n` : ''}
${conv ? `THREAD:\n${conv}\n` : ''}${hist ? `EARLIER RELATED EMAILS WITH THIS PERSON:\n${hist}\n` : ''}${b.to && !reading ? `TO: ${b.to}\n` : ''}WHAT THE SENDER WANTS TO SAY: ${b.intent || (reading ? 'Write an appropriate reply that addresses every point.' : 'Write an appropriate email.')}

Return the subject on the first line as "Subject: ..." then a blank line, then the body including greeting and sign-off. Sign off exactly as:
${tone === 'formal' ? 'Yours sincerely' : tone === 'warm' ? 'Warm regards' : 'Kind regards'},
${signer}`;
    const out = await chat(provider as Provider, { system: instructions, messages: [{ role: 'user', content: prompt }], maxTokens: 1500, timeoutMs: 90_000 });
    const m = out.match(/^\s*\**Subject:?\**\s*(.+)\n+([\s\S]*)$/i);
    const fallbackSubject = reading?.topic ? `Re: ${reading.topic}` : b.subject || '';
    return { subject: (m ? m[1].trim() : fallbackSubject).replace(/^\*+|\*+$/g, ''), body: (m ? m[2] : out).trim(), engine: provider, reading, insights, related, project, persona, reply_to: replyTo, note, suggested_cc };
  } catch (e: any) {
    const r = rules();
    return { ...r, engine: 'rules', reading, insights, related, project, persona, suggested_cc, reply_to: replyTo, note: `${PROVIDER_LABEL[provider as Provider] || provider} failed (${String(e?.message || e).slice(0, 120)}), so the built-in writer was used.` };
  }
}

const MODE_TEXT: Record<RewriteMode, string> = {
  polish: 'Polish this email so it reads as clear, confident and highly professional business correspondence. Fix grammar, spelling and punctuation, improve flow and structure, keep the meaning, facts, names, numbers and dates exactly.',
  proofread: 'Proofread this email: correct spelling, grammar and punctuation only. Do not change the wording otherwise.',
  shorten: 'Make this email shorter and more direct (about half the length) while keeping every fact, request, name, number and date.',
  formal: 'Rewrite this email in a more formal, senior business register, without contractions or casual phrases. Keep every fact.',
  friendly: 'Rewrite this email to be warmer and friendlier while staying professional. Keep every fact.',
};
export async function rewriteEmail(actor: Actor, b: { body: string; mode?: RewriteMode; instruction?: string; provider?: string | null; to?: string }) {
  const mode: RewriteMode = (['polish', 'proofread', 'shorten', 'formal', 'friendly'] as const).includes(b.mode as any) ? b.mode as RewriteMode : 'polish';
  const signer = await signerFor(actor, null);
  const rules = () => rewrite(b.body, mode, { recipient: b.to, signer });
  const provider = b.provider && b.provider !== 'none' ? (b.provider === 'auto' ? await resolveProvider('auto') : b.provider) : null;
  if (!provider || !providerReady(provider)) {
    if (!provider && b.provider === 'auto') return { body: rules(), engine: 'rules', note: b.instruction ? 'No AI is connected, so only the built-in edits were applied. Connect an AI (Settings → AI) for full rewrites and custom instructions.' : 'Built-in editor used (no AI connected) — it improves wording and structure; connect an AI for full rewrites.' };
    if (b.instruction && !provider) return { body: rules(), engine: 'rules', note: 'Custom instructions need an AI provider — the built-in polish was applied instead.' };
    return { body: rules(), engine: 'rules', note: provider ? `${provider} is not configured, so the built-in editor was used.` : undefined };
  }
  try {
    const out = await chat(provider as Provider, { system: await aiInstructions(actor.id), messages: [{ role: 'user', content: `${b.instruction ? `Rewrite this email: ${b.instruction}. Keep every fact, name, number and date unless told otherwise.` : MODE_TEXT[mode]} Use Australian English. Keep the greeting, sign-off and signature lines. Keep any [square-bracket placeholders]. Return ONLY the email body, no subject line and no commentary.\n\nEMAIL:\n${b.body}` }], maxTokens: 1500, timeoutMs: 90_000 });
    return { body: out.replace(/^\s*(here('s| is) (the|your) [^\n]*:\s*\n)/i, '').replace(/^\s*Subject:.*\n+/i, '').trim(), engine: provider };
  } catch (e: any) {
    return { body: rules(), engine: 'rules', note: `${PROVIDER_LABEL[provider as Provider] || provider} failed, so the built-in editor was used.` };
  }
}
