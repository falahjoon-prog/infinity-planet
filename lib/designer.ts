/**
 * Designer — layout engine. Pure TypeScript (runs in browser and server).
 * A design = layout + theme + content blocks. Rendering produces a
 * self-contained HTML document sized for print (PDF) or screen.
 */
export type DesignTheme = { primary: string; accent: string; background: string; text: string; font: 'serif' | 'sans' | 'modern' | 'brand' };
export type DesignContent = {
  eyebrow?: string; headline?: string; subheadline?: string; body?: string; bullets?: string[];
  stats?: { label: string; value: string }[]; cta?: string; contact?: string; disclaimer?: string;
  image_url?: string; image_path?: string; logo_text?: string; logo_image?: string;
  /** A library photo (public path) or an own picture (data URL) used when no image was uploaded. */
  image_lib?: string;
  /** Newsletter: the news stories (title, date, short text, link). */
  items?: { title: string; date?: string; text?: string; url?: string; tag?: string }[];
};
export type Design = { layout: LayoutId; theme: DesignTheme; content: DesignContent };
export type LayoutId = 'flyer_a4' | 'brochure_a4' | 'fact_sheet_a4' | 'investor_onepager' | 'eoi_poster_a3' | 'social_square' | 'social_story' | 'linkedin_banner' | 'email_header' | 'site_hoarding' | 'newsletter_email';

export const LAYOUTS: Record<LayoutId, { label: string; width: string; height: string; page: string; pages: number; screen: boolean; description: string }> = {
  flyer_a4: { label: 'Flyer (A4)', width: '210mm', height: '297mm', page: 'A4 portrait', pages: 1, screen: false, description: 'Hero image, headline, highlights and contact.' },
  brochure_a4: { label: 'Brochure (2 × A4)', width: '210mm', height: '297mm', page: 'A4 portrait', pages: 2, screen: false, description: 'Cover page plus detail page with stats.' },
  fact_sheet_a4: { label: 'Fact sheet (A4)', width: '210mm', height: '297mm', page: 'A4 portrait', pages: 1, screen: false, description: 'Data-led single page.' },
  investor_onepager: { label: 'Investor one-pager (A4)', width: '210mm', height: '297mm', page: 'A4 portrait', pages: 1, screen: false, description: 'Executive investment summary.' },
  eoi_poster_a3: { label: 'EOI poster (A3)', width: '297mm', height: '420mm', page: 'A3 portrait', pages: 1, screen: false, description: 'Large-format expression of interest poster.' },
  site_hoarding: { label: 'Site hoarding (landscape)', width: '420mm', height: '210mm', page: 'A3 landscape', pages: 1, screen: false, description: 'Wide sign for site fencing.' },
  social_square: { label: 'Social post (1080 × 1080)', width: '1080px', height: '1080px', page: '1080px 1080px', pages: 1, screen: true, description: 'Instagram / LinkedIn / Facebook feed.' },
  social_story: { label: 'Story (1080 × 1920)', width: '1080px', height: '1920px', page: '1080px 1920px', pages: 1, screen: true, description: 'Instagram / Facebook story.' },
  linkedin_banner: { label: 'LinkedIn banner (1584 × 396)', width: '1584px', height: '396px', page: '1584px 396px', pages: 1, screen: true, description: 'Company or profile banner.' },
  email_header: { label: 'Email header (1200 × 400)', width: '1200px', height: '400px', page: '1200px 400px', pages: 1, screen: true, description: 'Newsletter header graphic.' },
  newsletter_email: { label: 'Email newsletter (640 px)', width: '640px', height: '2600px', page: '640px 2600px', pages: 1, screen: true, description: 'The infinityplanet.com.au look — cream page, white rounded cards with the arrow button, lime highlights. Export the HTML for your email tool.' },
};

export const THEMES: Record<string, DesignTheme> = {
  'Infinity Planet website': { primary: '#111111', accent: '#E4ED64', background: '#F6F3EC', text: '#4B4B4B', font: 'brand' },
  'Infinity Planet brand': { primary: '#002A3A', accent: '#00E4FD', background: '#FCF8F1', text: '#173845', font: 'brand' },
  'Navy & Gold': { primary: '#13294b', accent: '#c8a45c', background: '#ffffff', text: '#1b2433', font: 'serif' },
  'Midnight': { primary: '#0b1424', accent: '#7fb0e8', background: '#0f1b2e', text: '#e9eef6', font: 'modern' },
  'Stone & Copper': { primary: '#3b3833', accent: '#b8734a', background: '#f6f2ec', text: '#2b2824', font: 'serif' },
  'Harbour Blue': { primary: '#0f4c75', accent: '#3fb5a3', background: '#ffffff', text: '#14212e', font: 'sans' },
  'Monochrome': { primary: '#111111', accent: '#888888', background: '#ffffff', text: '#111111', font: 'modern' },
};

const FONTS: Record<DesignTheme['font'], { head: string; body: string; link: string }> = {
  serif: { head: "'Playfair Display', Georgia, serif", body: "'Inter', 'Segoe UI', Arial, sans-serif", link: 'family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600' },
  sans: { head: "'Inter', 'Segoe UI', Arial, sans-serif", body: "'Inter', 'Segoe UI', Arial, sans-serif", link: 'family=Inter:wght@400;500;600;700;800' },
  modern: { head: "'Space Grotesk', 'Segoe UI', Arial, sans-serif", body: "'Inter', 'Segoe UI', Arial, sans-serif", link: 'family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600' },
  brand: { head: "'Gabarito', 'Segoe UI', Arial, sans-serif", body: "'DM Sans', 'Segoe UI', Arial, sans-serif", link: 'family=Gabarito:wght@500;700;800&family=DM+Sans:wght@400;500;700' },
};

export function escapeHtml(s: string) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const para = (s?: string) => (s || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
const safeUrl = (u?: string) => (u && /^(https?:|data:image\/|blob:|\/)/i.test(u) ? u.replace(/"/g, '%22') : '');

export function defaultDesign(layout: LayoutId = 'flyer_a4', businessName = 'RHC City'): Design {
  if (layout === 'newsletter_email') return { layout, theme: THEMES['Infinity Planet website'], content: NEWSLETTER_START(businessName) };
  return { layout, theme: THEMES['Navy & Gold'], content: { eyebrow: businessName.toUpperCase(), headline: '', subheadline: '', body: '', bullets: [], stats: [], cta: '', contact: '', disclaimer: '', logo_text: businessName.toUpperCase() } };
}

export function renderDesign(d: Design, opts: { watermark?: string | null; forPrint?: boolean } = {}): string {
  const L = LAYOUTS[d.layout] || LAYOUTS.flyer_a4;
  const t = d.theme; const f = FONTS[t.font] || FONTS.serif; const c = d.content;
  if (d.layout === 'newsletter_email') return renderNewsletter(d, f, opts);
  const img = safeUrl(c.image_url);
  const bullets = (c.bullets || []).filter(Boolean);
  const stats = (c.stats || []).filter(s => s.label || s.value);
  const wm = opts.watermark ? `<div class="wm">${escapeHtml(opts.watermark)}</div>` : '';
  const logoImg = safeUrl(c.logo_image);
  const logo = logoImg ? `<div class="logo"><img class="logo-img" src="${logoImg}" alt="${escapeHtml(c.logo_text || '')}"></div>` : `<div class="logo">${escapeHtml(c.logo_text || '')}</div>`;
  const statHtml = stats.length ? `<div class="stats">${stats.map(s => `<div><b>${escapeHtml(s.value)}</b><span>${escapeHtml(s.label)}</span></div>`).join('')}</div>` : '';
  const bulletHtml = bullets.length ? `<ul class="bullets">${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : '';
  const heroBg = img ? `background-image:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.55)),url("${img}");` : `background:linear-gradient(135deg,${t.primary},${shade(t.primary, 25)});`;
  const contact = c.contact ? `<div class="contact">${escapeHtml(c.contact).replace(/\n/g, '<br>')}</div>` : '';
  const cta = c.cta ? `<div class="cta">${escapeHtml(c.cta)}</div>` : '';
  const disc = c.disclaimer ? `<div class="disc">${escapeHtml(c.disclaimer)}</div>` : '';
  let pages = '';
  switch (d.layout) {
    case 'brochure_a4':
      pages = `<section class="page cover" style="${heroBg}"><div class="pad">${logo}<div class="grow"></div>${c.eyebrow ? `<div class="eyebrow light">${escapeHtml(c.eyebrow)}</div>` : ''}<h1 class="light">${escapeHtml(c.headline || '')}</h1>${c.subheadline ? `<h2 class="light">${escapeHtml(c.subheadline)}</h2>` : ''}<div class="rule"></div></div>${wm}</section>
<section class="page"><div class="pad"><div class="eyebrow">${escapeHtml(c.eyebrow || 'OVERVIEW')}</div><h2 class="dark">${escapeHtml(c.headline || '')}</h2><div class="body">${para(c.body)}</div>${statHtml}${bulletHtml}<div class="grow"></div>${cta}${contact}${disc}</div>${wm}</section>`;
      break;
    case 'fact_sheet_a4':
    case 'investor_onepager':
      pages = `<section class="page"><div class="band"><div>${logo}<div class="eyebrow light">${escapeHtml(c.eyebrow || (d.layout === 'investor_onepager' ? 'INVESTMENT SUMMARY' : 'PROJECT FACT SHEET'))}</div></div></div>
<div class="pad tight">${img ? `<div class="img" style="background-image:url('${img}')"></div>` : ''}<h1 class="dark">${escapeHtml(c.headline || '')}</h1>${c.subheadline ? `<h2 class="muted">${escapeHtml(c.subheadline)}</h2>` : ''}${statHtml}<div class="cols"><div class="body">${para(c.body)}</div><div>${bulletHtml}</div></div><div class="grow"></div>${cta}${contact}${disc}</div>${wm}</section>`;
      break;
    case 'social_square': case 'social_story': case 'linkedin_banner': case 'email_header': case 'site_hoarding': case 'eoi_poster_a3':
      pages = `<section class="page hero" style="${heroBg}"><div class="pad">${logo}<div class="grow"></div>${c.eyebrow ? `<div class="eyebrow light">${escapeHtml(c.eyebrow)}</div>` : ''}<h1 class="light">${escapeHtml(c.headline || '')}</h1>${c.subheadline ? `<h2 class="light">${escapeHtml(c.subheadline)}</h2>` : ''}${['social_story', 'eoi_poster_a3', 'site_hoarding'].includes(d.layout) && bullets.length ? `<ul class="bullets light">${bullets.slice(0, 5).map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}${c.cta ? `<div class="cta">${escapeHtml(c.cta)}</div>` : ''}${c.contact && !['linkedin_banner', 'email_header'].includes(d.layout) ? `<div class="contact light">${escapeHtml(c.contact).replace(/\n/g, '<br>')}</div>` : ''}${d.layout === 'eoi_poster_a3' || d.layout === 'site_hoarding' ? disc.replace('class="disc"', 'class="disc light"') : ''}</div>${wm}</section>`;
      break;
    default: // flyer_a4
      pages = `<section class="page"><div class="hero half" style="${heroBg}"><div class="pad">${logo}<div class="grow"></div>${c.eyebrow ? `<div class="eyebrow light">${escapeHtml(c.eyebrow)}</div>` : ''}<h1 class="light">${escapeHtml(c.headline || '')}</h1></div></div>
<div class="pad tight">${c.subheadline ? `<h2 class="dark">${escapeHtml(c.subheadline)}</h2>` : ''}<div class="body">${para(c.body)}</div>${statHtml}${bulletHtml}<div class="grow"></div>${cta}${contact}${disc}</div>${wm}</section>`;
  }
  const isScreen = L.screen;
  const scale = isScreen ? 1 : 1;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.headline || 'Design')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?${f.link}&display=swap" rel="stylesheet">
<style>
@page{size:${L.page};margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${opts.forPrint ? '#fff' : '#e9edf2'};-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:${f.body};color:${t.text}}
.page{width:${L.width};height:${L.height};background:${t.background};position:relative;overflow:hidden;display:flex;flex-direction:column;margin:${opts.forPrint ? '0' : '24px auto'};box-shadow:${opts.forPrint ? 'none' : '0 10px 40px rgba(0,0,0,.18)'};page-break-after:always;transform-origin:top center;zoom:${scale}}
.page:last-child{page-break-after:auto}
.pad{padding:${isScreen ? '7%' : '16mm'};display:flex;flex-direction:column;flex:1;position:relative;z-index:1}
.pad.tight{padding-top:${isScreen ? '5%' : '10mm'}}
.grow{flex:1}
.hero,.cover{background-size:cover;background-position:center;color:#fff}
.hero.half{height:48%;display:flex}
.band{background:${t.primary};color:#fff;padding:${isScreen ? '4% 7%' : '10mm 16mm'};display:flex;justify-content:space-between;align-items:center}
.logo{font-family:${f.head};font-weight:700;letter-spacing:.32em;font-size:${isScreen ? '28px' : '11pt'};color:${t.accent}}
.logo-img{display:block;max-height:${isScreen ? '72px' : '18mm'};max-width:${isScreen ? '260px' : '60mm'};object-fit:contain}
.eyebrow{font-size:${isScreen ? '22px' : '8.5pt'};letter-spacing:.28em;font-weight:600;color:${t.accent};margin-bottom:${isScreen ? '18px' : '4mm'};text-transform:uppercase}
h1{font-family:${f.head};font-weight:700;line-height:1.05;letter-spacing:-.01em;font-size:${d.layout === 'linkedin_banner' || d.layout === 'email_header' ? '64px' : isScreen ? '92px' : d.layout === 'eoi_poster_a3' || d.layout === 'site_hoarding' ? '54pt' : '34pt'}}
h2{font-family:${f.head};font-weight:600;line-height:1.2;font-size:${isScreen ? '40px' : '15pt'};margin-top:${isScreen ? '16px' : '4mm'}}
.light{color:#fff}.dark{color:${t.primary}}.muted{color:${t.text};opacity:.7}
.rule{width:60px;height:3px;background:${t.accent};margin-top:8mm}
.body{font-size:${isScreen ? '28px' : '10.5pt'};line-height:1.6;margin-top:${isScreen ? '20px' : '5mm'}}
.body p+p{margin-top:.8em}
.stats{display:grid;grid-template-columns:repeat(${Math.min(Math.max(stats.length, 1), 4)},1fr);gap:${isScreen ? '18px' : '4mm'};margin:${isScreen ? '28px 0' : '7mm 0'};border-top:2px solid ${t.accent};padding-top:${isScreen ? '18px' : '4mm'}}
.stats b{display:block;font-family:${f.head};font-size:${isScreen ? '44px' : '17pt'};color:${t.primary}}
.stats span{font-size:${isScreen ? '18px' : '7.5pt'};letter-spacing:.14em;text-transform:uppercase;opacity:.75}
.bullets{list-style:none;margin-top:${isScreen ? '20px' : '5mm'}}
.bullets li{font-size:${isScreen ? '28px' : '10.5pt'};padding:${isScreen ? '10px 0 10px 34px' : '2mm 0 2mm 7mm'};position:relative;border-bottom:1px solid rgba(127,127,127,.18)}
.bullets li:before{content:'';position:absolute;left:0;top:50%;width:${isScreen ? '14px' : '3mm'};height:2px;background:${t.accent}}
.bullets.light li{color:#fff;border-color:rgba(255,255,255,.25)}
.cols{display:grid;grid-template-columns:1.3fr 1fr;gap:8mm}
.img{height:70mm;background-size:cover;background-position:center;border-radius:2mm;margin-bottom:6mm}
.cta{display:inline-block;align-self:flex-start;background:${t.accent};color:${t.primary};font-weight:700;padding:${isScreen ? '18px 30px' : '3.5mm 6mm'};font-size:${isScreen ? '26px' : '10pt'};letter-spacing:.06em;margin-top:${isScreen ? '26px' : '6mm'}}
.contact{font-size:${isScreen ? '22px' : '9pt'};margin-top:${isScreen ? '20px' : '5mm'};line-height:1.5}
.disc{font-size:${isScreen ? '14px' : '6.5pt'};opacity:.6;margin-top:${isScreen ? '18px' : '5mm'};line-height:1.4}
.wm{position:absolute;inset:0;display:grid;place-items:center;font:700 ${isScreen ? '64px' : '26pt'}/1 ${f.body};color:rgba(200,30,30,.20);transform:rotate(-28deg);pointer-events:none;z-index:5;text-align:center;letter-spacing:.1em}
@media print{html,body{background:#fff}.page{margin:0;box-shadow:none;zoom:1}}
</style></head><body>${pages}</body></html>`;
}

function shade(hex: string, pct: number) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); if (!m) return hex;
  return '#' + m.slice(1).map(x => Math.min(255, Math.max(0, Math.round(parseInt(x, 16) * (1 + pct / 100)))).toString(16).padStart(2, '0')).join('');
}

/** Rule-based content from project data — uses only facts that exist. */
export function contentFromProject(p: any, contact?: { name?: string; email?: string; phone?: string }, entity = 'RHC City'): DesignContent {
  const value = Number(p?.deal_value);
  const stats: { label: string; value: string }[] = [];
  if (isFinite(value) && value > 0) stats.push({ label: 'Project value', value: value >= 1e6 ? `$${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M` : `$${Math.round(value).toLocaleString('en-AU')}` });
  if (p?.project_type) stats.push({ label: 'Asset class', value: p.project_type });
  if (p?.location) stats.push({ label: 'Location', value: p.location });
  const bullets = String(p?.highlights || '').split(/\n|•|;/).map(s => s.replace(/^[-*\s]+/, '').trim()).filter(Boolean).slice(0, 6);
  return {
    eyebrow: String(p?.location || p?.project_type || '').toUpperCase(),
    headline: p?.name || '',
    subheadline: [p?.project_type, p?.location].filter(Boolean).join(' · '),
    body: p?.description || '',
    bullets, stats: stats.slice(0, 4),
    cta: 'Register your interest',
    contact: [contact?.name, contact?.email, contact?.phone].filter(Boolean).join('  ·  '),
    disclaimer: 'This material is general information only and does not constitute an offer or financial advice. Details are subject to change.',
    logo_text: entity.toUpperCase(),
  };
}

/** A ready newsletter to start from (stories from infinityplanet.com.au/news; [●] = fill in). */
function NEWSLETTER_START(businessName: string): DesignContent {
  return {
    eyebrow: 'Newsletter · [● Month Year]', logo_text: 'INFINITY PLANET', logo_image: '/brand/deck/t/logo-desc.png', image_lib: '/brand/deck/photos/d02.jpg',
    headline: "Australia's First Integrated Entertainment City",
    subheadline: 'Where Imagination Becomes an Experience',
    body: '[● A short welcome — what has happened since the last newsletter and what is coming next.]',
    items: [
      { title: 'RHC completes global research programme for Infinity Planet across 83 countries', date: '28 June 2026', text: '[● two or three lines]', url: 'https://www.infinityplanet.com.au/news', tag: 'News' },
      { title: 'Singaporean developer makes major land acquisition near Infinity Planet, Moreton Bay', date: '10 February 2026', text: '[● two or three lines]', url: 'https://www.infinityplanet.com.au/news', tag: 'News' },
      { title: 'New Queensland policy framework accelerates global talent and capital', date: '8 December 2025', text: '[● two or three lines]', url: 'https://www.infinityplanet.com.au/news', tag: 'News' },
    ],
    stats: [{ value: '68 ha', label: 'Site at Elimbah' }, { value: '20', label: 'Concept areas' }, { value: '2,943', label: 'Hotel rooms' }, { value: '2030', label: 'Grand opening' }],
    bullets: [], cta: 'Register your interest',
    contact: `${businessName} · Level 38, 71 Eagle Street, Brisbane QLD 4000\n+61 7 3162 1162 · info@infinityplanet.com.au · www.infinityplanet.com.au`,
    disclaimer: 'You are receiving this because you registered your interest in Infinity Planet. This newsletter is general information only and is not an offer or financial advice.',
  };
}

/** Email newsletter in the infinityplanet.com.au style: table layout and inline styles so it survives email programs. */
function renderNewsletter(d: Design, f: { head: string; body: string; link: string }, opts: { watermark?: string | null; forPrint?: boolean }): string {
  const t = d.theme; const c = d.content; const e = escapeHtml;
  const ink = t.primary, lime = t.accent, bg = t.background, txt = t.text;
  const onAccent = /^#?(?:[0-9a-f]{6})$/i.test(lime) && lum(lime) > 0.45 ? '#111111' : '#FFFFFF';
  const img = safeUrl(c.image_url || c.image_lib); const logo = safeUrl(c.logo_image);
  const H = (sz: number, extra = '') => `font-family:${f.head};font-weight:700;color:${ink};font-size:${sz}px;line-height:1.15;margin:0;${extra}`;
  const B = (sz = 16, col = txt, extra = '') => `font-family:${f.body};color:${col};font-size:${sz}px;line-height:1.6;margin:0;${extra}`;
  const arrow = (fill: string, stroke: string, size = 44) => `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${fill};text-align:center;line-height:${size}px;font-family:Arial,sans-serif;font-size:${Math.round(size * 0.5)}px;color:${stroke};font-weight:700">&#8599;</span>`;
  const card = (inner: string, pad = 28) => `<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:26px;border:1px solid #E0E0E0"><tr><td style="padding:${pad}px">${inner}</td></tr></table></td></tr>`;
  const stories = (c.items || []).filter(i => i && (i.title || i.text));
  const stats = (c.stats || []).filter(s => s.label || s.value);
  const bullets = (c.bullets || []).filter(Boolean);
  const header = `<tr><td style="padding:28px 4px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="middle">${logo ? `<img src="${logo}" alt="${e(c.logo_text || '')}" height="64" style="display:block;height:64px;width:auto;border:0">` : `<span style="${H(20, 'letter-spacing:.08em')}">${e(c.logo_text || '')}</span>`}</td>
    <td valign="middle" align="right">${c.eyebrow ? `<span style="display:inline-block;background:${lime};color:${onAccent};font-family:${f.body};font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding:7px 12px;border-radius:6px">${e(c.eyebrow)}</span>` : ''}</td></tr></table></td></tr>`;
  const hero = `<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:28px;border:1px solid #E0E0E0;overflow:hidden">
    ${img ? `<tr><td style="padding:0"><div style="position:relative"><img src="${img}" alt="" width="600" style="display:block;width:100%;height:auto;border-radius:28px 28px 0 0;border:0"><div style="position:absolute;top:14px;right:14px">${arrow('#FFFFFF', '#000000', 48)}</div></div></td></tr>` : ''}
    <tr><td style="padding:30px 32px 34px">
      <h1 style="${H(34)}">${e(c.headline || '')}</h1>
      ${c.subheadline ? `<p style="${B(18, ink, 'margin-top:12px')}"><span style="background:${lime};color:${onAccent};padding:2px 6px;box-decoration-break:clone;-webkit-box-decoration-break:clone">${e(c.subheadline)}</span></p>` : ''}
      ${c.body ? `<div style="${B(16, txt, 'margin-top:16px')}">${(c.body || '').split(/\n{2,}/).map(p => `<p style="${B(16, txt, 'margin:0 0 12px')}">${e(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
      ${c.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr><td style="background:${ink};border-radius:999px;padding:6px 6px 6px 22px"><span style="font-family:${f.body};font-weight:700;font-size:15px;color:#FFFFFF;vertical-align:middle">${e(c.cta)}</span>&nbsp;&nbsp;${arrow(lime, onAccent, 36)}</td></tr></table>` : ''}
    </td></tr></table></td></tr>`;
  const sectionTitle = (s: string) => `<tr><td style="padding:14px 4px 14px"><span style="${H(24)}">${e(s)}</span></td></tr>`;
  const storyHtml = stories.length ? sectionTitle('Latest news') + stories.map(s => card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top">
      <p style="${B(13, '#7A7A7A')}">${s.date ? e(s.date) : ''}${s.tag ? `&nbsp;&nbsp;<span style="background:${lime};color:${onAccent};font-weight:700;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:5px">${e(s.tag)}</span>` : ''}</p>
      <h2 style="${H(21, 'margin-top:10px')}">${e(s.title || '')}</h2>
      ${s.text ? `<p style="${B(15, txt, 'margin-top:8px')}">${e(s.text)}</p>` : ''}</td>
      <td valign="top" width="56" align="right">${s.url && safeUrl(s.url) ? `<a href="${safeUrl(s.url)}" style="text-decoration:none">${arrow(ink, '#FFFFFF', 44)}</a>` : arrow(ink, '#FFFFFF', 44)}</td></tr></table>`, 24)).join('') : '';
  const statHtml = stats.length ? sectionTitle('By the numbers') + `<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stats.slice(0, 4).map((s, i) => `<td width="${Math.floor(100 / Math.min(4, stats.length))}%" valign="top" style="padding:0 ${i < Math.min(4, stats.length) - 1 ? 10 : 0}px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${i % 2 ? lime : '#FFFFFF'};border-radius:20px;border:1px solid ${i % 2 ? lime : '#E0E0E0'}"><tr><td style="padding:20px 16px"><p style="${H(26, `color:${i % 2 ? onAccent : ink}`)}">${e(s.value)}</p><p style="${B(13, i % 2 ? onAccent : txt, 'margin-top:6px')}">${e(s.label)}</p></td></tr></table></td>`).join('')}</tr></table></td></tr>` : '';
  const bulletHtml = bullets.length ? card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bullets.map(b => `<tr><td width="22" valign="top" style="padding:7px 0"><span style="display:inline-block;width:10px;height:10px;background:${lime};border-radius:2px"></span></td><td style="padding:3px 0"><p style="${B(15, txt)}">${e(b)}</p></td></tr>`).join('')}</table>`) : '';
  const band = `<tr><td style="padding:6px 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;border-radius:28px"><tr><td style="padding:34px 32px">
      <p style="${H(26, 'color:#FFFFFF')}">We bring the world to Australia, and Australia to the world.</p>
      ${c.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="background:${lime};border-radius:999px;padding:6px 6px 6px 22px"><span style="font-family:${f.body};font-weight:700;font-size:15px;color:${onAccent};vertical-align:middle">${e(c.cta)}</span>&nbsp;&nbsp;${arrow('#000000', lime, 36)}</td></tr></table>` : ''}
    </td></tr></table></td></tr>`;
  const footer = `<tr><td style="padding:10px 6px 40px">
      ${c.contact ? `<p style="${B(13, txt)}">${e(c.contact).replace(/\n/g, '<br>')}</p>` : ''}
      ${c.disclaimer ? `<p style="${B(11, '#8A8A8A', 'margin-top:12px;line-height:1.5')}">${e(c.disclaimer)}</p>` : ''}
    </td></tr>`;
  const wm = opts.watermark ? `<div style="position:absolute;inset:0;display:grid;place-items:center;font:700 54px/1 ${f.body};color:rgba(200,30,30,.18);transform:rotate(-28deg);pointer-events:none;z-index:5;text-align:center;letter-spacing:.1em">${e(opts.watermark)}</div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.headline || 'Newsletter')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?${f.link}&display=swap" rel="stylesheet">
<style>@page{size:640px auto;margin:0}html,body{margin:0;padding:0;background:${bg};-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{position:relative;width:640px;margin:0 auto;background:${bg}}img{-ms-interpolation-mode:bicubic}@media (max-width:640px){.page{width:100%!important}}</style></head>
<body style="margin:0;padding:0;background:${bg}"><div class="page"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}"><tr><td align="center" style="padding:0 20px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">${header}${hero}${storyHtml}${statHtml}${bulletHtml}${band}${footer}</table>
</td></tr></table>${wm}</div></body></html>`;
}
function lum(h: string) { const n = parseInt(h.replace('#', ''), 16); const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); }
