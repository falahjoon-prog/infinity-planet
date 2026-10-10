// Infinity Planet 4.6 — AI rules (standing commands) end-to-end. Run against a running server: node tests/v46-e2e.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const results = []; let current = '';
const ok = (c, m) => { results.push({ group: current, ok: !!c, msg: m }); if (!c) console.log(`  ✗ ${m}`); };
const group = g => { current = g; console.log(`\n▶ ${g}`); };
async function login(email, password) { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`login ${email}: ${error.message}`); return data.session.access_token; }
const client = token => { const call = async (method, path, body) => { const h = token ? { Authorization: `Bearer ${token}` } : {}; let payload; if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); } const r = await fetch(BASE + path, { method, headers: h, body: payload }); const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() }; }; return { get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p) }; };
const owner = client(await login('owner@rhc.test', 'Owner-Pass-12345'));
const member = client(await login('member@rhc.test', 'Team-Pass-12345'));
const anon = client(null);
const say = async (c, message) => ({ reply: ((await c.post('/api/ai/chat', { message, provider: 'search', allow_actions: true })).data.message || {}).content || '' });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
await admin.from('app_settings').delete().eq('key', 'ai_rules');

group('save rules from chat');
let r = await say(owner, 'From now on, remind me 15 minutes before meetings');
ok(/Saved/.test(r.reply) && /15 minutes before meetings/.test(r.reply), 'a "from now on" command is saved');
r = await say(owner, 'always write my emails as project manager');
ok(/Saved/.test(r.reply), '"always …" is saved');
r = await say(owner, 'new rule: meetings should be 30 minutes');
ok(/Saved/.test(r.reply), '"new rule: …" is saved');
r = await say(owner, 'rule for the team: always cc Ramin on Harbourline emails');
ok(/whole team/.test(r.reply), 'a team rule is saved for everyone');
r = await say(owner, 'whenever I say morning, show what needs my attention today');
ok(/Saved/.test(r.reply), 'a shortcut rule is saved');
r = await say(owner, 'always write my emails as project manager');
ok(/already have this rule/.test(r.reply), 'the same rule is not saved twice');
r = await say(member, 'rule for the team: never book meetings on Fridays');
ok(/Only admins, directors and managers/.test(r.reply), 'a member cannot set team rules');
r = await say(member, 'Never use exclamation marks in my emails');
ok(/Saved/.test(r.reply), 'a member can set their own rule');

group('list and settings');
r = await say(owner, 'show my rules');
ok(/15 minutes before meetings/.test(r.reply) && /cc Ramin/.test(r.reply) && !/exclamation/.test(r.reply), 'owner sees team + own rules, not other people\'s');
let s = await member.get('/api/ai/rules');
ok(s.status === 200 && s.data.rules.some(x => /cc Ramin/.test(x.text)) && s.data.rules.some(x => /exclamation/.test(x.text)) && !s.data.rules.some(x => /project manager/.test(x.text)), 'member sees team rules and their own only');
ok(s.data.can_team === false, 'member is told they cannot set team rules');
const teamRule = s.data.rules.find(x => /cc Ramin/.test(x.text));
r = await member.del(`/api/ai/rules?id=${teamRule.id}`);
ok(r.status === 403, 'member cannot remove a team rule');
r = await owner.post('/api/ai/rules', { text: 'Reply to me in Farsi', scope: 'me' });
ok(r.status === 200 && r.data.rule.scope === 'me', 'rule added in Settings');
r = await owner.patch('/api/ai/rules', { id: r.data.rule.id, text: 'Reply to me in English and Farsi' });
ok(r.status === 200 && /English and Farsi/.test(r.data.rule.text), 'rule edited in Settings');
r = await anon.get('/api/ai/rules'); ok(r.status === 401, 'needs sign-in');
r = await owner.post('/api/ai/rules', { text: 'x' }); ok(r.status === 400, 'empty rule refused');

group('rules are followed (built-in engine)');
r = await say(owner, 'schedule a meeting with @lena about the JV tomorrow at 10am');
const { data: ev } = await admin.from('calendar_events').select('id,starts_at,ends_at,reminder_minutes').order('created_at', { ascending: false }).limit(1);
ok(ev?.[0] && ev[0].reminder_minutes === 15, 'meeting reminder follows "remind me 15 minutes before meetings"');
ok(ev?.[0] && (new Date(ev[0].ends_at) - new Date(ev[0].starts_at)) / 60000 === 30, 'meeting length follows "meetings should be 30 minutes"');
r = await say(owner, 'schedule a meeting with @lena about the budget tomorrow at 2pm for 90 minutes');
const { data: ev2 } = await admin.from('calendar_events').select('starts_at,ends_at').order('created_at', { ascending: false }).limit(1);
ok((new Date(ev2[0].ends_at) - new Date(ev2[0].starts_at)) / 60000 === 90, 'what the person says this time beats the rule');
r = await say(owner, 'morning');
ok(/Your day/.test(r.reply), 'shortcut "morning" runs the briefing');
r = await owner.post('/api/email/draft-reply', { to: 'sarah@example.com', intent: 'confirm the site visit on Tuesday', provider: 'none' });
ok(r.status === 200 && r.data.persona === 'manager', 'emails are written as project manager by rule');

group('forget');
r = await say(owner, 'forget the rule about meetings should be 30 minutes');
ok(/Removed/.test(r.reply) && /30 minutes/.test(r.reply), 'forget a rule by its words');
r = await say(owner, 'show my rules');
const n = (r.reply.match(/^\d+\./gm) || []).length;
r = await say(owner, `forget rule ${n}`);
ok(/Removed/.test(r.reply), 'forget a rule by its number');
s = await owner.get('/api/ai/rules');
ok(!s.data.rules.some(x => /30 minutes/.test(x.text)), 'removed rule is gone');


await admin.from('app_settings').delete().eq('key', 'ai_rules');
const failed = results.filter(x => !x.ok);
console.log(`\nAI rules tests: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
