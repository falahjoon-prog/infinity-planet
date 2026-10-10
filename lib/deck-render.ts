/**
 * Turns a deck into a real PowerPoint file (native text, bullets and charts — fully editable in PowerPoint)
 * or a PDF, in the chosen template with the business's logo. Both draw the same layout as the on-screen slides (lib/deck-layout).
 */
import PptxGenJS from 'pptxgenjs';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage, degrees } from 'pdf-lib';
import { Deck, Slide } from './deck';
import { getLetterhead } from './letterhead';
import { layoutSlide, Prim, SW, SH } from './deck-layout';
import { DeckTheme, fontFamily, fontWeight } from './deck-themes';
import { deckTheme, themeImage } from './deck-theme-store';

const hex = (h: string) => h.replace('#', '').toUpperCase();
const BULLET: Record<string, string> = { square: '25A0', dot: '25CF', dash: '2013', check: '2713' };

async function prepare(deck: Deck) {
  const [lh, theme] = await Promise.all([getLetterhead(), deckTheme(deck.theme)]);
  const cover = theme.image ? await themeImage(theme.id).catch(() => null) : null;
  const { promises: fs } = await import('fs'); const path = await import('path');
  const wm = deck.watermark === false ? null : await Promise.all(['ip-dome-wm-white.png', 'ip-dome-wm-navy.png'].map(f => fs.readFile(path.join(process.cwd(), 'public', 'brand', f)).catch(() => null))).then(([d, l]) => d && l ? { dark: d, light: l } : null);
  // House templates: their artwork files (public/brand/deck)
  const assets: Record<string, Buffer> = {};
  const want = new Set<string>(Object.values(theme.art || {}).filter((f): f is string => typeof f === 'string'));
  for (const sl of deck.slides) { if (sl.photo?.startsWith('asset:')) want.add(sl.photo.slice(6)); for (const e of sl.extras || []) if (e.src?.startsWith('asset:')) want.add(e.src.slice(6)); }
  for (const f of want) if (/^([\w-]+\/)?[\w.-]+\.(png|jpe?g)$/i.test(f)) { const b = await fs.readFile(path.join(process.cwd(), 'public', 'brand', 'deck', f)).catch(() => null); if (b) assets[f] = b; }
  return { lh, theme, cover, wm, assets };
}
const mimeOf = (f: string) => /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';

// ------------------------------------------------------------------ PowerPoint
export async function deckToPptx(deck: Deck, opts: { draft?: boolean } = {}): Promise<Buffer> {
  const { lh, theme, cover, wm, assets } = await prepare(deck);
  const assetData = Object.fromEntries(Object.entries(assets).map(([f, b]) => [f, `data:${mimeOf(f)};base64,${b.toString('base64')}`]));
  const logo = lh.logo ? `data:${lh.logo.mime};base64,${lh.logo.bytes.toString('base64')}` : null;
  const wmData = wm ? { dark: `data:image/png;base64,${wm.dark.toString('base64')}`, light: `data:image/png;base64,${wm.light.toString('base64')}` } : null;
  const coverData = cover ? `data:${cover.mime};base64,${cover.bytes.toString('base64')}` : null;
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = lh.businessName; pptx.company = lh.legalName; pptx.title = deck.title;
  pptx.theme = { headFontFace: fontFamily(theme.fonts.head), bodyFontFace: fontFamily(theme.fonts.body) };
  const ctx = { business: lh.businessName, logoAspect: lh.logo ? lh.logo.width / lh.logo.height : null, hasCover: !!coverData, draft: opts.draft, watermark: !!wmData };
  const face = (f: 'head' | 'body') => theme.fonts[f];
  deck.slides.forEach((sl, i) => {
    const art = layoutSlide(deck, sl, i, theme, ctx);
    const s = pptx.addSlide(); s.background = { color: hex(art.bg) };
    for (const p of art.prims) drawPptx(pptx, s, p, { face, logo, cover: coverData, theme, wm: wmData, assets: assetData });
    const n = [sl.notes, sl.sources?.length ? `Sources:\n${sl.sources.join('\n')}` : ''].filter(Boolean).join('\n\n'); if (n) s.addNotes(n);
  });
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(out as any);
}

function drawPptx(pptx: PptxGenJS, s: any, p: Prim, o: { face: (f: 'head' | 'body') => string; logo: string | null; cover: string | null; theme: DeckTheme; wm: { dark: string; light: string } | null; assets: Record<string, string> }) {
  const fill = (c?: string, alpha?: number) => c ? { color: hex(c), ...(alpha ? { transparency: alpha } : {}) } : { type: 'none' as const };
  switch (p.t) {
    case 'rect': s.addShape(p.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, { x: p.x, y: p.y, w: p.w, h: p.h, fill: fill(p.fill, p.alpha), line: p.line ? { color: hex(p.line), width: p.lineW || 1 } : { type: 'none' }, ...(p.radius ? { rectRadius: Math.min(0.5, p.radius / Math.min(p.w, p.h)) } : {}) } as any); break;
    case 'ellipse': s.addShape(pptx.ShapeType.ellipse, { x: p.x, y: p.y, w: p.w, h: p.h, fill: fill(p.fill, p.alpha), line: { type: 'none' } } as any); break;
    case 'poly': {
      const xs = p.points.map(q => q[0]), ys = p.points.map(q => q[1]); const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      s.addShape((pptx as any).shapes.CUSTOM_GEOMETRY, { x, y, w, h, fill: fill(p.fill, p.alpha), line: { type: 'none' }, points: [...p.points.map(([px, py], k) => k === 0 ? { x: px - x, y: py - y, moveTo: true } : { x: px - x, y: py - y }), { close: true }] } as any); break;
    }
    case 'line': s.addShape(pptx.ShapeType.line, { x: Math.min(p.x1, p.x2), y: Math.min(p.y1, p.y2), w: Math.abs(p.x2 - p.x1), h: Math.abs(p.y2 - p.y1), line: { color: hex(p.color), width: p.w } }); break;
    case 'seg': {
      const dx = p.x2 - p.x1, dy = p.y2 - p.y1; const flip = (dx < 0) !== (dy < 0);
      const atBegin = (dx < 0 && dy < 0) || (dx >= 0 && dy < 0);
      s.addShape(pptx.ShapeType.line, { x: Math.min(p.x1, p.x2), y: Math.min(p.y1, p.y2), w: Math.max(0.001, Math.abs(dx)), h: Math.max(0.001, Math.abs(dy)), ...(flip ? { flipH: true } : {}),
        line: { color: hex(p.color), width: p.w, ...(p.arrow ? (atBegin ? { beginArrowType: 'triangle' } : { endArrowType: 'triangle' }) : {}) } } as any); break;
    }
    case 'image': { const data = p.src.startsWith('data:') ? p.src : p.src.startsWith('asset:') ? o.assets[p.src.slice(6)] : p.src === 'logo' ? o.logo : p.src === 'cover' ? o.cover : p.src === 'wm-dark' ? o.wm?.dark : o.wm?.light; if (data) s.addImage({ data, x: p.x, y: p.y, w: p.w, h: p.h, ...(p.alpha ? { transparency: p.alpha } : {}) }); break; }
    case 'text': {
      const f = o.face(p.font);
      s.addText(p.text, { x: p.x, y: p.y, w: p.w, h: p.h, fontSize: p.size, fontFace: fontFamily(f), bold: !!p.bold && fontWeight(f) === 700, italic: !!p.italic, color: hex(p.color), align: p.align || 'left', valign: p.valign || 'top', margin: 0, lineSpacingMultiple: p.lh || 1.15, ...(p.spacing ? { charSpacing: p.spacing } : {}), fit: 'shrink' } as any); break;
    }
    case 'list': {
      const f = o.face('body');
      s.addText(p.items.map(t => ({ text: t, options: { bullet: p.bullet === 'number' ? { type: 'number' } : { code: BULLET[p.bullet] || '25A0' }, color: hex(p.color), fontSize: p.size, breakLine: true, paraSpaceAfter: Math.round(p.size * p.gap), lineSpacingMultiple: p.lh || 1.25 } })), { x: p.x, y: p.y, w: p.w, h: p.h, valign: 'top', fontFace: fontFamily(f), margin: 0, fit: 'shrink' } as any); break;
    }
    case 'chart': {
      const c = p.chart; const round = c.type === 'pie' || c.type === 'doughnut';
      const type = c.type === 'line' ? pptx.ChartType.line : c.type === 'pie' ? pptx.ChartType.pie : c.type === 'doughnut' ? pptx.ChartType.doughnut : pptx.ChartType.bar;
      s.addChart(type, (round ? c.series.slice(0, 1) : c.series).map(x => ({ name: x.name, labels: c.labels, values: x.values })), { x: p.x, y: p.y, w: p.w, h: p.h, chartColors: p.colors.map(hex), showLegend: c.series.length > 1 || round, legendPos: 'b', legendColor: hex(p.ink), showValue: true, dataLabelFontSize: 11, dataLabelColor: hex(p.ink), catAxisLabelFontSize: 12, catAxisLabelColor: hex(p.muted), valAxisLabelFontSize: 11, valAxisLabelColor: hex(p.muted), showTitle: !!c.title, title: c.title, titleFontSize: 14, titleColor: hex(p.ink), barGapWidthPct: 60, lineSize: 3, lineDataSymbolSize: 7, valGridLine: { color: hex(p.grid), size: 1 }, fontFace: fontFamily(o.face('body')) } as any); break;
    }
  }
}

// ------------------------------------------------------------------ PDF
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/●/g, '•').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff•…€]/g, '?');
function wrap(t: string, f: PDFFont, size: number, max: number) { const out: string[] = []; for (const para of clean(t).split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const n = line ? `${line} ${w}` : w; if (f.widthOfTextAtSize(n, size) <= max || !line) line = n; else { out.push(line); line = w; } } out.push(line); } return out; }
const toRgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const K = 72; // points per inch

export async function deckToPdf(deck: Deck, opts: { draft?: boolean } = {}): Promise<Buffer> {
  const { lh, theme, cover, wm, assets } = await prepare(deck);
  const pdf = await PDFDocument.create(); pdf.setTitle(deck.title); pdf.setAuthor(lh.businessName);
  const serif = (f: string) => /georgia|garamond|cambria|times|palatino|book antiqua|constantia/i.test(f);
  const fonts: Record<string, PDFFont> = {};
  const font = async (which: 'head' | 'body', bold: boolean, italic: boolean) => {
    const sf = serif(theme.fonts[which]); const key = `${sf}-${bold}-${italic}`;
    if (!fonts[key]) fonts[key] = await pdf.embedFont(sf ? (bold ? (italic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold) : italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman) : (bold ? (italic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold) : italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica));
    return fonts[key];
  };
  const logo = lh.logo ? (lh.logo.mime === 'image/png' ? await pdf.embedPng(lh.logo.bytes) : lh.logo.mime === 'image/jpeg' ? await pdf.embedJpg(lh.logo.bytes) : null) : null;
  const coverImg = cover ? (cover.mime === 'image/png' ? await pdf.embedPng(cover.bytes) : await pdf.embedJpg(cover.bytes)) : null;
  const wmImg = wm ? { dark: await pdf.embedPng(wm.dark), light: await pdf.embedPng(wm.light) } : null;
  const assetImg: Record<string, PDFImage> = {}; for (const [f, b] of Object.entries(assets)) assetImg[f] = mimeOf(f) === 'image/png' ? await pdf.embedPng(b) : await pdf.embedJpg(b);
  const ctx = { business: lh.businessName, logoAspect: lh.logo ? lh.logo.width / lh.logo.height : null, hasCover: !!coverImg, draft: false, watermark: !!wmImg };
  const W = SW * K, H = SH * K;
  for (let i = 0; i < deck.slides.length; i++) {
    const art = layoutSlide(deck, deck.slides[i], i, theme, ctx);
    const page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: toRgb(art.bg) });
    for (const p of art.prims) await drawPdf(page, p, { font, logo, cover: coverImg, wm: wmImg, H, assets: assetImg, embedPng: b => pdf.embedPng(b), embedJpg: b => pdf.embedJpg(b) });
    if (opts.draft) { const b = await font('body', true, false); page.drawText('DRAFT', { x: W / 2 - 120, y: H / 2 - 40, size: 90, font: b, color: rgb(0.85, 0.2, 0.15), opacity: 0.1, rotate: degrees(20) }); }
  }
  return Buffer.from(await pdf.save());
}

async function drawPdf(page: PDFPage, p: Prim, o: { font: (w: 'head' | 'body', b: boolean, i: boolean) => Promise<PDFFont>; logo: PDFImage | null; cover: PDFImage | null; wm: { dark: PDFImage; light: PDFImage } | null; H: number; assets: Record<string, PDFImage>; embedPng: (b: Buffer) => Promise<PDFImage>; embedJpg: (b: Buffer) => Promise<PDFImage> }) {
  const X = (x: number) => x * K, Y = (y: number, h = 0) => o.H - (y + h) * K;
  const op = (alpha?: number) => alpha ? 1 - alpha / 100 : 1;
  switch (p.t) {
    case 'rect': {
      const paint = { ...(p.fill ? { color: toRgb(p.fill), opacity: op(p.alpha) } : {}), ...(p.line ? { borderColor: toRgb(p.line), borderWidth: p.lineW || 1 } : {}) };
      if (p.radius && p.radius > 0.01) {
        const r = Math.min(p.radius, p.w / 2, p.h / 2) * K, w = p.w * K, h = p.h * K;
        page.drawSvgPath(`M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`, { x: X(p.x), y: o.H - p.y * K, ...paint });
      } else page.drawRectangle({ x: X(p.x), y: Y(p.y, p.h), width: p.w * K, height: p.h * K, ...paint });
      break;
    }
    case 'ellipse': page.drawEllipse({ x: X(p.x + p.w / 2), y: Y(p.y + p.h / 2), xScale: p.w * K / 2, yScale: p.h * K / 2, color: toRgb(p.fill), opacity: op(p.alpha) }); break;
    case 'poly': page.drawSvgPath(`M ${p.points.map(([x, y]) => `${x * K} ${y * K}`).join(' L ')} Z`, { x: 0, y: o.H, color: toRgb(p.fill), opacity: op(p.alpha) }); break;
    case 'line': page.drawLine({ start: { x: X(p.x1), y: Y(p.y1) }, end: { x: X(p.x2), y: Y(p.y2) }, thickness: p.w, color: toRgb(p.color) }); break;
    case 'seg': {
      page.drawLine({ start: { x: X(p.x1), y: Y(p.y1) }, end: { x: X(p.x2), y: Y(p.y2) }, thickness: p.w, color: toRgb(p.color) });
      if (p.arrow) { const a = Math.atan2(p.y2 - p.y1, p.x2 - p.x1); const L = Math.max(0.16, p.w * 0.05), Wd = L * 0.55; const bx = p.x2 - L * Math.cos(a), by = p.y2 - L * Math.sin(a);
        const pts = [[p.x2, p.y2], [bx - Wd * Math.sin(a), by + Wd * Math.cos(a)], [bx + Wd * Math.sin(a), by - Wd * Math.cos(a)]];
        page.drawSvgPath(`M ${pts.map(([x, y]) => `${x * K} ${y * K}`).join(' L ')} Z`, { x: 0, y: o.H, color: toRgb(p.color) }); }
      break;
    }
    case 'image': {
      if (p.src.startsWith('data:') && !o.assets[p.src]) { const m = /^data:image\/(png|jpeg);base64,(.*)$/.exec(p.src); if (m) { const b = Buffer.from(m[2], 'base64'); o.assets[p.src] = m[1] === 'png' ? await o.embedPng(b) : await o.embedJpg(b); } }
      const img = p.src.startsWith('data:') ? o.assets[p.src] : p.src.startsWith('asset:') ? o.assets[p.src.slice(6)] : p.src === 'logo' ? o.logo : p.src === 'cover' ? o.cover : p.src === 'wm-dark' ? o.wm?.dark : o.wm?.light; if (!img) break;
      let w = p.w * K, h = p.h * K, x = X(p.x), y = Y(p.y, p.h);
      if (p.fit === 'contain') { const s = Math.min(w / img.width, h / img.height); const nw = img.width * s, nh = img.height * s; x += (w - nw) / 2; y += (h - nh) / 2; w = nw; h = nh; }
      page.drawImage(img, { x, y, width: w, height: h, ...(p.alpha ? { opacity: 1 - p.alpha / 100 } : {}) }); break;
    }
    case 'text': {
      const f = await o.font(p.font, !!p.bold, !!p.italic); const lines = wrap(p.text, f, p.size, p.w * K); const lead = p.size * (p.lh || 1.15);
      const total = lines.length * lead; const top = o.H - p.y * K; const boxH = p.h * K;
      const y0 = p.valign === 'bottom' ? top - boxH + total : p.valign === 'middle' ? top - (boxH - total) / 2 : top;
      lines.forEach((l, k) => { const lw = f.widthOfTextAtSize(l, p.size); const x = p.align === 'center' ? X(p.x) + (p.w * K - lw) / 2 : p.align === 'right' ? X(p.x) + p.w * K - lw : X(p.x); page.drawText(l, { x, y: y0 - p.size * 0.88 - k * lead, size: p.size, font: f, color: toRgb(p.color) }); });
      break;
    }
    case 'list': {
      const f = await o.font('body', false, false); const lead = p.size * (p.lh || 1.3); const ind = p.size * 1.4; let y = o.H - p.y * K;
      p.items.forEach((it, k) => {
        const lines = wrap(it, f, p.size, p.w * K - ind); const by = y - p.size * 0.55; const bc = toRgb(p.bulletColor); const bx = X(p.x);
        if (p.bullet === 'square') page.drawRectangle({ x: bx, y: by - p.size * 0.18, width: p.size * 0.36, height: p.size * 0.36, color: bc });
        else if (p.bullet === 'dot') page.drawCircle({ x: bx + p.size * 0.18, y: by, size: p.size * 0.19, color: bc });
        else if (p.bullet === 'dash') page.drawLine({ start: { x: bx, y: by }, end: { x: bx + p.size * 0.6, y: by }, thickness: Math.max(1, p.size * 0.1), color: bc });
        else if (p.bullet === 'check') page.drawSvgPath(`M 0 ${p.size * 0.22} L ${p.size * 0.2} ${p.size * 0.42} L ${p.size * 0.55} 0`, { x: bx, y: by + p.size * 0.22, borderColor: bc, borderWidth: Math.max(1.2, p.size * 0.11) });
        else page.drawText(`${k + 1}.`, { x: bx, y: y - p.size * 0.88, size: p.size, font: f, color: bc });
        lines.forEach((l, j) => page.drawText(l, { x: bx + ind, y: y - p.size * 0.88 - j * lead, size: p.size, font: f, color: toRgb(p.color) }));
        y -= lines.length * lead + p.size * p.gap;
      });
      break;
    }
    case 'chart': await drawChart(page, p, X(p.x), Y(p.y, p.h), p.w * K, p.h * K, await o.font('body', false, false), await o.font('body', true, false)); break;
  }
}

async function drawChart(page: PDFPage, p: Extract<Prim, { t: 'chart' }>, x: number, y: number, w: number, h: number, font: PDFFont, bold: PDFFont) {
  const c = p.chart; const pal = p.colors.map(toRgb); const INK = toRgb(p.ink), GREY = toRgb(p.muted);
  const vals = c.series.flatMap(s => s.values); const max = Math.max(1, ...vals.map(v => Math.abs(v)));
  if (c.title) page.drawText(clean(c.title), { x, y: y + h - 14, size: 13, font: bold, color: INK });
  const ch = h - 50, cy = y + 24;
  if (c.type === 'pie' || c.type === 'doughnut') {
    const s = c.series[0]; const total = s.values.reduce((a, b) => a + Math.max(0, b), 0) || 1; const r = Math.min(ch, w * 0.5) / 2; const cx = x + r + 10, ccy = cy + ch / 2;
    let a0 = -Math.PI / 2;
    s.values.forEach((v, i) => { const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2; const steps = Math.max(2, Math.ceil((a1 - a0) / 0.08)); let d = 'M 0 0'; for (let k = 0; k <= steps; k++) { const a = a0 + (a1 - a0) * k / steps; d += ` L ${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`; } d += ' Z'; page.drawSvgPath(d, { x: cx, y: ccy, color: pal[i % pal.length] }); a0 = a1; });
    if (c.type === 'doughnut') page.drawCircle({ x: cx, y: ccy, size: r * 0.55, color: rgb(1, 1, 1) });
    c.labels.forEach((l, i) => { const ly = ccy + r - 10 - i * 22; page.drawRectangle({ x: cx + r + 30, y: ly, width: 12, height: 12, color: pal[i % pal.length] }); page.drawText(clean(`${l} - ${s.values[i] ?? ''}`), { x: cx + r + 50, y: ly + 1, size: 12, font, color: INK }); });
    return;
  }
  page.drawLine({ start: { x, y: cy }, end: { x: x + w, y: cy }, thickness: 1, color: toRgb(p.grid) });
  const n = c.labels.length, gw = w / n;
  c.labels.forEach((l, i) => { const lw = font.widthOfTextAtSize(clean(l), 11); page.drawText(clean(l), { x: x + gw * i + (gw - lw) / 2, y: cy - 16, size: 11, font, color: GREY }); });
  if (c.type === 'line') c.series.forEach((s, si) => { let prev: { x: number; y: number } | null = null; s.values.forEach((v, i) => { const pt = { x: x + gw * i + gw / 2, y: cy + (v / max) * (ch - 20) }; if (prev) page.drawLine({ start: prev, end: pt, thickness: 3, color: pal[si % pal.length] }); page.drawCircle({ x: pt.x, y: pt.y, size: 4, color: pal[si % pal.length] }); page.drawText(String(v), { x: pt.x - 8, y: pt.y + 8, size: 10, font, color: INK }); prev = pt; }); });
  else { const k = c.series.length, bw = Math.min(60, (gw * 0.7) / k); c.series.forEach((s, si) => s.values.forEach((v, i) => { const bh = (Math.max(0, v) / max) * (ch - 20); const bx = x + gw * i + (gw - bw * k) / 2 + si * bw; page.drawRectangle({ x: bx, y: cy, width: bw - 4, height: bh, color: pal[si % pal.length] }); page.drawText(String(v), { x: bx, y: cy + bh + 4, size: 10, font, color: INK }); })); }
  if (c.series.length > 1) c.series.forEach((s, si) => { page.drawRectangle({ x: x + si * 150, y: y + h - 34, width: 10, height: 10, color: pal[si % pal.length] }); page.drawText(clean(s.name), { x: x + si * 150 + 14, y: y + h - 34, size: 11, font, color: INK }); });
}
export type { Slide };
