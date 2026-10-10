/**
 * Business letterhead for exported documents (Word and PDF): logo + business name in the header,
 * company details and page numbers in the footer, headings in the brand colour.
 * Everything comes from Settings → Business details (name, logo, colours, footer) and the legal entity details.
 */
import { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, ImageRun, PageNumber, BorderStyle, TabStopType, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType } from 'docx';
import type { LetterheadArt } from './letterhead-art';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, degrees } from 'pdf-lib';
import { getBrand, getBrandStyle } from './brand';
import { getLogo } from './brand-logo';
import { getSetting } from './settings';

export type Letterhead = {
  businessName: string; legalName: string; abn?: string; address?: string; phone?: string; email?: string; website?: string;
  footer: string; primary: string; accent: string; serif?: boolean; art?: LetterheadArt | null; logo: { bytes: Buffer; mime: string; width: number; height: number } | null; enabled: boolean;
};

/** Reads PNG/JPEG/GIF pixel size from the file header (no image library needed). */
export function imageSize(b: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === 'image/png' && b.readUInt32BE(12) === 0x49484452) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === 'image/gif') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1]; const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch {}
  return null;
}

export async function getLetterhead(): Promise<Letterhead> {
  const [brand, style, entity, logo, art] = await Promise.all([getBrand(), getBrandStyle(), getSetting<any>('rhc_entity_details'), getLogo().catch(() => null), import('./letterhead-art').then(m => m.getLetterheadArt()).catch(() => null)]);
  const e = entity || {};
  let lg: Letterhead['logo'] = null;
  if (logo) {
    // Any logo format (PNG, JPEG, WebP, SVG, GIF) becomes a clean 8-bit PNG that Word and PDF can embed.
    try {
      const sharp = (await import('sharp')).default;
      const png = await sharp(logo.bytes, { density: 300 }).resize({ height: 320, withoutEnlargement: true }).png().toBuffer();
      const sz = imageSize(png, 'image/png');
      if (sz && sz.width > 0 && sz.height > 0) lg = { bytes: png, mime: 'image/png', ...sz };
    } catch {
      if (['image/png', 'image/jpeg', 'image/gif'].includes(logo.mime)) { const sz = imageSize(logo.bytes, logo.mime); if (sz && sz.width > 0 && sz.height > 0) lg = { ...logo, ...sz }; }
    }
  }
  const details = [e.name && e.name !== brand.business_name ? e.name : null, e.abn ? `ABN ${e.abn}` : null, e.acn ? `ACN ${e.acn}` : null, e.address, e.phone, e.email, style.website].filter(Boolean).join('  ·  ');
  return {
    businessName: brand.business_name, legalName: e.name || brand.business_name, abn: e.abn, address: e.address, phone: e.phone, email: e.email, website: style.website || undefined,
    footer: [style.footer_text, details].filter(Boolean).join('\n'), primary: style.primary || '#13294b', accent: style.accent || '#c8a45c', serif: style.font === 'serif', art, logo: lg, enabled: style.letterhead !== false,
  };
}

const isHeading = (t: string) => /^[A-Z0-9][A-Z0-9 &,'()/—–.:-]{3,}$/.test(t.trim()) && t.trim().length < 90 && /[A-Z]{3}/.test(t);
const hexNoHash = (h: string) => h.replace('#', '').toUpperCase();

// ------------------------------------------------------------------ document structure (shared by Word and PDF)
export type Seg = { text: string; bold?: boolean };
export type Block =
  | { t: 'banner'; segs: Seg[] } | { t: 'title'; segs: Seg[] } | { t: 'h2'; segs: Seg[] } | { t: 'h3'; segs: Seg[] }
  | { t: 'p'; segs: Seg[] } | { t: 'item'; label: string; level: number; segs: Seg[] } | { t: 'rule' } | { t: 'gap' } | { t: 'sig'; segs: Seg[] };

/** "**bold**" → segments. Stray asterisks are removed. */
export function inline(text: string): Seg[] {
  const out: Seg[] = []; const re = /\*\*([^*]+)\*\*|__([^_]+)__/g; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { if (m.index > last) out.push({ text: text.slice(last, m.index) }); out.push({ text: m[1] || m[2], bold: true }); last = m.index + m[0].length; }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.map(x => ({ ...x, text: x.text.replace(/\*\*/g, '').replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|[.,;:]|$)/g, '$1$2') })).filter(x => x.text);
}
const ROMAN = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\)\s+/;

/** Reads the light markup the document writer produces (and plain legacy text). */
export function parseDoc(body: string): Block[] {
  const out: Block[] = []; let lastLetter = '';
  for (const raw of String(body || '').replace(/\r/g, '').split('\n')) {
    const t = raw.trim();
    if (!t) { if (out.length && out[out.length - 1].t !== 'gap') out.push({ t: 'gap' }); continue; }
    if (/^_{6,}/.test(t)) { out.push({ t: 'sig', segs: inline(t.replace(/^_+\s*/, '')) }); continue; }
    if (/^(-{3,}|\*{3,}|={3,}|_{3,5})$/.test(t)) { out.push({ t: 'rule' }); continue; }
    if (/^DRAFT\b.{0,6}(SUBJECT|NOT|FOR)/i.test(t) && out.filter(b => b.t !== 'gap').length < 2) { out.push({ t: 'banner', segs: inline(t) }); continue; }
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^#\s+(.+)$/))) { out.push({ t: 'title', segs: inline(m[1]) }); continue; }
    if ((m = t.match(/^##\s+(.+)$/))) { out.push({ t: 'h2', segs: inline(m[1]) }); continue; }
    if ((m = t.match(/^#{3,6}\s+(.+)$/))) { out.push({ t: 'h3', segs: inline(m[1]) }); continue; }
    if ((m = t.match(/^\*\*([^*]{2,90})\*\*$/)) && !/[.,;]$/.test(m[1]) && !/^(re|subject)\s*:/i.test(m[1]) && /^[A-Z0-9]/.test(m[1]) && raw === t) { out.push({ t: 'h3', segs: [{ text: m[1], bold: true }] }); continue; }
    if (isHeading(t) && !/_{4,}/.test(t)) { out.push({ t: 'h2', segs: inline(t) }); continue; }
    if ((m = t.match(/^[-•●▪*]\s+(.+)$/))) { out.push({ t: 'item', label: '•', level: raw.match(/^\s{2,}/) ? 2 : 1, segs: inline(m[1]) }); continue; }
    if ((m = t.match(/^(\d+(?:\.\d+){1,3})\.?\s+(.+)$/))) { const lv = Math.min(3, m[1].split('.').length - 1); out.push({ t: 'item', label: m[1], level: lv, segs: inline(m[2]) }); continue; }
    if ((m = t.match(ROMAN)) && !(lastLetter && String.fromCharCode(lastLetter.charCodeAt(0) + 1) === m[1])) { out.push({ t: 'item', label: `(${m[1]})`, level: 3, segs: inline(t.slice(m[0].length)) }); continue; }
    if ((m = t.match(/^\(([a-z]{1,2})\)\s+(.+)$/))) { lastLetter = m[1]; out.push({ t: 'item', label: `(${m[1]})`, level: 2, segs: inline(m[2]) }); continue; }
    if ((m = t.match(/^([A-Z]|\d{1,2})[.)]\s+(.+)$/))) { out.push({ t: 'item', label: `${m[1]}.`, level: 1, segs: inline(m[2]) }); continue; }
    out.push({ t: 'p', segs: inline(t) });
  }
  while (out.length && out[out.length - 1].t === 'gap') out.pop();
  return out;
}

/** Word (.docx) with letterhead header/footer. */
export async function docxWithLetterhead(title: string, body: string, lh: Letterhead, opts: { final?: boolean } = {}): Promise<Buffer> {
  const headerKids: Paragraph[] = [];
  // A4 in twips / pixels (96 dpi) / EMU
  const PAGE_W_PX = 794, PAGE_H_PX = 1123, EMU = 9525;
  const art = lh.enabled ? lh.art : null;
  const hdrPx = art?.header ? Math.round(PAGE_W_PX * art.header.height / art.header.width) : 0;
  const ftrPx = art?.footer ? Math.round(PAGE_W_PX * art.footer.height / art.footer.width) : 0;
  const floating = (img: { bytes: Buffer }, hPx: number, y: number) => new ImageRun({ type: 'png', data: img.bytes, transformation: { width: PAGE_W_PX, height: hPx },
    floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: y * EMU }, behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE } } } as any);
  if (art?.header) headerKids.push(new Paragraph({ children: [floating(art.header, hdrPx, 0)] }));
  if (lh.enabled && !art?.header) {
    const runs: any[] = [];
    if (lh.logo) {
      const h = 48; const w = Math.min(220, Math.round(lh.logo.width * (h / lh.logo.height)));
      runs.push(new ImageRun({ type: lh.logo.mime === 'image/png' ? 'png' : lh.logo.mime === 'image/gif' ? 'gif' : 'jpg', data: lh.logo.bytes, transformation: { width: w, height: h } } as any));
      runs.push(new TextRun({ text: '\t' }));
    }
    runs.push(new TextRun({ text: lh.businessName, bold: true, size: 26, color: hexNoHash(lh.primary), font: 'Calibri' }));
    headerKids.push(new Paragraph({ children: runs, tabStops: [{ type: TabStopType.RIGHT, position: 9000 }], border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: hexNoHash(lh.accent), space: 6 } }, spacing: { after: 200 } }));
  }
  const footerKids: Paragraph[] = [];
  if (art?.footer) footerKids.push(new Paragraph({ children: [floating(art.footer, ftrPx, PAGE_H_PX - ftrPx)] }));
  if (lh.enabled && lh.footer && !art?.footer) for (const f of lh.footer.split('\n')) footerKids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: f, size: 16, color: '666666' })] }));
  footerKids.push(new Paragraph({ alignment: art?.footer ? AlignmentType.RIGHT : AlignmentType.CENTER, border: lh.enabled && !art?.footer ? { top: { style: BorderStyle.SINGLE, size: 6, color: hexNoHash(lh.accent), space: 4 } } : undefined, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: '888888' })] }));
  const doc = new Document({
    creator: lh.businessName, title,
    styles: { default: { document: { run: { font: lh.serif ? 'Georgia' : 'Calibri', size: 22 } } } },
    sections: [{
      // 1 px = 15 twips
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: art?.header ? hdrPx * 15 + 300 : 1300, bottom: art?.footer ? ftrPx * 15 + 500 : 1300, left: 1200, right: 1200, header: art?.header ? 0 : 500, footer: art?.footer ? ftrPx * 15 + 60 : 450 } } },
      headers: { default: new Header({ children: headerKids.length ? headerKids : [new Paragraph('')] }) },
      footers: { default: new Footer({ children: footerKids }) },
      children: docxBlocks(parseDoc(body).filter(b => !(opts.final && b.t === 'banner')), lh),
    }],
  });
  return Packer.toBuffer(doc);
}


const LEVEL_TW = [0, 0, 567, 1134, 1701];
function docxBlocks(blocks: Block[], lh: Letterhead): Paragraph[] {
  const runs = (segs: Seg[], o: { bold?: boolean; size?: number; color?: string } = {}) => segs.map(x => new TextRun({ text: x.text, bold: o.bold || x.bold, size: o.size, color: o.color }));
  const out: Paragraph[] = [];
  for (const b of blocks) {
    if (b.t === 'gap') { out.push(new Paragraph({ spacing: { after: 0 }, children: [] })); continue; }
    if (b.t === 'rule') { out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hexNoHash(lh.accent), space: 4 } }, spacing: { after: 160 }, children: [] })); continue; }
    if (b.t === 'sig') { out.push(new Paragraph({ spacing: { before: 360, after: 60 }, children: [new TextRun({ text: '_______________________________' }), ...(b.segs.length ? [new TextRun({ text: '   ' }), ...runs(b.segs)] : [])] })); continue; }
    if (b.t === 'banner') { out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: runs(b.segs, { bold: true, size: 17, color: 'B42318' }) })); continue; }
    if (b.t === 'title') { out.push(new Paragraph({ spacing: { before: 120, after: 160 }, children: runs(b.segs, { bold: true, size: 36, color: hexNoHash(lh.primary) }) })); continue; }
    if (b.t === 'h2') { out.push(new Paragraph({ keepNext: true, spacing: { before: 240, after: 100 }, children: runs(b.segs, { bold: true, size: 25, color: hexNoHash(lh.primary) }) })); continue; }
    if (b.t === 'h3') { out.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 80 }, children: runs(b.segs, { bold: true, size: 22 }) })); continue; }
    if (b.t === 'item') {
      const left = LEVEL_TW[b.level] + 567;
      out.push(new Paragraph({ indent: { left, hanging: 567 }, tabStops: [{ type: TabStopType.LEFT, position: left }], spacing: { after: 100 }, children: [new TextRun({ text: `${b.label}\t`, bold: b.level === 1 && /^\d/.test(b.label) }), ...runs(b.segs)] }));
      continue;
    }
    out.push(new Paragraph({ spacing: { after: 120, line: 276 }, children: runs(b.segs) }));
  }
  return out;
}

// ------------------------------------------------------------------ PDF
const toRgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
/** Standard PDF fonts only cover Latin-1 — replace characters they cannot draw. */
const clean = (s: string) => s.replace(/●/g, '•').replace(/[\u2010\u2011]/g, '-').replace(/\u00a0|\u202f/g, ' ').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u2026\u20AC\u2122]/g, '?');

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const words = clean(text).split(/(\s+)/); const out: string[] = []; let line = '';
  for (const w of words) {
    const next = line + w;
    if (font.widthOfTextAtSize(next.trimEnd(), size) <= max || !line.trim()) { line = next; continue; }
    out.push(line.trimEnd()); line = w.trimStart();
    while (font.widthOfTextAtSize(line, size) > max && line.length > 1) { let k = line.length; while (k > 1 && font.widthOfTextAtSize(line.slice(0, k), size) > max) k--; out.push(line.slice(0, k)); line = line.slice(k); }
  }
  if (line.trim() || !out.length) out.push(line.trimEnd());
  return out;
}

/** PDF (A4) with letterhead header/footer and page numbers. */
export async function pdfWithLetterhead(title: string, body: string, lh: Letterhead, opts: { watermark?: string; final?: boolean } = {}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title); pdf.setAuthor(lh.businessName); pdf.setCreator('Infinity Planet');
  const font = await pdf.embedFont(lh.serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica); const bold = await pdf.embedFont(lh.serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const logo = lh.enabled && lh.logo ? (lh.logo.mime === 'image/png' ? await pdf.embedPng(lh.logo.bytes) : lh.logo.mime === 'image/jpeg' ? await pdf.embedJpg(lh.logo.bytes) : null) : null;
  const W = 595.28, H = 841.89, M = 62;
  const art = lh.enabled ? lh.art : null;
  const hdrImg = art?.header ? await pdf.embedPng(art.header.bytes) : null; const hdrH = art?.header ? W * art.header.height / art.header.width : 0;
  const ftrImg = art?.footer ? await pdf.embedPng(art.footer.bytes) : null; const ftrH = art?.footer ? W * art.footer.height / art.footer.width : 0;
  const top = hdrImg ? hdrH + 20 : lh.enabled ? 116 : 64, bottom = ftrImg ? ftrH + 34 : 84;
  const primary = toRgb(lh.primary), accent = toRgb(lh.accent), grey = rgb(0.4, 0.4, 0.4), ink = rgb(0.11, 0.13, 0.17);
  const pages: PDFPage[] = [];
  let page!: PDFPage; let y = 0;
  const newPage = () => { page = pdf.addPage([W, H]); pages.push(page); y = H - top; };
  newPage();
  const bump = lh.serif ? 0.6 : 0;
  /** Draws rich text (bold segments) wrapped to width; returns nothing, moves y. */
  const drawRich = (segs: Seg[], o: { x: number; width: number; size: number; color?: any; allBold?: boolean; lead?: number; keepWith?: number }) => {
    const size = o.size + bump; const lead = (o.lead || 1.45) * size;
    type Tok = { w: string; b: boolean };
    // Units: whitespace, or a run of non-space tokens that must stay together even across bold/plain changes ("(" + "Project" + ").")
    const units: Tok[][] = [];
    for (const sg of segs) for (const part of clean(sg.text).split(/(\s+)/)) {
      if (!part) continue; const tk = { w: part, b: !!(o.allBold || sg.bold) };
      const lastU = units[units.length - 1];
      if (!/^\s+$/.test(part) && lastU && !/^\s+$/.test(lastU[0].w)) lastU.push(tk); else units.push([tk]);
    }
    const lines: Tok[][] = []; let cur: Tok[] = []; let cw = 0;
    const width = (x: Tok) => (x.b ? bold : font).widthOfTextAtSize(x.w, size);
    for (const u of units) {
      const ww = u.reduce((a, x) => a + width(x), 0);
      if (/^\s+$/.test(u[0].w)) { if (cur.length) { cur.push({ w: ' ', b: u[0].b }); cw += width({ w: ' ', b: u[0].b }); } continue; }
      if (cw + ww > o.width && cur.length) { while (cur.length && /^\s+$/.test(cur[cur.length - 1].w)) cur.pop(); lines.push(cur); cur = []; cw = 0; }
      if (ww > o.width) { // very long token: hard split
        const wd = { w: u.map(x => x.w).join(''), b: u[0].b };
        let rest = wd.w; while (rest) { let k = rest.length; while (k > 1 && (wd.b ? bold : font).widthOfTextAtSize(rest.slice(0, k), size) > o.width) k--; lines.push([{ w: rest.slice(0, k), b: wd.b }]); rest = rest.slice(k); }
        continue;
      }
      cur.push(...u); cw += ww;
    }
    if (cur.length) lines.push(cur);
    if (!lines.length) lines.push([]);
    if (y - lead * Math.min(lines.length, 2) - (o.keepWith || 0) < bottom) newPage();
    for (const ln of lines) {
      if (y - lead < bottom) newPage();
      let x = o.x;
      for (const wd of ln) { const f = wd.b ? bold : font; if (!/^\s+$/.test(wd.w)) page.drawText(wd.w, { x, y: y - size, size, font: f, color: o.color || ink }); x += f.widthOfTextAtSize(wd.w, size); }
      y -= lead;
    }
  };
  const IND = [0, 0, 26, 52, 78];
  for (const blk of parseDoc(body).filter(b => !(opts.final && b.t === 'banner'))) {
    const tw = W - 2 * M;
    if (blk.t === 'gap') { y -= 7; continue; }
    if (blk.t === 'sig') { y -= 26; if (y - 30 < bottom) newPage(); page.drawRectangle({ x: M, y: y - 2, width: 190, height: 0.7, color: ink }); y -= 6; if (blk.segs.length) drawRich(blk.segs, { x: M, width: tw, size: 9.4, color: grey }); else y -= 4; continue; }
    if (blk.t === 'rule') { if (y - 14 < bottom) newPage(); y -= 6; page.drawRectangle({ x: M, y, width: tw, height: 0.8, color: accent }); y -= 10; continue; }
    if (blk.t === 'banner') { const txt = clean(blk.segs.map(x => x.text).join('')); const sz = 7.8; const lines = wrap(txt, bold, sz, tw - 16); const hh = lines.length * sz * 1.4 + 10; if (y - hh < bottom) newPage(); page.drawRectangle({ x: M, y: y - hh, width: tw, height: hh, color: rgb(0.99, 0.94, 0.93), borderColor: rgb(0.85, 0.35, 0.3), borderWidth: 0.6 }); lines.forEach((l, k) => page.drawText(l, { x: M + (tw - bold.widthOfTextAtSize(l, sz)) / 2, y: y - 7 - sz - k * sz * 1.4, size: sz, font: bold, color: rgb(0.7, 0.14, 0.1) })); y -= hh + 12; continue; }
    if (blk.t === 'title') { y -= 4; drawRich(blk.segs, { x: M, width: tw, size: 19, color: primary, allBold: true, lead: 1.25, keepWith: 40 }); page.drawRectangle({ x: M, y: y - 2, width: 46, height: 2.2, color: accent }); y -= 14; continue; }
    if (blk.t === 'h2') { y -= 9; drawRich(blk.segs, { x: M, width: tw, size: 12.2, color: primary, allBold: true, lead: 1.3, keepWith: 30 }); y -= 3; continue; }
    if (blk.t === 'h3') { y -= 5; drawRich(blk.segs, { x: M, width: tw, size: 10.8, allBold: true, lead: 1.35, keepWith: 24 }); y -= 1; continue; }
    if (blk.t === 'item') {
      const x0 = M + IND[blk.level]; const hang = blk.label === '•' ? 14 : Math.max(26, font.widthOfTextAtSize(blk.label, 10.2) + 10);
      if (y - 30 < bottom) newPage();
      const lf = blk.level === 1 && /^\d/.test(blk.label) ? bold : font;
      page.drawText(clean(blk.label), { x: x0, y: y - (10.2 + bump), size: 10.2 + bump, font: lf, color: blk.label === '•' ? accent : ink });
      drawRich(blk.segs, { x: x0 + hang, width: tw - IND[blk.level] - hang, size: 10.2 });
      y -= 3; continue;
    }
    drawRich(blk.segs, { x: M, width: tw, size: 10.2 }); y -= 4;
  }
  const footerLines = lh.enabled && lh.footer ? lh.footer.split('\n').flatMap(l => wrap(l, font, 7.5, W - 2 * M)).slice(0, 3) : [];
  pages.forEach((p, i) => {
    if (hdrImg) p.drawImage(hdrImg, { x: 0, y: H - hdrH, width: W, height: hdrH });
    if (ftrImg) p.drawImage(ftrImg, { x: 0, y: 0, width: W, height: ftrH });
    if (lh.enabled && !hdrImg) {
      let x = M;
      if (logo) { const hh = 40; const ww = Math.min(170, logo.width * (hh / logo.height)); p.drawImage(logo, { x, y: H - 40 - hh, width: ww, height: hh }); x += ww + 14; }
      const name = clean(lh.businessName); const ns = 15;
      p.drawText(name, { x: logo ? W - M - bold.widthOfTextAtSize(name, ns) : x, y: H - 62, size: ns, font: bold, color: primary });
      const contact = clean([lh.phone, lh.email, lh.website].filter(Boolean).join('   |   '));
      if (contact) p.drawText(contact, { x: logo ? W - M - font.widthOfTextAtSize(contact, 7.8) : x, y: H - 77, size: 7.8, font, color: grey });
      p.drawRectangle({ x: M, y: H - 92, width: W - 2 * M, height: 1.6, color: accent });
    }
    if (lh.enabled && !ftrImg) {
      p.drawRectangle({ x: M, y: 62, width: W - 2 * M, height: 0.8, color: accent });
      footerLines.forEach((l, k) => p.drawText(l, { x: (W - font.widthOfTextAtSize(l, 7.5)) / 2, y: 50 - k * 10, size: 7.5, font, color: grey }));
    }
    if (opts.watermark) { const ws = 64; const wt = clean(opts.watermark); p.drawText(wt, { x: W / 2 - bold.widthOfTextAtSize(wt, ws) * 0.36, y: H / 2 - ws, size: ws, font: bold, color: rgb(0.85, 0.2, 0.15), opacity: 0.12, rotate: degrees(35) }); }
    const pn = `Page ${i + 1} of ${pages.length}`;
    if (ftrImg) p.drawText(pn, { x: W - M - font.widthOfTextAtSize(pn, 8), y: ftrH + 12, size: 8, font, color: grey });
    else p.drawText(pn, { x: (W - font.widthOfTextAtSize(pn, 8)) / 2, y: 22, size: 8, font, color: grey });
  });
  return Buffer.from(await pdf.save());
}
