// Unit tests for the no-AI-key engines added in 4.1: date parsing, the bot's command parser,
// Drive link parsing, brand-book colour extraction and business naming in Legal AI reports.
// Run: npx -y tsx tests/bot-rules.test.ts
import { parseWhen, stripWhen } from '../lib/when';
import { parseCommand } from '../lib/agent';
import { parseDriveUrl } from '../lib/drive-links';
import { extractBrandHints } from '../lib/brand-book';
import { analyseAgreement } from '../lib/legal/engine';
import { guideFor } from '../lib/app-guide';
import { validAbn, validAcn, extractFacts } from '../lib/business-extract';
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const NOW = new Date('2026-10-09T00:50:00Z'); // Friday 9 Oct 2026, 10:50 Brisbane
const local = (d: Date) => d.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: false });

// --- when
const w = (t: string) => { const r = parseWhen(t, NOW); return r ? local(r.at) : null; };
ok(w('tomorrow 3pm') === 'Sat, 10 Oct, 15:00', 'tomorrow 3pm');
ok(w('friday at 9:30') === 'Fri, 16 Oct, 09:30', 'weekday on the same weekday means next week');
ok(w('in 2 hours') === 'Fri, 9 Oct, 12:50', 'in 2 hours');
ok(w('on 14/10 at 10am') === 'Wed, 14 Oct, 10:00', 'Australian day/month');
ok(w('12 Oct') === 'Mon, 12 Oct, 09:00', 'date without time defaults to 9am');
ok(w('at noon') === 'Fri, 9 Oct, 12:00', 'noon today');
ok(w('at 9am') === 'Sat, 10 Oct, 09:00', 'a time already passed today rolls to tomorrow');
ok(w('budget 2-3 hours') === null && w('nothing here') === null, 'no false dates');
ok(stripWhen('call John tomorrow 3pm', parseWhen('call John tomorrow 3pm', NOW)) === 'call John', 'date words removed from titles');

// --- commands
const members = [{ id: 'u-me', full_name: 'Falah Owner', email: 'owner@rhc.test', role: 'admin' }, { id: 'u-max', full_name: 'Max Member', email: 'member@rhc.test', role: 'member' }, { id: 'u-lena', full_name: 'Lena Legal', email: 'legal@rhc.test', role: 'legal' }];
const ctx: any = { actor: { id: 'u-me', role: 'admin', full_name: 'Falah Owner', email: 'owner@rhc.test' }, members, projects: [{ id: 'p1', name: 'Fortitude Valley Mixed-Use' }], now: NOW, attachments: [] };
const c = (t: string) => parseCommand(t, ctx);
let a: any = c('@ai task: send the MOU to Harbourline for @max due friday 3pm urgent')?.[0];
ok(a?.type === 'create_task' && a.assignee === 'max' && a.priority === 'urgent' && /send the MOU to Harbourline/i.test(a.title) && local(new Date(a.due)) === 'Fri, 16 Oct, 15:00', 'task with assignee, priority and due');
a = c('ask Lena to review the lease by tomorrow')?.[0];
ok(a?.type === 'create_task' && a.assignee === 'Lena' && /review the lease/i.test(a.title) && a.due, '"ask <person> to …" becomes an assigned task');
a = c('remind me tomorrow 9am to call the bank')?.[0];
ok(a?.type === 'set_reminder' && a.for === 'me' && a.title === 'call the bank' && local(new Date(a.when)) === 'Sat, 10 Oct, 09:00', 'reminder for me');
a = c('remind everyone at 4pm to submit timesheets')?.[0];
ok(a?.type === 'set_reminder' && a.for === 'everyone' && /submit timesheets/.test(a.title), 'reminder for everyone');
a = c('schedule a meeting with @lena about the JV on 14/10 at 10am for 30 minutes')?.[0];
ok(a?.type === 'create_meeting' && a.duration_minutes === 30 && a.attendees.includes('lena') && local(new Date(a.starts_at)) === 'Wed, 14 Oct, 10:00', 'meeting with attendee, time and duration');
a = c('note: investor prefers quarterly updates')?.[0];
ok(a?.type === 'add_note' && /quarterly/.test(a.body), 'note');
a = c('draft an MOU for the Fortitude Valley Mixed-Use project with Harbourline Capital')?.[0];
ok(a?.type === 'generate_document' && a.template === 'Memorandum of Understanding' && a.project === 'Fortitude Valley Mixed-Use' && a.counterparty === 'Harbourline Capital', 'draft an MOU for a project with a counterparty');
a = c('prepare a status report for Fortitude Valley Mixed-Use')?.[0];
ok(a?.type === 'generate_document' && a.template === 'Project Status Report', 'status report');
a = c('design a flyer for Fortitude Valley Mixed-Use')?.[0];
ok(a?.type === 'create_design' && a.layout === 'flyer_a4' && a.project === 'Fortitude Valley Mixed-Use', 'design a flyer');
a = c('make a social post for Fortitude Valley Mixed-Use')?.[0];
ok(a?.type === 'create_design' && a.layout === 'social_square', 'social post layout');
a = c('what are my tasks?')?.[0];
ok(a?.type === 'list_tasks' && a.who === 'me', 'list my tasks');
ok(Array.isArray(c('how do I export to Excel?')) && c('how do I export to Excel?')!.length === 0, 'how-to questions go to the guide');
ok(c('what is the deposit in the Harbourline MOU?') === null, 'plain questions are not commands');
ok(guideFor('how do I export to excel')[0]?.topic === 'Exports', 'guide finds the right topic');
ok(guideFor('how can I attach a photo in chat')[0]?.topic === 'Team chat', 'guide: chat files');
const ctxAtt = { ...ctx, attachments: [{ name: 'lease.pdf', text: 'x' }] };
ok(parseCommand('please review this contract, we are the Tenant', ctxAtt)?.[0]?.type === 'review_contract', 'attached contract review');

ok(c('fill in our business details from our documents')?.[0]?.type === 'autofill_business', 'business details from documents');
ok(c('get the logo and ABN from our Google Drive files')?.[0]?.type === 'autofill_business', 'logo/ABN from Drive');
a = c('make a template from Harbourline MOU')?.[0];
ok(a?.type === 'template_from_document' && a.document === 'Harbourline MOU', 'template from a named document');
a = c('update the MOU template from our RHC documents')?.[0];
ok(a?.type === 'update_template' && a.template === 'Memorandum of Understanding', 'update a template from our documents');
ok(validAbn('51 824 753 556') && !validAbn('12 345 678 901') && validAcn('612 345 678') && !validAcn('123 456 789'), 'ABN/ACN checksums');
const F = extractFacts('Prepared by RHC City Pty Ltd ABN 51 824 753 556, 12 Main Street, Fortitude Valley, QLD 4006. Ph 07 3000 1234. www.rhccity.com.au info@rhccity.com.au', ['RHC City', 'RHC']);
ok(F.legal_name[0]?.value === 'RHC City Pty Ltd' && F.abn[0]?.value === '51 824 753 556' && /12 Main Street, Fortitude Valley, QLD 4006/.test(F.address[0]?.value) && F.website[0]?.value === 'www.rhccity.com.au' && F.email[0]?.value === 'info@rhccity.com.au' && /07 3000 1234/.test(F.phone[0]?.value), 'business facts extracted from text');

// --- drive links
ok(parseDriveUrl('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv?usp=sharing') === '1AbCdEfGhIjKlMnOpQrStUv', 'folder link');
ok(parseDriveUrl('https://docs.google.com/document/d/1ZyXwVuTsRqPoNmLkJiHg/edit') === '1ZyXwVuTsRqPoNmLkJiHg', 'Google Doc link');
ok(parseDriveUrl('https://drive.google.com/open?id=1QwErTyUiOpAsDfGhJk') === '1QwErTyUiOpAsDfGhJk', 'open?id= link');
ok(parseDriveUrl('https://drive.google.com/drive/u/0/home') === 'root', 'My Drive home link');
ok(parseDriveUrl('https://example.com/file') === null, 'non-Drive link rejected');

// --- brand book
const hints = extractBrandHints('Primary colour: Navy #13294B. Accent: Gold #C8A45C. Text #1B2433. Background #FFFFFF. RGB 19, 41, 75. Headings in Playfair Display, body in Inter.');
ok(hints.colours.includes('#13294b') && hints.colours.includes('#c8a45c') && !hints.colours.includes('#ffffff'), 'colours found, white ignored');
ok(hints.primary === '#13294b' && hints.accent === '#c8a45c', 'dark primary, light accent');
ok(hints.fonts.includes('Playfair Display') && hints.fonts.includes('Inter'), 'fonts found');

// --- Legal AI speaks for the configured business
const mou = readFileSync(new URL('./fixtures/sample-mou.txt', import.meta.url), 'utf8');
const rhc = analyseAgreement({ text: mou, rhcNames: ['RHC City', 'RHC'] });
ok(/\bRHC\b/.test(JSON.stringify(rhc.findings)), 'default report names RHC');
const other = analyseAgreement({ text: mou.replace(/RHC City/g, 'Acme Developments').replace(/\bRHC\b/g, 'Acme'), rhcNames: ['Acme Developments', 'Acme'], ourName: 'Acme' });
const txt = JSON.stringify({ f: other.findings.map(f => [f.title, f.issue, f.recommendation]), m: other.missing_protections.map(m => [m.why, m.recommendation]), s: other.executive_summary, d: other.disclaimer });
ok(!/\bRHC\b/.test(txt) && /\bAcme\b/.test(txt), 'reports use the business short name, never "RHC"');
ok(other.overall_risk.rating === rhc.overall_risk.rating && other.findings.length === rhc.findings.length, 'same analysis result for a renamed business');
ok(other.findings.every(f => !f.excerpt || !/Acme's/.test(f.excerpt) || mou.includes('x')), 'quoted excerpts are left as written');

// ---- 4.4 actions: open pages, approvals, task status
const t0 = (q: string) => c(q)?.[0] as any;
ok(t0('open approval tab')?.type === 'open_page' && t0('open approval tab')?.page === 'approvals', 'open approval tab → navigate');
ok(t0('go to my tasks')?.page === 'tasks', 'go to my tasks → navigate');
ok(t0('open gmail')?.page === 'gmail' && t0('take me to the calendar')?.page === 'calendar', 'open gmail / calendar');
ok(t0('show my approvals')?.type === 'list_approvals', 'show my approvals → list');
ok(t0('what approvals are waiting for me?')?.type === 'list_approvals', 'what approvals are waiting → list');
ok(t0('approve 1')?.type === 'decide_approval' && t0('approve 1')?.title === '1' && t0('approve 1')?.decision === 'approved', 'approve 1');
const rj = t0('reject the Harbourline MOU because the deposit is too high');
ok(rj?.decision === 'rejected' && /Harbourline MOU/.test(rj.title) && /deposit/.test(rj.note), 'reject with reason');
ok(t0('mark send the MOU as done')?.type === 'update_task' && t0('mark send the MOU as done')?.status === 'done', 'mark task done');
ok(t0('complete task review lease')?.status === 'done' && t0('start task review lease')?.status === 'in_progress', 'complete / start task');
ok(t0('open project Fortitude Valley')?.type === 'open_item' && t0('open project Fortitude Valley')?.name === 'Fortitude Valley', 'open a project by name');
ok(t0('open the latest email from Harbourline')?.type === 'read_email', 'opening an email still reads it');
ok(t0('what are my tasks?')?.type === 'list_tasks', 'tasks question still lists');

console.log(`\nBot & 4.1 rules tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
