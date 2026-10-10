/**
 * Slide layout engine: turns a slide + template into simple drawing parts (boxes, text, lists, pictures, charts)
 * measured in inches on a 13.333 × 7.5 in (16:9) slide. The on-screen preview, the PowerPoint file and the PDF
 * all draw these same parts, so they match. Pure code — runs on the server and in the browser.
 */
import type { Deck, Slide, ChartSpec, Extra } from './deck';
import { DeckTheme, shade, isDark, fontWeight } from './deck-themes';

export const SW = 13.333, SH = 7.5;
export type Font = 'head' | 'body';
export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; line?: string; lineW?: number; radius?: number; alpha?: number }
  | { t: 'ellipse'; x: number; y: number; w: number; h: number; fill: string; alpha?: number }
  | { t: 'poly'; points: [number, number][]; fill: string; alpha?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; w: number }
  | { t: 'image'; x: number; y: number; w: number; h: number; src: 'logo' | 'cover' | 'wm-dark' | 'wm-light' | `asset:${string}` | `data:${string}`; fit: 'contain' | 'cover'; alpha?: number }
  | { t: 'text'; x: number; y: number; w: number; h: number; text: string; size: number; font: Font; color: string; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'; lh?: number; spacing?: number }
  | { t: 'list'; x: number; y: number; w: number; h: number; items: string[]; size: number; color: string; bullet: DeckTheme['bullet']; bulletColor: string; gap: number; lh?: number }
  | { t: 'seg'; x1: number; y1: number; x2: number; y2: number; color: string; w: number; arrow?: boolean; id?: string }
  | { t: 'chart'; x: number; y: number; w: number; h: number; chart: ChartSpec; colors: string[]; ink: string; muted: string; grid: string };
export type SlideArt = { bg: string; prims: Prim[]; dark: boolean };
export type LayoutCtx = { business: string; logoAspect: number | null; hasCover: boolean; draft?: boolean; watermark?: boolean };
/** The dome picture is 1271 × 512. */
const DOME = 1271 / 512;

const CHAR = 0.5; // average character width in em
const lines = (text: string, size: number, w: number) => text.split('\n').reduce((n, p) => n + Math.max(1, Math.ceil((p.length * size * CHAR) / 72 / Math.max(0.3, w))), 0);
/** Largest size (≤ size, ≥ min) at which the text fits the box. */
export function fit(text: string, w: number, h: number, size: number, min = 10, lh = 1.2): number { let s = size; while (s > min && lines(text, s, w) * s * lh / 72 > h) s -= 1; return s; }
function fitList(items: string[], w: number, h: number, size: number, min = 11, lh = 1.3, gapEm = 0.55): number { let s = size; const tot = (z: number) => items.reduce((a, it) => a + lines(it, z, w - z * 1.4 / 72) * z * lh / 72 + z * gapEm / 72, 0); while (s > min && tot(s) > h) s -= 1; return s; }

export const chartColors = (th: DeckTheme) => [th.colors.primary, th.colors.accent, shade(th.colors.primary, 0.45), shade(th.colors.accent, 0.45), th.colors.muted, shade(th.colors.primary, -0.35)].map(c => isDark(th.colors.bg) && c === th.colors.bg ? th.colors.ink : c);

/** The template's drawing plus the photos, lines and boxes placed by hand ("back" ones sit just above the background, "front" ones on top). */
export function layoutSlide(deck: Deck, sl: Slide, index: number, th: DeckTheme, ctx: LayoutCtx): SlideArt {
  const art = layoutBase(deck, sl, index, th, ctx);
  if (!sl.extras?.length) return art;
  const full = (p: Prim) => (p.t === 'image' || p.t === 'rect') && p.x <= 0.01 && p.y <= 0.01 && p.w >= SW - 0.02 && p.h >= SH - 0.02;
  let k = 0; while (k < art.prims.length && full(art.prims[k])) k++;
  const back = sl.extras.filter(e => e.layer === 'back').flatMap(e => extraPrims(e, art.dark));
  const front = sl.extras.filter(e => e.layer !== 'back').flatMap(e => extraPrims(e, art.dark));
  return { ...art, prims: [...art.prims.slice(0, k), ...back, ...art.prims.slice(k), ...front] };
}
export function extraPrims(e: Extra, dark: boolean): Prim[] {
  const ink = dark ? '#FFFFFF' : '#1F2937';
  switch (e.kind) {
    case 'image': return e.src ? [{ t: 'image', x: e.x, y: e.y, w: e.w, h: e.h, src: e.src as any, fit: e.fit || 'cover', alpha: e.alpha || undefined }] : [];
    case 'line': case 'arrow': return [{ t: 'seg', x1: e.x, y1: e.y, x2: e.x + e.w, y2: e.y + e.h, color: e.color || ink, w: e.stroke ?? 2.5, arrow: e.kind === 'arrow' }];
    case 'rect': return [{ t: 'rect', x: e.x, y: e.y, w: e.w, h: e.h, fill: e.fill, line: e.color, lineW: e.color ? e.stroke ?? 2 : undefined, alpha: e.alpha || undefined, radius: 0.06 }];
    case 'ellipse': return e.fill ? [{ t: 'ellipse', x: e.x, y: e.y, w: e.w, h: e.h, fill: e.fill, alpha: e.alpha || undefined }] : [{ t: 'rect', x: e.x, y: e.y, w: e.w, h: e.h, line: e.color || ink, lineW: e.stroke ?? 2, radius: Math.min(e.w, e.h) / 2 }];
    case 'text': return [{ t: 'text', x: e.x, y: e.y, w: e.w, h: e.h, text: e.text || '', size: e.size || 18, font: 'body', color: e.color || ink, bold: !!e.bold, align: e.align || 'left', valign: 'top', lh: 1.2 }];
  }
  return [];
}

function layoutBase(deck: Deck, sl: Slide, index: number, th: DeckTheme, ctx: LayoutCtx): SlideArt {
  let C = th.colors; const M = 0.6; const P: Prim[] = []; const r = (th.round || 0) * 0.18;
  const up = (s: string) => th.upper ? s.toUpperCase() : s;
  const sectionNo = deck.slides.slice(0, index + 1).filter(s => s.layout === 'section').length;
  const logo = (x: number, y: number, h: number, box?: boolean, align: 'left' | 'right' = 'left') => {
    if (!ctx.logoAspect) return; const w = Math.min(2.6, h * ctx.logoAspect); const px = align === 'right' ? x - w : x;
    if (box) P.push({ t: 'rect', x: px - 0.18, y: y - 0.14, w: w + 0.36, h: h + 0.28, fill: '#FFFFFF', radius: 0.06 });
    P.push({ t: 'image', x: px, y, w, h, src: 'logo', fit: 'contain' });
  };
  const draft = (dark: boolean) => { if (ctx.draft) P.push({ t: 'text', x: SW - 2.4, y: 0.2, w: 1.9, h: 0.35, text: 'DRAFT', size: 11, font: 'body', color: dark ? '#FFB4A9' : '#C0392B', bold: true, align: 'right' }); };

  // ---------------------------------------------------------------- cover, closing and section slides
  if (sl.layout === 'title' || sl.layout === 'closing' || sl.layout === 'section') {
    const section = sl.layout === 'section';
    const title = up(sl.title || deck.title); const sub = sl.subtitle || '';
    const style = section ? (th.cover === 'minimal' ? 'minimal' : th.cover === 'image' ? 'solid' : th.cover === 'band' || th.cover === 'split' ? 'split' : th.cover) : th.cover;
    const darkCover = isDark(C.cover);
    // The Infinity Planet dome, faint, rising from the bottom-right corner (white on dark slides, navy on light ones)
    const dome = (dark: boolean, x = SW - 7.4, w = 7.6) => { if (ctx.watermark) P.push({ t: 'image', x, y: SH - w / DOME + 0.05, w, h: w / DOME, src: dark ? 'wm-dark' : 'wm-light', fit: 'contain', alpha: dark ? 84 : 90 }); };
    if (th.cover === 'house' && th.art) {
      const A = th.art; const ma = A.markAspect || 1.26;
      const mark = (sp: { x: number; y: number; h: number; light?: boolean; tag?: boolean } | null | undefined) => { if (!sp) return; const tag = !!(sp.tag && A.tagMark); const f = tag ? (sp.light ? A.tagMarkLight || A.tagMark : A.tagMark) : sp.light ? A.markLight : A.mark; if (f) P.push({ t: 'image', x: sp.x, y: sp.y, w: sp.h * (tag ? A.tagAspect || 1.49 : ma), h: sp.h, src: `asset:${f}`, fit: 'contain' }); };
      const logoAt = (sp: { x: number; y: number; h: number; align?: 'left' | 'right'; box?: boolean } | null | undefined) => { if (sp) logo(sp.x, sp.y, sp.h, sp.box !== false, sp.align || 'left'); };
      const textIn = (bx: import('./deck-themes').TextBox, main: string, second: string, max: number, num?: string) => {
        const al = bx.align || 'left'; let y = bx.y;
        if (num) { P.push({ t: 'text', x: bx.x, y: y - 0.55, w: bx.w, h: 0.5, text: num, size: 22, font: 'head', color: bx.num || C.accent, bold: true, align: al }); }
        const mh = second ? bx.h * 0.68 : bx.h;
        P.push({ t: 'text', x: bx.x, y, w: bx.w, h: mh, text: main, size: fit(main, bx.w, mh, bx.size || max, 16, 1.08), font: 'head', color: bx.ink, bold: true, align: al, valign: bx.valign || 'top', lh: 1.08 });
        if (second) P.push({ t: 'text', x: bx.x, y: y + mh + 0.12, w: bx.w, h: bx.h - mh - 0.1, text: second, size: fit(second, bx.w, Math.max(0.4, bx.h - mh - 0.1), 17, 9), font: 'body', color: bx.sub || bx.ink, align: al, valign: 'top' });
      };
      if (sl.layout === 'title' && A.cover) {
        P.push({ t: 'image', x: 0, y: 0, w: SW, h: SH, src: `asset:${A.cover}`, fit: 'cover' });
        mark(A.coverMark === undefined ? { x: M - 0.1, y: 0.35, h: 1.75 } : A.coverMark);
        logoAt(A.coverLogo === undefined ? { x: SW - M, y: 0.5, h: 0.62, align: 'right' } : A.coverLogo);
        const bx = A.coverText || { x: M, y: 2.9, w: 6.0, h: 3.5, ink: C.coverInk, sub: C.coverInk };
        if (A.kicker) P.push({ t: 'text', x: bx.x, y: bx.y - 0.45, w: bx.w, h: 0.4, text: A.kicker.toUpperCase(), size: 12, font: 'body', color: C.coverMuted, bold: true, spacing: 2, align: bx.align || 'left' });
        textIn(bx, title, sub, 40);
        const dk = isDark(C.cover); draft(dk); return { bg: C.cover, prims: P, dark: dk };
      }
      if (section && A.section) {
        P.push({ t: 'image', x: 0, y: 0, w: SW, h: SH, src: `asset:${A.section}`, fit: 'cover' });
        const bx = A.sectionText || { x: M, y: 2.25, w: 4.9, h: 2.8, ink: '#FFFFFF', sub: '#CFEFF7', num: '#00E4FD' };
        textIn(bx, title, sub, 36, String(sectionNo).padStart(2, '0'));
        const dk = A.sectionDark !== false; draft(dk); return { bg: A.sectionBg || '#00324A', prims: P, dark: dk };
      }
      if (sl.layout === 'closing' && A.closing) {
        P.push({ t: 'image', x: 0, y: 0, w: SW, h: SH, src: `asset:${A.closing}`, fit: 'cover' });
        if (A.closingText) {
          logoAt(A.closingLogo); mark(A.closingMark);
          textIn(A.closingText, title, sub, 34);
          const dk = isDark(A.closingBg || '#FFFFFF'); draft(dk); return { bg: A.closingBg || '#FFFFFF', prims: P, dark: dk };
        }
        const sy = SH * 0.76;
        logo(M, sy + 0.42, 0.78);
        const tx = M + (ctx.logoAspect ? Math.min(2.6, 0.78 * ctx.logoAspect) + 0.45 : 0);
        P.push({ t: 'text', x: tx, y: sy + 0.25, w: SW - tx - 3.3, h: 0.6, text: title, size: fit(title, SW - tx - 3.3, 0.6, 24, 14), font: 'head', color: C.primary, bold: true, valign: 'middle' });
        if (sub) P.push({ t: 'text', x: tx, y: sy + 0.85, w: SW - tx - 3.3, h: 0.8, text: sub, size: fit(sub, SW - tx - 3.3, 0.8, 12, 8), font: 'body', color: C.muted, valign: 'top' });
        mark({ x: SW - M - 1.55 * ma, y: sy + 0.12, h: 1.55 });
        draft(false); return { bg: '#FFFFFF', prims: P, dark: false };
      }
    }
    if (style === 'image' && ctx.hasCover) {
      P.push({ t: 'image', x: 0, y: 0, w: SW, h: SH, src: 'cover', fit: 'cover' });
      if (isDark(C.coverInk) === false) P.push({ t: 'rect', x: 0, y: SH * 0.42, w: SW, h: SH * 0.58, fill: '#000000', alpha: 55 });
      logo(M, 0.55, 0.7, true);
      P.push({ t: 'rect', x: M, y: SH - 2.95, w: 1.3, h: 0.07, fill: C.accent });
      P.push({ t: 'text', x: M, y: SH - 2.75, w: SW - 2 * M, h: 1.4, text: title, size: fit(title, SW - 2 * M, 1.4, 40, 22, 1.1), font: 'head', color: C.coverInk, bold: true, valign: 'top', lh: 1.1 });
      if (sub) P.push({ t: 'text', x: M, y: SH - 1.25, w: SW - 2 * M, h: 0.7, text: sub, size: fit(sub, SW - 2 * M, 0.7, 18, 11), font: 'body', color: C.coverMuted });
      draft(true); return { bg: C.cover, prims: P, dark: true };
    }
    if (style === 'split') {
      const sx = SW * 0.56;
      if (ctx.hasCover && th.cover === 'image') P.push({ t: 'image', x: 0, y: 0, w: SW, h: SH, src: 'cover', fit: 'cover' });
      P.push({ t: 'rect', x: 0, y: 0, w: sx, h: SH, fill: C.cover });
      if (!(ctx.hasCover && th.cover === 'image')) { P.push({ t: 'rect', x: sx, y: 0, w: SW - sx, h: SH, fill: C.soft }); P.push({ t: 'ellipse', x: sx + 1.2, y: 1.2, w: 4.2, h: 4.2, fill: C.accent, alpha: 78 }); P.push({ t: 'ellipse', x: sx + 2.6, y: 3.2, w: 3.2, h: 3.2, fill: C.primary, alpha: 82 }); }
      dome(darkCover, -1.2, 7.0);
      P.push({ t: 'rect', x: sx - 0.06, y: 0, w: 0.12, h: SH, fill: C.accent });
      if (!section) logo(M, 0.6, 0.65, true);
      if (section) P.push({ t: 'text', x: M, y: 2.1, w: sx - 2 * M, h: 0.5, text: `${String(sectionNo).padStart(2, '0')}`, size: 28, font: 'head', color: C.coverMuted, bold: true });
      P.push({ t: 'rect', x: M, y: 2.85, w: 1.1, h: 0.07, fill: C.accent });
      P.push({ t: 'text', x: M, y: 3.05, w: sx - 2 * M + 0.1, h: 2.1, text: title, size: fit(title, sx - 2 * M, 2.1, section ? 34 : 38, 20, 1.1), font: 'head', color: C.coverInk, bold: true, valign: 'top', lh: 1.1 });
      if (sub) P.push({ t: 'text', x: M, y: 5.35, w: sx - 2 * M, h: 1.2, text: sub, size: fit(sub, sx - 2 * M, 1.2, 16, 10), font: 'body', color: C.coverMuted, valign: 'top' });
      draft(true); return { bg: C.cover, prims: P, dark: darkCover };
    }
    if (style === 'band') {
      const bh = SH * 0.62;
      P.push({ t: 'rect', x: 0, y: 0, w: SW, h: bh, fill: C.cover });
      if (ctx.watermark) P.push({ t: 'image', x: SW - 6.2, y: bh - 6.0 / DOME, w: 6.0, h: 6.0 / DOME, src: darkCover ? 'wm-dark' : 'wm-light', fit: 'contain', alpha: darkCover ? 84 : 90 });
      P.push({ t: 'rect', x: 0, y: bh, w: SW, h: 0.09, fill: C.accent });
      P.push({ t: 'text', x: M, y: 1.0, w: SW - 2 * M, h: bh - 1.35, text: title, size: fit(title, SW - 2 * M, bh - 1.35, 44, 22, 1.1), font: 'head', color: C.coverInk, bold: true, valign: 'bottom', lh: 1.1 });
      if (sub) P.push({ t: 'text', x: M, y: bh + 0.45, w: SW - 2 * M - 3, h: 1.0, text: sub, size: fit(sub, SW - 2 * M - 3, 1.0, 18, 11), font: 'body', color: C.muted, valign: 'top' });
      logo(SW - M, SH - 1.15, 0.6, false, 'right');
      draft(true); return { bg: C.bg, prims: P, dark: isDark(C.bg) };
    }
    if (style === 'frame') {
      dome(darkCover, SW / 2 - 4, 8);
      P.push({ t: 'rect', x: 0.35, y: 0.35, w: SW - 0.7, h: SH - 0.7, line: C.accent, lineW: 1.5 });
      P.push({ t: 'rect', x: 0.5, y: 0.5, w: SW - 1.0, h: SH - 1.0, line: shade(C.accent, darkCover ? -0.4 : 0.5), lineW: 0.5 });
      if (!section) logo(SW / 2 - (ctx.logoAspect ? Math.min(2.6, 0.6 * ctx.logoAspect) / 2 : 0), 1.0, 0.6, !darkCover ? false : true);
      if (section) P.push({ t: 'text', x: M, y: 2.0, w: SW - 2 * M, h: 0.5, text: `— ${String(sectionNo).padStart(2, '0')} —`, size: 16, font: 'body', color: C.coverMuted, align: 'center', spacing: 4 });
      P.push({ t: 'text', x: 1.4, y: 2.55, w: SW - 2.8, h: 2.0, text: title, size: fit(title, SW - 2.8, 2.0, 42, 22, 1.1), font: 'head', color: C.coverInk, bold: true, align: 'center', valign: 'middle', lh: 1.1 });
      P.push({ t: 'rect', x: SW / 2 - 0.6, y: 4.75, w: 1.2, h: 0.05, fill: C.accent });
      if (sub) P.push({ t: 'text', x: 1.4, y: 5.0, w: SW - 2.8, h: 0.9, text: sub, size: fit(sub, SW - 2.8, 0.9, 17, 10), font: 'body', color: C.coverMuted, align: 'center', valign: 'top' });
      draft(darkCover); return { bg: C.cover, prims: P, dark: darkCover };
    }
    if (style === 'minimal') {
      const bg = section ? C.soft : C.bg; const ink = section ? C.primary : (isDark(C.bg) ? C.ink : C.cover === C.bg ? C.coverInk : C.ink);
      dome(isDark(bg));
      logo(SW - M, 0.6, 0.55, false, 'right');
      P.push({ t: 'rect', x: M, y: 2.35, w: 0.9, h: 0.09, fill: C.accent });
      if (section) P.push({ t: 'text', x: M, y: 1.6, w: 4, h: 0.6, text: String(sectionNo).padStart(2, '0'), size: 30, font: 'head', color: C.accent, bold: true });
      P.push({ t: 'text', x: M, y: 2.6, w: SW - 2 * M - 1, h: 2.6, text: title, size: fit(title, SW - 2 * M - 1, 2.6, 54, 24, 1.05), font: 'head', color: ink, bold: fontWeight(th.fonts.head) >= 600, valign: 'top', lh: 1.05 });
      if (sub) P.push({ t: 'text', x: M, y: 5.45, w: SW - 2 * M - 3, h: 0.9, text: sub, size: fit(sub, SW - 2 * M - 3, 0.9, 18, 11), font: 'body', color: C.muted, valign: 'top' });
      P.push({ t: 'text', x: M, y: SH - 0.7, w: 6, h: 0.35, text: ctx.business, size: 11, font: 'body', color: C.muted });
      draft(isDark(bg)); return { bg, prims: P, dark: isDark(bg) };
    }
    // solid
    dome(darkCover);
    if (th.deco === 'circle') { P.push({ t: 'ellipse', x: SW - 4.6, y: -1.6, w: 6.5, h: 6.5, fill: C.accent, alpha: 80 }); P.push({ t: 'ellipse', x: SW - 2.4, y: 3.6, w: 4.4, h: 4.4, fill: C.coverMuted, alpha: 85 }); }
    if (th.deco === 'corner') P.push({ t: 'poly', points: [[SW - 3.2, 0], [SW, 0], [SW, 3.2]], fill: C.accent });
    if (!section) logo(M, 0.6, 0.7, true);
    if (section) P.push({ t: 'text', x: M, y: 2.3, w: 4, h: 0.6, text: String(sectionNo).padStart(2, '0'), size: 30, font: 'head', color: C.accent, bold: true });
    P.push({ t: 'rect', x: M, y: section ? 3.05 : 4.55, w: 1.4, h: 0.08, fill: C.accent });
    P.push({ t: 'text', x: M, y: section ? 3.3 : 2.4, w: SW - 2 * M - 1, h: section ? 1.3 : 2.05, text: title, size: fit(title, SW - 2 * M - 1, section ? 1.3 : 2.05, section ? 34 : 42, 20, 1.1), font: 'head', color: C.coverInk, bold: true, valign: section ? 'top' : 'bottom', lh: 1.1 });
    if (sub) P.push({ t: 'text', x: M, y: section ? 4.7 : 4.8, w: SW - 2 * M - 1, h: 1.0, text: sub, size: fit(sub, SW - 2 * M - 1, 1.0, 18, 11), font: 'body', color: C.coverMuted, valign: 'top' });
    draft(darkCover); return { bg: C.cover, prims: P, dark: darkCover };
  }

  // ---------------------------------------------------------------- content slides
  const A = th.art || null;
  const darkStats = !!(A?.dark && sl.layout === 'stats');
  const pic = sl.photo && sl.photo !== 'none' && (sl.layout === 'bullets' || sl.layout === 'quote') ? sl.photo : null;
  const strip = !!(A?.strip && !darkStats && !pic && (sl.layout === 'bullets' || sl.layout === 'two_column' || sl.layout === 'quote') && Math.max(sl.bullets?.length || 0, sl.left?.bullets.length || 0, sl.right?.bullets.length || 0) <= 5);
  if (A?.paper) P.push({ t: 'image', x: 0, y: 0, w: SW, h: SH, src: `asset:${A.paper}`, fit: 'cover' });
  if (darkStats) P.push({ t: 'image', x: 0, y: 0, w: SW, h: SH, src: `asset:${A!.dark}`, fit: 'cover' });
  if (darkStats) { const o = C; const dc = A!.darkColors || { bg: '#00324A', ink: '#FFFFFF', muted: '#9FE8F5', accent: '#FFFFFF', line: '#2C5670' }; C = { ...o, bg: dc.bg, ink: dc.ink, muted: dc.muted, primary: dc.ink, accent: dc.accent, line: dc.line, soft: shade(dc.bg, 0.12) }; }
  // picture band behind the title, or a photo column on the right
  const band = !!(A?.band && !darkStats); const side = !!(A?.side && !darkStats && !pic && sl.layout !== 'chart' && sl.layout !== 'stats');
  if (band) P.push({ t: 'image', x: 0, y: 0, w: SW, h: 1.45, src: `asset:${A!.band}`, fit: 'cover' });
  if (side) P.push({ t: 'image', x: SW - 2.3, y: 0, w: 2.3, h: SH, src: `asset:${A!.side}`, fit: 'cover' });
  const dark = isDark(C.bg);
  // decoration
  if (th.deco === 'stripe') P.push({ t: 'rect', x: 0, y: 0, w: 0.14, h: SH, fill: C.primary });
  if (th.deco === 'corner') P.push({ t: 'poly', points: [[SW - 1.3, 0], [SW, 0], [SW, 1.3]], fill: C.accent });
  if (th.deco === 'circle') P.push({ t: 'ellipse', x: SW - 2.2, y: SH - 2.0, w: 4.0, h: 4.0, fill: C.soft });
  if (th.deco === 'grid') for (let gx = 1; gx < 12; gx++) P.push({ t: 'line', x1: gx * SW / 12, y1: 0, x2: gx * SW / 12, y2: SH, color: shade(C.line, dark ? -0.2 : 0.55), w: 0.4 });
  // heading
  let top = 1.75; const title = sl.title ? up(sl.title) : '';
  const hw = SW - 2 * M - (th.deco === 'corner' ? 0.8 : 0) - (side ? 2.3 : 0);
  if (title && band) {
    P.push({ t: 'text', x: M, y: 0.2, w: hw, h: 1.05, text: title, size: fit(title, hw, 1.05, 28, 16, 1.1), font: 'head', color: A!.bandInk || '#FFFFFF', bold: true, valign: 'middle', lh: 1.1 });
    top = 1.85;
  } else if (title) {
    // number slides on a dark picture: band headings become a plain title with an accent bar
    const H = darkStats && (th.heading === 'band' || th.heading === 'bands') ? 'bar' : th.heading;
    if (H === 'bands') {
      P.push({ t: 'rect', x: 0, y: 0, w: SW, h: 0.5, fill: C.primary });
      P.push({ t: 'rect', x: 0, y: SH - 0.5, w: SW, h: 0.5, fill: C.primary });
      if (ctx.logoAspect) logo(SW - M, 0.1, 0.3, true, 'right');
      P.push({ t: 'text', x: M, y: 0.68, w: hw, h: 0.9, text: title, size: fit(title, hw, 0.9, 30, 16, 1.1), font: 'head', color: C.accent, bold: true, valign: 'middle', lh: 1.1 });
      top = 1.75;
    } else if (H === 'band') {
      P.push({ t: 'rect', x: 0, y: 0, w: SW, h: 1.45, fill: C.primary });
      P.push({ t: 'text', x: M, y: 0.25, w: hw, h: 1.0, text: title, size: fit(title, hw, 1.0, 28, 16, 1.1), font: 'head', color: isDark(C.primary) ? '#FFFFFF' : C.ink, bold: true, valign: 'middle', lh: 1.1 });
      top = 1.85;
    } else if (H === 'bar') {
      P.push({ t: 'rect', x: M, y: 0.5, w: 0.1, h: 0.95, fill: C.accent });
      P.push({ t: 'text', x: M + 0.32, y: 0.45, w: hw - 0.32, h: 1.05, text: title, size: fit(title, hw - 0.32, 1.05, 28, 16, 1.1), font: 'head', color: dark ? C.ink : C.primary, bold: true, valign: 'middle', lh: 1.1 });
    } else if (H === 'kicker') {
      const k = (sl.subtitle || deck.title).toUpperCase().slice(0, 70);
      P.push({ t: 'text', x: M, y: 0.38, w: hw, h: 0.35, text: k, size: 11, font: 'body', color: C.accent, bold: true, spacing: 2 });
      P.push({ t: 'text', x: M, y: 0.72, w: hw, h: 0.85, text: title, size: fit(title, hw, 0.85, 28, 16, 1.1), font: 'head', color: dark ? C.ink : C.primary, bold: true, valign: 'top', lh: 1.1 });
    } else if (H === 'underline') {
      P.push({ t: 'text', x: M, y: 0.4, w: hw, h: 0.95, text: title, size: fit(title, hw, 0.95, 28, 16, 1.1), font: 'head', color: C.ink, bold: true, valign: 'bottom', lh: 1.1 });
      P.push({ t: 'line', x1: M, y1: 1.47, x2: SW - M, y2: 1.47, color: th.id === 'editorial' ? C.ink : C.line, w: th.id === 'editorial' ? 1.5 : 1 });
      P.push({ t: 'rect', x: M, y: 1.44, w: 1.0, h: 0.06, fill: C.accent });
    } else if (H === 'plain') {
      P.push({ t: 'text', x: M, y: 0.35, w: hw, h: 1.15, text: title, size: fit(title, hw, 1.15, 32, 16, 1.08), font: 'head', color: C.ink, bold: fontWeight(th.fonts.head) >= 600, valign: 'bottom', lh: 1.08 });
    } else {
      P.push({ t: 'text', x: M, y: 0.4, w: hw, h: 0.95, text: title, size: fit(title, hw, 0.95, 28, 16, 1.1), font: 'head', color: dark ? C.ink : C.primary, bold: true, valign: 'bottom', lh: 1.1 });
      P.push({ t: 'rect', x: M, y: 1.42, w: 1.1, h: 0.06, fill: C.accent });
    }
  }
  const bodyH = SH - top - (strip ? 2.0 : th.heading === 'bands' ? 1.05 : 0.85); const bw = SW - 2 * M - (side ? 2.3 : 0);
  const list = (items: string[], x: number, y: number, w: number, h: number, size: number) => P.push({ t: 'list', x, y, w, h, items, size: fitList(items, w, h, size), color: C.ink, bullet: th.bullet, bulletColor: C.accent, gap: 0.55, lh: 1.3 });
  // a photo beside the text: right-hand frame 5 × 4.2 in (the library photos are cut to this shape)
  const photoFrame = () => { const ph = Math.min(4.2, bodyH - 0.05), pw = ph * (5 / 4.2); const px = SW - M - pw, py = top + 0.05;
    P.push({ t: 'image', x: px, y: py, w: pw, h: ph, src: pic as any, fit: 'cover' }); P.push({ t: 'rect', x: px, y: py + ph, w: pw, h: 0.07, fill: C.accent }); return pw; };
  if (sl.layout === 'bullets') { const items = sl.bullets?.length ? sl.bullets : ['[● add points]'];
    if (pic) { const pw = photoFrame(); list(items, M, top + 0.1, bw - pw - 0.45, bodyH - 0.1, items.length <= 3 ? 22 : items.length <= 5 ? 19 : 17); }
    else list(items, M, top + 0.1, bw - (th.deco === 'circle' ? 1.2 : 0), bodyH - 0.1, items.length <= 4 ? 24 : items.length <= 6 ? 21 : 19); }
  else if (sl.layout === 'two_column') {
    const cw = (bw - 0.6) / 2;
    [sl.left, sl.right].forEach((c, i) => {
      if (!c) return; const x = M + i * (cw + 0.6); let y = top;
      if (c.heading) {
        if (th.stats === 'filled' || th.heading === 'band') { P.push({ t: 'rect', x, y, w: cw, h: 0.55, fill: i ? C.accent : C.primary, radius: r }); P.push({ t: 'text', x: x + 0.2, y, w: cw - 0.4, h: 0.55, text: c.heading, size: fit(c.heading, cw - 0.4, 0.55, 17, 11), font: 'head', color: isDark(i ? C.accent : C.primary) ? '#FFFFFF' : C.ink, bold: true, valign: 'middle' }); }
        else { P.push({ t: 'text', x, y, w: cw, h: 0.5, text: c.heading, size: fit(c.heading, cw, 0.5, 18, 11), font: 'head', color: dark ? C.accent : C.primary, bold: true }); P.push({ t: 'rect', x, y: y + 0.52, w: cw, h: 0.02, fill: C.line }); }
        y += 0.75;
      }
      list(c.bullets, x, y, cw, bodyH - (y - top), c.bullets.length <= 4 ? 20 : 17);
    });
  } else if (sl.layout === 'stats') {
    const st = sl.stats || []; const P1 = darkStats ? shade(C.bg, 0.14) : C.primary; const n = Math.max(1, st.length); const gap = 0.35; const cw = (bw - gap * (n - 1)) / n; const sy = top + 0.3, sh = sl.bullets?.length ? 2.7 : 3.4;
    st.forEach((x, i) => {
      const cx = M + i * (cw + gap); const v = x.value; const S = th.stats;
      if (S === 'card') { P.push({ t: 'rect', x: cx, y: sy, w: cw, h: sh, fill: C.soft, line: C.line, lineW: 0.5, radius: r }); P.push({ t: 'rect', x: cx, y: sy, w: cw, h: 0.08, fill: C.accent }); }
      if (S === 'outline') P.push({ t: 'rect', x: cx, y: sy, w: cw, h: sh, line: C.accent, lineW: 1.25, radius: r });
      const fl = i % 2 ? C.accent : P1;
      if (S === 'filled') P.push({ t: 'rect', x: cx, y: sy, w: cw, h: sh, fill: fl, radius: r });
      const vc = S === 'filled' ? (isDark(fl) ? '#FFFFFF' : darkStats ? '#002A3A' : C.ink) : S === 'outline' ? C.accent : dark ? C.ink : C.primary;
      const lc = S === 'filled' ? (isDark(fl) ? shade(fl, 0.7) : darkStats ? '#2B4B57' : C.muted) : C.muted;
      if (S === 'big') {
        P.push({ t: 'text', x: cx, y: sy, w: cw, h: 1.5, text: v, size: fit(v, cw, 1.5, 54, 22, 1.0), font: 'head', color: dark ? C.accent : C.primary, bold: true, valign: 'bottom' });
        P.push({ t: 'rect', x: cx, y: sy + 1.65, w: Math.min(cw, 1.2), h: 0.06, fill: C.accent });
        P.push({ t: 'text', x: cx, y: sy + 1.85, w: cw, h: sh - 1.9, text: x.label, size: fit(x.label, cw, sh - 1.9, 16, 10), font: 'body', color: C.muted, valign: 'top' });
      } else {
        P.push({ t: 'text', x: cx + 0.2, y: sy + 0.45, w: cw - 0.4, h: 1.3, text: v, size: fit(v, cw - 0.4, 1.3, 44, 18, 1.0), font: 'head', color: vc, bold: true, align: 'center', valign: 'middle' });
        P.push({ t: 'text', x: cx + 0.2, y: sy + 1.85, w: cw - 0.4, h: sh - 2.0, text: x.label, size: fit(x.label, cw - 0.4, sh - 2.0, 15, 10), font: 'body', color: lc, align: 'center', valign: 'top' });
      }
    });
    if (sl.bullets?.length) list(sl.bullets, M, sy + sh + 0.3, bw, bodyH - sh - 0.6, 15);
  } else if (sl.layout === 'quote') {
    P.push({ t: 'text', x: M + 0.2, y: top - 0.4, w: 1.4, h: 1.4, text: '“', size: 110, font: 'head', color: C.accent, bold: true, lh: 1 });
    const q = sl.quote || ''; const qw = pic ? bw - photoFrame() - 1.6 : bw - 2.2;
    P.push({ t: 'text', x: M + 1.2, y: top + 0.1, w: qw, h: 3.3, text: q, size: fit(q, qw, 3.3, pic ? 26 : 30, 14, 1.3), font: 'head', color: dark ? C.ink : C.primary, italic: true, valign: 'middle', lh: 1.3 });
    if (sl.by) P.push({ t: 'text', x: M + 1.2, y: top + 3.6, w: qw, h: 0.5, text: `— ${sl.by}`, size: 16, font: 'body', color: C.muted });
  } else if (sl.layout === 'chart' && sl.chart) {
    const cw = sl.bullets?.length ? 8.2 : bw;
    P.push({ t: 'chart', x: M, y: top, w: cw, h: bodyH, chart: sl.chart, colors: chartColors(th), ink: C.ink, muted: C.muted, grid: C.line });
    if (sl.bullets?.length) list(sl.bullets, M + 8.6, top, bw - 8.6, bodyH, 15);
  }
  // footer
  if (strip) {
    P.push({ t: 'image', x: 0, y: SH - 2.0, w: SW, h: 2.0, src: `asset:${A!.strip}`, fit: 'cover' });
    P.push({ t: 'ellipse', x: SW - 0.95, y: SH - 0.62, w: 0.42, h: 0.42, fill: '#FFFFFF' });
    P.push({ t: 'text', x: SW - 0.95, y: SH - 0.62, w: 0.42, h: 0.42, text: String(index + 1), size: 10, font: 'body', color: C.primary, bold: true, align: 'center', valign: 'middle' });
    draft(dark); return { bg: C.bg, prims: P, dark };
  }
  if (th.heading === 'bands') {
    P.push({ t: 'text', x: M, y: SH - 0.5, w: 7, h: 0.5, text: ctx.business, size: 10, font: 'body', color: '#FFFFFF', valign: 'middle' });
    P.push({ t: 'text', x: SW - M - 1, y: SH - 0.5, w: 1, h: 0.5, text: String(index + 1), size: 10, font: 'body', color: '#FFFFFF', align: 'right', valign: 'middle' });
    draft(dark); return { bg: C.bg, prims: P, dark };
  }
  const fy = SH - 0.52;
  if (darkStats) { P.push({ t: 'text', x: SW - M - 0.6, y: fy, w: 0.6, h: 0.3, text: String(index + 1), size: 10, font: 'body', color: C.muted, align: 'right', valign: 'middle' }); draft(true); return { bg: C.bg, prims: P, dark: true }; }
  const RX = side ? SW - 2.3 - 0.35 : SW - M;
  if (th.heading !== 'band' && th.deco !== 'stripe') P.push({ t: 'rect', x: 0, y: SH - 0.07, w: side ? SW - 2.3 : SW, h: 0.07, fill: C.primary === C.bg ? C.accent : C.primary });
  P.push({ t: 'text', x: M, y: fy, w: 6, h: 0.3, text: ctx.business, size: 10, font: 'body', color: C.muted, valign: 'middle' });
  const lw = ctx.logoAspect ? Math.min(2.4, 0.38 * ctx.logoAspect) : 0;
  P.push({ t: 'text', x: RX - lw - (lw ? 0.25 : 0) - 0.6, y: fy, w: 0.6, h: 0.3, text: String(index + 1), size: 10, font: 'body', color: C.muted, align: 'right', valign: 'middle' });
  if (lw) P.push({ t: 'image', x: RX - lw, y: fy - 0.05, w: lw, h: 0.38, src: 'logo', fit: 'contain' });
  draft(dark);
  return { bg: C.bg, prims: P, dark };
}
