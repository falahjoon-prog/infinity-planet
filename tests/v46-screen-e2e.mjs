// Infinity Planet 4.6 — Infinity AI knows what is on screen (open contract, document) and highlighted text.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const results = []; let current = '';
const ok = (c, m) => { results.push({ group: current, ok: !!c, msg: m }); if (!c) console.log(`  ✗ ${m}`); };
const group = g => { current = g; console.log(`\n▶ ${g}`); };
async function login(email, password) { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`login ${email}: ${error.message}`); return data.session.access_token; }
const client = token => { const call = async (method, path, body) => { const h = token ? { Authorization: `Bearer ${token}` } : {}; let payload; if (body instanceof FormData) payload = body; else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); } const r = await fetch(BASE + path, { method, headers: h, body: payload }); const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() }; }; return { get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p) }; };
const owner = client(await login('owner@rhc.test', 'Owner-Pass-12345'));
const viewer = client(await login('viewer@rhc.test', 'Team-Pass-12345'));
const say = async (c, message, screen, extra = {}) => { const r = await c.post('/api/ai/chat', { message, provider: 'search', allow_actions: true, screen, ...extra }); return { status: r.status, text: r.data?.message?.content || r.data?.error || '' }; };

group('setup: a contract under review');
const fd = new FormData(); fd.append('file', new Blob([readFileSync('tests/fixtures/sample-mou.txt')], { type: 'text/plain' }), 'Harbourline MOU.txt');
const up = await owner.post('/api/documents/upload', fd); const DOC = up.data.results?.[0]?.document;
ok(DOC?.id, 'contract uploaded');
const rv = await owner.post('/api/legal/reviews', { document_id: DOC.id }); const RV = rv.data.review;
ok(RV?.id, 'contract reviewed');
const src = readFileSync('tests/fixtures/sample-mou.txt', 'utf8');
const term = /indemnif/i.test(src) ? 'indemnify' : /exclusiv/i.test(src) ? 'exclusivity' : 'deposit';

group('highlight a term and ask');
let r = await say(owner, `Explain “${term}” in plain English — what it means here and why it matters to us.`, { path: `/legal/${RV.id}`, page: 'Legal AI', item: { kind: 'legal_review', id: RV.id }, selection: term });
ok(r.status === 200 && /What to watch for us/.test(r.text), `explains “${term}” without an AI key`);
ok(/Where it appears in/.test(r.text), 'quotes where it appears in the open contract');
r = await say(owner, 'Explain “sunset date”', { path: `/legal/${RV.id}`, page: 'Legal AI', item: { kind: 'legal_review', id: RV.id }, selection: 'sunset date' });
ok(/last date by which/i.test(r.text), 'explains a term not in this contract from the glossary');
const clause = src.split(/\n+/).find(l => l.length > 80) || src.slice(0, 300);
r = await say(owner, 'Is this risky for us?', { path: `/legal/${RV.id}`, page: 'Legal AI', item: { kind: 'legal_review', id: RV.id }, selection: clause });
ok(r.status === 200 && /(Legal AI rules flag|no red flags)/i.test(r.text), 'checks highlighted wording with the Legal AI rules');
r = await say(owner, 'Translate the selected text into Farsi.', { path: '/documents', page: 'Documents', item: null, selection: 'Purchase price' });
ok(/needs an AI connected/i.test(r.text), 'translation says it needs an AI (honest)');
r = await say(owner, 'Explain “zzqx blorp”', { path: `/legal/${RV.id}`, page: 'Legal AI', item: { kind: 'legal_review', id: RV.id }, selection: 'zzqx blorp' });
ok(/don't have a built-in explanation/i.test(r.text), 'unknown wording: says so and how to get an explanation');

group('normal questions still work with something open');
r = await say(owner, 'what are my tasks?', { path: `/legal/${RV.id}`, page: 'Legal AI', item: { kind: 'legal_review', id: RV.id } });
ok(r.status === 200 && !/What to watch for us/.test(r.text) && r.text.length > 5, 'a normal command is not hijacked by the screen');


const failed = results.filter(x => !x.ok);
console.log(`\nScreen-aware AI tests: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
