// Unit tests for the 4.2 email engine: reading emails, replies by role, earlier-email ranking,
// rewriting, branded HTML and the MIME message sent to Gmail. Run: npx -y tsx tests/email.test.ts
import { readEmail, draftReply, rewrite, rankRelated, stripQuoted, parseAddress, expandIntent, describeReading } from '../lib/email-craft';
import { renderEmailHtml, renderEmailText, buildMime, splitSignature, fromHeader, DEFAULT_DISCLAIMER } from '../lib/email-html';
import { parseCommand, personaFrom } from '../lib/agent';
import { emailState } from '../lib/email-state';
import { tidyEmailText, parseIcs, sanitizeEmailHtml, linkParts } from '../lib/email-clean';

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const NOW = new Date('2026-10-09T00:50:00Z');
const EMAIL = { from: 'Sarah Nguyen <sarah@harbourline.com.au>', subject: 'RE: Fortitude Valley MOU - revised deposit', date: 'Thu, 8 Oct 2026', body: `Hi Falah,

Thanks for sending the draft MOU through. We have reviewed it with our board.

Could you confirm whether the deposit can be reduced to 5%? Also, when will the updated feasibility be ready?

Please send through the latest site plan before Friday 16 Oct. We'd also like to meet on Tuesday at 10am to go through the numbers.

Please find attached our comments.

Kind regards,
Sarah Nguyen
Investment Director
Harbourline Capital

On Mon, 5 Oct 2026 at 9:00, Falah <falah@rhccity.com.au> wrote:
> Hi Sarah, please find the MOU attached.` };

// --- reading
ok(!/please find the MOU attached/.test(stripQuoted(EMAIL.body)) && !/Investment Director/.test(stripQuoted(EMAIL.body)), 'quoted history and signature removed');
ok(stripQuoted('Short reply here.\n\n-----Original Message-----\nFrom: x').trim() === 'Short reply here.', 'Outlook original message removed');
const a = parseAddress('"Nguyen, Sarah" <Sarah@Harbourline.com.au>'); ok(a.first === 'Sarah' && a.email === 'sarah@harbourline.com.au', '"Last, First" names');
ok(parseAddress('info@harbourline.com.au').first === '', 'generic mailbox has no first name');
ok(parseAddress('john.smith@x.com').name === 'John Smith', 'name from address');
const r = readEmail([EMAIL], NOW);
ok(r.sender_first === 'Sarah' && r.topic === 'Fortitude Valley MOU - revised deposit', 'sender and topic');
ok(r.questions.length === 2 && /5%/.test(r.questions[0]), 'questions found');
ok(r.requests.some(x => /site plan/.test(x)), 'requests found');
ok(r.kind === 'meeting' || r.kind === 'documents', 'kind');
ok(new Date(r.dates[0].at).toISOString() === '2026-10-13T00:00:00.000Z', 'meeting date first (Tue 13 Oct 10am Brisbane)');
ok(r.attachments.length === 1 && !!r.deadline, 'attachment and deadline');
ok(describeReading(r).some(x => /Questions/.test(x)), 'reading summary');
ok(readEmail([{ from: 'x@y.com', subject: 'Late payment', body: 'We are still waiting on the invoice payment which is now overdue. This is unacceptable.' }], NOW).sentiment === 'concerned', 'concerned sentiment');

// --- earlier emails
const rel = rankRelated({ subject: r.topic, body: r.cleaned }, [{ subject: 'Christmas party', date: '2026-09-01' }, { subject: 'Fortitude Valley MOU first draft', date: '2026-09-02T00:00:00Z' }, { subject: 'Re: deposit structure', snippet: 'Fortitude Valley MOU deposit 10%', date: '2026-08-01' }]);
ok(rel.length === 2 && rel[0].subject === 'Fortitude Valley MOU first draft', 'related emails ranked, unrelated dropped');

// --- replies by role
const sign = 'Falah Owner\nRHC City Pty Ltd';
const mgr = draftReply({ reading: r, intent: 'accept tuesday 10am, tell them we will send the site plan by Wednesday, ask for their board approval timeline', signer: sign, persona: 'manager', related: rel, project: { name: 'Fortitude Valley Mixed-Use' } }).body;
ok(/^Dear Sarah,/.test(mgr), 'greets the sender by first name');
ok(/Further to our previous correspondence on “Fortitude Valley MOU first draft” \(2 Sept 2026\)/.test(mgr), 'refers to the earlier email');
ok(/confirm the meeting on Tuesday at 10am/.test(mgr), 'meeting accepted from shorthand');
ok(/site plan before Friday 16 Oct\. — We will send the site plan by Wednesday\./.test(mgr), 'point answered from the intent');
ok(/Could you please send through your board approval timeline\?/.test(mgr), '"their" becomes "your"');
ok(/Kind regards,\nFalah Owner\nProject Manager — Fortitude Valley Mixed-Use\nRHC City Pty Ltd$/.test(mgr), 'role title under the name');
const ceo = draftReply({ reading: r, signer: sign, persona: 'ceo' }).body;
ok(/Chief Executive Officer/.test(ceo) && /subject to formal documentation and approval/.test(ceo) && /reviewed your email personally/.test(ceo), 'CEO voice');
const adm = draftReply({ reading: r, signer: sign, persona: 'admin' }).body;
ok(/passed it to the relevant team member/.test(adm) && /\nAdministration\n/.test(adm), 'Admin voice');
const crd = draftReply({ reading: r, signer: sign, persona: 'coordinator' }).body;
ok(/confirm with the Project Manager/.test(crd) && /Project Coordinator/.test(crd), 'Coordinator voice');
ok(draftReply({ reading: r, signer: sign }).subject === 'Re: Fortitude Valley MOU - revised deposit', 'reply subject');
const fresh = draftReply({ intent: 'ask for the updated term sheet by Friday', signer: sign, recipient: 'Sarah Nguyen <s@x.com>', tone: 'warm' });
ok(/^Hi Sarah,/.test(fresh.body) && /Could you please send through the updated term sheet by Friday\?/.test(fresh.body) && /Warm regards,/.test(fresh.body), 'new email from shorthand');
ok(expandIntent('decline the meeting')[0].startsWith('Unfortunately I am unable'), 'decline');

// --- rewriting
const rough = 'hey sarah,\n\nthx for ur msg. i recieved the docs yesterday and we r gonna review them asap , i think the deposit is ok but  we need to check w/ the board!!\n\ncheers\nFalah';
const pol = rewrite(rough, 'polish');
ok(/^Hi Sarah,/.test(pol) && /Thank you for your message\./.test(pol) && /I received the documents/.test(pol) && /we are going to review them as soon as possible/.test(pol) && /with the board!/.test(pol) && !/!!/.test(pol) && /Kind regards,\nFalah$/.test(pol), 'polish fixes casual text, spelling and sign-off');
const frm = rewrite("Hi Sarah,\n\nWe can't make Tuesday, but we're free Wednesday. Thanks!\n\nCheers,\nFalah", 'formal');
ok(/^Dear Sarah,/.test(frm) && /cannot/.test(frm) && /we are free/.test(frm) && /Yours sincerely,/.test(frm), 'formal');
const sh = rewrite('Hi Sarah,\n\nI just wanted to let you know that we have received the documents. In order to progress, we really need the site plan at this point in time due to the fact that the council meeting is soon. Please let me know if you have any questions.\n\nKind regards,\nFalah', 'shorten');
ok(sh.length < 230 && /To progress, we need the site plan now because/.test(sh), 'shorten');
ok(rewrite('Hello John,\n\nteh report is attached.\n\nRegards,\nAmy', 'proofread').includes('The report is attached.'), 'proofread');
ok(/Hi Sarah,/.test(rewrite('Dear Sarah,\n\nI trust this email finds you well.\n\nYours sincerely,\nFalah', 'friendly')), 'friendlier');

// --- branded HTML + MIME
const look: any = { businessName: 'RHC City', legalName: 'RHC City Pty Ltd', abn: '51 824 753 556', address: '12 Main Street, Fortitude Valley QLD 4006', phone: '07 3000 1234', email: 'info@rhccity.com.au', website: 'www.rhccity.com.au', footerText: 'Building better communities', primary: '#13294b', accent: '#c8a45c', font: 'Georgia, serif', logo: { bytes: Buffer.from('89504e470d0a1a0a', 'hex'), mime: 'image/png' }, style: { branded: true, header: 'logo', disclaimer: DEFAULT_DISCLAIMER, show_footer: true, quote_original: true, quote_previous: true, default_persona: null, default_tone: 'professional' } };
const ss = splitSignature(mgr); ok(ss.signoff === 'Kind regards,' && ss.signer[0] === 'Falah Owner' && ss.signer.length === 3, 'signature split');
const html = renderEmailHtml({ subject: 'Re: MOU', body: mgr + '\n\nSee **bold** <script>x</script> www.rhccity.com.au', sig: { mobile: '0400 000 000' }, quoted: { from: 'Sarah <s@x.com>', date: 'Thu', body: 'Original <b>text</b>' }, logoSrc: 'cid:brandlogo', senderEmail: 'falah@rhccity.com.au' }, look);
ok(html.includes('src="cid:brandlogo"') && html.includes('#13294b') && html.includes('#c8a45c'), 'logo and brand colours');
ok(/<ol[^>]*>[\s\S]*<li/.test(html), 'numbered points become a list');
ok(html.includes('ABN 51 824 753 556') && html.includes('12 Main Street') && html.includes('confidential'), 'footer with ABN, address, disclaimer');
ok(html.includes('M 0400 000 000') && html.includes('mailto:falah@rhccity.com.au'), 'contact line in signature');
ok(!html.includes('<script>') && html.includes('&lt;script&gt;') && html.includes('Original &lt;b&gt;text&lt;/b&gt;'), 'content is escaped');
ok(html.includes('wrote:'), 'original quoted');
ok(html.includes('[your answer]') === false || html.includes('background:#fff4d6'), 'placeholders highlighted');
const txt = renderEmailText({ subject: 'x', body: 'Hi,\n\nBody.\n\nKind regards,\nAmy', quoted: { from: 'S', date: 'D', body: 'line1\nline2' } }, look);
ok(/> line1\n> line2/.test(txt) && txt.includes('ABN 51 824 753 556'), 'plain-text alternative');
const mime = buildMime({ from: fromHeader('Falah Owner', 'RHC City', 'falah@rhccity.com.au'), to: 's@x.com', cc: 'a@b.com', subject: 'Re: Café MOU', inReplyTo: '<abc@mail>', references: '<x@m> <abc@mail>', text: 'Hello', html: '<p><img src="cid:brandlogo"></p>', logo: look.logo });
ok(/^From: "Falah Owner \| RHC City" <falah@rhccity\.com\.au>\r\n/.test(mime), 'From display name');
ok(/Subject: =\?UTF-8\?B\?/.test(mime) && /In-Reply-To: <abc@mail>\r\nReferences: <x@m> <abc@mail>/.test(mime), 'encoded subject and threading headers');
ok(/multipart\/related/.test(mime) && /multipart\/alternative/.test(mime) && /Content-ID: <brandlogo>/.test(mime) && /text\/plain/.test(mime) && /text\/html/.test(mime), 'multipart related + alternative with inline logo');
ok(!/multipart\/related/.test(buildMime({ to: 'a@b.com', subject: 's', text: 't', html: '<p>no logo</p>', logo: look.logo })), 'no related part without a cid logo');

// --- bot email commands
const members = [{ id: 'u-me', full_name: 'Falah Owner', email: 'owner@rhc.test', role: 'admin' }];
const ctx: any = { actor: { id: 'u-me', role: 'admin', full_name: 'Falah Owner' }, members, projects: [{ id: 'p1', name: 'Fortitude Valley Mixed-Use' }], now: NOW, attachments: [] };
let c: any = parseCommand('reply to the latest email from Harbourline saying we accept Tuesday 10am, as project manager', ctx)?.[0];
ok(c?.type === 'reply_email' && c.from === 'Harbourline' && /accept Tuesday 10am/.test(c.intent) && c.persona === 'manager', 'reply to latest email, as manager');
c = parseCommand('as CEO reply to sarah@harbourline.com.au and tell them we support the deal in principle', ctx)?.[0];
ok(c?.type === 'reply_email' && c.from === 'sarah@harbourline.com.au' && c.persona === 'ceo', 'reply as CEO to an address');
c = parseCommand('draft an email to sarah@harbourline.com.au about the revised deposit for Fortitude Valley Mixed-Use', ctx)?.[0];
ok(c?.type === 'draft_email' && c.to === 'sarah@harbourline.com.au' && /revised deposit/.test(c.intent) && c.project === 'Fortitude Valley Mixed-Use', 'draft a new email');
c = parseCommand('read the latest email from Harbourline', ctx)?.[0];
ok(c?.type === 'read_email' && c.from === 'Harbourline', 'read latest email');
ok(parseCommand('What needs my attention today?', ctx)?.[0]?.type === 'briefing' && parseCommand('brief me', ctx)?.[0]?.type === 'briefing', 'daily briefing');
ok(personaFrom('reply as the project coordinator to Bob').persona === 'coordinator', 'persona words');
ok(parseCommand('draft an MOU for the Fortitude Valley Mixed-Use project with Harbourline Capital', ctx)?.[0]?.type === 'generate_document', 'documents still work');

// --- inbox status
const mb = 'falah@rhccity.com.au';
const T = (from: string, t: number, labels: string[] = []) => ({ from, internalDate: t, labels });
const base = { subject: 'Re: X2M agreement', mailbox: mb, auto: false, draft: null };
ok(emailState({ ...base, labels: ['UNREAD', 'INBOX'], from: 'Mohan <mohan@x2m.com>', internalDate: 10, thread: [T('Mohan <mohan@x2m.com>', 10)] }).state === 'unread', 'unread');
ok(emailState({ ...base, labels: ['INBOX'], from: 'Mohan <mohan@x2m.com>', internalDate: 10, thread: [T('Mohan <mohan@x2m.com>', 10), T('Ramin <ramin@rhccity.com.au>', 20)] }).state === 'replied', 'replied by a colleague counts');
ok(emailState({ ...base, labels: ['INBOX'], from: 'Mohan <mohan@x2m.com>', internalDate: 10, thread: [T('Mohan <mohan@x2m.com>', 10), T('Ramin <ramin@rhccity.com.au>', 20), T('Mohan <mohan@x2m.com>', 30)] }).state === 'needs_reply', 'they wrote again → needs reply');
ok(emailState({ ...base, labels: ['INBOX'], from: 'Ramin <ramin@rhccity.com.au>', internalDate: 20, thread: [T('Mohan <mohan@x2m.com>', 10), T('Ramin <ramin@rhccity.com.au>', 20)] }).state === 'waiting', 'our email last → waiting on them');
ok(emailState({ ...base, subject: 'Accepted: RHC meeting @ Fri', labels: ['INBOX'], from: 'Ramin <ramin@x.com>', internalDate: 10, thread: [T('Ramin <ramin@x.com>', 10)] }).state === 'fyi', 'calendar acceptance is FYI');
ok(emailState({ ...base, labels: ['INBOX'], from: 'Paul <paul@y.com>', internalDate: 10, thread: [T('Paul <paul@y.com>', 10)], draft: 'awaiting_approval' }).state === 'draft', 'reply drafted');
ok(emailState({ ...base, labels: ['INBOX'], from: 'Paul <paul@y.com>', internalDate: 10, thread: [T('Paul <paul@y.com>', 10)] }).state === 'needs_reply', 'read, unanswered → needs reply');


// ---- 4.3.1 clean email reading
{
  const inv = 'Site meeting\nGuests\nRamin<mailto:r@x.com> - organiser\nView all guest info<https://calendar.google.com/x>\nReply for a@b.com<https://calendar.google.com/y>\nYes<https://calendar.google.com/1>\nNo<https://calendar.google.com/2>\nMaybe<https://calendar.google.com/3>\nMore options<https://calendar.google.com/4>\n\nInvitation from Google Calendar<https://calendar.google.com/>\n\nYou are receiving this email because you are an attendee on the event.';
  const c = tidyEmailText(inv);
  ok(!/mailto|https?:|View all guest|Reply for|^Yes$|Invitation from|receiving this email/m.test(c) && /Ramin - organiser/.test(c), 'calendar invite text tidied');
  const e = parseIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261013T000000Z\r\nORGANIZER;CN=Ramin:mailto:r@x.com\r\nATTENDEE;CN=r@x.com:mailto:r@x.com\r\nATTENDEE;CN=Sarah:mailto:s@x.com\r\nSUMMARY:Site meeting\r\nEND:VEVENT\r\nEND:VCALENDAR');
  ok(e?.title === 'Site meeting' && e.organizer === 'Ramin' && e.guests.join() === 'Sarah' && e.start === '2026-10-13T00:00:00Z', 'ics read into a simple event');
  const h = sanitizeEmailHtml('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">l</a><iframe src=x></iframe><form><input></form></p>');
  ok(!/script|onclick|javascript:|iframe|form|input/i.test(h) && /Hi/.test(h), 'email html made safe');
  ok(linkParts('see https://docs.google.com/document/d/LONGID/edit?usp=sharing').some(p => p.t === 'link' && p.s.length <= 43 && !p.s.includes('?')), 'long links shortened');
}

console.log(`\nEmail engine tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
