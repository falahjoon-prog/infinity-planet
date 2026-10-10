// Infinity Planet end-to-end API tests. Runs against a live server + Supabase.
// Usage: BASE=http://localhost:3300 node tests/api-e2e.mjs
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const FX = new URL('./fixtures/', import.meta.url);
const results = []; let current = '';
const ok = (cond, msg) => { results.push({ group: current, ok: !!cond, msg }); if (!cond) console.log(`  ✗ ${msg}`); };
const group = (g) => { current = g; console.log(`\n▶ ${g}`); };

async function login(email, password) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return data.session.access_token;
}
function client(token) {
  const call = async (method, path, body, raw = false) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    let payload;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + path, { method, headers, body: payload });
    if (raw) return r;
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    return { status: r.status, data };
  };
  return { get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p), raw: (m, p) => call(m, p, undefined, true) };
}
const file = (name, type) => new File([readFileSync(new URL(name, FX))], name, { type });

const owner = client(await login('owner@rhc.test', 'Owner-Pass-12345'));
const legal = client(await login('legal@rhc.test', 'Team-Pass-12345'));
const member = client(await login('member@rhc.test', 'Team-Pass-12345'));
const viewer = client(await login('viewer@rhc.test', 'Team-Pass-12345'));
const mkt = client(await login('mkt@rhc.test', 'Team-Pass-12345'));
const anon = client(null);
// These suites test role-based approvals without naming approvers (4.3 requires named approvers by default).
await owner.patch('/api/settings', { approvals_require_approver: false });

group('Auth & RBAC');
ok((await anon.get('/api/projects')).status === 401, 'unauthenticated API call is rejected (401)');
ok((await client('not-a-token').get('/api/projects')).status === 401, 'invalid token rejected');
const forged = await fetch(BASE + '/api/me', { headers: { 'x-rhc-actor-id': '00000000-0000-0000-0000-000000000000' } });
ok(forged.status === 401, 'forged x-rhc-actor-id header without token is rejected');
const me = await owner.get('/api/me');
ok(me.status === 200 && me.data.user.role === 'admin' && me.data.can.admin, 'owner is admin');
const vme = await viewer.get('/api/me');
ok(vme.data.can.write === false, 'viewer has no write permission');
ok((await viewer.post('/api/projects', { name: 'Should fail' })).status === 403, 'viewer cannot create projects (403)');
ok((await member.patch('/api/settings', { home_jurisdiction: 'NSW' })).status === 403, 'member cannot change settings');
ok((await member.post('/api/google/oauth')).status === 403, 'member cannot connect Google');
ok((await anon.get('/api/health')).status === 200, 'public health endpoint works');

group('Settings');
let r = await owner.patch('/api/settings', { rhc_entity_details: { name: 'RHC City Pty Ltd', abn: '12 345 678 901', signatory_name: 'Falah Owner', signatory_title: 'Director', email: 'info@rhc.test', phone: '07 3000 0000' }, rhc_entity_names: ['RHC City', 'RHC'] });
ok(r.status === 200 && r.data.settings.rhc_entity_details.name === 'RHC City Pty Ltd', 'admin updates RHC entity settings');
r = await owner.get('/api/system/status');
ok(r.status === 200 && r.data.supabase.migration_v4 === true, 'system status reports V4 migration applied');
ok(r.data.providers.length === 4 && r.data.providers.find(p => p.id === 'ollama'), 'four providers reported incl. Ollama');
ok(r.data.providers.every(p => typeof p.detail === 'string' && !/sk-|AIza/.test(p.detail)), 'provider status never leaks keys');

group('Projects');
r = await owner.post('/api/projects', { name: 'Fortitude Valley Mixed-Use', location: 'Fortitude Valley, QLD', project_type: 'Mixed-use', status: 'due_diligence', risk: 'medium', deal_value: 42000000, counterparty: 'Harbourline Capital', description: 'A 24-storey mixed-use tower with ground-floor retail and 180 apartments.', highlights: '180 apartments\nGround-floor retail\n400m to train station', next_action: 'Finalise investor MOU', next_action_at: new Date(Date.now() + 3 * 864e5).toISOString() });
ok(r.status === 201, 'create project');
const P = r.data.project;
r = await owner.post('/api/projects', { name: 'Bayside Land Acquisition', status: 'negotiation', risk: 'high', deal_value: 8200000, location: 'Wynnum, QLD' });
const P2 = r.data.project;
r = await owner.get('/api/projects');
ok(r.data.projects.length === 2 && r.data.projects[0].counts, 'list projects with counts');
r = await member.patch(`/api/projects/${P.id}`, { status: 'negotiation' });
ok(r.status === 200 && r.data.project.status === 'negotiation', 'member advances project stage');
ok((await member.del(`/api/projects/${P2.id}`)).status === 403, 'member cannot archive project');

group('CRM / Deals');
r = await owner.post('/api/deals', { title: 'Harbourline JV equity', project_id: P.id, counterparty: 'Harbourline Capital Holdings Pty Ltd', stage: 'opportunity', expected_value: 4500000, contact_name: 'Sam Lee', contact_email: 'sam@harbourline.test', next_action: 'Send MOU draft', next_action_at: new Date(Date.now() + 2 * 864e5).toISOString() });
ok(r.status === 201 && r.data.deal.probability === 25, 'create deal; stage default probability applied');
const D = r.data.deal;
ok(!!D.counterparty_id, 'counterparty record auto-created');
r = await owner.patch(`/api/deals/${D.id}`, { stage: 'negotiation' });
ok(r.data.deal.stage === 'negotiation' && r.data.deal.probability === 50, 'stage move updates default probability');
r = await owner.post('/api/deals', { title: 'Bayside land purchase', project_id: P2.id, counterparty: 'Bayside Land Holdings', stage: 'due_diligence', expected_value: 8200000 });
r = await owner.post('/api/deals', { title: 'Old lead', counterparty: 'Nobody Pty Ltd', stage: 'lost', lost_reason: 'Price' });
ok(r.status === 201, 'deal without project allowed');
ok((await owner.patch(`/api/deals/${D.id}`, { stage: 'bogus' })).status >= 400, 'invalid stage rejected by DB constraint');
r = await owner.get(`/api/deals/${D.id}`);
ok(r.status === 200 && r.data.activity.some(a => a.action === 'deal.stage_changed'), 'deal page includes stage-change activity');
r = await owner.post('/api/contacts', { full_name: 'Sam Lee', email: 'sam@harbourline.test', counterparty_name: 'Harbourline Capital Holdings Pty Ltd', project_id: P.id, position: 'Investment Director' });
ok(r.status === 201 && r.data.contact.counterparty_id === D.counterparty_id, 'contact linked to existing counterparty');

group('Tasks, notes, reminders, notifications');
const memberId = (await member.get('/api/me')).data.user.id;
r = await owner.post('/api/tasks', { title: 'Order title search', project_id: P2.id, assigned_to: memberId, priority: 'high', due_at: new Date(Date.now() - 864e5).toISOString() });
ok(r.status === 201, 'create overdue task assigned to member');
const T = r.data.task;
r = await owner.post('/api/tasks', { title: 'Review MOU with solicitors', project_id: P.id, due_at: new Date(Date.now() + 864e5).toISOString(), remind_at: new Date(Date.now() - 60_000).toISOString() });
ok(r.status === 201, 'create task with reminder');
r = await member.get('/api/tasks?assigned=me');
ok(r.data.tasks.length === 1 && r.data.tasks[0].id === T.id, 'member sees own tasks');
r = await member.get('/api/notifications');
ok(r.data.items.some(i => i.type === 'overdue'), 'member notified about overdue task');
r = await owner.get('/api/notifications');
ok(r.data.items.some(i => i.type === 'reminder'), 'owner receives due reminder');
const remId = r.data.items.find(i => i.type === 'reminder').ref;
ok((await owner.patch(`/api/reminders/${remId}`, { status: 'done' })).status === 200, 'dismiss reminder');
r = await member.patch(`/api/tasks/${T.id}`, { status: 'done' });
ok(r.data.task.status === 'done' && r.data.task.completed_at, 'complete task records completion time');
ok((await owner.patch(`/api/tasks/${T.id}`, { status: 'weird' })).status === 400, 'invalid task status rejected');
r = await owner.post('/api/notes', { title: 'Investor preference', body: 'Harbourline wants a 12 month exclusivity but we should cap at 60 days.', important: true, project_id: P.id });
ok(r.status === 201, 'create important note');
r = await owner.get('/api/notes?q=exclusivity');
ok(r.data.notes.length === 1, 'search notes');

group('Documents: upload, extract, index, search');
let fd = new FormData(); fd.append('file', file('sample-mou.txt', 'text/plain')); fd.append('file', file('services.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')); fd.append('file', file('sample-mou.pdf', 'application/pdf')); fd.append('project_id', P.id); fd.append('authority', 'draft');
r = await owner.post('/api/documents/upload', fd);
ok(r.status === 201 && r.data.uploaded === 3, 'upload txt + docx + pdf');
const [DOC_TXT, DOC_DOCX, DOC_PDF] = r.data.results.map(x => x.document);
ok(r.data.results.every(x => x.extraction.status === 'indexed' && x.extraction.chunks > 0), 'all three extracted and chunked');
fd = new FormData(); fd.append('file', file('scanned-hoa.pdf', 'application/pdf')); fd.append('file', file('scanned-hoa.png', 'image/png')); fd.append('project_id', P2.id); fd.append('authority', 'historical_precedent');
r = await owner.post('/api/documents/upload', fd);
ok(r.data.results[0].extraction.status === 'needs_ocr', 'scanned PDF detected as needing OCR');
ok(r.data.results[1].extraction.status === 'indexed' && r.data.results[1].extraction.method === 'tesseract-ocr', 'photo read automatically by the built-in OCR on upload');
const [DOC_SCAN_PDF, DOC_SCAN_IMG] = r.data.results.map(x => x.document);
fd = new FormData(); fd.append('file', file('sample-mou.txt', 'text/plain')); fd.append('authority', 'approved');
r = await member.post('/api/documents/upload', fd);
ok(r.status === 403, 'member cannot upload a document as APPROVED');
r = await owner.get(`/api/knowledge/search?q=${encodeURIComponent('non-refundable deposit')}`);
ok(r.data.results.length > 0 && r.data.results[0].citation === '[KB-1]', 'full-text knowledge search returns cited passages');
r = await owner.get(`/api/knowledge/search?q=${encodeURIComponent('Apex Planning consultant indemnify')}`);
ok(r.data.results.some(x => x.document_id === DOC_DOCX.id), 'search finds DOCX content');
r = await owner.get(`/api/documents/${DOC_PDF.id}`);
ok(r.status === 200 && r.data.chunk_count > 0 && r.data.document.content_text.includes('Harbourline'), 'document detail with extracted PDF text');
r = await owner.get(`/api/documents/${DOC_PDF.id}/download`);
ok(r.status === 200 && /^http/.test(r.data.url), 'signed download URL');
const dl = await fetch(r.data.url); ok(dl.ok && (await dl.arrayBuffer()).byteLength > 1000, 'signed URL downloads the stored file');
r = await owner.patch(`/api/documents/${DOC_TXT.id}`, { authority: 'historical_precedent' });
ok(r.data.document.authority === 'historical_precedent', 'classify document as HISTORICAL PRECEDENT');
ok((await member.patch(`/api/documents/${DOC_TXT.id}`, { authority: 'approved' })).status === 403, 'member cannot mark a document APPROVED');
r = await owner.post(`/api/documents/${DOC_DOCX.id}/extract`);
ok(r.status === 200 && r.data.extraction.chunks > 0, 're-extract / re-index');
r = await owner.post(`/api/documents/${DOC_SCAN_PDF.id}/ocr`, {});
ok(r.status === 409 && /vision-capable AI key/.test(r.data.error), 'scanned PDF OCR explains the missing AI key (no fake text)');
console.log('  … running built-in Tesseract OCR on image (first run downloads language data)');
r = await owner.post(`/api/documents/${DOC_SCAN_IMG.id}/ocr`, {});
if (r.status === 200) { ok(r.data.ocr.method === 'tesseract-ocr' && r.data.ocr.chunks > 0, `image OCR via Tesseract (${r.data.ocr.characters} chars, confidence ${r.data.ocr.confidence})`); const d = await owner.get(`/api/documents/${DOC_SCAN_IMG.id}`); ok(/8,?200,?000/.test(d.data.document.content_text) && /Bayside/i.test(d.data.document.content_text), 'OCR text contains the price and party'); }
else ok(false, `image OCR failed: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);

group('Infinity AI (search mode + provider errors)');
r = await owner.post('/api/ai/chat', { message: 'What deposit does the MOU require?', provider: 'search', project_id: P.id });
ok(r.status === 200 && r.data.message.provider === 'search' && r.data.message.metadata.citations.length > 0, 'RHC Search mode answers with citations (no AI model)');
ok(/Infinity Search/.test(r.data.message.content) && !/I think|As an AI/.test(r.data.message.content), 'search answer is clearly labelled, not fake AI');
const conv = r.data.conversation_id;
r = await owner.post('/api/ai/chat', { message: 'And the exclusivity?', provider: 'search', conversation_id: conv, document_ids: [DOC_PDF.id] });
ok(r.data.conversation_id === conv && r.data.message.metadata.citations.some(c => c.citation.startsWith('[DOC-')), 'attached document cited as [DOC-n] in same conversation');
r = await owner.get(`/api/ai/conversations/${conv}`);
ok(r.data.messages.length === 4, 'conversation persisted (2 user + 2 assistant)');
r = await owner.post('/api/ai/chat', { message: 'hello', provider: 'openai' });
ok(r.status === 409 && /not configured/.test(r.data.error), 'unconfigured OpenAI returns a clear error (no fake answer)');
r = await owner.post('/api/ai/chat', { message: 'hello', provider: 'ollama' });
ok(r.status === 502 && /Ollama is not reachable/.test(r.data.error), 'Ollama down returns a clear error');
ok((await viewer.post('/api/ai/chat', { message: 'hi', provider: 'search' })).status === 403, 'viewer cannot use AI chat');

group('Legal AI (built-in rules engine)');
r = await owner.post('/api/legal/reviews', { document_id: DOC_PDF.id, project_id: P.id });
ok(r.status === 201 && r.data.review.engine === 'rules', 'rules-engine review of stored PDF');
const REV = r.data.review; const A = r.data.analysis;
ok(A.overall_risk.rating === 'Critical', `MOU rated Critical (score ${A.overall_risk.score})`);
ok(A.findings.some(f => /indemnity/i.test(f.title) && f.severity === 'critical'), 'broad RHC indemnity flagged critical');
ok(A.findings.some(f => /terminate for convenience/i.test(f.title)), 'counterparty termination for convenience flagged');
ok(A.findings.some(f => /Non-refundable deposit/.test(f.title)), 'non-refundable deposit flagged');
ok(A.missing_protections.some(m => m.label === 'Confidentiality'), 'missing confidentiality detected');
ok(A.parties.some(p => p.is_rhc) && A.parties.some(p => /Harbourline/.test(p.name)), 'parties extracted, RHC identified');
ok(A.conditions_precedent.length > 0 && A.due_diligence.length > 3 && A.solicitor_questions.length > 2, 'conditions, due diligence and solicitor questions produced');
ok(A.authority.document_authority === 'draft' && /never treated as approved/i.test(A.authority.note), 'authority note: old agreements never auto-approved');
r = await owner.get(`/api/projects/${P.id}`);
ok(r.data.project.risk === 'critical', 'project risk escalated to critical by the review');
r = await legal.post('/api/legal/reviews', { document_id: DOC_TXT.id });
ok(r.data.analysis.authority.document_authority === 'historical_precedent' && /HISTORICAL PRECEDENT/.test(r.data.analysis.authority.note), 'historical precedent document labelled as reference only');
r = await owner.post('/api/legal/reviews', { document_id: DOC_DOCX.id, provider: 'anthropic' });
ok(r.status === 201 && r.data.review.engine === 'rules' && /not configured/.test(r.data.ai_error), 'AI requested without key: rules review still saved, AI error recorded');
ok(r.data.analysis.findings.some(f => /indemnity/i.test(f.title)), 'DOCX services agreement: RHC indemnity found');
r = await owner.post('/api/legal/reviews', { text: 'too short' });
ok(r.status === 400, 'too-short text rejected');
r = await owner.post(`/api/documents/${DOC_SCAN_PDF.id}/extract`); // still no text
r = await owner.post('/api/legal/reviews', { document_id: DOC_SCAN_PDF.id });
ok(r.status === 400 && /OCR/.test(r.data.error), 'scanned doc without text: review asks for OCR');
// Clause library + comparison
r = await legal.post('/api/legal/clauses', { name: 'RHC governing law', category: 'governing_law', authority: 'approved', preferred_position: 'This agreement is governed by the laws of Queensland and each party submits to the exclusive jurisdiction of the courts of Queensland.', clause_text: 'This agreement is governed by the laws of Queensland and each party submits to the exclusive jurisdiction of the courts of Queensland.' });
ok(r.status === 201 && r.data.clause.status === 'draft', 'new clause starts unapproved even if proposed as APPROVED');
const CL = r.data.clause;
r = await owner.post('/api/legal/reviews', { document_id: DOC_PDF.id, save: false });
ok(r.data.analysis.clause_comparisons[0].is_approved_position === false, 'unapproved clause compared as reference only');
r = await legal.post('/api/approvals', { entity_type: 'legal_clause', entity_id: CL.id });
const CLA = r.data.approval;
ok((await legal.patch(`/api/approvals/${CLA.id}`, { status: 'approved' })).status === 403, 'legal user cannot approve own clause request');
ok((await member.patch(`/api/approvals/${CLA.id}`, { status: 'approved' })).status === 403, 'member cannot approve legal items');
r = await owner.patch(`/api/approvals/${CLA.id}`, { status: 'approved', note: 'Standard position' });
ok(r.status === 200, 'admin approves clause');
r = await owner.post('/api/legal/reviews', { document_id: DOC_PDF.id, save: false });
const cmp = r.data.analysis.clause_comparisons[0];
ok(cmp.is_approved_position && cmp.result === 'deviates', 'approved Queensland position vs NSW clause → deviates');
r = await legal.patch(`/api/legal/clauses/${CL.id}`, { preferred_position: 'Changed wording for Queensland law.' });
ok(r.data.approval_voided && r.data.clause.status === 'draft', 'editing an approved clause voids its approval');
// Review approval workflow
r = await member.post('/api/approvals', { entity_type: 'contract_review', entity_id: REV.id, summary: 'Please review before we respond' });
ok(r.status === 201, 'member requests legal approval of review');
ok((await member.post('/api/approvals', { entity_type: 'contract_review', entity_id: REV.id })).status === 409, 'duplicate pending approval blocked');
const RA = r.data.approval;
r = await legal.patch(`/api/approvals/${RA.id}`, { status: 'rejected' });
ok(r.status === 400, 'reject without comment is refused');
r = await legal.patch(`/api/approvals/${RA.id}`, { status: 'changes_requested', note: 'Add cap on indemnity' });
ok(r.status === 200, 'legal user requests changes');
r = await owner.get(`/api/legal/reviews/${REV.id}`);
ok(r.data.review.status === 'changes_requested' && r.data.approvals[0].decision_note === 'Add cap on indemnity', 'review status and decision trail updated');

group('Drafting (templates + approval-gated export)');
r = await owner.get('/api/templates');
ok(r.data.templates.filter(t => t.kind === 'document').length === 9 && r.data.templates.filter(t => t.kind === 'marketing').length === 11, '9 document (incl. Project Status Report) + 11 marketing starter templates seeded');
ok(r.data.templates.every(t => t.status !== 'approved'), 'starter templates are NOT auto-approved');
const MOU_T = r.data.templates.find(t => t.category === 'mou');
r = await owner.post('/api/generate', { template_id: MOU_T.id, project_id: P.id, deal_id: D.id, inputs: { purpose: 'a joint venture', key_terms: 'Investor contributes $4.5m equity\nRHC acts as development manager', exclusivity_days: '45', sunset_date: '30 November 2026' } });
ok(r.status === 201, 'generate MOU from template + project + deal');
const G = r.data.generated;
ok(G.body.includes('Harbourline Capital Holdings Pty Ltd') && G.body.includes('Fortitude Valley Mixed-Use') && G.body.includes('RHC City Pty Ltd'), 'facts filled from deal, project and settings');
ok(G.body.includes('[Starter wording — no approved clause'), 'unapproved clause topics clearly marked as starter wording');
ok(!G.body.includes('[● counterparty abn]'), 'optional fields (ABN) omitted cleanly when unknown');
const noDeal = await owner.post('/api/generate', { template_id: MOU_T.id, inputs: {} });
ok(noDeal.data.missing_fields.includes('counterparty') && noDeal.data.generated.body.includes('[● counterparty]'), 'required facts not supplied are flagged and visibly marked');
await owner.del(`/api/generated/${noDeal.data.generated.id}`);
r = await owner.get(`/api/generated/${G.id}/export?format=docx`);
ok(r.status === 409, 'export blocked until approved');
r = await member.post('/api/approvals', { entity_type: 'generated_document', entity_id: G.id });
const GA = r.data.approval;
ok((await member.patch(`/api/generated/${G.id}`, { body: 'edited' })).status === 403, 'editing locked while awaiting approval (only approvers may amend)');
r = await legal.patch(`/api/approvals/${GA.id}`, { status: 'approved', note: 'OK to send' });
ok(r.status === 200, 'legal approves generated MOU');
const ex = await owner.raw('GET', `/api/generated/${G.id}/export?format=docx`);
const buf = Buffer.from(await ex.arrayBuffer());
ok(ex.status === 200 && buf.slice(0, 2).toString() === 'PK' && buf.length > 3000, `approved MOU exports as real .docx (${buf.length} bytes)`);
r = await owner.patch(`/api/generated/${G.id}`, { body: G.body + '\nExtra clause.' });
ok(r.data.generated.status === 'draft' && r.data.generated.version === 2, 'editing an exported document requires re-approval (v2)');

group('Marketing & Designer');
r = await owner.get('/api/templates?kind=marketing');
const INV = r.data.templates.find(t => t.name === 'Investment Opportunity');
r = await mkt.post('/api/marketing/generate', { template_id: INV.id, project_id: P.id });
ok(r.status === 200 && r.data.content.includes('Fortitude Valley Mixed-Use') && r.data.content.includes('180 apartments') && !r.data.content.includes('{{'), 'investment opportunity filled from project facts only');
ok(!/\[●/.test(r.data.content), 'marketing output omits unknown facts instead of placeholders');
r = await mkt.post('/api/marketing/assets', { title: r.data.title, content: r.data.content, project_id: P.id, template_id: INV.id });
const MA = r.data.asset;
r = await mkt.post('/api/marketing/copy', { project_id: P.id });
ok(r.data.engine === 'rules' && r.data.content.headline === 'Fortitude Valley Mixed-Use' && r.data.content.stats.some(s => s.value === '$42M'), 'designer rules fill from project');
const design = { layout: 'flyer_a4', theme: { primary: '#13294b', accent: '#c8a45c', background: '#fff', text: '#1b2433', font: 'serif' }, content: r.data.content };
r = await mkt.post('/api/marketing/assets', { title: 'FV flyer', kind: 'design', layout: 'flyer_a4', design, project_id: P.id });
const DS = r.data.asset;
let html = await (await mkt.raw('GET', `/api/marketing/assets/${DS.id}/render`)).text();
ok(html.includes('DRAFT — NOT APPROVED') && html.includes('Fortitude Valley Mixed-Use'), 'design preview renders with DRAFT watermark');
ok((await mkt.raw('GET', `/api/marketing/assets/${DS.id}/render?export=1`)).status === 409, 'design export blocked until approved');
r = await mkt.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: DS.id });
const DA = r.data.approval;
ok((await legal.patch(`/api/approvals/${DA.id}`, { status: 'approved' })).status === 403, 'legal role cannot approve marketing');
ok((await owner.patch(`/api/approvals/${DA.id}`, { status: 'approved' })).status === 200, 'director/admin approves design');
html = await (await mkt.raw('GET', `/api/marketing/assets/${DS.id}/render?export=1`)).text();
ok(!html.includes('DRAFT — NOT APPROVED') && html.includes('@page{size:A4 portrait'), 'approved design exports print-ready A4 without watermark');
fd = new FormData(); fd.append('file', file('scanned-hoa.png', 'image/png'));
r = await mkt.post('/api/marketing/image', fd);
ok(r.status === 201 && r.data.path.startsWith('designs/') && r.data.url, 'designer image upload');

group('Email (Gmail not connected) & calendar');
r = await owner.get('/api/google/gmail');
ok(r.status === 409 && /not connected/.test(r.data.error), 'Gmail list explains Google is not connected');
r = await member.post('/api/email/drafts', { to_addresses: 'sam@harbourline.test', subject: 'MOU draft', body: 'Hi Sam, attached is our draft.', project_id: P.id });
ok(r.status === 201, 'save email draft');
const ED = r.data.draft;
ok((await member.post('/api/email/drafts', { to_addresses: 'bad address', subject: 'x', body: 'y' })).status === 400, 'invalid recipient rejected');
ok((await member.post('/api/email/drafts', { to_addresses: 'a@b.co\r\nBcc: evil@x.com', subject: 'x', body: 'y' })).status === 400, 'header injection in recipient rejected');
r = await member.post(`/api/email/drafts/${ED.id}/send`, { confirm: true });
ok(r.status === 409 && /approved/.test(r.data.error), 'unapproved email cannot be sent');
ok((await member.post(`/api/email/drafts/${ED.id}/send`, {})).status === 400, 'sending requires explicit confirmation');
r = await member.post('/api/email/draft-reply', { intent: 'Confirm Tuesday 10am meeting', original: { from: 'Sam Lee <sam@harbourline.test>', subject: 'Meeting', body: 'Can we meet?' } });
ok(r.status === 200 && r.data.subject === 'Re: Meeting' && /confirm the meeting on Tuesday at 10am\./.test(r.data.body) && r.data.engine === 'rules', 'template reply draft without AI');
r = await owner.post('/api/calendar/events', { title: 'Harbourline investment committee', starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(), ends_at: new Date(Date.now() + 3 * 3600_000).toISOString(), project_id: P.id, attendees: 'sam@harbourline.test', reminder_minutes: 180, sync_google: true });
ok(r.status === 201 && /not connected/.test(r.data.google_error || ''), 'event saved in RHC; Google sync failure reported honestly');
r = await owner.get('/api/calendar/events');
ok(r.data.events.length === 1 && r.data.google.connected === false, 'calendar lists RHC events');
r = await owner.get('/api/notifications');
ok(r.data.items.some(i => i.type === 'meeting' || (i.type === 'reminder' && /Meeting/.test(i.title))), 'meeting reminder surfaces in notifications');

group('Team chat & presence');
r = await owner.get('/api/team/channels');
ok(r.data.channels.length >= 4, 'default channels exist');
r = await owner.post('/api/team/channels', { project_id: P.id });
const PC = r.data.channel;
ok(PC.slug === `project-${P.id}`, 'project channel created');
r = await owner.post('/api/team/messages', { channel: PC.slug, body: '@Max can you chase the title search?' });
ok(r.status === 201, 'post message');
r = await member.get(`/api/team/messages?channel=${PC.slug}`);
ok(r.data.messages.length === 1 && r.data.messages[0].sender.full_name === 'Falah Owner', 'member reads message with sender name');
r = await member.get('/api/notifications');
ok(r.data.items.some(i => i.type === 'mention'), '@mention notifies member');
ok((await viewer.post('/api/team/messages', { channel: 'general', body: 'hi' })).status === 403, 'viewer cannot post');
await member.post('/api/team/presence', { status: 'online' });
r = await owner.get('/api/team/members');
ok(r.data.members.find(m => m.email === 'member@rhc.test').presence === 'online', 'presence shows member online');

group('Team admin');
r = await owner.post('/api/team/members', { email: 'new@rhc.test', password: 'Brand-New-Pass-1', full_name: 'New Person', role: 'project' });
ok(r.status === 201, 'admin creates a team account');
const nu = client(await login('new@rhc.test', 'Brand-New-Pass-1'));
ok((await nu.get('/api/me')).data.user.role === 'project', 'new member can sign in with assigned role');
r = await owner.patch(`/api/team/members/${r.data.member.id}`, { active: false });
ok((await nu.get('/api/me')).status === 403, 'deactivated account is blocked');
ok((await owner.patch(`/api/team/members/${me.data.user.id}`, { role: 'member' })).status === 400, 'admin cannot demote themselves');

group('Command centre, search, activity');
r = await owner.get('/api/executive');
const k = r.data.kpis;
ok(r.status === 200 && k.activeProjects === 2 && k.pipelineValue === 12700000, `KPIs computed from records (pipeline ${k.pipelineValue})`);
ok(k.pendingApprovals >= 0 && k.legalRisks >= 1 && k.upcomingMeetings === 1, 'legal risks and meetings counted');
ok(typeof r.data.summary.text === 'string' && r.data.summary.text.includes('2 active projects'), 'rules executive summary from live data');
ok(r.data.pipeline.length === 7 && r.data.deadlines.length > 0, 'pipeline by stage and deadlines');
r = await owner.get('/api/search?q=harbour');
ok(r.data.results.some(x => x.type === 'deal') && r.data.results.some(x => x.type === 'contact'), 'global search across deals and contacts');
r = await owner.get('/api/activity?limit=200');
ok(r.data.events.length > 30 && r.data.events.every(e => e.action), `audit trail recorded (${r.data.events.length} events)`);
r = await owner.get(`/api/projects/${P.id}`);
ok(r.data.deals.length === 1 && r.data.documents.length === 4 && r.data.documents.some(d => /\(final\)\.pdf$/.test(d.name)) && r.data.reviews.length >= 1 && r.data.generated.length === 1 && r.data.marketing.length === 2 && r.data.events.length === 1 && r.data.contacts.length === 1 && r.data.activity.length > 5, 'project workspace aggregates every module');

group('Row-level security (direct database access with user tokens)');
const anonDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let q = await anonDb.from('projects').select('id');
ok((q.data || []).length === 0, 'anonymous key cannot read projects');
q = await anonDb.from('deals').select('id');
ok((q.data || []).length === 0, 'anonymous key cannot read deals (V3.1 RLS gap fixed)');
const vdb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await vdb.auth.signInWithPassword({ email: 'viewer@rhc.test', password: 'Team-Pass-12345' });
q = await vdb.from('projects').select('id'); ok((q.data || []).length === 2, 'viewer can read via RLS');
q = await vdb.from('projects').insert({ name: 'hack' }).select(); ok(!!q.error, 'viewer insert blocked by RLS');
q = await vdb.from('profiles').update({ role: 'admin' }).eq('email', 'viewer@rhc.test').select(); ok(!!q.error || !(q.data || []).length || q.data[0].role === 'viewer', 'viewer cannot self-promote via RLS');
q = await vdb.from('integrations').select('*'); ok((q.data || []).length === 0, 'integrations table hidden from non-admins');
q = await vdb.from('profiles').select('id'); ok(!q.error && q.data.length >= 5, 'profiles readable without RLS recursion error');

// ---------------------------------------------------------------- summary
const pass = results.filter(r => r.ok).length, fail = results.length - pass;
console.log(`\n${'='.repeat(60)}\nInfinity Planet API tests: ${pass} passed, ${fail} failed, ${results.length} total`);
const byGroup = {}; for (const r of results) { byGroup[r.group] ||= [0, 0]; byGroup[r.group][r.ok ? 0 : 1]++; }
for (const [g, [p, f]] of Object.entries(byGroup)) console.log(`  ${f ? '✗' : '✓'} ${g}: ${p}/${p + f}`);
if (fail) { console.log('\nFailures:'); for (const r of results.filter(r => !r.ok)) console.log(`  - [${r.group}] ${r.msg}`); }
process.exit(fail ? 1 : 0);
