// Infinity Planet 4.6.1 — house presentation templates and hand-placed photos / drawings.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import JSZip from 'jszip';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
const res = []; const ok = (c, m) => { res.push(!!c); console.log(`  ${c ? '✓' : '✗'} ${m}`); };
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await c.auth.signInWithPassword({ email: 'owner@rhc.test', password: 'Owner-Pass-12345' }); const H = { Authorization: `Bearer ${data.session.access_token}`, 'content-type': 'application/json' };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b) }); return { status: r.status, type: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer()) }; };
const get = async p => (await fetch(BASE + p, { headers: H })).json();
const PNG = 'data:image/png;base64,' + readFileSync('public/brand/deck/ip-logo-light.png').toString('base64');
const extras = [{ id: 'ph1', kind: 'image', src: PNG, x: 7, y: 2, w: 3, h: 2.4, layer: 'back' }, { id: 'ar1', kind: 'arrow', x: 2, y: 5, w: 4, h: -1, color: '#C00000', stroke: 3, layer: 'front' }, { id: 'bx1', kind: 'rect', x: 1, y: 1, w: 2, h: 1, fill: '#00E4FD', layer: 'front' }, { id: 'tx1', kind: 'text', x: 1, y: 6, w: 5, h: 0.6, text: 'Hand note', size: 18, layer: 'front' }, { id: 'bad', kind: 'image', src: 'https://evil.example/x.png', x: 0, y: 0, w: 1, h: 1 }];
const deck = (theme) => ({ title: 'House test', theme, slides: [{ id: 's1', layout: 'title', title: 'House test', subtitle: 'Sub' }, { id: 's2', layout: 'section', title: 'The Location' }, { id: 's3', layout: 'bullets', title: 'Why', bullets: ['One', 'Two'], extras }, { id: 's4', layout: 'stats', title: 'Numbers', stats: [{ value: '12,000', label: 'Jobs' }, { value: '$5.6B', label: 'Output' }] }, { id: 's5', layout: 'closing', title: 'Thank you' }] });

console.log('▶ house templates');
for (const t of ['infinity', 'investor']) {
  let r = await post('/api/decks/render', { deck: deck(t), format: 'pptx' });
  ok(r.status === 200 && /presentation/.test(r.type), `${t}: PowerPoint made`);
  const zip = await JSZip.loadAsync(r.buf); const media = Object.keys(zip.files).filter(f => f.startsWith('ppt/media/'));
  ok(media.length >= 5, `${t}: template artwork and the photo are inside (${media.length} pictures)`);
  const s3 = await zip.file('ppt/slides/slide3.xml').async('string');
  ok(/Hand note/.test(s3) && /triangle/.test(s3), `${t}: hand-placed text and arrow are on slide 3`);
  ok(!/evil\.example/.test(s3), `${t}: outside picture links are dropped`);
  r = await post('/api/decks/render', { deck: deck(t), format: 'pdf' }); ok(r.status === 200 && r.buf.slice(0, 4).toString() === '%PDF', `${t}: PDF made`);
}
console.log('▶ hand-placed items survive changes');
const r = await fetch(BASE + '/api/decks/turn', { method: 'POST', headers: H, body: JSON.stringify({ message: 'rename slide 1 to Infinity Planet briefing', deck: deck('infinity'), provider: 'none' }) });
const j = await r.json(); const s3 = j.deck?.slides?.find(s => s.id === 's3');
ok(r.status === 200 && s3?.extras?.length === 4, `the built-in writer keeps the 4 safe items on the slide (${s3?.extras?.length})`);
ok(s3?.extras?.find(e => e.id === 'ph1')?.layer === 'back', 'the photo stays behind the text');

console.log('▶ photos from our library');
const turn = async b => { const r = await fetch(BASE + '/api/decks/turn', { method: 'POST', headers: H, body: JSON.stringify({ provider: 'none', ...b }) }); return { status: r.status, j: await r.json() }; };
let t = await turn({ message: 'Investor presentation for Infinity Planet: the location, the project scale, the hotel and accommodation, next steps', theme: 'infinity' });
const withPhotos = (t.j.deck?.slides || []).filter(s => s.photo && s.photo !== 'none');
ok(t.status === 200 && withPhotos.length >= 2, `the built-in writer puts library photos on matching slides (${withPhotos.length}: ${withPhotos.map(s => s.title + ' → ' + s.photo.split('/').pop()).join('; ')})`);
const k = t.j.deck.slides.findIndex(s => s.layout === 'bullets') + 1;
let t2 = await turn({ message: `add a photo of the resort pool to slide ${k}`, deck: t.j.deck });
ok(/p54\.jpg$/.test(t2.j.deck?.slides?.[k - 1]?.photo || ''), `"add a photo of the resort pool to slide ${k}" picks the pool photo (${t2.j.reply})`);
let t3 = await turn({ message: `remove the photo from slide ${k}`, deck: t2.j.deck });
ok(t3.j.deck?.slides?.[k - 1]?.photo === 'none', 'removing a photo sticks (it is not added back)');
let rr = await post('/api/decks/render', { deck: t2.j.deck, format: 'pptx' }); const z = await JSZip.loadAsync(rr.buf);
ok(rr.status === 200 && Object.keys(z.files).filter(f => f.startsWith('ppt/media/')).length >= withPhotos.length + 3, 'library photos are inside the PowerPoint');
rr = await post('/api/decks/render', { deck: t2.j.deck, format: 'pdf' }); ok(rr.status === 200, 'and the PDF');
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`); process.exit(res.every(Boolean) ? 0 : 1);
