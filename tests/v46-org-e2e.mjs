// Infinity Planet 4.6 — company structure, approvals that follow the reporting line, and company records.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const results = []; let current = '';
const ok = (c, m) => { results.push({ group: current, ok: !!c, msg: m }); if (!c) console.log(`  ✗ ${m}`); };
const group = g => { current = g; console.log(`\n▶ ${g}`); };
async function login(email, password) { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`login ${email}: ${error.message}`); return data.session.access_token; }
const client = token => { const call = async (method, path, body) => { const h = token ? { Authorization: `Bearer ${token}` } : {}; let payload; if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); } const r = await fetch(BASE + path, { method, headers: h, body: payload }); const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() }; }; return { get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p) }; };
const owner = client(await login('owner@rhc.test', 'Owner-Pass-12345'));   // Falah Owner → General Manager
const legal = client(await login('legal@rhc.test', 'Team-Pass-12345'));    // Lena → CEO (for the test)
const member = client(await login('member@rhc.test', 'Team-Pass-12345'));  // Max → Technical and Engineering Deputy
const mkt = client(await login('mkt@rhc.test', 'Team-Pass-12345'));        // Mia → Marketing and Sales Manager
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
await admin.from('app_settings').delete().in('key', ['org_chart', 'approval_routes', 'approval_copies', 'company_profile', 'company_records_stamps']);
const id = {}; for (const [k, c] of Object.entries({ owner, legal, member, mkt })) id[k] = (await c.get('/api/me')).data.user.id;
const asset = async (c, t) => (await c.post('/api/marketing/assets', { title: t, content: `${t} copy`, kind: 'copy' })).data.asset.id;

group('company structure');
let r = await owner.get('/api/team/org');
ok(r.status === 200 && r.data.org.positions.length === 15 && !r.data.org.saved, 'the RHC organisation chart is ready (15 positions)');
ok(r.data.org.positions.find(p => p.id === 'gm').holders.includes(id.owner), 'Falah is matched to General Manager');
ok(r.data.org.positions.find(p => p.id === 'tech').reports_to === 'gm' && r.data.org.positions.find(p => p.id === 'gm').reports_to === 'ceo', 'Technical Deputy → GM → CEO');
const org = r.data.org; const set = (pid, who) => { org.positions.find(p => p.id === pid).holders = [who]; };
set('ceo', id.legal); set('tech', id.member); set('marketing', id.mkt);
r = await member.patch('/api/team/org', org); ok(r.status === 403, 'only admins and directors change the structure');
r = await owner.patch('/api/team/org', org); ok(r.status === 200 && r.data.org.saved, 'structure saved');

group('the deputy cannot skip the GM');
let A = await asset(member, 'Site hoarding copy');
r = await member.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: A, approvers: [id.legal] });
ok(r.status === 201 && JSON.stringify(r.data.approval.approvers) === JSON.stringify([id.owner]), 'request to the CEO goes to the GM first');
ok(/Goes to .* first/.test(r.data.approval.route || ''), 'the reason is recorded');
const AP = r.data.approval.id;
r = await legal.patch(`/api/approvals/${AP}`, { status: 'approved', note: 'ok' }); ok(r.status === 403, 'the CEO cannot decide before the GM');
r = await owner.get('/api/notifications'); ok(r.data.items.some(i => i.ref === AP), 'the GM is notified');
r = await owner.patch(`/api/approvals/${AP}`, { status: 'approved', note: 'Fine by me' });
ok(r.status === 200, 'GM approves');
let a = (await admin.from('approvals').select('status,approvers').eq('id', AP).single()).data;
ok(a.status === 'pending' && a.approvers[0] === id.legal, 'then it passes to the CEO');
r = await legal.get('/api/notifications'); ok(r.data.items.some(i => i.ref === AP), 'the CEO is notified');
r = await legal.patch(`/api/approvals/${AP}`, { status: 'approved', note: 'Approved' });
a = (await admin.from('approvals').select('status').eq('id', AP).single()).data;
const st = (await admin.from('marketing_assets').select('status').eq('id', A).single()).data;
ok(a.status === 'approved' && st.status === 'approved', 'CEO approval finishes it');
const { data: cm } = await admin.from('approval_comments').select('body').eq('approval_id', AP);
ok(cm.some(c => /Company structure/.test(c.body)) && cm.some(c => /Passed to/.test(c.body)), 'the trail shows each step');

group('other cases');
A = await asset(member, 'Direct to manager');
r = await member.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: A, approvers: [id.owner] });
ok(r.status === 201 && r.data.approval.approvers[0] === id.owner && !r.data.approval.route, 'asking your own manager is direct');
A = await asset(member, 'Cross department');
r = await member.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: A, approvers: [id.mkt] });
ok(r.status === 201 && /copied/.test(r.data.approval.route || ''), 'asking another department copies your manager');
r = await owner.get('/api/notifications'); ok(r.data.items.some(i => /For your information/.test(i.title)), 'the manager sees the copy');
A = await asset(member, 'Rejected at GM');
r = await member.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: A, approvers: [id.legal] }); const RJ = r.data.approval.id;
r = await owner.patch(`/api/approvals/${RJ}`, { status: 'rejected', note: 'Not yet' });
a = (await admin.from('approvals').select('status').eq('id', RJ).single()).data; ok(a.status === 'rejected', 'a GM rejection stops it there');
org.routing = 'copy'; await owner.patch('/api/team/org', org);
A = await asset(member, 'Copy mode');
r = await member.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: A, approvers: [id.legal] });
ok(r.status === 201 && r.data.approval.approvers[0] === id.legal && /copied/.test(r.data.approval.route || ''), '"copy" setting: goes to the CEO and copies the GM');

group('company records');
r = await member.post('/api/company-records', {}); ok(r.status === 403, 'only admins/directors load the records');
r = await owner.get('/api/company-records'); ok(r.status === 200 && r.data.folder.available && r.data.folder.files.length >= 8, 'records folder found');
r = await owner.post('/api/company-records', {});
ok(r.status === 200 && r.data.profile && r.data.results.filter(x => /added|updated/.test(x.status)).length >= 8, `records loaded (${(r.data.results || []).map(x => x.status).join(', ')})`);
ok(r.data.results.some(x => /stamp/.test(x.status) || /set as/.test(x.status)), 'the GM seal is set as Falah’s stamp');
r = await owner.get('/api/company-records');
ok(r.data.profile?.json?.entities?.length > 3 && r.data.documents.filter(d => d.authority === 'approved').length >= 7, 'profile and approved documents listed');
const uha = r.data.documents.find(d => /Unitholders/.test(d.name)); const full = (await admin.from('documents').select('content_text').eq('id', uha.id).single()).data;
ok(full.content_text && full.content_text.length > 20000, 'scanned Unitholders’ Agreement is searchable (OCR text)');
const sig = await owner.get('/api/signatures'); ok(sig.data.signatures.some(s => s.owner === 'me' && s.kind === 'stamp'), 'stamp ready in My signatures');
r = await legal.get('/api/company-records'); ok(r.status === 200, 'Legal can read the records');
r = await owner.post('/api/company-records', {}); ok(r.status === 200 && r.data.results.every(x => !/failed/.test(x.status)), 'reloading updates in place');
const { count } = await admin.from('documents').select('id', { count: 'exact', head: true }).eq('source', 'company_records');
ok(count === 9, `no duplicates after reloading (${count})`);

await admin.from('app_settings').delete().in('key', ['org_chart', 'approval_routes', 'approval_copies']);
const failed = results.filter(x => !x.ok);
console.log(`\nStructure & records tests: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
