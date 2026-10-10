// Weekly Board Meeting Record end-to-end: create a record → branded PDF → re-open → edit → send for signatures to
// two signers → each signs (no account) → the final signed copy carries both signatures, names and certificates;
// editing after sending makes a new version; viewers cannot write.
// Usage (test database only): BASE=http://localhost:3300 node tests/board-record-e2e.mjs
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const results = []; let current = '';
const ok = (c, m) => { results.push({ group: current, ok: !!c, msg: m }); console.log(`  ${c ? '✓' : '✗'} ${m}`); };
const group = g => { current = g; console.log(`\n▶ ${g}`); };
async function login(email, password) { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`login ${email}: ${error.message}`); return data.session.access_token; }
const client = token => { const call = async (method, path, body) => { const h = token ? { Authorization: `Bearer ${token}` } : {}; let payload; if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); } const r = await fetch(BASE + path, { method, headers: h, body: payload }); const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() }; }; return { get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p) }; };
const owner = client(await login('owner@rhc.test', 'Owner-Pass-12345'));
const viewer = client(await login('viewer@rhc.test', 'Team-Pass-12345'));
const anon = client(null);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNkYPhfz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC';
const pdfOf = async url => { const r = await fetch(BASE + url); const b = Buffer.from(await r.arrayBuffer()); return { ok: r.ok && b.slice(0, 4).toString() === '%PDF', bytes: b, pdf: await PDFDocument.load(b).catch(() => null) }; };
/** Number of images/forms a page uses (signature images are added as images). */
const xobjects = (pdf, i) => { const xo = pdf.getPage(i).node.Resources()?.lookup(PDFName.of('XObject')); return xo instanceof PDFDict ? xo.keys().length : 0; };
/** The document's extracted text, on one line (table cells wrap long text over several lines). */
const textOf = async id => String((await owner.get(`/api/documents/${id}`)).data?.document?.content_text || '').replace(/\s+/g, ' ');
let r;

const ATTENDEES = ['Alex Ehsani', 'Ramin Ahmadi', 'Payam Moradi', 'Amir Ranjbar', 'Mahdi Gorji'];
const AGENDA = [
  ['Ms. Rita Anwarian will be updated tomorrow. She was appointed as Investment Promotion Consultant for Middle East area for 5K monthly for 3 months and it can be extended for another 3 months. Mr. Azizi could come to Australia early April.', 'Team'],
  ['Since there is already a company Qshac Pty Ltd, there is no need for another company as Lotus Prime. Therefore, Rita contract was signed under Qshac Pty Ltd.', 'Team'],
  ['All members shall update the tasks in Todoist and follow up the communications and tasks.', 'Team'],
  ['Since we will have the accountant so no need to have the accounting form anymore. Alex and Mr. Gorji will follow up with the accountant afterwards.', 'Alex & Mr. Gorji'],
  ['Amir already sent the request to CBRE for selling price and then to check with Dr. Amirsharafi', 'Amir'],
  ['Amir will discuss with Greg that just the down part of the land (17hr) will be contracted and the concept design / Block massing will be started.', 'Amir'],
  ['Taiwanese trip also will be postponed.', 'Team'],
  ['Due to the mayor works with the Cyclone the trip will be postponed. 3 weeks delay for the cyclone problems.', 'Team'],
  ['The PMC contract will be sent to be prepared and comments will be discussed. The costing is based on Cordel software. The feasibility study will be under negotiation with PMC as well.', 'Team'],
  ['Alex and Amir attended in a conference for the investment in Dubai.', 'Team'],
  ['To avoid any Family problem in the Board of Director meeting it would be better to have no family members in the Board of Director Meetings.', 'Team'],
  ['Accounting, auditing, tax and bookkeeping will be under Mr. Gorji and Alex responsibility based on the agreement we had before.', 'Mr. Gorji & Alex'],
];
const NO = String(5000 + Math.floor(Math.random() * 4000));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const record = {
  date: today, meeting_no: NO, time: '21:30', called_by: 'Alex Ehsani', location: 'Arana Hills Office', note_taker: 'Payam Moradi', attendees: ATTENDEES, guests: '', absents: '',
  agenda: AGENDA.map(([text, presenter]) => ({ text, presenter, attachment: '' })),
  decisions: ['Rita Anwarian\'s contract stays under Qshac Pty Ltd.'],
  actions: [{ action: 'Send the PMC contract for preparation and circulate comments.', responsible: 'Amir Ranjbar', due: today }, { action: 'Hand over the accounting files to the accountant.', responsible: 'Alex & Mr. Gorji', due: today }],
  previous_minutes: 'Minutes of the previous meeting were read and approved.', other_notes: 'Next meeting next Monday.',
};

group('Create a record');
r = await owner.get('/api/board-meetings');
ok(r.status === 200 && Array.isArray(r.data.records) && r.data.template && typeof r.data.template.note_taker === 'string', 'list opens with a pre-filled new record');
ok((await viewer.post('/api/board-meetings', { record })).status === 403, 'viewers cannot create records');
ok((await anon.get('/api/board-meetings')).status === 401, 'sign-in required');
r = await owner.post('/api/board-meetings', { record });
ok(r.status === 201 && /Weekly Board Meeting Record/.test(r.data.document?.name) && /\.pdf$/.test(r.data.document?.name), `record saved as a PDF in Documents (${r.data.document?.name})`);
const ID = r.data.document?.id;
ok(r.data.record?.signature_blocks === 5, 'one signature block per attendee by default');

group('The PDF');
let one = (await owner.get(`/api/board-meetings/${ID}`)).data;
const orig = await pdfOf(one.pdf_url);
const PAGES = orig.pdf?.getPageCount() || 0;
ok(orig.ok && PAGES >= 2, `branded PDF made (${PAGES} pages)`);
ok(Math.round(orig.pdf.getPage(0).getWidth()) === 595 && Math.round(orig.pdf.getPage(0).getHeight()) === 842, 'A4 portrait');
const text = await textOf(ID);
ok(/WEEKLY BOARD MEETING RECORD/.test(text), 'titled WEEKLY BOARD MEETING RECORD');
ok(['Meeting Information', 'Agenda Items', 'Decisions', 'New Action Items', 'Approval of Previous Minutes', 'Other Notes & Information', 'Signatures'].every(h => text.includes(h)), 'has every section of the old minutes');
ok(/Page 1 of \d/.test(text) && text.includes('Amirsharafi') && text.includes('Board of Director Meetings'), 'page numbers and all agenda text are in it');
const sigPart = text.slice(text.indexOf('By signing below'));
ok(sigPart.length > 20 && !ATTENDEES.some(n => sigPart.includes(n)), 'no names are printed in the signature blocks');
const docRow = (await owner.get(`/api/documents?category=board_minutes`)).data.documents || [];
ok(docRow.some(d => d.id === ID), 'listed in Documents under the board_minutes category');

group('Re-open and edit');
ok(one.record?.agenda?.length === 12 && one.record.attendees.length === 5 && one.record.note_taker === 'Payam Moradi', 'record re-opens with all its data');
ok(one.blocks?.length === 5 && one.blocks.every(b => b.fields.length === 3 && ['signature', 'name', 'date'].every(k => b.fields.some(f => f.kind === k)) && b.fields.every(f => f.x >= 0 && f.y >= 0 && f.x + f.w <= 1 && f.y + f.h <= 1 && f.page < PAGES)), 'each signature block has its signature, name and date boxes');
r = await owner.get('/api/board-meetings');
ok(r.data.records[0]?.id === ID && r.data.template.meeting_no === String(Number(NO) + 1), `newest first, and the next record suggests No. ${Number(NO) + 1}`);
ok(r.data.template.attendees.length === 5 && r.data.template.location === 'Arana Hills Office', 'the next record keeps the same board and location');
r = await owner.patch(`/api/board-meetings/${ID}`, { record: { ...record, decisions: [...record.decisions, 'The Taiwan trip is postponed by 3 weeks.'] } });
ok(r.status === 200 && r.data.new_version === false && r.data.document.id === ID, 'editing before sending updates the same record');
one = (await owner.get(`/api/board-meetings/${ID}`)).data;
ok(one.record.decisions.length === 2 && (await textOf(ID)).includes('Taiwan trip is postponed'), 'the PDF is re-generated with the change');

group('Send for signatures (2 signers)');
const send = (i, name, email, extra = {}) => owner.post('/api/sign-requests', { document_id: ID, title: one.title, signer_name: name, signer_email: email, fields: one.blocks[i].fields, ...extra });
const s1 = await send(0, 'Alex Ehsani', 'alex.board@client.example');
const s2 = await send(1, 'Ramin Ahmadi', 'ramin.board@client.example', { email: false });
ok(s1.status === 201 && s2.status === 201 && s1.data.email_draft_id && !s2.data.email_draft_id, 'one signing link per signer (with an email draft when asked)');
const t1 = s1.data.link.split('/sign/')[1], t2 = s2.data.link.split('/sign/')[1];
one = (await owner.get(`/api/board-meetings/${ID}`)).data;
ok(one.requests.length === 2 && one.requests.find(x => x.signer_email === 'alex.board@client.example')?.block === 0 && one.requests.find(x => x.signer_email === 'ramin.board@client.example')?.block === 1, 'each request is on its own signature block');
r = await anon.get(`/api/sign/${t1}`);
ok(r.status === 200 && r.data.fields.length === 3 && r.data.fields.every(f => f.page === one.blocks[0].page), 'signer 1 opens the link: their three boxes only');

group('Signer 1 signs');
r = await anon.post(`/api/sign/${t1}`, { name: 'Alex J. Ehsani', signature: PNG, agree: true });
ok(r.status === 200 && r.data.signed, 'signer 1 signs');
r = await anon.get(`/api/sign/${t2}`);
const shown = await pdfOf(r.data.pdf_url);
ok(r.status === 200 && shown.pdf?.getPageCount() === PAGES + 1, 'signer 2 sees the copy that already has signature 1 (+1 certificate page)');

group('Signer 2 signs');
r = await anon.post(`/api/sign/${t2}`, { name: 'Ramin K. Ahmadi', signature: PNG, agree: true });
ok(r.status === 200 && r.data.signed, 'signer 2 signs');
ok((await anon.post(`/api/sign/${t2}`, { name: 'Ramin K. Ahmadi', signature: PNG, agree: true })).status === 409, 'cannot sign twice');

group('Final signed document');
one = (await owner.get(`/api/board-meetings/${ID}`)).data;
ok(one.requests.every(x => x.status === 'signed') && one.signed?.signatures === 2, 'both requests signed');
const final = await pdfOf(one.signed.url);
ok(final.ok && final.pdf.getPageCount() === PAGES + 2, `final copy = the record + 2 signing certificates (${final.pdf?.getPageCount()} pages)`);
const finalId = one.signed.document_id;
const ft = await textOf(finalId);
ok((ft.match(/Alex J\. Ehsani/g) || []).length >= 2 && (ft.match(/Ramin K\. Ahmadi/g) || []).length >= 2, 'both typed names are on it (in their blocks and on the certificates)');
ok(/Signed by: Alex J\. Ehsani/.test(ft) && /Signed by: Ramin K\. Ahmadi/.test(ft), 'both signing certificates are kept');
const fdoc = (await owner.get(`/api/documents/${finalId}`)).data.document;
const reqs = (await owner.get(`/api/sign-requests?document_id=${ID}`)).data.requests;
const first = reqs.find(x => x.signer_email === 'alex.board@client.example');
ok(fdoc.metadata?.signed_from === ID && fdoc.metadata?.builds_on === first.signed_document_id, 'signature 2 was added to the copy signed by signer 1');
ok(/signed by Alex Ehsani, Ramin K\. Ahmadi/.test(fdoc.name), `final copy is named after both signers (${fdoc.name})`);
const sigPage = one.blocks[0].page;
const added = xobjects(final.pdf, sigPage) - xobjects(orig.pdf, sigPage);
ok(added >= 2, `the signature page carries both signature images (+${added} images)`);
const s1doc = await pdfOf((await owner.get(`/api/documents/${first.signed_document_id}/pdf`)).data.url);
ok(s1doc.pdf?.getPageCount() === PAGES + 1, 'the intermediate copy (signer 1 only) is kept too');

group('Changes after sending');
r = await owner.patch(`/api/board-meetings/${ID}`, { record: { ...record, other_notes: 'Corrected after signing.' } });
ok(r.status === 200 && r.data.new_version === true && r.data.document.id !== ID, 'editing a sent record saves a new version');
const NEW = r.data.document.id;
one = (await owner.get(`/api/board-meetings/${ID}`)).data;
ok(one.superseded_by === NEW, 'the sent version points to the new one');
ok((await owner.patch(`/api/board-meetings/${ID}`, { record })).status === 409, 'the old version cannot be edited again');
r = await owner.get('/api/board-meetings');
ok(r.data.records.some(x => x.id === NEW) && !r.data.records.some(x => x.id === ID), 'the list shows only the latest version');
const nv = (await owner.get(`/api/board-meetings/${NEW}`)).data;
ok(nv.version === 2 && nv.previous_version === ID && nv.requests.length === 0, 'the new version is v2 and not yet sent');
ok((await owner.get(`/api/board-meetings/${finalId}`)).status === 404, 'a signed copy is not itself a record');

console.log(`\n${results.filter(x => x.ok).length}/${results.length} passed`);
process.exit(results.every(x => x.ok) ? 0 : 1);
