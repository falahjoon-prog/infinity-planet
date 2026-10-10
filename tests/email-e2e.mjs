// Infinity Planet 4.2 email tests (built-in writer, no AI key, no Google needed):
// reply drafting by role, rewrite modes, branded preview, signatures, email look settings,
// bot email drafts, and approval/connection rules on sending.
// Usage (test database only): BASE=http://localhost:3300 node tests/email-e2e.mjs
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
async function login(email, password) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`login ${email}: ${error.message}`);
  return data.session.access_token;
}
const client = (token) => { const call = async (method, path, body) => { const h = token ? { Authorization: `Bearer ${token}` } : {}; if (body !== undefined) h['content-type'] = 'application/json'; const r = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined }); const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() }; }; return { get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p) }; };
const owner = client(await login('owner@rhc.test', 'Owner-Pass-12345'));
const member = client(await login('member@rhc.test', 'Team-Pass-12345'));
const viewer = client(await login('viewer@rhc.test', 'Team-Pass-12345'));
const anon = client(null);
const original = { from: 'Sarah Nguyen <sarah@harbourline.com.au>', subject: 'Fortitude Valley MOU - revised deposit', date: 'Thu, 8 Oct 2026', body: 'Hi,\n\nCould you confirm whether the deposit can be reduced to 5%? Please send through the latest site plan before Friday 16 Oct.\n\nKind regards,\nSarah' };
let r;

console.log('▶ Reply drafting');
r = await member.post('/api/email/draft-reply', { provider: 'none', original, persona: 'manager', intent: 'we will send the site plan by Wednesday', related: [{ subject: 'Fortitude Valley MOU first draft', date: '2026-09-02T00:00:00Z' }] });
ok(r.status === 200 && r.data.engine === 'rules', 'built-in writer');
ok(/^Dear Sarah,/.test(r.data.body) && /Project Manager/.test(r.data.body) && /Further to our previous correspondence/.test(r.data.body), 'reply as manager with history');
ok(/site plan before Friday 16 Oct\. — We will send the site plan by Wednesday/.test(r.data.body), 'answers the request');
ok(r.data.subject === 'Re: Fortitude Valley MOU - revised deposit' && r.data.persona === 'manager', 'subject and persona');
ok(r.data.insights.some(x => /Questions/.test(x)) && r.data.insights.some(x => /Earlier emails/.test(x)), 'insights');
ok(r.data.reply_to?.to === 'sarah@harbourline.com.au', 'reply-to address');
r = await member.post('/api/email/draft-reply', { provider: 'none', original, persona: 'ceo' });
ok(/Chief Executive Officer/.test(r.data.body), 'reply as CEO');
r = await member.post('/api/email/draft-reply', { provider: 'openai', original, persona: 'admin' });
ok(r.status === 200 && r.data.engine === 'rules' && /not configured/.test(r.data.note || ''), 'unconfigured provider falls back');
r = await member.post('/api/email/draft-reply', { provider: 'none', intent: 'ask for the updated term sheet by Friday', to: 'Sarah Nguyen <sarah@harbourline.com.au>' });
ok(/Could you please send through the updated term sheet by Friday\?/.test(r.data.body) && r.data.subject, 'new email');
r = await viewer.post('/api/email/draft-reply', { provider: 'none', original });
ok(r.status === 403, 'viewers cannot draft');
r = await member.post('/api/email/read', { original });
ok(r.status === 200 && r.data.reading.questions.length === 1 && r.data.insights.length > 0, 'read email');

console.log('▶ Rewrite');
r = await member.post('/api/email/rewrite', { body: 'hey sarah,\n\nthx for ur msg, we r gonna review asap!!\n\ncheers\nFalah', mode: 'polish' });
ok(r.status === 200 && /^Hi Sarah,/.test(r.data.body) && /Thank you for your message/.test(r.data.body) && /Kind regards,/.test(r.data.body), 'polish');
r = await member.post('/api/email/rewrite', { body: "Hi Sarah,\n\nWe can't do that.\n\nThanks,\nFalah", mode: 'formal' });
ok(/cannot/.test(r.data.body) && /Dear Sarah/.test(r.data.body), 'formal');
r = await member.post('/api/email/rewrite', { body: 'Hi,\n\nPlease review.\n\nRegards,\nA', instruction: 'make it firmer' });
ok(r.status === 200 && /AI provider/.test(r.data.note || ''), 'custom instruction needs AI');
r = await member.post('/api/email/rewrite', { body: '  ' });
ok(r.status === 400, 'empty body rejected');

console.log('▶ Signature & email look');
r = await member.patch('/api/email/signature', { title: 'Development Manager', phone: '07 3000 1111', mobile: '0400 111 222', persona: 'coordinator' });
ok(r.status === 200 && r.data.signature.persona === 'coordinator', 'save my signature');
r = await member.get('/api/email/signature');
ok(r.data.signature.mobile === '0400 111 222', 'read my signature');
r = await member.post('/api/email/draft-reply', { provider: 'none', original });
ok(r.data.persona === 'coordinator' && /Project Coordinator/.test(r.data.body), 'my default role is used');
r = await member.post('/api/email/draft-reply', { provider: 'none', original, persona: null });
ok(r.data.persona === null && /Development Manager/.test(r.data.body), 'no role → my title');
r = await member.patch('/api/settings', { email_style: { header: 'band' } });
ok(r.status === 403, 'members cannot change the email look');
r = await owner.patch('/api/settings', { email_style: { branded: true, header: 'band', show_footer: true, quote_previous: true, disclaimer: 'Confidential test notice.', default_tone: 'professional' } });
ok(r.status === 200 && r.data.settings.email_style.header === 'band', 'admin sets the email look');

console.log('▶ Preview');
r = await member.post('/api/email/preview', { subject: 'Re: MOU', body: 'Dear Sarah,\n\n1. One\n2. Two\n\nKind regards,\nMax Member\nRHC City Pty Ltd', quoted: { from: 'Sarah', date: 'Thu', body: 'Original question' } });
ok(r.status === 200 && r.data.branded && /<ol/.test(r.data.html) && /Confidential test notice/.test(r.data.html) && /Original question/.test(r.data.html), 'branded HTML preview');
ok(/M 0400 111 222/.test(r.data.html) && /<!doctype html>/i.test(r.data.html), 'signature contact line');
ok(/Max Member/.test(r.data.text) && /Confidential test notice/.test(r.data.text), 'plain-text copy');
r = await anon.post('/api/email/preview', { subject: 'x', body: 'y' });
ok(r.status === 401, 'preview needs sign-in');

console.log('▶ Drafts, bot and sending rules');
r = await member.post('/api/email/drafts', { to_addresses: 'sarah@harbourline.com.au', subject: 'Re: MOU', body: 'Dear Sarah,\n\nTest.\n\nKind regards,\nMax' });
ok(r.status === 201, 'save draft'); const draftId = r.data.draft?.id;
r = await member.post('/api/email/preview', { draft_id: draftId });
ok(r.status === 200 && /Test\./.test(r.data.html), 'preview a saved draft');
r = await member.post(`/api/email/drafts/${draftId}/send`, { confirm: true });
ok(r.status === 409 && /approved/i.test(r.data.error), 'sending needs approval');
r = await member.post(`/api/email/drafts/${draftId}/send`, {});
ok(r.status === 400, 'sending needs confirmation');
r = await member.post('/api/ai/chat', { message: 'draft an email to sarah@harbourline.com.au about the revised deposit, as project manager', allow_actions: true, provider: 'search' });
const acts = r.data.message?.metadata?.actions || [];
ok(r.status === 200 && acts.some(a => a.type === 'draft_email' && a.ok), 'bot drafts an email');
r = await member.get('/api/email/drafts');
const botDraft = r.data.drafts.find(d => d.to_addresses === 'sarah@harbourline.com.au' && /Project Manager/.test(d.body));
ok(botDraft && botDraft.status === 'draft', 'bot draft saved for approval (never sent)');
r = await member.post('/api/ai/chat', { message: 'reply to the latest email from Harbourline saying we accept', allow_actions: true, provider: 'search' });
const acts2 = r.data.message?.metadata?.actions || [];
ok(r.status === 200 && acts2.some(a => a.type === 'reply_email' && !a.ok && /Google|connected/i.test(a.summary)), 'reply needs Gmail connected');
r = await member.post('/api/ai/chat', { message: 'how do I reply to an email as CEO?', allow_actions: true, provider: 'search' });
ok(r.status === 200 && /Reply as/.test(JSON.stringify(r.data)), 'app guide teaches email');

console.log('▶ Daily briefing & Drive');
const meId = (await member.get('/api/me')).data.user.id;
await member.post('/api/tasks', { title: 'Overdue briefing task', assigned_to: meId, due_at: new Date(Date.now() - 86400_000).toISOString(), priority: 'high' });
await member.post('/api/tasks', { title: 'Due soon briefing task', assigned_to: meId, due_at: new Date(Date.now() + 3 * 3600_000).toISOString() });
r = await member.post('/api/ai/chat', { message: 'What needs my attention today?', allow_actions: true, provider: 'search' });
const brief = r.data.message?.content || '';
ok(r.status === 200 && r.data.message.metadata.actions[0]?.type === 'briefing', 'briefing action');
ok(/Overdue/.test(brief) && /Overdue briefing task/.test(brief) && /Due soon briefing task/.test(brief) && /Your day/.test(brief), 'briefing lists overdue and due work');
r = await member.post('/api/ai/chat', { message: 'zzqx unknown flibbertigibbet', allow_actions: true, provider: 'search' });
ok(/Google Drive is not connected|Google Drive/.test(r.data.message?.content || ''), 'not-found reply explains the Drive connection');
r = await owner.get('/api/system/status');
ok(r.data.google.drive && typeof r.data.google.drive.indexed === 'number' && r.data.server.version === JSON.parse(readFileSync('package.json', 'utf8')).version, 'status shows Drive indexing and the app version');

console.log('▶ Team: edit and remove members');
const em = `edit.${Date.now()}@rhc.test`;
r = await owner.post('/api/team/members', { email: em, full_name: 'Temp Person', role: 'member', password: 'Temp-Pass-12345' });
ok(r.status === 201 || r.status === 200, 'create member'); const mid = r.data.member?.id || r.data.user?.id || r.data.id;
r = await owner.patch(`/api/team/members/${mid}`, { full_name: 'Edited Person', title: 'Site Manager', email: em.replace('edit.', 'edited.'), role: 'project' });
ok(r.status === 200 && r.data.member.full_name === 'Edited Person' && r.data.member.title === 'Site Manager' && r.data.member.email === em.replace('edit.', 'edited.') && r.data.member.role === 'project', 'edit name, title, email, role');
ok(!!(await login(em.replace('edit.', 'edited.'), 'Temp-Pass-12345')), 'signs in with the new email');
r = await owner.patch(`/api/team/members/${mid}`, { email: 'owner@rhc.test' });
ok(r.status === 409, 'email already in use rejected');
r = await member.patch(`/api/team/members/${mid}`, { full_name: 'Hacker' });
ok(r.status === 403, 'members cannot edit others');
r = await owner.del(`/api/team/members/${mid}`);
ok(r.status === 200 && (r.data.removed || r.data.deactivated), 'remove member');
r = await owner.del(`/api/team/members/${(await owner.get('/api/me')).data.user.id}`);
ok(r.status === 400, 'cannot remove yourself');

console.log(`\n${'='.repeat(50)}\nEmail tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
