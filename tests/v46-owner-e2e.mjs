// Infinity Planet 4.6 — main admin (owner) lock and second admins.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const results = []; const ok = (c, m) => { results.push(!!c); console.log(`  ${c ? '✓' : '✗'} ${m}`); };
async function login(email, password) { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`login ${email}: ${error.message}`); return data.session.access_token; }
const client = token => { const call = async (method, path, body) => { const h = { Authorization: `Bearer ${token}` }; let payload; if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); } const r = await fetch(BASE + path, { method, headers: h, body: payload }); const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() }; }; return { get: p => call('GET', p), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p) }; };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OWNER = process.env.RHC_OWNER_EMAIL;
let { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
let u = list.users.find(x => x.email === OWNER);
if (!u) { const r = await admin.auth.admin.createUser({ email: OWNER, password: 'Main-Admin-12345', email_confirm: true, user_metadata: { full_name: OWNER } }); u = r.data.user; }
await new Promise(r => setTimeout(r, 500));
await admin.from('profiles').upsert({ id: u.id, email: OWNER, full_name: OWNER, role: 'member', active: true });
const main = client(await login(OWNER, 'Main-Admin-12345'));
const other = client(await login('owner@rhc.test', 'Owner-Pass-12345'));
const lena = client(await login('legal@rhc.test', 'Team-Pass-12345'));
let r = await main.get('/api/me');
ok(r.status === 200 && r.data.user.role === 'admin', 'main admin is made admin on sign-in');
ok(r.data.user.full_name === process.env.RHC_OWNER_NAME, `name set to "${r.data.user.full_name}"`);
const mid = r.data.user.id; const lid = (await lena.get('/api/me')).data.user.id;
r = await other.get('/api/team/members'); ok(r.data.members.find(m => m.id === mid)?.owner === true, 'members list marks the main admin');
r = await other.patch(`/api/team/members/${mid}`, { role: 'manager' }); ok(r.status === 403, 'another admin cannot demote the main admin');
r = await other.patch(`/api/team/members/${mid}`, { active: false }); ok(r.status === 403, 'cannot deactivate the main admin');
r = await other.patch(`/api/team/members/${mid}`, { password: 'Something-Else-123' }); ok(r.status === 403, 'cannot reset the main admin password');
r = await other.patch(`/api/team/members/${mid}`, { email: 'x@evil.test' }); ok(r.status === 403, 'cannot change the main admin email');
r = await other.patch(`/api/team/members/${mid}`, { full_name: 'Falah Al-Hamidi', email: OWNER, title: 'General Manager', role: 'admin' }); ok(r.status === 200, 'editing name/title with the same email still works');
r = await other.del(`/api/team/members/${mid}`); ok(r.status === 403, 'cannot remove the main admin');
r = await main.patch(`/api/team/members/${lid}`, { role: 'admin', custom_role: null }); ok(r.status === 200 && r.data.member.role === 'admin', 'main admin makes Lena a second admin');
r = await lena.get('/api/me'); ok(r.data.can.admin, 'Lena now has admin rights');
r = await lena.patch(`/api/team/members/${mid}`, { role: 'member' }); ok(r.status === 403, 'second admin cannot demote the main admin');
r = await main.patch(`/api/team/members/${lid}`, { role: 'manager', custom_role: null }); ok(r.status === 200 && r.data.member.role === 'manager', 'main admin takes admin away again');
r = await main.patch(`/api/team/members/${mid}`, { role: 'manager' }); ok(r.status === 400, 'the main admin cannot demote themselves');
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1);
