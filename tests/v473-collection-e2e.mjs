// Infinity Planet template collection (4.7.3): 18 brand templates, each starts from a ready outline and renders to PowerPoint and PDF;
// all artwork files exist; the newsletter layout renders in the website style.
// Usage (test database only): BASE=http://localhost:3300 node tests/v473-collection-e2e.mjs
import { readFileSync, existsSync, statSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE || 'http://localhost:3300';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await c.auth.signInWithPassword({ email: 'owner@rhc.test', password: 'Owner-Pass-12345' }); const token = data.session.access_token;
const call = async (method, path, body, raw) => { const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return raw ? { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') } : { status: r.status, data: await r.json().catch(() => null) }; };

console.log('\n▶ the collection');
const r = await call('GET', '/api/decks/themes?outlines=1');
const col = r.data?.collection || [];
ok(col.length === 18, `18 collection templates (${col.length})`);
ok(new Set(col.map(t => t.id)).size === 18, 'all ids are different');
const files = new Set(); for (const t of col) for (const v of Object.values(t.art || {})) if (typeof v === 'string' && /\.(png|jpe?g)$/.test(v)) files.add(v);
const missing = [...files].filter(f => !existsSync(`public/brand/deck/${f}`));
ok(files.size > 90 && !missing.length, `every artwork file exists (${files.size} files${missing.length ? `; missing ${missing.join(', ')}` : ''})`);
const big = [...files].filter(f => existsSync(`public/brand/deck/${f}`) && statSync(`public/brand/deck/${f}`).size > 400_000);
ok(!big.length, `artwork files stay small (${big.join(', ') || 'none over 400 KB'})`);
const taglines = col.every(t => t.outline.slides.at(-1).layout === 'closing' && /bring the world to Australia/.test(t.outline.slides.at(-1).title));
ok(taglines, 'every outline closes with "We bring the world to Australia, and Australia to the world."');
ok(col.filter(t => /Integrated Entertainment City/.test(JSON.stringify(t.outline))).length >= 3, 'the pick line is used on the covers');

console.log('\n▶ each template renders');
for (const t of col) {
  const deck = { ...t.outline, theme: t.id };
  const p = await call('POST', '/api/decks/render', { deck, format: 'pptx' }, true);
  let slides = 0, media = 0; try { const z = await JSZip.loadAsync(p.buf); slides = Object.keys(z.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length; media = Object.keys(z.files).filter(f => f.startsWith('ppt/media/')).length; } catch {}
  const d = await call('POST', '/api/decks/render', { deck, format: 'pdf' }, true);
  ok(p.status === 200 && slides === t.outline.slides.length && media >= 4 && d.status === 200 && d.buf.slice(0, 4).toString() === '%PDF', `${t.name}: ${slides} slides in PowerPoint (${media} pictures) and a PDF`);
}
const pp = await call('POST', '/api/decks/render', { deck: { ...col[0].outline, theme: col[0].id }, format: 'pptx' }, true);
const z = await JSZip.loadAsync(pp.buf); const xml = await z.file('ppt/slides/slide2.xml').async('string');
ok(/Gabarito|DM Sans/.test(xml), 'PowerPoint text uses the brand fonts (Gabarito / DM Sans)');

console.log('\n▶ newsletter (website style)');
const a = await call('POST', '/api/marketing/assets', { title: 'Newsletter test', layout: 'newsletter_email', kind: 'design', content: 'Newsletter', design: { layout: 'newsletter_email', theme: { primary: '#111111', accent: '#E4ED64', background: '#F6F3EC', text: '#4B4B4B', font: 'brand' }, content: { headline: 'Hello investors', subheadline: 'Where Imagination Becomes an Experience', eyebrow: 'Newsletter · October 2026', logo_image: '/brand/deck/t/logo-desc.png', image_lib: '/brand/deck/photos/d02.jpg', items: [{ title: 'Story one', date: '1 Oct 2026', text: 'Short text', url: 'https://www.infinityplanet.com.au/news', tag: 'News' }, { title: 'Story two', text: 'More' }], stats: [{ value: '68 ha', label: 'Site' }], cta: 'Register your interest', contact: 'info@infinityplanet.com.au' } } });
ok(a.status === 201, 'a newsletter design is saved');
const h = await call('GET', `/api/marketing/assets/${a.data?.asset?.id}/render`, null, true); const html = h.buf.toString();
ok(h.status === 200 && html.includes('#F6F3EC') && html.includes('#E4ED64') && html.includes('Story one') && html.includes('Story two') && html.includes('&#8599;'), 'renders: cream page, lime highlight, story cards with the arrow button');
ok(/data:image\/png;base64/.test(html) && /data:image\/jpeg;base64/.test(html), 'the logo and library photo are embedded (self-contained HTML)');
ok(/role="presentation"/.test(html) && /max-width:600px/.test(html), 'email-safe table layout, 600 px wide');
ok(html.includes('DRAFT'), 'unapproved newsletter is watermarked');

console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
