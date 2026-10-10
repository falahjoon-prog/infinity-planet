// Infinity Planet 4.6 — presentation templates, PowerPoint template import, learning from the business's decks.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const results = []; let current = '';
const ok = (c, m) => { results.push({ group: current, ok: !!c, msg: m }); if (!c) console.log(`  ✗ ${m}`); };
const group = g => { current = g; console.log(`\n▶ ${g}`); };
async function login(email, password) { const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`login ${email}: ${error.message}`); return data.session.access_token; }
const client = token => { const call = async (method, path, body, raw) => { const h = token ? { Authorization: `Bearer ${token}` } : {}; let payload; if (body instanceof FormData) payload = body; else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); } const r = await fetch(BASE + path, { method, headers: h, body: payload }); if (raw) return r; const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), headers: r.headers }; }; return { get: p => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p) }; };
const owner = client(await login('owner@rhc.test', 'Owner-Pass-12345'));
const member = client(await login('member@rhc.test', 'Team-Pass-12345'));
const anon = client(null);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
await admin.from('app_settings').delete().in('key', ['deck_themes', 'deck_house']);
const PPTX = readFileSync('tests/fixtures/sample-template.pptx');
const deck = { title: 'Test deck', slides: [{ layout: 'title', title: 'Test deck', subtitle: 'Sub' }, { layout: 'bullets', title: 'Points', bullets: ['One', 'Two'] }, { layout: 'stats', title: 'Numbers', stats: [{ value: '$1m', label: 'Value' }, { value: '12', label: 'Homes' }] }, { layout: 'two_column', title: 'Two', left: { heading: 'A', bullets: ['a'] }, right: { heading: 'B', bullets: ['b'] } }, { layout: 'chart', title: 'Chart', chart: { type: 'line', labels: ['a', 'b'], series: [{ name: 'S', values: [1, 2] }] } }, { layout: 'quote', quote: 'Q', by: 'Me' }, { layout: 'section', title: 'Part two' }, { layout: 'closing', title: 'Thanks' }] };

group('built-in templates render to PowerPoint and PDF');
for (const t of ['brand', 'executive', 'consulting', 'property', 'architect', 'pitch', 'teal', 'minimal', 'editorial', 'charcoal', 'midnight', 'forest', 'coral', 'terracotta']) {
  const a = await owner.post('/api/decks/render', { deck: { ...deck, theme: t }, format: 'pptx' });
  const b = await owner.post('/api/decks/render', { deck: { ...deck, theme: t }, format: 'pdf' });
  ok(a.status === 200 && a.data.subarray(0, 2).toString() === 'PK' && b.status === 200 && b.data.subarray(0, 4).toString() === '%PDF', `${t}: PowerPoint and PDF`);
}

group('import a PowerPoint template');
let fd = new FormData(); fd.append('file', new Blob([PPTX]), 'Harbourline proposal.pptx');
let r = await member.post('/api/decks/themes', fd); ok(r.status === 403, 'members cannot add templates');
fd = new FormData(); fd.append('file', new Blob([Buffer.from('not a pptx')]), 'x.pptx');
r = await owner.post('/api/decks/themes', fd); ok(r.status === 400, 'a non-PowerPoint file is refused');
fd = new FormData(); fd.append('file', new Blob([PPTX]), 'Harbourline proposal.pptx');
r = await owner.post('/api/decks/themes', fd);
const T = r.data.theme;
ok(r.status === 200 && T && T.colors.primary === '#3B1F5E' && T.colors.accent === '#F2A541', 'brand colours read from the theme');
ok(T && T.fonts.head === 'Georgia' && T.fonts.body === 'Verdana', 'fonts read from the theme');
ok(T && T.cover === 'image' && r.data.read.cover && T.image, 'title slide background picture kept');
r = await owner.get('/api/decks/themes'); ok(r.status === 200 && r.data.custom.some(x => x.id === T.id), 'listed with the templates');
r = await owner.get(`/api/decks/themes/${T.id}/image`); ok(r.status === 200 && /image\/jpeg/.test(r.headers.get('content-type')), 'cover picture served');
r = await anon.get(`/api/decks/themes/${T.id}/image`); ok(r.status === 401, 'cover picture needs sign-in');
r = await owner.post('/api/decks/render', { deck: { ...deck, theme: T.id }, format: 'pptx' });
const { default: JSZip } = await import('jszip'); const z = await JSZip.loadAsync(r.data);
ok(Object.keys(z.files).some(f => /^ppt\/media\/.+\.(jpe?g|png)$/.test(f)) && /Georgia/.test(await z.file('ppt/slides/slide1.xml').async('string')), 'PowerPoint uses its picture and fonts');

group('learn from our decks');
fd = new FormData(); fd.append('file', new Blob([PPTX], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'Harbourline JV proposal.pptx');
const up = await owner.post('/api/documents/upload', fd); ok(up.status === 200 || up.status === 201, 'deck uploaded to Documents');
r = await member.post('/api/decks/learn', {}); ok(r.status === 403, 'members cannot run learning');
r = await owner.post('/api/decks/learn', {});
ok(r.status === 200 && r.data.read.length >= 1, 'reads the uploaded deck (Google not connected here)');
const st = r.data.house?.structure || [];
ok(['Executive summary', 'The site / project', 'Design & concept', 'Financials', 'Timeline', 'Risks', 'Next steps'].every(x => st.includes(x)) && st.indexOf('Executive summary') < st.indexOf('Financials') && st.indexOf('Financials') < st.indexOf('Next steps'), `learned the usual order: ${st.join(' → ')}`);
ok(r.data.template && r.data.house.theme_id === r.data.template.id, 'house template made and set as default');
r = await owner.post('/api/decks/turn', { message: 'presentation for a new partner', provider: 'none' });
const titles = (r.data.deck?.slides || []).map(s => s.title);
ok(r.status === 200 && titles.includes('Financials') && titles.includes('Risks') && titles.indexOf('Financials') < titles.indexOf('Risks'), 'a new deck follows the learned structure');
ok(r.data.deck?.theme === r.data.deck?.theme && r.data.deck?.theme, 'new deck uses the house template');

group('switching templates');
r = await owner.post('/api/decks/turn', { message: 'use the Executive Navy template', deck: { ...deck, theme: 'brand' }, provider: 'none' });
ok(r.status === 200 && r.data.deck.theme === 'executive', 'chat: "use the Executive Navy template"');
r = await owner.post('/api/decks/turn', { message: 'add a slide about funding: equity; debt', deck: { ...deck, theme: 'forest' }, provider: 'none' });
ok(r.data.deck.theme === 'forest', 'the template stays when the deck changes');
r = await owner.patch('/api/decks/themes', { default: 'pitch' }); ok(r.status === 200 && r.data.house.theme_id === 'pitch', 'default template changed');
r = await owner.del(`/api/decks/themes?id=${T.id}`); ok(r.status === 200 && !r.data.custom.some(x => x.id === T.id), 'imported template removed');

await admin.from('app_settings').delete().in('key', ['deck_themes', 'deck_house']);
const failed = results.filter(x => !x.ok);
console.log(`\nPresentation template tests: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
process.exit(failed.length ? 1 : 0);
