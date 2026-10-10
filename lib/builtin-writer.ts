/**
 * Built-in writer — works with no AI key.
 * Turns plain instructions and key points ("write to Alex and tell him to come back tomorrow") into a proper letter or
 * document, and understands simple change requests ("make it shorter", "add a point about the deposit",
 * "change Friday to Monday", "remove the paragraph about parking", "more formal").
 * Deterministic and transparent: it never invents facts — it only rephrases what it is given.
 */
import { Party } from './doc-writer';

const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const end = (s: string, p = '.') => /[.!?:]$/.test(s.trim()) ? s.trim() : `${s.trim()}${p}`;
const titleCase = (s: string) => s.replace(/\b([a-z])([a-z']*)/g, (_m, a: string, b: string) => a.toUpperCase() + b);

/** Third person → second person, for points about the reader ("tell him his order is ready" → "your order is ready"). */
function toYou(s: string): string {
  return s
    .replace(/\b(he|she|they) (is|are|was|were|has|have)\b/gi, (_m, _p, v: string) => `you ${({ is: 'are', are: 'are', was: 'were', were: 'were', has: 'have', have: 'have' } as any)[v.toLowerCase()]}`)
    .replace(/\b(he|she|they)\b/gi, 'you')
    .replace(/\b(him|her|them)\b(?!self)/gi, 'you')
    .replace(/\b(his|their)\b/gi, 'your')
    .replace(/\b(himself|herself|themselves)\b/gi, 'yourself');
}

/** Brisbane-local readable date for "tomorrow" / "today" etc. */
function dateWords(s: string, now = new Date()): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Brisbane' });
  const plus = (n: number) => new Date(now.getTime() + n * 86400000);
  return s.replace(/\btomorrow\b(?!,? (monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i, m => `${m} (${fmt(plus(1))})`)
    .replace(/\bday after tomorrow\b/i, m => `${m} (${fmt(plus(2))})`);
}

/** One instruction or key point → a finished sentence addressed to the reader. */
export function pointToSentence(raw: string, opts: { addressed?: boolean } = {}): string {
  let s = raw.trim().replace(/^[-•*\d.)\s]+/, '').replace(/\s+/g, ' ');
  if (!s) return '';
  const who = '(?:him|her|them|alex|[A-Z][a-z]+|the (?:client|buyer|seller|tenant|team|recipient))';
  let m: RegExpMatchArray | null;
  const you = (x: string) => opts.addressed === false ? x : toYou(x);
  if ((m = s.match(new RegExp(`^(?:please\\s+)?tell ${who} (?:to )(.+)$`, 'i')))) return end(`I would be grateful if you could ${you(m[1])}`);
  if ((m = s.match(new RegExp(`^(?:please\\s+)?tell ${who} (?:that )?(.+)$`, 'i')))) return end(cap(you(m[1])));
  if ((m = s.match(new RegExp(`^(?:please\\s+)?ask ${who} (?:to )(.+)$`, 'i')))) return end(`Could you please ${you(m[1])}`, '?');
  if ((m = s.match(new RegExp(`^(?:please\\s+)?ask ${who} (?:for )(.+)$`, 'i')))) return end(`Could you please provide ${you(m[1])}`, '?');
  if ((m = s.match(new RegExp(`^(?:please\\s+)?ask ${who} (?:if|whether) (.+)$`, 'i')))) return end(`Could you please let me know whether ${you(m[1])}`, '?');
  if ((m = s.match(new RegExp(`^(?:please\\s+)?ask ${who} (?:about )?(.+)$`, 'i')))) return end(`Could you please update me on ${you(m[1])}`, '?');
  if ((m = s.match(new RegExp(`^let ${who} know (?:that )?(.+)$`, 'i')))) return end(`I would like to let you know that ${you(m[1])}`);
  if ((m = s.match(new RegExp(`^(?:inform|advise|notify) ${who} (?:that |of |about )?(.+)$`, 'i')))) return end(`Please be advised that ${you(m[1])}`);
  if ((m = s.match(new RegExp(`^thank ${who} (?:for )?(.+)$`, 'i')))) return end(`Thank you for ${you(m[1])}`);
  if ((m = s.match(new RegExp(`^remind ${who} (?:to )(.+)$`, 'i')))) return end(`This is a friendly reminder to ${you(m[1])}`);
  if ((m = s.match(new RegExp(`^remind ${who} (?:about |of |that )?(.+)$`, 'i')))) return end(`This is a friendly reminder about ${you(m[1])}`);
  if ((m = s.match(new RegExp(`^invite ${who} (?:to )?(.+)$`, 'i')))) return end(`We would be delighted to invite you to ${you(m[1])}`);
  if ((m = s.match(new RegExp(`^(?:apologi[sz]e|say sorry) (?:to ${who} )?(?:for )?(.+)$`, 'i')))) return end(`Please accept our apologies for ${you(m[1])}`);
  if ((m = s.match(/^confirm (?:that )?(.+)$/i))) return end(`I am writing to confirm ${you(m[1])}`);
  if ((m = s.match(/^(?:request|we need|need) (.+)$/i))) return end(`We kindly request ${you(m[1])}`);
  if ((m = s.match(/^(?:mention|say|note|include|add) (?:that )?(.+)$/i))) return end(cap(you(m[1])));
  if ((m = s.match(/^(?:offer|propose) (.+)$/i))) return end(`We are pleased to offer ${you(m[1])}`);
  if ((m = s.match(/^welcome (?:them |him |her )?(?:to )?(.+)$/i))) return end(`Welcome to ${m[1]}`, '!');
  return end(cap(you(s)));
}

/** Pulls the recipient's name and the key points out of a plain request. */
export function readRequest(text: string): { recipientName: string | null; subject: string | null; points: string[]; kind: 'letter' | 'document' | null; tone: 'formal' | 'friendly' | null } {
  let t = String(text || '').replace(/\r/g, '').trim();
  let recipientName: string | null = null; let subject: string | null = null; let kind: 'letter' | 'document' | null = null; let tone: 'formal' | 'friendly' | null = null;
  if (/\b(letter|email|e-mail|note|message|write to|reply to)\b/i.test(t)) kind = 'letter';
  else if (/\b(report|proposal|brochure|flyer|fact sheet|newsletter|announcement|release|summary|document)\b/i.test(t)) kind = 'document';
  if (/\b(formal|professional|firm)\b/i.test(t)) tone = 'formal'; else if (/\b(friendly|warm|casual|relaxed)\b/i.test(t)) tone = 'friendly';
  const sub = t.match(/\b(?:about|regarding|re:?|subject:?)\s+([^,.\n;]{3,80})/i); if (sub) subject = cap(sub[1].trim().replace(/\s+and\s+(tell|ask|let|remind|say|mention|invite|thank).*$/i, ''));
  // "write (this|a letter|an email) to Alex Smith (about …) and tell him …"
  const lead = t.match(/^(?:please\s+)?(?:write|draft|prepare|send|compose|make)\s+(?:this|it|a|an|the)?\s*(?:short\s+|formal\s+|friendly\s+)?(?:letter|email|e-mail|note|message|reply|document)?\s*(?:to|for)\s+([A-Za-z][\w'.-]*)/i);
  if (lead) {
    const STOP = /^(and|about|regarding|re|to|from|with|that|saying|telling|asking|please|on|for|by)$/i;
    let rest = t.slice(lead[0].length); const names = [lead[1]];
    for (let i = 0; i < 2; i++) { const w = rest.match(/^\s+([A-Z][\w'.-]*)/); if (!w || STOP.test(w[1])) break; names.push(w[1]); rest = rest.slice(w[0].length); }
    recipientName = titleCase(names.join(' ')); t = rest; if (!kind) kind = 'letter';
  }
  if (sub) t = t.replace(new RegExp(`\\b(?:about|regarding|re:?|subject:?)\\s+${sub[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '');
  t = t.replace(/^(?:please\s+)?(?:write|draft|prepare|compose)\s+(?:this|it|a|an|the)?\s*(?:short\s+|formal\s+|friendly\s+)?(?:letter|email|e-mail|note|message|document)?\s*/i, '');
  t = t.replace(/^\s*(?:and|,|:|-)\s*/i, '').replace(/\b(?:in a |keep it |make it )(?:formal|friendly|professional|short|brief)(?: tone)?\b/gi, '');
  const parts = t.split(/\n+|;|\s*•\s*|(?:,\s*(?:and\s+)?(?=(?:tell|ask|let|remind|say|mention|invite|thank|confirm|offer|apologi[sz]e|include|note|request)\b))|(?:,?\s+and\s+(?=(?:tell|ask|let|remind|say|mention|invite|thank|confirm|offer|apologi[sz]e|include|note|request)\b))|(?:\.\s+)/i)
    .map(x => x.trim().replace(/^(?:and|also|then)\s+/i, '').replace(/[.]+$/, '')).filter(x => x.length > 2);
  return { recipientName, subject, points: parts, kind, tone };
}

const OPENERS = {
  formal: (subject: string | null) => subject ? `I am writing in relation to ${subject.charAt(0).toLowerCase() + subject.slice(1)}.` : 'I am writing to follow up with you.',
  friendly: (subject: string | null) => subject ? `I hope you are well. I wanted to get in touch about ${subject.charAt(0).toLowerCase() + subject.slice(1)}.` : 'I hope you are well. I wanted to get in touch with a quick update.',
};

/** A first draft with no AI: letter body, or a structured document from the template + points. */
export function builtinDraft(o: { request: string; tone?: 'formal' | 'friendly' | null; asLetter: boolean; recipient: Party; sender: Party; templateText?: string | null; docName?: string | null; projectName?: string | null }): { body: string; subject: string | null; recipient: Party; reply: string } {
  const r = readRequest(o.request);
  const recipient = { ...o.recipient }; if (!recipient.name && r.recipientName) recipient.name = r.recipientName;
  const tone = r.tone || o.tone || 'formal';
  const sentences = r.points.map(p => dateWords(pointToSentence(p))).filter(Boolean);
  const subject = r.subject || (o.projectName ? o.projectName : null);
  if (o.asLetter) {
    const contact = [o.sender.phone, o.sender.email].filter(Boolean);
    const paras = [OPENERS[tone](subject), ...groupSentences(sentences),
      contact.length ? `If you have any questions, please contact me on ${contact.join(' or ')}.` : 'If you have any questions, please do not hesitate to contact me.',
      tone === 'friendly' ? 'Thanks again, and I look forward to hearing from you.' : 'Thank you for your attention to this matter.'];
    return { body: paras.join('\n\n'), subject, recipient, reply: `I wrote the letter${recipient.name ? ` to ${recipient.name}` : ''} from your ${sentences.length === 1 ? 'point' : `${sentences.length} points`}. Tell me what to change — for example "make it friendlier", "add that the site visit is at 10am", or "change tomorrow to Monday".` };
  }
  const title = o.docName || subject || 'Document';
  const lines = [`# ${title}`];
  if (sentences.length) lines.push('', '## Overview', sentences[0], ...(sentences.length > 1 ? ['', '## Key points', ...sentences.slice(1).map(s => `- ${s}`)] : []));
  if (o.templateText?.trim()) lines.push('', o.templateText.replace(/^#?\s*[A-Z][A-Z0-9 &,'()/—–.:-]{3,}\n/, '').trim());
  return { body: lines.join('\n'), subject, recipient, reply: `I built the ${title.toLowerCase()} from your points${o.templateText ? ' and the template' : ''}. Ask me to add, remove or reword anything.` };
}

function groupSentences(s: string[]): string[] {
  // 1–2 sentences per paragraph, so it reads like a letter rather than a list
  const out: string[] = [];
  for (let i = 0; i < s.length; i += 2) out.push(s.slice(i, i + 2).join(' '));
  return out;
}

const FORMAL: [RegExp, string][] = [[/\bHi\b/g, 'Dear'], [/\bHello\b/g, 'Dear'], [/\bThanks\b/g, 'Thank you'], [/\bCheers,?/g, 'Kind regards,'], [/\bKind regards,/g, 'Yours sincerely,'], [/\bcan't\b/gi, 'cannot'], [/\bwon't\b/gi, 'will not'], [/\bdon't\b/gi, 'do not'], [/\bdoesn't\b/gi, 'does not'], [/\bI'm\b/g, 'I am'], [/\bwe're\b/gi, 'we are'], [/\bit's\b/gi, 'it is'], [/\blet's\b/gi, 'let us'], [/\bget in touch\b/gi, 'contact us'], [/\bASAP\b/g, 'as soon as possible'], [/\bquick\b/gi, 'brief']];
const FRIENDLY: [RegExp, string][] = [[/\bYours sincerely,/g, 'Kind regards,'], [/\bYours faithfully,/g, 'Kind regards,'], [/\bI am writing in relation to\b/g, 'I wanted to get in touch about'], [/\bI am writing to follow up with you\./g, 'I hope you are well.'], [/\bPlease be advised that\b/g, 'Just to let you know,'], [/\bdo not hesitate to\b/g, 'feel free to'], [/\bThank you for your attention to this matter\./g, 'Thanks so much — speak soon.'], [/\bWe kindly request\b/g, 'Could we please have']];
const FILLER = /^(I hope you are well\.?|I hope this (email|letter) finds you well\.?|Thank you for your attention to this matter\.?|Thanks again,.*|Please do not hesitate to contact me.*|If you have any questions, please.*)$/i;

/** Simple change requests with no AI. Returns null when the request isn't understood. */
export function builtinRevise(doc: string, request: string, ctx: { asLetter?: boolean } = {}): { content: string; reply: string; title?: string } | null {
  const q = request.trim(); let m: RegExpMatchArray | null; let d = doc;
  const unq = (s: string) => s.trim().replace(/^["“'‘]|["”'’]$/g, '').trim();
  // replace / change X to Y
  if ((m = q.match(/^(?:please\s+)?(?:replace|change|swap|update)\s+["“']?(.+?)["”']?\s+(?:to|with|into|for)\s+["“']?(.+?)["”']?\.?$/i)) && !/^(the )?(tone|title|heading|length)\b/i.test(m[1])) {
    const from = unq(m[1]), to = unq(m[2]);
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); const n = (d.match(re) || []).length;
    if (!n) return { content: doc, reply: `I couldn't find "${from}" in the document — check the spelling, or select the text in "Edit text" and change it there.` };
    d = d.replace(re, (x) => x[0] === x[0].toUpperCase() ? cap(to) : to);
    return { content: d, reply: `Changed "${from}" to "${to}" (${n} place${n === 1 ? '' : 's'}).` };
  }
  // title
  if ((m = q.match(/^(?:change|set|rename)\s+(?:the\s+)?(?:title|heading|name)\s+(?:to\s+)?["“']?(.+?)["”']?\.?$/i))) {
    const t = unq(m[1]);
    if (/^# /m.test(d)) d = d.replace(/^# .*$/m, `# ${t}`); else if (/^\*\*Re: .*\*\*$/m.test(d)) d = d.replace(/^\*\*Re: .*\*\*$/m, `**Re: ${t}**`); else d = `# ${t}\n\n${d}`;
    return { content: d, reply: `Title changed to "${t}".`, title: t };
  }
  // remove
  if ((m = q.match(/^(?:please\s+)?(?:remove|delete|drop|take out)\s+(?:the\s+)?(?:clause|section)\s+(\d+(?:\.\d+)?)\b/i))) {
    const num = m[1]; const lines = d.split('\n');
    const start = lines.findIndex(l => new RegExp(`^(#{1,3}\\s+)?${num.replace('.', '\\.')}\\.?\\s`).test(l.trim()));
    if (start < 0) return { content: doc, reply: `I couldn't find clause ${num}.` };
    const isHead = /^(#{1,3}\s+)?\d+\.?\s+[A-Z]/.test(lines[start].trim()) && !num.includes('.');
    let stop = start + 1;
    if (isHead) while (stop < lines.length && !/^(#{1,3}\s+)?\d+\.?\s+[A-Z][A-Z]/.test(lines[stop].trim()) && !/^#{1,2}\s/.test(lines[stop])) stop++;
    else while (stop < lines.length && /^\s*\([a-z]+\)|^\s*\([ivx]+\)/.test(lines[stop])) stop++;
    lines.splice(start, stop - start);
    return { content: lines.join('\n').replace(/\n{3,}/g, '\n\n'), reply: `Removed clause ${num}. Numbering of later clauses is unchanged — tell me if you want it renumbered by an AI writer, or edit the numbers in "Edit text".` };
  }
  if ((m = q.match(/^(?:please\s+)?(?:remove|delete|drop|take out)\s+(?:the\s+)?(?:paragraph|line|sentence|point|bit|part|section|clause)?\s*(?:about|on|regarding|that mentions|mentioning|with|containing|saying)?\s*["“']?(.+?)["”']?\.?$/i))) {
    const what = unq(m[1]).toLowerCase(); const blocks = d.split(/\n\n/);
    const words = what.split(/\s+/).filter(w => w.length > 2);
    const idx = blocks.findIndex(b => words.length && words.every(w => b.toLowerCase().includes(w)));
    if (idx < 0) return { content: doc, reply: `I couldn't find a paragraph about "${what}".` };
    // remove only the matching line if the block is a list or long section
    const lines = blocks[idx].split('\n');
    if (lines.length > 1) { const li = lines.findIndex(l => words.every(w => l.toLowerCase().includes(w))); if (li >= 0) { lines.splice(li, 1); blocks[idx] = lines.join('\n'); } else blocks.splice(idx, 1); }
    else blocks.splice(idx, 1);
    return { content: blocks.filter(b => b.trim()).join('\n\n'), reply: `Removed the part about "${what}".` };
  }
  // add clause / heading / point
  if ((m = q.match(/^(?:please\s+)?add\s+(?:a\s+|an\s+)?(?:new\s+)?(?:clause|condition|term)\s+(?:about|for|on|that|saying|:)?\s*(.+)$/i))) {
    const text = end(cap(m[1].trim()));
    const lines = d.split('\n');
    const nums = lines.map(l => l.trim().match(/^(?:#{1,3}\s+)?(\d+)\.\s+[A-Z]/)).filter(Boolean).map(x => Number(x![1]));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    const heading = cap(m[1].trim().split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:]$/, '')).toUpperCase();
    const block = `## ${next}. ${heading}\n${next}.1 ${text}`;
    const sigAt = lines.findIndex(l => /^(#{1,3}\s+)?(EXECUTION|SIGNED|EXECUTED|SCHEDULE)\b/i.test(l.trim()) || /^\*\*Executed by/i.test(l.trim()));
    if (sigAt > 0) lines.splice(sigAt, 0, block, ''); else lines.push('', block);
    return { content: lines.join('\n'), reply: `Added clause ${next} (${heading.toLowerCase()}). Check the wording — the built-in writer copies your words as the clause text.` };
  }
  if ((m = q.match(/^(?:please\s+)?add\s+(?:a\s+)?(?:heading|section)\s+(?:called\s+)?["“']?(.+?)["”']?\.?$/i))) {
    return { content: insertBeforeClose(d, `## ${unq(m[1])}\n[●]`, ctx), reply: `Added the section "${unq(m[1])}" — tell me what to put under it.` };
  }
  if ((m = q.match(/^(?:please\s+)?(?:add|include|mention|also\s+(?:say|mention|add|tell|ask))\s+(?:a\s+)?(?:paragraph|point|line|sentence|note)?\s*(?:about|saying|that|:)?\s*(.+)$/i)) || /^(?:tell|ask|let|remind|thank|invite|confirm|apologi[sz]e)\b/i.test(q)) {
    const point = m ? m[1] : q; const s = dateWords(pointToSentence(point));
    const isList = /^- /m.test(d) && !ctx.asLetter;
    return { content: insertBeforeClose(d, isList ? `- ${s}` : s, ctx), reply: `Added: "${s}"` };
  }
  // tone
  if (/\b(more\s+)?(formal|professional|firmer|serious)\b/i.test(q) && q.split(/\s+/).length <= 6) { let c = d; for (const [a, b] of FORMAL) c = c.replace(a, b); return { content: c, reply: c === d ? 'It already reads formally — tell me which part to firm up.' : 'Made the wording more formal.' }; }
  if (/\b(friendlier|more friendly|warmer|casual|relaxed|softer)\b/i.test(q) && q.split(/\s+/).length <= 6) { let c = d; for (const [a, b] of FRIENDLY) c = c.replace(a, b); return { content: c, reply: c === d ? 'It already reads in a friendly way — tell me which part to soften.' : 'Made the wording friendlier.' }; }
  // shorter
  if (/\b(shorter|more concise|cut it down|too long|trim)\b/i.test(q)) {
    const blocks = d.split(/\n\n/); const kept = blocks.filter(b => !FILLER.test(b.trim()));
    const c = kept.map(b => b.split('\n').length === 1 && b.length > 420 ? b.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ') : b).join('\n\n');
    return { content: c, reply: c === d ? 'There is nothing obvious to cut — tell me which part to remove.' : 'Made it shorter — removed the pleasantries and trimmed long paragraphs.' };
  }
  // addressed to / signed by
  if ((m = q.match(/^(?:address|send|write)\s+(?:it|this)?\s*to\s+([A-Za-z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2})\.?$/i))) {
    const n = titleCase(m[1]); const first = n.split(/\s+/)[0];
    const c = d.replace(/^Dear [^,\n]+,/m, `Dear ${first},`);
    return { content: c, reply: c === d ? `There's no "Dear …" line to change — set the recipient in "To" and I'll write it as a letter.` : `Now addressed to ${n}. Update the address block in "To" if needed.` };
  }
  return null;
}

function insertBeforeClose(d: string, block: string, ctx: { asLetter?: boolean }) {
  const lines = d.split('\n');
  const close = lines.findIndex(l => /^(Kind regards|Yours sincerely|Yours faithfully|Regards|Best regards|Warm regards|Thank you for your attention|If you have any questions|Thanks again)/i.test(l.trim()));
  const sig = lines.findIndex(l => /^(#{1,3}\s+)?(EXECUTION|SIGNED|EXECUTED)\b/i.test(l.trim()));
  const at = close >= 0 ? close : sig >= 0 ? sig : -1;
  if (at >= 0) { lines.splice(at, 0, block, ''); return lines.join('\n').replace(/\n{3,}/g, '\n\n'); }
  return `${d.trimEnd()}\n\n${block}`;
}

export const BUILTIN_HELP = 'Without an AI writer I can do these: "replace Friday with Monday", "add a point that the deposit is 10%", "add a clause about insurance", "remove the paragraph about parking", "remove clause 7", "make it shorter", "more formal", "friendlier", "change the title to …", "address it to John Smith". For free-form rewriting, connect an AI writer in Settings → AI.';
