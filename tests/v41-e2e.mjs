// Infinity Planet 4.1 end-to-end tests: business identity & logo, AI bot actions (built-in engine),
// team-chat files/history/bot, chat history, reminders, Excel/Word/PDF exports, Drive links, signed file links.
// Usage (test database only — it creates data): BASE=http://localhost:3300 node tests/v41-e2e.mjs
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const FX = new URL('./fixtures/', import.meta.url);
const results = []; let current = '';
const ok = (cond, msg) => { results.push({ group: current, ok: !!cond, msg }); if (!cond) console.log(`  ✗ ${msg}`); };
const group = (g) => { current = g; console.log(`\n▶ ${g}`); };
async function login(email, password) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`login ${email}: ${error.message}`);
  return data.session.access_token;
}
function client(token) {
  const call = async (method, path, body, raw = false) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {}; let payload;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + path, { method, headers, body: payload }); if (raw) return r;
    const ct = r.headers.get('content-type') || ''; const data = ct.includes('json') ? await r.json() : await r.text();
    return { status: r.status, data };
  };
  return { get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p), raw: (m, p) => call(m, p, undefined, true) };
}
const file = (name, type) => new File([readFileSync(new URL(name, FX))], name, { type });
const owner = client(await login('owner@rhc.test', 'Owner-Pass-12345'));
const legal = client(await login('legal@rhc.test', 'Team-Pass-12345'));
const member = client(await login('member@rhc.test', 'Team-Pass-12345'));
const viewer = client(await login('viewer@rhc.test', 'Team-Pass-12345'));
const anon = client(null);
// These suites test role-based approvals without naming approvers (4.3 requires named approvers by default).
await owner.patch('/api/settings', { approvals_require_approver: false });
const me = (await member.get('/api/me')).data.user;
const ownerMe = (await owner.get('/api/me')).data.user;
let r;

group('Status & migrations');
r = await owner.get('/api/system/status');
ok(r.status === 200 && r.data.supabase.migration_v4 === true, 'migrations 004 + 005 detected as applied');
r = await anon.get('/api/health');
ok(r.data.app === 'Infinity Planet' && r.data.version === JSON.parse(readFileSync('package.json', 'utf8')).version, 'health reports the Infinity Planet version (desktop app check)');

group('Business identity & logo');
r = await anon.get('/api/brand');
ok(r.status === 200 && r.data.app_name === 'Infinity Planet' && r.data.business_name === 'RHC City' && r.data.short_name === 'RHC', 'public brand endpoint: product + default business');
ok((await member.patch('/api/settings', { business_name: 'Hacker Co' })).status === 403, 'members cannot change the business name');
r = await owner.patch('/api/settings', { business_name: 'Infinity Test Developments', business_short_name: 'ITD', brand_style: { primary: '#123456', accent: '#d4a017', font: 'sans', footer_text: 'Building better places', website: 'www.itd.test', letterhead: true } });
ok(r.status === 200 && r.data.settings.business_name === 'Infinity Test Developments', 'admin sets business name, colours and footer');
r = await anon.get('/api/brand');
ok(r.data.business_name === 'Infinity Test Developments' && r.data.short_name === 'ITD', 'brand change is visible immediately');
let fd = new FormData(); fd.append('file', file('scanned-hoa.png', 'image/png'));
ok((await member.post('/api/brand/logo', fd)).status === 403, 'members cannot upload the logo');
ok((await anon.raw('POST', '/api/brand/logo')).status === 401, 'logo upload needs sign-in');
fd = new FormData(); fd.append('file', new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'x.svg', { type: 'image/svg+xml' }));
ok((await owner.post('/api/brand/logo', fd)).status === 400, 'SVG with script rejected');
fd = new FormData(); fd.append('file', file('scanned-hoa.png', 'image/png'));
r = await owner.post('/api/brand/logo', fd);
ok(r.status === 200 && r.data.brand.logo_url?.startsWith('/api/brand/logo?v='), 'admin uploads PNG logo');
const logoRes = await anon.raw('GET', '/api/brand/logo');
ok(logoRes.status === 200 && logoRes.headers.get('content-type') === 'image/png' && (await logoRes.arrayBuffer()).byteLength > 1000, 'logo served publicly for the sign-in page');
r = await owner.get('/api/settings');
ok(r.data.settings.ai_system_instructions.includes('{{business}}'), 'AI instructions follow the business name (template)');

group('AI bot actions (built-in engine, no AI key)');
const ask = (c, message, extra = {}) => c.post('/api/ai/chat', { message, provider: 'search', allow_actions: true, ...extra });
const P = (await owner.post('/api/projects', { name: 'Kangaroo Point Towers', status: 'active', location: 'Kangaroo Point QLD', project_type: 'Residential', deal_value: 42000000, description: 'Two residential towers with river views.', highlights: 'River frontage\nApproved DA\n240 apartments', risk: 'medium' })).data.project;
r = await ask(owner, 'task: send the MOU to Harbourline for @max due tomorrow 3pm urgent');
const A1 = r.data.message?.metadata?.actions?.[0];
ok(r.status === 200 && A1?.type === 'create_task' && A1.ok && /Max Member/.test(A1.summary), 'bot creates a task assigned to @max');
const conv = r.data.conversation_id;
r = await member.get('/api/tasks?assigned=me');
const T1 = r.data.tasks.find(t => /send the MOU to Harbourline/i.test(t.title));
ok(T1 && T1.priority === 'urgent' && T1.due_at, 'task exists for Max with priority and due date');
r = await member.get('/api/reminders');
ok(r.data.reminders.some(x => x.task_id === T1?.id), 'task reminder created for the assignee');
r = await ask(owner, 'remind everyone tomorrow at 4pm to submit timesheets');
ok(r.data.message.metadata.actions[0]?.ok && /everyone/.test(r.data.message.metadata.actions[0].summary), 'bot sets a reminder for everyone');
r = await member.get('/api/reminders');
ok(r.data.reminders.some(x => /submit timesheets/.test(x.title) && x.recipient_id === null), 'everyone-reminder visible to other members');
r = await ask(owner, 'schedule a meeting with @lena about the Kangaroo Point Towers JV on 14/10 at 10am for 30 minutes', { conversation_id: conv });
const A3 = r.data.message.metadata.actions[0];
ok(A3?.type === 'create_meeting' && A3.ok && /legal@rhc.test/.test(A3.summary), 'bot books a meeting with Lena as attendee');
ok(r.data.conversation_id === conv, 'same conversation continues (chat history)');
r = await owner.get(`/api/calendar/events?from=${encodeURIComponent('2026-10-01T00:00:00Z')}&to=${encodeURIComponent('2027-12-31T00:00:00Z')}`);
const EV = r.data.events.find(e => /JV/.test(e.title));
ok(EV && (EV.ends_at && new Date(EV.ends_at) - new Date(EV.starts_at) === 30 * 60_000) && EV.project_id === P.id, 'meeting saved with 30-minute duration and linked project');
r = await ask(owner, 'note: investor prefers quarterly updates for Kangaroo Point Towers');
ok(r.data.message.metadata.actions[0]?.type === 'add_note' && r.data.message.metadata.actions[0].ok, 'bot saves a note');
r = await ask(owner, 'what are my tasks?');
ok(r.data.message.metadata.actions[0]?.type === 'list_tasks', 'bot lists tasks');
r = await ask(owner, 'prepare a status report for Kangaroo Point Towers');
const A6 = r.data.message.metadata.actions[0];
ok(A6?.type === 'generate_document' && A6.ok && A6.href?.startsWith('/drafting/'), 'bot generates a Project Status Report');
const REP = (await owner.get(A6.href.replace('/drafting/', '/api/generated/'))).data.generated;
ok(REP && /PROJECT STATUS REPORT — Kangaroo Point Towers/.test(REP.body) && /Infinity Test Developments/.test(REP.body) && /send the MOU to Harbourline/i.test(REP.body) === false, 'report built from live records and the business name');
r = await ask(owner, 'draft an MOU for the Kangaroo Point Towers project with Harbourline Capital');
const A7 = r.data.message.metadata.actions[0];
ok(A7?.type === 'generate_document' && A7.ok && /Memorandum of Understanding/.test(A7.summary), 'bot drafts an MOU');
const MOU = (await owner.get(A7.href.replace('/drafting/', '/api/generated/'))).data.generated;
ok(/Harbourline Capital/.test(MOU.body) && /\(ITD\)/.test(MOU.body) && !/\(RHC\)|BY RHC/.test(MOU.body), 'MOU uses the counterparty and the business short name');
r = await ask(owner, 'design a flyer for Kangaroo Point Towers');
const A8 = r.data.message.metadata.actions[0];
ok(A8?.type === 'create_design' && A8.ok && /with your logo/.test(A8.summary), 'bot creates a branded design');
const DS = (await owner.get(`/api/marketing/assets/${A8.id}`)).data.asset;
ok(DS.design.theme.primary === '#123456' && DS.design.content.logo_image?.startsWith('/api/brand/logo') && DS.design.content.headline === 'Kangaroo Point Towers', 'design uses brand colours, logo and project facts');
const html = await (await owner.raw('GET', `/api/marketing/assets/${A8.id}/render`)).text();
ok(/data:image\/png;base64,/.test(html) && /DRAFT — NOT APPROVED/.test(html), 'rendered design embeds the logo and is watermarked until approved');
r = await ask(owner, 'how do I export to Excel?');
ok(/Excel/.test(r.data.message.content) && !r.data.message.metadata.actions.length, 'bot teaches how to use the app');
r = await ask(owner, 'help');
ok(/Tasks:.*Reminders:/s.test(r.data.message.content), 'help lists what the bot can do');
r = await ask(owner, 'remind me to call the bank');
ok(r.data.message.metadata.actions[0]?.ok === false && /need a time/i.test(r.data.message.content), 'missing time is reported, nothing invented');
r = await ask(owner, 'task: chase council for @nobodyhere');
ok(r.data.message.metadata.actions[0]?.ok === false && /couldn't find/i.test(r.data.message.content), 'unknown person is reported, nothing invented');
ok((await ask(viewer, 'task: something')).status === 403, 'viewers cannot use the bot to act');

group('Chat history');
r = await owner.get('/api/ai/conversations');
ok(r.data.conversations.some(c => c.id === conv), 'conversation saved in history');
r = await owner.get(`/api/ai/conversations?q=${encodeURIComponent('Harbourline')}`);
ok(r.data.conversations.some(c => c.id === conv), 'history search finds message text');
r = await owner.patch(`/api/ai/conversations/${conv}`, { title: 'Harbourline MOU planning', pinned: true });
ok(r.status === 200 && r.data.conversation.pinned && r.data.conversation.title === 'Harbourline MOU planning', 'rename and pin');
r = await owner.get('/api/ai/conversations');
ok(r.data.conversations[0].id === conv, 'pinned conversation listed first');
ok((await member.patch(`/api/ai/conversations/${conv}`, { title: 'x' })).status === 403, 'others cannot rename my conversation');
r = await owner.get(`/api/ai/conversations/${conv}`);
ok(r.data.messages.filter(m => m.role === 'user').length === 2 && r.data.messages.some(m => m.metadata?.actions?.length), 'full message history with actions kept');

group('Team chat: files, history, search, AI bot');
fd = new FormData(); fd.append('channel', 'general'); fd.append('body', 'Site photos and the MOU'); fd.append('file', file('scanned-hoa.png', 'image/png')); fd.append('file', file('sample-mou.pdf', 'application/pdf'));
r = await member.post('/api/team/messages', fd);
ok(r.status === 201 && r.data.message.attachments.length === 2 && r.data.message.attachments[0].url.startsWith('/api/files/'), 'message with photo + PDF attachments');
const att = r.data.message.attachments;
let fr = await anon.raw('GET', att[0].url);
ok(fr.status === 200 && fr.headers.get('content-type') === 'image/png' && /inline/.test(fr.headers.get('content-disposition')), 'photo opens inline from a signed link (no token needed in <img>)');
fr = await anon.raw('GET', att[1].download);
ok(fr.status === 200 && /attachment/.test(fr.headers.get('content-disposition')) && (await fr.arrayBuffer()).byteLength > 1000, 'PDF downloads');
ok((await anon.raw('GET', att[0].url.slice(0, -3) + 'abc')).status === 403, 'tampered file link rejected');
ok((await viewer.post('/api/team/messages', { channel: 'general', body: 'hi' })).status === 403, 'viewers cannot post');
fd = new FormData(); fd.append('channel', 'general'); fd.append('file', new File([Buffer.alloc(10)], 'empty.txt', { type: 'text/plain' }));
ok((await member.post('/api/team/messages', fd)).status === 201, 'file-only message allowed');
for (let i = 0; i < 65; i++) await member.post('/api/team/messages', { channel: 'deals', body: `history message ${i}` });
r = await member.get('/api/team/messages?channel=deals');
ok(r.data.messages.length === 60 && r.data.has_more && r.data.messages.at(-1).body === 'history message 64', 'latest 60 messages with "has more"');
r = await member.get(`/api/team/messages?channel=deals&before=${encodeURIComponent(r.data.messages[0].created_at)}`);
ok(r.data.messages.length === 5 && r.data.messages[0].body === 'history message 0' && !r.data.has_more, 'older messages load (nothing is lost)');
r = await member.get('/api/team/messages?channel=deals&q=message%2042');
ok(r.data.messages.length === 1 && r.data.messages[0].body === 'history message 42', 'search a channel');
r = await member.post('/api/team/messages?wait=1', { channel: 'general', body: '@ai task: check the site photos due friday' });
ok(r.status === 201 && r.data.bot === true, '@ai mention triggers the bot');
r = await member.get('/api/team/messages?channel=general');
const bot1 = r.data.messages.filter(m => m.is_bot).at(-1);
ok(bot1 && bot1.sender_id === null && bot1.bot_meta.actions[0]?.type === 'create_task' && bot1.bot_meta.actions[0].ok, 'bot replies in the channel and creates the task');
r = await member.post('/api/team/messages?wait=1', { channel: 'ai-assistant', body: 'what are my tasks?' });
r = await member.get('/api/team/messages?channel=ai-assistant');
ok(r.data.messages.some(m => m.is_bot && /check the site photos/i.test(m.body)), '"Ask Infinity AI" channel answers without @ai');
fd = new FormData(); fd.append('channel', 'legal'); fd.append('body', '@ai please review this contract, we are the Purchaser'); fd.append('file', file('sample-mou.txt', 'text/plain'));
r = await (async () => { const res = await fetch(BASE + '/api/team/messages?wait=1', { method: 'POST', headers: { Authorization: `Bearer ${await login('legal@rhc.test', 'Team-Pass-12345')}` }, body: fd }); return { status: res.status, data: await res.json() }; })();
ok(r.status === 201, 'contract attached in chat');
r = await legal.get('/api/team/messages?channel=legal');
const bot2 = r.data.messages.filter(m => m.is_bot).at(-1);
ok(bot2?.bot_meta?.actions?.[0]?.type === 'review_contract' && bot2.bot_meta.actions[0].ok && /Critical|High/i.test(bot2.body), 'bot reads the attachment and runs the Legal AI review');
r = await member.post('/api/team/messages?wait=1', { channel: 'general', body: '@ai what is the deposit in the MOU?' });
r = await member.get('/api/team/messages?channel=general');
ok(r.data.messages.filter(m => m.is_bot).at(-1)?.body.length > 20, 'bot answers questions from documents');

group('Reminders');
r = await member.post('/api/reminders', { title: 'Team stand-up', remind_at: new Date(Date.now() + 3600_000).toISOString(), recipient_id: 'everyone' });
ok(r.status === 201 && r.data.reminder.recipient_id === null, 'reminder for everyone');
r = await legal.get('/api/reminders');
ok(r.data.reminders.some(x => x.title === 'Team stand-up'), 'visible to the whole team');
ok((await member.post('/api/reminders', { title: 'x', remind_at: 'not a date' })).status === 400, 'invalid time rejected');
r = await member.patch(`/api/tasks/${T1.id}`, { remind_at: new Date(Date.now() + 7200_000).toISOString() });
r = await member.patch(`/api/tasks/${T1.id}`, { remind_at: new Date(Date.now() + 9000_000).toISOString() });
r = await member.get('/api/reminders');
ok(r.data.reminders.filter(x => x.task_id === T1.id).length === 1, 'editing a task reminder replaces it (no duplicates)');

group('Exports: Excel, Word and PDF with letterhead');
for (const kind of ['tasks', 'projects', 'deals', 'contacts', 'legal']) {
  const x = await owner.raw('GET', `/api/export/${kind}`);
  const buf = Buffer.from(await x.arrayBuffer());
  let rows = -1; try { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); rows = wb.worksheets[0].rowCount; } catch {}
  ok(x.status === 200 && /spreadsheetml/.test(x.headers.get('content-type')) && rows >= 3, `${kind} → Excel (${rows} rows)`);
}
const wbx = new ExcelJS.Workbook(); await wbx.xlsx.load(Buffer.from(await (await owner.raw('GET', '/api/export/tasks')).arrayBuffer()));
ok(wbx.worksheets[0].getCell(1, 1).value === 'Infinity Test Developments — Tasks' && wbx.worksheets[0].getCell(3, 1).value === 'Task', 'Excel has business title and headers');
ok((await anon.raw('GET', '/api/export/tasks')).status === 401, 'exports need sign-in');
r = await member.post('/api/approvals', { entity_type: 'generated_document', entity_id: MOU.id });
r = await legal.patch(`/api/approvals/${r.data.approval.id}`, { status: 'approved', note: 'ok' });
const pdf = await owner.raw('GET', `/api/generated/${MOU.id}/export?format=pdf`);
const pdfBuf = Buffer.from(await pdf.arrayBuffer());
ok(pdf.status === 200 && pdf.headers.get('content-type') === 'application/pdf' && pdfBuf.subarray(0, 5).toString() === '%PDF-', 'approved MOU exports to PDF');
const { getDocumentProxy, extractText } = await import('unpdf');
const pdfText = (await extractText(await getDocumentProxy(new Uint8Array(pdfBuf)), { mergePages: true })).text;
ok(/Infinity Test Developments/.test(pdfText) && /Building better places/.test(pdfText) && /Page 1 of/.test(pdfText) && /MEMORANDUM OF UNDERSTANDING/.test(pdfText), 'PDF has letterhead, footer and page numbers');
const docx = await owner.raw('GET', `/api/generated/${MOU.id}/export?format=docx`);
const dBuf = Buffer.from(await docx.arrayBuffer());
const mammoth = (await import('mammoth')).default;
ok(docx.status === 200 && dBuf.subarray(0, 2).toString() === 'PK' && /MEMORANDUM OF UNDERSTANDING/.test((await mammoth.extractRawText({ buffer: dBuf })).value), 'approved MOU exports to Word');
ok(dBuf.includes(Buffer.from('word/media/')) || dBuf.toString('latin1').includes('media/image'), 'Word export contains the logo image');

group('Google Drive links & previews (Google not connected in tests)');
r = await owner.get('/api/google/drive/links');
ok(r.status === 200 && Array.isArray(r.data.links), 'links list');
r = await owner.post('/api/google/drive/links', { url: 'https://example.com/not-drive' });
ok(r.status === 400 && /Google Drive link/.test(r.data.error), 'non-Drive link rejected with a clear message');
r = await owner.post('/api/google/drive/links', { url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv' });
ok(r.status === 409 && /not connected/i.test(r.data.error), 'honest error when Google is not connected');
ok((await viewer.post('/api/google/drive/links', { url: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv' })).status === 403, 'viewers cannot add links');

group('Brand book');
fd = new FormData(); fd.append('file', new File(['Brand guidelines. Primary colour Navy #0F2A4A, accent Copper #C27C4A. Headings in Montserrat. Tone: confident, warm, plain English. Always write "ITD" not "I.T.D."'], 'brand-book.txt', { type: 'text/plain' })); fd.append('category', 'brand_book');
r = await owner.post('/api/documents/upload', fd);
ok(r.status === 201 && r.data.results[0].document.category === 'brand_book', 'document tagged as brand book');
r = await owner.get('/api/brand/detect');
ok(r.data.primary === '#0f2a4a' && r.data.accent === '#c27c4a' && r.data.fonts.includes('Montserrat'), 'colours and font read from the brand book');
ok((await member.get('/api/brand/detect')).status === 403, 'brand detection is admin/marketing only');

group('Photo & spreadsheet reader');
const wbIn = new ExcelJS.Workbook(); const ws = wbIn.addWorksheet('Budget'); ws.addRow(['Item', 'Cost']); ws.addRow(['Demolition', 125000]); ws.addRow(['Civil works', 480000]);
fd = new FormData(); fd.append('file', new File([Buffer.from(await wbIn.xlsx.writeBuffer())], 'budget.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
r = await owner.post('/api/documents/upload', fd);
ok(r.status === 201 && r.data.results[0].extraction.status === 'indexed' && r.data.results[0].extraction.method === 'xlsx-text', 'Excel files are read and indexed');
r = await owner.get('/api/knowledge/search?q=Civil%20works');
ok(r.data.results.some(x => /Civil works \| 480000/.test(x.content)), 'spreadsheet contents searchable');

group('Business details & templates from your documents');
fd = new FormData(); fd.append('file', new File([`ITD LETTERHEAD\nInfinity Test Developments Pty Ltd ABN 51 824 753 556\nLevel 5, 100 Eagle Street, Brisbane City, QLD 4000\nPhone 07 3123 4567 · info@infinitytest.com.au · www.infinitytest.com.au\n\nDear Sir/Madam, thank you for your enquiry.\nKind regards`], 'ITD letterhead.txt', { type: 'text/plain' }));
await owner.post('/api/documents/upload', fd);
fd = new FormData(); fd.append('file', file('scanned-hoa.png', 'image/png').slice(0, undefined, 'image/png'), 'itd-logo.png');
r = await owner.post('/api/documents/upload', fd);
ok(r.status === 201, 'logo image (itd-logo.png) uploaded as a document');
await owner.patch('/api/settings', { business_name: 'Infinity Test Developments', business_short_name: 'ITD', rhc_entity_details: {} });
r = await owner.get('/api/brand/autofill');
ok(r.status === 200 && r.data.proposal.abn[0]?.value === '51 824 753 556', 'valid ABN found (checksum verified)');
ok(r.data.proposal.legal_name[0]?.value === 'Infinity Test Developments Pty Ltd', 'legal name found');
ok(/100 Eagle Street, Brisbane City, QLD 4000/.test(r.data.proposal.address[0]?.value || ''), 'address found');
ok(r.data.proposal.email[0]?.value === 'info@infinitytest.com.au' && r.data.proposal.website[0]?.value === 'www.infinitytest.com.au' && /07 3123 4567/.test(r.data.proposal.phone[0]?.value || ''), 'email, website and phone found');
ok(r.data.logos.some(l => l.name === 'itd-logo.png'), 'logo image found by name');
ok((await member.get('/api/brand/autofill')).status === 403, 'only admins can read business details for autofill');
const logoDoc = r.data.logos.find(l => l.name === 'itd-logo.png');
r = await owner.post('/api/brand/autofill', { details: { name: 'Infinity Test Developments Pty Ltd', abn: '51 824 753 556', address: r.data.proposal.address[0].value, website: 'www.infinitytest.com.au' }, logo_document_id: logoDoc.id });
ok(r.status === 200 && r.data.changed.includes('logo') && r.data.entity.abn === '51 824 753 556', 'admin applies details and logo');
ok((await anon.get('/api/brand')).data.logo_url?.startsWith('/api/brand/logo'), 'logo now set from the document');
r = await ask(owner, 'fill in our business details from our documents');
ok(r.data.message.metadata.actions[0]?.type === 'autofill_business' && r.data.message.metadata.actions[0].ok, 'bot fills business details from documents');
r = await ask(member, 'fill in our business details from our documents');
ok(r.data.message.metadata.actions[0]?.ok === false && /admin/i.test(r.data.message.content), 'bot refuses business changes for non-admins');
let mouDoc = (await owner.get('/api/documents?limit=500')).data.documents.find(d => d.name === 'sample-mou.txt');
if (!mouDoc) { const f2 = new FormData(); f2.append('file', file('sample-mou.txt', 'text/plain')); f2.append('category', 'mou'); await (async () => { const res = await fetch(BASE + '/api/documents/upload', { method: 'POST', headers: { Authorization: `Bearer ${await login('owner@rhc.test', 'Owner-Pass-12345')}` }, body: f2 }); return res.json(); })(); mouDoc = (await owner.get('/api/documents?limit=500')).data.documents.find(d => d.name === 'sample-mou.txt'); }
r = await owner.post('/api/templates/from-document', { document_id: mouDoc.id });
const NT = r.data.template;
ok(r.status === 201 && NT.status === 'draft' && NT.category === 'mou' && /\{\{counterparty\}\}/.test(NT.body) && r.data.placeholders.includes('counterparty'), 'template built from a real MOU with placeholders (draft until approved)');
ok(!/Harbourline Capital Holdings Pty Ltd/.test(NT.body), "the other party's name is replaced by a placeholder");
const tpls = (await owner.get('/api/templates')).data.templates;
const MOUT = tpls.find(t => t.name.startsWith('Memorandum of Understanding'));
r = await owner.post(`/api/templates/${MOUT.id}/learn`, { document_ids: [mouDoc.id] });
ok(r.status === 200 && r.data.template.version === MOUT.version + 1 && r.data.template.status === 'draft' && r.data.template.metadata.previous_body === MOUT.body, 'MOU template updated from our MOU — new draft version, old wording kept in history');
ok((await owner.post(`/api/templates/${MOUT.id}/learn`, { document_ids: [] })).status === 400, 'learning needs at least one document');
r = await ask(owner, 'make a template from sample-mou');
ok(r.data.message.metadata.actions[0]?.type === 'template_from_document' && r.data.message.metadata.actions[0].ok, 'bot builds a template from a named document');
r = await ask(owner, 'update the MOU template from our RHC documents');
ok(r.data.message.metadata.actions[0]?.type === 'update_template' && r.data.message.metadata.actions[0].ok, 'bot updates the MOU template from matching documents');

group('Team accounts: bulk add & sign-up requests');
const stamp = Date.now();
r = await owner.post('/api/team/members/bulk', { emails: `ramin.${stamp}@rhc.test, hassan.${stamp}@rhc.test\nnot-an-email`, role: 'member' });
ok(r.status === 201 && r.data.results.filter(x => x.ok).length === 2 && r.data.results.find(x => x.email === 'not-an-email')?.ok === false, 'two accounts created at once, bad email reported');
const ramin = r.data.results.find(x => x.ok);
ok(ramin.full_name.startsWith('Ramin') && ramin.password.length >= 14, 'name taken from email, strong temporary password');
ok(!!(await login(ramin.email, ramin.password)), 'new member can sign in with the temporary password');
ok((await member.post('/api/team/members/bulk', { emails: 'x@rhc.test' })).status === 403, 'only admins add members');
r = await anon.get('/api/auth/signup-config');
ok(r.status === 200 && r.data.enabled === false, 'sign-up requests are off by default');
const reqAccess = (b) => fetch(BASE + '/api/auth/request-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async x => ({ status: x.status, data: await x.json() }));
ok((await reqAccess({ email: `new.${stamp}@rhc.test`, password: 'Strong-Pass-12345', full_name: 'New Person' })).status === 403, 'requests refused while turned off');
await owner.patch('/api/settings', { signup: { enabled: true, domains: ['rhc.test'], default_role: 'member' } });
ok((await anon.get('/api/auth/signup-config')).data.enabled === true, 'sign-in page shows "Request access"');
ok((await reqAccess({ email: `outsider.${stamp}@gmail.com`, password: 'Strong-Pass-12345', full_name: 'Outsider' })).status === 403, 'other email domains refused');
ok((await reqAccess({ email: `p.${stamp}@rhc.test`, password: 'short', full_name: 'P' })).status === 400, 'weak password refused');
r = await reqAccess({ email: `payam.${stamp}@rhc.test`, password: 'Strong-Pass-12345', full_name: 'Payam Test' });
ok(r.status === 201 && /administrator/.test(r.data.message), 'company email can request access');
const pTok = await login(`payam.${stamp}@rhc.test`, 'Strong-Pass-12345');
r = await client(pTok).get('/api/me');
ok(r.status === 403 && /waiting for an administrator/.test(r.data.error), 'pending account cannot use the app until approved');
r = await owner.get('/api/notifications');
ok(r.data.items.some(i => i.type === 'access' && /Payam Test/.test(i.title)), 'admins are notified of the request');
r = await owner.get('/api/team/members');
const PM = r.data.members.find(m => m.email === `payam.${stamp}@rhc.test`);
ok(PM?.pending === true && PM.active === false, 'request listed as awaiting approval');
r = await owner.patch(`/api/team/members/${PM.id}`, { approve: true, role: 'project' });
ok(r.status === 200 && (await client(await login(`payam.${stamp}@rhc.test`, 'Strong-Pass-12345')).get('/api/me')).status === 200, 'approved member can sign in');
await reqAccess({ email: `alex.${stamp}@rhc.test`, password: 'Strong-Pass-12345', full_name: 'Alex Test' });
const AX = (await owner.get('/api/team/members')).data.members.find(m => m.email === `alex.${stamp}@rhc.test`);
ok((await owner.del(`/api/team/members/${AX.id}`)).status === 200 && !(await owner.get('/api/team/members')).data.members.some(m => m.id === AX.id), 'admin declines a request (account removed)');
ok((await reqAccess({ email: `payam.${stamp}@rhc.test`, password: 'Strong-Pass-12345', full_name: 'Payam' })).status === 409, 'existing account cannot request again');
r = await owner.del(`/api/team/members/${PM.id}`);
ok(r.status === 200 && (r.data.removed || r.data.deactivated), 'admin can remove a member (deactivated instead if they have work on record)');
await owner.patch('/api/settings', { signup: { enabled: false, domains: [], default_role: 'member' } });

group('Restore defaults');
r = await owner.patch('/api/settings', { business_name: 'RHC City', business_short_name: 'RHC', brand_style: { letterhead: true } });
ok(r.status === 200, 'business name restored');
ok((await owner.del('/api/brand/logo')).status === 200 && (await anon.get('/api/brand')).data.logo_url === '/brand/rhc-logo.png', 'logo removed — back to the built-in RHC logo');

const by = {}; for (const x of results) { by[x.group] ??= [0, 0]; by[x.group][x.ok ? 0 : 1]++; }
const pass = results.filter(x => x.ok).length, fail = results.length - pass;
console.log(`\n${'='.repeat(60)}\nInfinity Planet 4.1 tests: ${pass} passed, ${fail} failed, ${results.length} total`);
for (const [g, [p, f]] of Object.entries(by)) if (f) console.log(`  ✗ ${g}: ${p}/${p + f}`);
process.exit(fail ? 1 : 0);
