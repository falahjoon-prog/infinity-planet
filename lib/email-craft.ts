/**
 * Email writing engine that works WITHOUT an AI key:
 *  - readEmail(): reads an email (or a whole thread), removes quoted history and signatures,
 *    and pulls out who wrote it, the topic, questions asked, requests made, dates/meetings
 *    proposed, attachments mentioned, deadlines and urgency.
 *  - draftReply(): writes a structured, professional reply that answers each point, using what
 *    the user said they want to say ("accept Tuesday 10am, ask for the term sheet").
 *  - rewrite(): polish / proofread / shorten / more formal / friendlier.
 * With an AI provider the routes ask the model instead and fall back to these rules on error.
 * Pure functions (no database), so they are unit-tested.
 */
import { parseWhen, formatWhen } from './when';

export type ThreadMessage = { from?: string; to?: string; date?: string; subject?: string; body: string };
export type Tone = 'professional' | 'warm' | 'formal' | 'brief';
/** Who the reply is written as. Sets voice, how far the reply may commit, and the title under the signature. */
export type Persona = 'admin' | 'coordinator' | 'manager' | 'ceo';
export type RelatedEmail = { id?: string; threadId?: string; subject: string; date?: string; from?: string; snippet?: string; body?: string; score?: number; project?: string | null };
export const PERSONAS: Record<Persona, { label: string; title: (project?: string) => string; open: string; points: string; close: string; commit: string; concerned: string }> = {
  admin: {
    label: 'Admin', title: () => 'Administration',
    open: 'I have received your email and passed it to the relevant team member.',
    points: 'I have noted the following for the team:', commit: 'The responsible team member will respond on the open items above.',
    close: 'I will make sure you receive a response, and please contact me in the meantime if anything further is needed.',
    concerned: 'I have escalated this to the responsible manager so it receives prompt attention.',
  },
  coordinator: {
    label: 'Project Coordinator', title: p => p ? `Project Coordinator — ${p}` : 'Project Coordinator',
    open: 'I will coordinate with the project team and the relevant consultants on this.',
    points: 'Taking your points in turn:', commit: 'Where a decision is needed I will confirm with the Project Manager before responding.',
    close: 'I will keep you updated on progress and come back to you with confirmed timing.',
    concerned: 'I have raised this with the Project Manager and will coordinate a response with the team.',
  },
  manager: {
    label: 'Project Manager', title: p => p ? `Project Manager — ${p}` : 'Project Manager',
    open: 'I have reviewed your email and will make sure this is actioned.',
    points: 'In response to the points you raised:', commit: 'I will come back to you on the open items above with owners and timing.',
    close: 'I will ensure the agreed actions are completed and keep you informed.',
    concerned: 'I take this seriously and will make sure it is resolved promptly.',
  },
  ceo: {
    label: 'CEO', title: () => 'Chief Executive Officer',
    open: 'I have reviewed your email personally.',
    points: 'On the key points:', commit: 'Any commitment remains subject to formal documentation and approval.',
    close: 'I have asked our team to follow up on the detail, and I look forward to progressing this with you.',
    concerned: 'I appreciate you raising this directly with me, and I have asked our team to address it as a priority.',
  },
};
export type EmailReading = {
  sender_name: string; sender_first: string; sender_email: string; topic: string;
  summary: string[]; questions: string[]; requests: string[]; dates: { text: string; at: string }[];
  attachments: string[]; deadline: string | null; urgent: boolean; kind: string; sentiment: 'positive' | 'neutral' | 'concerned';
  thanks: boolean; message_count: number; cleaned: string;
};

// ------------------------------------------------------------------ cleaning
/** Removes quoted replies ("On … wrote:", Outlook "From: … Sent:" blocks, "> " lines) and the sender's signature. */
export function stripQuoted(body: string): string {
  let t = String(body || '').replace(/\r/g, '');
  const cut = [
    /\n\s*On\s[\s\S]{5,200}?wrote:\s*\n/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*_{5,}\s*\n\s*From:/i,
    /\n\s*From:\s.+\n\s*(Sent|Date):\s.+\n/i,
    /\n\s*Sent from my (iPhone|iPad|Android|mobile|Samsung|Galaxy)/i,
  ];
  for (const re of cut) { const m = t.match(re); if (m && m.index! >= 5) t = t.slice(0, m.index); }
  t = t.split('\n').filter(l => !/^\s*>/.test(l)).join('\n');
  // Signature: "-- " delimiter, or a sign-off line followed by a short block
  const sig = t.match(/\n--\s*\n/); if (sig && sig.index! > 20) t = t.slice(0, sig.index);
  const so = t.match(/\n\s*(kind regards|best regards|warm regards|regards|many thanks|thanks|thank you|cheers|sincerely|yours sincerely|yours faithfully|best wishes|best|talk soon)[,!.]?\s*\n[\s\S]{0,400}$/i);
  if (so && so.index! > 20) t = t.slice(0, so.index);
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** "Jane Citizen <jane@x.com>" → { name, first, email }. */
export function parseAddress(from: string) {
  const s = String(from || '').trim();
  const email = (s.match(/<([^>]+)>/)?.[1] || (s.match(/[^\s<>"]+@[^\s<>"]+/)?.[0]) || '').toLowerCase();
  let name = s.replace(/<[^>]*>/, '').replace(/["']/g, '').trim();
  if (!name || name.includes('@')) {
    const local = (email.split('@')[0] || '').replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
    name = /^(info|admin|office|enquiries|hello|contact|accounts|sales|support|noreply|no reply|reception|team|mail)$/i.test(local) ? '' : local.replace(/\b\w/g, c => c.toUpperCase());
  }
  if (/,/.test(name)) { const [last, first] = name.split(',').map(x => x.trim()); if (first) name = `${first} ${last}`; }
  const first = name.split(/\s+/)[0] || '';
  return { name, first: /^(mr|mrs|ms|dr|prof)\.?$/i.test(first) ? name : first, email };
}

const sentences = (t: string) => t.replace(/\n+/g, ' \n ').split(/(?<=[.!?])\s+|\n/).map(s => s.trim()).filter(s => s.length > 2);

// ------------------------------------------------------------------ reading
const REQUEST_RE = /\b(we'?d like|we would like|i'?d like to|could you|can you|would you|will you|please|kindly|we need|i need|we require|we'd need|we would need|let (me|us) know|send (me|us|through|over)|provide|confirm|advise|forward|arrange|share|review|sign|approve|update (me|us)|get back to)\b/i;
const ATTACH_RE = /\b(attached|attachment|enclosed|please find|see the (attached|enclosed))\b/i;
const URGENT_RE = /\b(urgent|asap|as soon as possible|immediately|time[- ]sensitive|by (today|tonight|end of (the )?day|cob|eod)|priority)\b/i;
const CONCERN_RE = /\b(concern(ed)?|disappoint(ed|ing)|unacceptable|delay(ed)?|issue|problem|complain|frustrat|unhappy|breach|overdue|not (yet )?received|still waiting|chasing)\b/i;
const POSITIVE_RE = /\b(great|pleased|happy|delighted|excellent|good news|thank you|thanks|appreciate|congratulations|well done)\b/i;

function kindOf(t: string, subject: string) {
  const s = `${subject}\n${t}`.toLowerCase();
  if (/\b(invoice|payment|remittance|overdue amount|statement|pay(able)?)\b/.test(s)) return 'payment';
  if (/\b(meet|meeting|catch ?up|call|zoom|teams|site visit|inspection|available|availability|calendar|diary)\b/.test(s)) return 'meeting';
  if (/\b(mou|heads of agreement|contract|agreement|lease|deed|term sheet|offer|nda|draft)\b/.test(s)) return 'documents';
  if (/\b(proposal|quote|quotation|pricing|fee|tender|eoi)\b/.test(s)) return 'proposal';
  if (/\b(follow(ing)? up|chasing|reminder|any update|checking in)\b/.test(s)) return 'follow_up';
  if (/\b(introduc|connect you|meet [A-Z])/.test(s)) return 'introduction';
  if (/^\s*(thanks|thank you|many thanks)\b/.test(t.toLowerCase()) && t.length < 400) return 'thanks';
  return 'general';
}

/** Reads the latest message (and the thread for context). The LAST item is the message being replied to. */
export function readEmail(thread: ThreadMessage[], now = new Date()): EmailReading {
  const last = thread[thread.length - 1] || { body: '' };
  const who = parseAddress(last.from || '');
  const cleaned = stripQuoted(last.body);
  const subject = String(last.subject || thread.find(m => m.subject)?.subject || '').replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').trim();
  const ss = sentences(cleaned).filter(s => !/^(hi|hello|dear|hey|good (morning|afternoon|evening))\b[^.?!]{0,40}[,!]?$/i.test(s));
  const questions = ss.filter(s => /\?\s*$/.test(s)).slice(0, 8);
  const requests = ss.filter(s => !/\?\s*$/.test(s) && REQUEST_RE.test(s) && !/^(please find|please see)\b/i.test(s)).slice(0, 8);
  const dates: { text: string; at: string }[] = [];
  for (const s of ss) { const w = parseWhen(s, now); if (w && dates.length < 4 && /\b(on|at|by|before|from|next|this|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}\/\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s)) dates.push({ text: s.slice(0, 160), at: w.at.toISOString() }); }
  const meetS = ss.find(s => /\b(meet|meeting|catch ?up|call|zoom|teams|site visit|inspection)\b/i.test(s) && parseWhen(s, now));
  if (meetS) { const at = parseWhen(meetS, now)!.at.toISOString(); const i = dates.findIndex(d => d.at === at); if (i > 0) dates.unshift(dates.splice(i, 1)[0]); else if (i < 0) dates.unshift({ text: meetS.slice(0, 160), at }); }
  const attachments = ss.filter(s => ATTACH_RE.test(s)).map(s => s.slice(0, 160)).slice(0, 4);
  const deadlineS = ss.find(s => /\b(by|before|no later than|deadline|due)\b/i.test(s) && parseWhen(s, now));
  const deadline = deadlineS ? formatWhen(parseWhen(deadlineS, now)!.at) : null;
  const summary = [...new Set([...ss.filter(s => !questions.includes(s) && !requests.includes(s)).slice(0, 2), ...questions.slice(0, 2), ...requests.slice(0, 2)])].slice(0, 5).map(s => s.length > 200 ? `${s.slice(0, 197)}…` : s);
  return {
    sender_name: who.name, sender_first: who.first, sender_email: who.email, topic: subject,
    summary, questions, requests, dates, attachments, deadline,
    urgent: URGENT_RE.test(cleaned) || /\b(urgent|asap)\b/i.test(last.subject || ''),
    kind: kindOf(cleaned, subject),
    sentiment: CONCERN_RE.test(cleaned) ? 'concerned' : POSITIVE_RE.test(cleaned) ? 'positive' : 'neutral',
    thanks: /\b(thank|thanks|appreciate)\b/i.test(cleaned), message_count: thread.length, cleaned,
  };
}

// ------------------------------------------------------------------ replying
const cap = (s: string) => s.replace(/^\s*([a-z])/, (_, c) => c.toUpperCase());
const end = (s: string) => /[.!?:]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;
/** Turns the user's shorthand ("accept tue 10am, ask for term sheet") into sentences. */
export function expandIntent(intent: string, r?: EmailReading | null): string[] {
  const parts = String(intent || '').split(/\s*(?:;|\n|,\s*(?=(?:and\s+)?(?:ask|tell|say|confirm|accept|decline|request|send|attach|let|mention|thank|propose|suggest|agree|note|advise|chase|remind|book|schedule|offer|explain|apologi[sz]e)\b)|\band then\b|\bthen\b)\s*/i).map(s => s.trim().replace(/^and\s+/i, '')).filter(Boolean);
  const out: string[] = [];
  for (let p of parts) {
    p = p.replace(/\bu\b/gi, 'you').replace(/\bur\b/gi, 'your').replace(/\bpls|plz\b/gi, 'please').replace(/\btmrw|tmr\b/gi, 'tomorrow').replace(/\basap\b/gi, 'as soon as possible');
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^(?:accept|confirm|agree to|yes to|ok(?:ay)? (?:for|with))\s+(?:the\s+)?(?:meeting|call|time|invitation|invite)?\s*(.*)$/i))) out.push(`I am pleased to confirm${m[1] ? ` ${m[1].replace(/^(for|on|at)\s+/i, (x) => x)}` : ' the proposed time'}`.replace(/confirm (on|at) /i, 'confirm $1 ').replace(/confirm (\w)/, (x) => x));
    else if ((m = p.match(/^(?:decline|reject|say no(?: to)?|can'?t make|cannot make|not available(?: for)?)\s*(.*)$/i))) out.push(`Unfortunately I am unable to ${m[1] ? `accommodate ${m[1]}` : 'accommodate this'} on this occasion`);
    else if ((m = p.match(/^(?:ask|request)\s+(?:them\s+|him\s+|her\s+)?(?:for|to)\s+(.*)$/i))) out.push(/^(send|provide|confirm|share|advise|forward|review|sign|update|arrange|let)/i.test(m[1]) ? `Could you please ${m[1].replace(/^let (me|us)/i, 'let us')}?` : `Could you please send through ${m[1].replace(/^(the|a|an)\s+/i, (x) => x.toLowerCase())}?`);
    else if ((m = p.match(/^(?:ask|request)\s+(?:them\s+|him\s+|her\s+)?(?:if|whether|when|what|how|where|who)\s+(.*)$/i))) { const w = p.match(/\b(if|whether|when|what|how|where|who)\b/i)![1].toLowerCase(); out.push(w === 'if' || w === 'whether' ? `Could you please confirm whether ${m[1]}?` : `Could you please advise ${w} ${m[1]}?`); }
    else if ((m = p.match(/^(?:propose|suggest|offer)\s+(.*)$/i))) out.push(`I would like to propose ${m[1]}`);
    else if ((m = p.match(/^(?:thank (?:them|him|her)|say thanks)\s*(?:for\s+)?(.*)$/i))) out.push(`Thank you${m[1] ? ` for ${m[1]}` : ''}`);
    else if ((m = p.match(/^(?:tell (?:them|him|her)|say|let (?:them|him|her) know|advise(?: them)?|mention|note)\s+(?:that\s+)?(.*)$/i))) out.push(cap(m[1].replace(/\bwe'?ll\b/gi, 'we will').replace(/\bwe'?re\b/gi, 'we are')));
    else if ((m = p.match(/^(?:send|attach)\s+(.*)$/i))) out.push(`Please find attached ${m[1].replace(/^(them|him|her)\s+/i, '')}`);
    else if ((m = p.match(/^(?:apologi[sz]e)\s*(?:for\s+)?(.*)$/i))) out.push(`Please accept my apologies${m[1] ? ` for ${m[1]}` : ''}`);
    else if ((m = p.match(/^(?:chase|remind (?:them|him|her)(?: about| of)?|follow up(?: on)?)\s+(.*)$/i))) out.push(`I am following up on ${m[1]} and would appreciate an update at your earliest convenience`);
    else out.push(cap(p));
  }
  const meet = r?.kind === 'meeting' || /\b(meet|meeting|call)\b/i.test(intent);
  return out.map(s => s.replace(/\btheir\b/gi, 'your').replace(/\bthem\b/gi, 'you').replace(/\bthey are\b/gi, 'you are').replace(/\bthey\b/gi, 'you')
    .replace(/^I am pleased to confirm (?!the |our |that |we )(.+)$/i, (_, x) => `I am pleased to confirm ${meet ? `the meeting on ` : ''}${(meet ? x.replace(/\b(the\s+)?(meeting|call|catch ?up)\b/gi, ' ') : x).replace(/\s{2,}/g, ' ').trim().replace(/^(on|at)\s+/i, '')}`)
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, d => d[0].toUpperCase() + d.slice(1).toLowerCase())
    .replace(/\b(\d{1,2})(am|pm)\b/gi, (_, h, ap) => `${h}${ap.toLowerCase()}`)
    .replace(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d)/g, '$1 at $2'))
    .map(end).map(s => s.replace(/\?\.$/, '?'));
}

const SIGN_OFF: Record<Tone, string> = { professional: 'Kind regards', warm: 'Warm regards', formal: 'Yours sincerely', brief: 'Regards' };
function greeting(first: string, tone: Tone) {
  if (tone === 'formal') return first ? `Dear ${first},` : 'Dear Sir/Madam,';
  if (tone === 'warm') return first ? `Hi ${first},` : 'Hello,';
  return first ? `Dear ${first},` : 'Good day,';
}

/** Writes a reply (when `reading` is given) or a new email, without an AI key. */
export function draftReply(opts: { reading?: EmailReading | null; intent?: string; tone?: Tone; signer: string; project?: { name: string; next_action?: string | null } | null; recipient?: string; subject?: string; persona?: Persona | null; related?: RelatedEmail[] }): { subject: string; body: string } {
  const tone: Tone = opts.tone || 'professional';
  const r = opts.reading || null;
  const P = opts.persona ? PERSONAS[opts.persona] : null;
  const prev = (opts.related || []).filter(x => x.subject)[0];
  const first = r ? r.sender_first : parseAddress(opts.recipient || '').first;
  const lines: string[] = [greeting(first, tone), ''];
  const said = expandIntent(opts.intent || '', r);
  if (r) {
    const topic = r.topic ? ` regarding ${r.topic.replace(/^["']|["']$/g, '')}` : '';
    const open = r.sentiment === 'concerned' ? `Thank you for your email${topic}, and for raising this with us. I understand your concerns and want to address them directly.`
      : r.kind === 'thanks' ? 'Thank you for your kind note — it is much appreciated.'
      : r.kind === 'follow_up' ? `Thank you for following up${topic}, and apologies for the delay in responding.`
      : `Thank you for your email${topic}.`;
    lines.push(tone === 'brief' ? `Thank you for your email${topic}.` : open, '');
    if (prev && tone !== 'brief') lines.push(`Further to our previous correspondence${prev.subject && norm(prev.subject) !== norm(r.topic) ? ` on “${prev.subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '')}”` : ''}${prev.date ? ` (${shortDate(prev.date)})` : ''}, ${P ? P.open.replace(/^(?!I\b)./, c => c.toLowerCase()) : 'I have considered your email in the context of our earlier discussions.'}`, '');
    else if (P && tone !== 'brief') lines.push(r.sentiment === 'concerned' ? P.concerned : P.open, '');
    if (said.length) { lines.push(said.join(' '), ''); }
    const points = [...r.questions.map(q => ({ q, t: 'question' })), ...r.requests.map(q => ({ q, t: 'request' }))].slice(0, 6);
    const used = new Set<string>();
    const answerFor = (q: string) => { const qw = words(q); const hit = said.find(x => !used.has(x) && [...words(x)].filter(w => qw.has(w)).length >= 2); if (hit) used.add(hit); return hit; };
    const answered = points.map(p => ({ ...p, a: answerFor(p.q) }));
    const meetingAnswered = said.some(s => /confirm the meeting|unable to accommodate|propose/i.test(s));
    const open2 = answered.filter(p => !(p.a) && !(meetingAnswered && /\b(meet|meeting|call)\b/i.test(p.q)));
    const free = said.filter(x => !used.has(x));
    if (free.length) lines.splice(lines.length - (said.length ? 2 : 0), said.length ? 2 : 0, free.join(' '), '');
    else if (said.length) lines.splice(lines.length - 2, 2);
    if (answered.some(p => p.a) || (open2.length && tone !== 'brief')) {
      lines.push(P ? P.points : points.length === 1 ? 'In response to your point:' : 'In response to the points you raised:', '');
      answered.filter(p => p.a || open2.includes(p)).forEach((p, i) => lines.push(`${i + 1}. ${tidyPoint(p.q)} — ${p.a ? p.a : p.t === 'question' ? '[your answer]' : '[confirm action / timing]'}`));
      lines.push('');
      if (P && open2.length) lines.push(P.commit, '');
    }
    if (r.kind === 'meeting' && r.dates.length && !meetingAnswered) lines.push(`I note the proposed meeting time of ${formatWhen(new Date(r.dates[0].at))} and will confirm my availability shortly.`, '');
    if (r.attachments.length && !said.some(s => /attached/i.test(s))) lines.push('I have received the attached documents and will review them carefully.', '');
    if (r.deadline && !said.length && !points.some(p => /\b(by|before|deadline|due)\b/i.test(p.q))) lines.push(`I note the timing of ${r.deadline} and will respond accordingly.`, '');
    if (opts.project) lines.push(`For reference, this relates to the ${opts.project.name} project${opts.project.next_action ? `; our next step is to ${opts.project.next_action.replace(/^./, c => c.toLowerCase()).replace(/\.$/, '')}` : ''}.`, '');
    if (!said.length && !points.length) lines.push('[Add your response]', '');
    lines.push(r.urgent ? 'I appreciate this is time-sensitive and will keep you updated.' : P ? P.close : r.sentiment === 'concerned' ? 'Please let me know if you would like to discuss this further by phone.' : 'Please do not hesitate to contact me if you need anything further.');
  } else {
    lines.push(tone === 'warm' ? 'I hope you are well.' : 'I trust this email finds you well.', '');
    if (prev) lines.push(`Further to our previous correspondence on “${prev.subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '')}”${prev.date ? ` (${shortDate(prev.date)})` : ''}:`, '');
    lines.push(said.length ? said.join(' ') : '[Add your message]', '');
    if (opts.project) lines.push(`This relates to the ${opts.project.name} project.`, '');
    lines.push('Please let me know if you have any questions.');
  }
  lines.push('', `${SIGN_OFF[tone]},`, personaSigner(opts.signer, opts.persona, opts.project?.name));
  const subj = r ? (r.topic ? `Re: ${r.topic}` : opts.subject || 'Re:') : (opts.subject || subjectFromIntent(opts.intent || '', opts.project?.name));
  return { subject: subj, body: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}
const norm = (s: string) => String(s || '').toLowerCase().replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
const shortDate = (d: string) => { const x = new Date(d); return isNaN(x.getTime()) ? d : x.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }); };
/** Signer block "Name\nTitle\nBusiness" with the persona's title inserted under the name. */
export function personaSigner(signer: string, persona?: Persona | null, project?: string) {
  if (!persona) return signer;
  const [name, ...rest] = String(signer || '').split('\n');
  const title = PERSONAS[persona].title(project);
  return [name, title, ...rest.filter(l => l.trim() && l.trim() !== title)].join('\n');
}

const STOP = new Set('the a an and or of to for on in at by with from re fw fwd your our my we you i is are be this that it as about regarding update request meeting email follow up following'.split(' '));
const words = (s: string) => new Set(norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)));
/**
 * Ranks earlier emails with the same person by how closely they relate to the current topic
 * (shared subject words, same thread, documents/projects named in both). Highest first.
 */
export function rankRelated(current: { subject: string; body?: string; threadId?: string }, past: RelatedEmail[]): RelatedEmail[] {
  const cs = words(current.subject); const cb = words(String(current.body || '').slice(0, 3000));
  return past.map(p => {
    const ps = words(p.subject); const pb = words(`${p.snippet || ''} ${String(p.body || '').slice(0, 3000)}`);
    let score = 0;
    for (const w of cs) { if (ps.has(w)) score += 3; else if (pb.has(w)) score += 1; }
    for (const w of ps) if (cb.has(w)) score += 1;
    if (current.threadId && p.threadId === current.threadId) score += 2;
    if (p.project) score += 1;
    return { ...p, score };
  }).filter(p => (p.score || 0) >= 3).sort((a, b) => (b.score! - a.score!) || (new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
}

function tidyPoint(s: string) { const t = s.replace(/^(and|also|but|so)\s+/i, '').replace(/\s+/g, ' ').trim(); return t.length > 160 ? `${t.slice(0, 157)}…` : t; }
export function subjectFromIntent(intent: string, project?: string) {
  const t = String(intent || '').replace(/^(ask|tell|let|send|email|write to|remind|request|chase|follow up)\s+(them|him|her|us)?\s*(for|to|if|whether|about|on|that|know)?\s*(send|provide|confirm|share|forward)?\s*(through|over)?\s*(the|a|an|our|your)?\s*/i, '').split(/[,.;\n]/)[0].trim();
  const s = t ? cap(t.replace(/^(about|regarding|re)\s+/i, '')).slice(0, 70) : 'Follow-up';
  return project && !s.toLowerCase().includes(project.toLowerCase()) ? `${s} — ${project}` : s;
}

// ------------------------------------------------------------------ rewriting
export type RewriteMode = 'polish' | 'proofread' | 'shorten' | 'formal' | 'friendly';
const TYPOS: Record<string, string> = { recieve: 'receive', recieved: 'received', seperate: 'separate', definately: 'definitely', occured: 'occurred', untill: 'until', accomodate: 'accommodate', acheive: 'achieve', adress: 'address', beleive: 'believe', calender: 'calendar', commited: 'committed', enviroment: 'environment', goverment: 'government', independant: 'independent', neccessary: 'necessary', necesary: 'necessary', occassion: 'occasion', recomend: 'recommend', refered: 'referred', wich: 'which', teh: 'the', thier: 'their', tommorow: 'tomorrow', tomorow: 'tomorrow', wierd: 'weird', sincerly: 'sincerely', regaurds: 'regards', reguards: 'regards', buisness: 'business', bussiness: 'business', availible: 'available', avaliable: 'available', convinient: 'convenient', confirmd: 'confirmed', alot: 'a lot', aswell: 'as well', infact: 'in fact', thankyou: 'thank you', truely: 'truly', begining: 'beginning', existance: 'existence', foward: 'forward', fowarded: 'forwarded', garantee: 'guarantee', occurence: 'occurrence', paralel: 'parallel', persue: 'pursue', posession: 'possession', preffered: 'preferred', priviledge: 'privilege', recieving: 'receiving', resturant: 'restaurant', succesful: 'successful', sucessful: 'successful', supercede: 'supersede', writting: 'writing', agreeement: 'agreement', aggreement: 'agreement', contruction: 'construction', developement: 'development', managment: 'management', propery: 'property', investmet: 'investment', finacial: 'financial', apreciate: 'appreciate', appriciate: 'appreciate', oppurtunity: 'opportunity', oportunity: 'opportunity', schedual: 'schedule', shedule: 'schedule' };
const CASUAL: [RegExp, string][] = [
  [/\bhey there\b/gi, 'Hello'], [/^hey\b/gim, 'Hi'], [/\bthx\b|\bthnx\b|\bty\b/gi, 'thank you'], [/\bpls\b|\bplz\b/gi, 'please'], [/\bu\b/g, 'you'], [/\bur\b/g, 'your'], [/\br\b(?= (you|we|they)\b)/g, 'are'],
  [/\b(we|you|they)\s+r\b/gi, '$1 are'], [/\bgonna\b/gi, 'going to'], [/\bwanna\b/gi, 'want to'], [/\bgotta\b/gi, 'need to'], [/\bkinda\b/gi, 'somewhat'], [/\byeah\b|\byep\b|\byup\b/gi, 'yes'], [/\bnope\b/gi, 'no'],
  [/\basap\b/gi, 'as soon as possible'], [/\bfyi\b/gi, 'for your information'], [/\bbtw,?\s*/gi, ''], [/\btmrw\b|\btmr\b/gi, 'tomorrow'], [/\bmsg\b/gi, 'message'], [/\binfo\b/gi, 'information'], [/\bdocs\b/gi, 'documents'], [/\bmins\b/gi, 'minutes'], [/\bw\/\s?/gi, 'with '], [/\babt\b/gi, 'about'], [/\bcuz\b|\bcos\b/gi, 'because'], [/\bwk\b/gi, 'week'], [/\bmtg\b/gi, 'meeting'],
  [/\bno worries\b/gi, 'no problem'], [/\bawesome\b/gi, 'excellent'], [/\bcheers\b(?=[,.!]?\s*$)/gim, 'Kind regards'],
];
const CONTRACTIONS: [RegExp, string][] = [[/\bcan't\b/gi, 'cannot'], [/\bwon't\b/gi, 'will not'], [/\bdon't\b/gi, 'do not'], [/\bdoesn't\b/gi, 'does not'], [/\bdidn't\b/gi, 'did not'], [/\bisn't\b/gi, 'is not'], [/\baren't\b/gi, 'are not'], [/\bwasn't\b/gi, 'was not'], [/\bweren't\b/gi, 'were not'], [/\bhaven't\b/gi, 'have not'], [/\bhasn't\b/gi, 'has not'], [/\bwouldn't\b/gi, 'would not'], [/\bshouldn't\b/gi, 'should not'], [/\bcouldn't\b/gi, 'could not'], [/\bI'm\b/g, 'I am'], [/\bI've\b/g, 'I have'], [/\bI'll\b/g, 'I will'], [/\bI'd\b/g, 'I would'], [/\bwe're\b/gi, 'we are'], [/\bwe've\b/gi, 'we have'], [/\bwe'll\b/gi, 'we will'], [/\bwe'd\b/gi, 'we would'], [/\byou're\b/gi, 'you are'], [/\byou've\b/gi, 'you have'], [/\byou'll\b/gi, 'you will'], [/\bthey're\b/gi, 'they are'], [/\bit's\b/gi, 'it is'], [/\bthat's\b/gi, 'that is'], [/\bthere's\b/gi, 'there is'], [/\blet's\b/gi, 'let us']];
const WORDY: [RegExp, string][] = [
  [/\bI just wanted to (let you know|reach out|touch base|check in|follow up)( that| on| regarding)?\b/gi, 'I am writing to $1$2'], [/\bjust wanted to\b/gi, 'wanted to'],
  [/\bin order to\b/gi, 'to'], [/\bat this point in time\b|\bat the present time\b/gi, 'now'], [/\bdue to the fact that\b|\bowing to the fact that\b/gi, 'because'], [/\bin the event that\b/gi, 'if'], [/\bprior to\b/gi, 'before'], [/\bsubsequent to\b/gi, 'after'],
  [/\bwith regard(s)? to\b|\bin relation to\b|\bwith respect to\b/gi, 'regarding'], [/\bin the near future\b/gi, 'soon'], [/\bfor the purpose of\b/gi, 'for'], [/\ba large number of\b/gi, 'many'], [/\bhas the ability to\b/gi, 'can'], [/\bis able to\b/gi, 'can'],
  [/\b(really|very|basically|actually|literally|totally|quite|just|simply|definitely|certainly)\s+(?=\w)/gi, ''], [/\bI think that\b|\bI believe that\b|\bI feel that\b/gi, ''], [/\bplease do not hesitate to\b/gi, 'please'], [/\bat your earliest convenience\b/gi, 'soon'],
  [/\bI hope (this|that) (email|message) finds you well\.?\s*/gi, ''], [/\ba lot of\b|\blots of\b/gi, 'many'], [/\bright now\b/gi, 'now'], [/\bso (that )?we can\b/gi, 'to'], [/\bbefore we can\b/gi, 'before we'], [/\bthat has taken\b/gi, 'taking'], [/\band we('re| are) trying to\b/gi, 'while we'], [/\bhave a look\b/gi, 'review it'], [/\bcan you\b/gi, 'please'], [/\bsorry for the delay,?\s*/gi, 'Apologies for the delay. '], [/\bI trust (this|that) (email|message) finds you well\.?\s*/gi, ''], [/\bas per\b/gi, 'per'], [/\bin addition to this\b/gi, 'also'], [/\bon a (daily|weekly|monthly) basis\b/gi, '$1'],
];

const GREET_RE = /^(dear|hi|hello|good (morning|afternoon|evening|day)|hey)\b/i;
const SIGNOFF_RE = /^(kind regards|best regards|warm regards|regards|many thanks|thanks|thank you|cheers|sincerely|yours sincerely|yours faithfully|best wishes|best)[,!.]?\s*$/i;

function splitParts(body: string) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  let gi = lines.findIndex(l => l.trim());
  const greet = gi >= 0 && GREET_RE.test(lines[gi].trim()) && lines[gi].trim().length < 60 ? lines[gi].trim() : null;
  const startBody = greet ? gi + 1 : 0;
  let si = -1; for (let i = lines.length - 1; i >= startBody; i--) if (SIGNOFF_RE.test(lines[i].trim())) { si = i; break; }
  const signoff = si >= 0 ? lines[si].trim() : null;
  const sig = si >= 0 ? lines.slice(si + 1).join('\n').trim() : '';
  const main = lines.slice(startBody, si >= 0 ? si : undefined).join('\n').trim();
  return { greet, main, signoff, sig };
}
function fixText(t: string, keepCase = false) {
  let s = t;
  s = s.replace(/\b([A-Za-z]+)\b/g, w => { const f = TYPOS[w.toLowerCase()]; if (!f) return w; return /^[A-Z]/.test(w) ? f[0].toUpperCase() + f.slice(1) : f; });
  s = s.replace(/\bi\b(?!\.e\.)/g, 'I').replace(/\bi'(m|ve|ll|d)\b/g, "I'$1");
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/([,.;:!?])(?=[A-Za-z])/g, (m, p, o, str) => /[.]/.test(p) && /\b(e\.g|i\.e|etc|www|com|au)$/i.test(str.slice(Math.max(0, o - 4), o)) ? p : `${p} `);
  s = s.replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?').replace(/\.{4,}/g, '…').replace(/,{2,}/g, ',');
  s = s.replace(/(\d)\s*,\s+(\d{3})\b/g, '$1,$2').replace(/(https?):\s\/\//g, '$1://').replace(/\$\s(\d)/g, '$$$1').replace(/(\d)\.\s(\d)/g, '$1.$2').replace(/(\w)@\s/g, '$1@').replace(/\b(\d{1,2})\s*:\s*(\d{2})\b/g, '$1:$2');
  if (!keepCase) s = s.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_, a, c) => a + c.toUpperCase());
  return s;
}
function finishParagraphs(t: string) {
  return t.split(/\n{2,}/).map(p => {
    const q = p.trim(); if (!q) return '';
    if (/^([-•*]|\d+[.)])\s/m.test(q)) return q; // lists are kept as they are
    return /[.!?:…)"']$/.test(q) || /\[[^\]]+\]$/.test(q) ? q : `${q}.`;
  }).filter(Boolean).join('\n\n');
}
function reparagraph(t: string) {
  // Long single blocks → paragraphs of ~3 sentences
  return t.split(/\n{2,}/).map(p => {
    if (p.length < 500 || /\n/.test(p) || /^([-•*]|\d+[.)])\s/.test(p)) return p;
    const ss = p.split(/(?<=[.!?])\s+(?=[A-Z])/); const out: string[] = [];
    for (let i = 0; i < ss.length; i += 3) out.push(ss.slice(i, i + 3).join(' '));
    return out.join('\n\n');
  }).join('\n\n');
}

/** Rewrites an email body without AI. Greeting, sign-off and signature are kept (and added when missing for polish/formal). */
// Word and phrase upgrades. FORMAL turns everyday business English into senior, formal register;
// FRIENDLY does the reverse; POLISH applies the safe subset (clearer, more professional, same meaning).
const FORMAL_WORDS: [RegExp, string][] = [
  [/\bthanks for\b/gi, 'thank you for'], [/\bthanks\b/gi, 'thank you'], [/\bget back to (me|us)\b/gi, 'respond'], [/\bget back to you\b/gi, 'revert to you'], [/\bneed to\b/gi, 'must'], [/\bI think\b/g, 'I believe'], [/\bwe think\b/gi, 'we believe'], [/\bcan you\b/gi, 'could you please'], [/\bso we can\b/gi, 'so that we may'], [/\bthings\b/gi, 'matters'], [/\bstuff\b/gi, 'matters'], [/\bhave a look\b/gi, 'review it'], [/\blet (me|us) know\b/gi, 'please advise'], [/\bplease please advise\b/gi, 'please advise'],
  [/\bcheck out\b/gi, 'review'], [/\bcheck\b/gi, 'review'], [/\blook into\b/gi, 'investigate'], [/\blook at\b/gi, 'review'], [/\bsort out\b/gi, 'resolve'], [/\bfix\b/gi, 'resolve'], [/\bfind out\b/gi, 'ascertain'],
  [/\bget\b(?! back)/gi, 'obtain'], [/\bgot\b/gi, 'received'], [/\bneed\b/gi, 'require'], [/\bneeds\b/gi, 'requires'], [/\bhelp\b/gi, 'assist'], [/\bstart\b/gi, 'commence'], [/\bend\b(?! of)/gi, 'conclude'],
  [/\bbuy\b/gi, 'purchase'], [/\bshow\b/gi, 'demonstrate'], [/\btell\b/gi, 'inform'], [/\bask for\b/gi, 'request'], [/\bgive\b/gi, 'provide'], [/\bsend over\b|\bsend through\b/gi, 'forward'],
  [/\bbig\b/gi, 'significant'], [/\ba lot of\b|\blots of\b/gi, 'a considerable amount of'], [/\bright now\b/gi, 'at present'], [/\bsoon\b/gi, 'shortly'], [/\bmaybe\b/gi, 'perhaps'],
  [/\babout\b(?= (the|your|our|this|that|a|an)\b)/gi, 'regarding'], [/\bso that\b/gi, 'in order that'], [/\bbut\b/gi, 'however,'], [/\balso,?\b/gi, 'additionally,'], 
  [/\bok(ay)?\b/gi, 'acceptable'], [/\bsorry\b/gi, 'apologies'], [/\bhappy to\b/gi, 'pleased to'], [/\bkeen to\b/gi, 'eager to'], [/\bchat\b/gi, 'discussion'], [/\bcatch up\b|\bcatch-up\b/gi, 'meeting'],
  [/\bhave a look\b/gi, 'review'], [/\bfeel free to\b/gi, 'please do not hesitate to'], [/\bI hope you are well\b|\bhope you'?re well\b/gi, 'I trust this email finds you well'],
];
const FRIENDLY_WORDS: [RegExp, string][] = [
  [/\bI trust this email finds you well\b/gi, 'I hope you are having a good week'], [/\bplease do not hesitate to contact me\b/gi, 'just give me a shout'], [/\bplease do not hesitate to\b/gi, 'feel free to'],
  [/\bplease advise\b/gi, 'let me know'], [/\bat your earliest convenience\b/gi, 'when you get a chance'], [/\bkindly\b/gi, 'please'], [/\bregarding\b/gi, 'about'], [/\bin relation to\b|\bwith respect to\b|\bwith regard to\b/gi, 'about'],
  [/\brequire\b/gi, 'need'], [/\brequires\b/gi, 'needs'], [/\bobtain\b/gi, 'get'], [/\bassist\b/gi, 'help'], [/\bcommence\b/gi, 'start'], [/\bpurchase\b/gi, 'buy'], [/\bascertain\b/gi, 'find out'],
  [/\bI am pleased to\b/gi, "I'm happy to"], [/\bI am writing to\b/gi, "I'm just reaching out to"], [/\bapologies\b/gi, 'sorry'], [/\bhowever,?\b/gi, 'but'], [/\badditionally,?\b/gi, 'also'],
  [/\bI am\b/g, "I'm"], [/\bwe are\b/gi, "we're"], [/\bit is\b/gi, "it's"], [/\bdo not\b/gi, "don't"], [/\bcannot\b/gi, "can't"], [/\bwill not\b/gi, "won't"], [/\bwe will\b/gi, "we'll"], [/\bI will\b/g, "I'll"],
];
const POLISH_WORDS: [RegExp, string][] = [
  [/\bthanks for\b/gi, 'thank you for'], [/^thanks\b/gim, 'Thank you'], [/\bget back to (me|us)\b/gi, 'come back to $1'], [/\bsort out\b/gi, 'resolve'], [/\bcheck out\b/gi, 'review'], [/\bhave a look\b/gi, 'take a look'],
  [/\bok(ay)?\b(?=[.,!?\s])/gi, 'fine'], [/\bsorry for\b/gi, 'apologies for'], [/\ba lot of\b|\blots of\b/gi, 'many'], [/\bright now\b/gi, 'at the moment'], [/\bjust wanted to\b/gi, 'wanted to'],
  [/\bI think\b/g, 'I believe'], [/\bwe think\b/gi, 'we believe'], [/\bcan you\b/gi, 'could you please'], [/\bsend over\b|\bsend through\b/gi, 'send'], [/\bstuff\b/gi, 'items'], [/\bthings\b/gi, 'matters'], [/\bgot\b/gi, 'received'], [/\bkind of\b|\bsort of\b/gi, 'somewhat'],
];
const OPENER_RE = /^(i (hope|trust)|hope you|thank you for|thanks for|good (morning|afternoon))/i;
const CLOSER_RE = /(let me know|do not hesitate|don'?t hesitate|any questions|look forward|reach out|give me a (call|shout)|speak soon|talk soon|contact me)/i;
function splitRunOns(t: string) {
  // "…, I think …" / "…, we need …" → two sentences; long sentences joined with "and" at ~35+ words get split.
  return t.replace(/(?<!\b(?:however|therefore|additionally|also|and|but|so|yet))(?<!\b(?:However|Therefore|Additionally|Also)),\s+(I|we|they|it|this|that)\s+(think|believe|need|will|would|can|have|are|is|was)\b/g, (_, w, v) => `. ${w[0].toUpperCase()}${w.slice(1)} ${v}`)
    .split(/(?<=[.!?])\s+/).map(sn => { const w = sn.split(/\s+/); if (w.length < 35) return sn; const i = sn.search(/,? and (?=[a-z])/i); return i > 40 ? `${sn.slice(0, i).replace(/,$/, '')}. ${sn.slice(i).replace(/^,? and\s+/i, '').replace(/^./, c => c.toUpperCase())}` : sn; }).join(' ');
}
const apply = (t: string, rules: [RegExp, string][]) => rules.reduce((x, [re, r]) => x.replace(re, r), t);

export function rewrite(body: string, mode: RewriteMode, opts: { recipient?: string; signer?: string } = {}): string {
  const { greet, main, signoff, sig } = splitParts(body);
  let m = main;
  const first = parseAddress(opts.recipient || '').first;
  let g = greet, so = signoff;
  if (mode !== 'proofread') for (const [re, r] of CASUAL) m = m.replace(re, r);
  if (mode === 'formal') for (const [re, r] of CONTRACTIONS) m = m.replace(re, r);
  if (mode === 'shorten') {
    for (const [re, r] of WORDY) m = m.replace(re, r);
    // drop repeated closing pleasantries and filler sentences
    m = m.split(/\n{2,}/).map(p => p.split(/(?<=[.!?])\s+/).filter(s => !/^(please (let me know|feel free|contact me)|let me know if you (have|need)|thanks again|thank you again|looking forward to hearing from you)\b/i.test(s.trim()) || p.split(/(?<=[.!?])\s+/).length === 1).join(' ')).filter(p => p.trim()).join('\n\n');
  }
  if (mode === 'formal') m = apply(m, FORMAL_WORDS);
  if (mode === 'friendly') m = apply(m, FRIENDLY_WORDS);
  if (mode === 'polish') m = apply(m, POLISH_WORDS);
  if (mode === 'polish' || mode === 'formal') m = splitRunOns(m);
  m = fixText(m).replace(/\bplease advise\b/g, 'please advise').replace(/(^|[.!?]\s+)please advise/g, (x, a) => `${a}Please advise`).replace(/,\s*however,/gi, '; however,').replace(/\.\s*however,/g, '. However,');
  // Professional opening and closing lines
  const paras = m.split(/\n{2,}/).filter(Boolean);
  if (paras.length) {
    if ((mode === 'polish' || mode === 'formal') && !OPENER_RE.test(paras[0])) paras.unshift(mode === 'formal' ? 'I trust this email finds you well.' : 'I hope you are well.');
    if (mode === 'friendly' && !OPENER_RE.test(paras[0])) paras.unshift('I hope you are having a good week!');
    const last = paras[paras.length - 1];
    if (!CLOSER_RE.test(last)) paras.push(mode === 'formal' ? 'Please do not hesitate to contact me should you require any further information.' : mode === 'friendly' ? 'Thanks so much — speak soon!' : mode === 'polish' ? 'Please let me know if you have any questions.' : '');
    if (mode === 'shorten' && paras.length > 1 && OPENER_RE.test(paras[0]) && /^i (hope|trust)/i.test(paras[0]) && paras[0].length < 80) paras.shift();
    m = paras.filter(Boolean).join('\n\n');
  }
  if (mode !== 'proofread') m = reparagraph(m);
  m = finishParagraphs(m).replace(/\n{3,}/g, '\n\n').trim();
  // Greeting
  if (g) {
    g = g.replace(/^hey\b/i, 'Hi').replace(/[,!.:]*$/, ',');
    if (mode === 'formal') g = g.replace(/^(hi|hello)\b/i, 'Dear');
    if (mode === 'friendly') g = g.replace(/^dear\b/i, 'Hi');
    g = g.replace(/^(\w+)\s+(\w)/, (_, a, b) => `${a[0].toUpperCase()}${a.slice(1).toLowerCase()} ${b.toUpperCase()}`);
  } else if (mode === 'polish' || mode === 'formal' || mode === 'friendly') g = mode === 'friendly' ? (first ? `Hi ${first},` : 'Hi,') : (first ? `Dear ${first},` : 'Good day,');
  // Sign-off
  if (so) {
    so = so.replace(/[!.]*$/, '').replace(/,*$/, ',');
    if (mode === 'formal' && /^(thanks|cheers|best|regards)\b/i.test(so)) so = 'Yours sincerely,';
    if ((mode === 'polish') && /^(thanks|cheers|best)[,]?$/i.test(so)) so = 'Kind regards,';
    if (mode === 'friendly' && /^(yours sincerely|yours faithfully)/i.test(so)) so = 'Warm regards,';
    so = so[0].toUpperCase() + so.slice(1);
  } else if (mode === 'polish' || mode === 'formal' || mode === 'friendly') so = mode === 'formal' ? 'Yours sincerely,' : mode === 'friendly' ? 'Warm regards,' : 'Kind regards,';
  const signature = sig || (so && !signoff && opts.signer ? opts.signer : '');
  return [g, g ? '' : null, m, so ? '' : null, so, signature].filter(x => x !== null && x !== undefined && !(x === '' && false)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Short human summary of what was read (for the "Read by Infinity AI" panel and the bot). */
export function describeReading(r: EmailReading) {
  const out: string[] = [];
  out.push(`From ${r.sender_name || r.sender_email || 'the sender'}${r.topic ? ` about “${r.topic}”` : ''}${r.message_count > 1 ? ` (thread of ${r.message_count} messages)` : ''}.`);
  if (r.urgent) out.push('Marked urgent / time-sensitive.');
  if (r.sentiment === 'concerned') out.push('The sender sounds concerned — reply carefully.');
  if (r.questions.length) out.push(`Questions: ${r.questions.map(q => `“${tidyPoint(q)}”`).join(' ')}`);
  if (r.requests.length) out.push(`Asks you to: ${r.requests.map(q => `“${tidyPoint(q)}”`).join(' ')}`);
  if (r.dates.length) out.push(`Dates mentioned: ${r.dates.map(d => formatWhen(new Date(d.at))).join(', ')}.`);
  if (r.deadline) out.push(`Deadline: ${r.deadline}.`);
  if (r.attachments.length) out.push('Mentions attachments.');
  return out;
}
