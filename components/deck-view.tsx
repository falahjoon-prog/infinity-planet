'use client';
/** On-screen slides — drawn from the same layout as the PowerPoint and PDF exports (lib/deck-layout), in the chosen template. */
import React, { useEffect, useMemo, useState } from 'react';
import { useBrand } from '@/lib/client/brand';
import { api } from '@/lib/client/api';
import type { Deck, Slide, ChartSpec } from '@/lib/deck';
import { BUILTIN_THEMES, DeckTheme, resolveTheme, fontFamily, fontWeight } from '@/lib/deck-themes';
import { layoutSlide, Prim, SW, SH } from '@/lib/deck-layout';

// ---------------------------------------------------------------- shared data (templates, logo shape, cover pictures)
type ThemeData = { custom: DeckTheme[]; house: { structure: string[]; theme_id?: string | null; from: string[]; learned_at: string } | null };
let themeCache: ThemeData | null = null; let themePromise: Promise<ThemeData> | null = null; const themeListeners = new Set<(d: ThemeData) => void>();
export function loadDeckThemes(force = false): Promise<ThemeData> {
  if (!force && themeCache) return Promise.resolve(themeCache);
  if (!force && themePromise) return themePromise;
  themePromise = api.get('/api/decks/themes').then((r: any) => { themeCache = { custom: r.custom || [], house: r.house || null }; themeListeners.forEach(f => f(themeCache!)); return themeCache!; }).catch(() => ({ custom: [], house: null }));
  return themePromise;
}
export function useDeckThemes(): ThemeData & { reload: () => Promise<ThemeData> } {
  const [d, setD] = useState<ThemeData>(themeCache || { custom: [], house: null });
  useEffect(() => { themeListeners.add(setD); loadDeckThemes().then(setD); return () => { themeListeners.delete(setD); }; }, []);
  return { ...d, reload: () => loadDeckThemes(true) };
}
const aspectCache: Record<string, number | null> = {};
function useLogoAspect(url?: string | null) {
  const [a, setA] = useState<number | null>(url ? aspectCache[url] ?? null : null);
  useEffect(() => { if (!url) { setA(null); return; } if (url in aspectCache) { setA(aspectCache[url]); return; } const img = new Image(); img.onload = () => { aspectCache[url] = img.naturalWidth / Math.max(1, img.naturalHeight); setA(aspectCache[url]); }; img.onerror = () => { aspectCache[url] = null; }; img.src = url; }, [url]);
  return a;
}
const coverCache: Record<string, string> = {};
function useCoverUrl(theme: DeckTheme) {
  const [u, setU] = useState<string | null>(theme.image ? coverCache[theme.id] || null : null);
  useEffect(() => { if (!theme.image) { setU(null); return; } if (coverCache[theme.id]) { setU(coverCache[theme.id]); return; } api.blob(`/api/decks/themes/${theme.id}/image`).then(({ blob }: any) => { coverCache[theme.id] = URL.createObjectURL(blob); setU(coverCache[theme.id]); }).catch(() => {}); }, [theme.id, theme.image]);
  return u;
}
/** The template a deck uses, with the business colours applied where the template follows them. */
export function useTheme(id?: string | null): DeckTheme {
  const b = useBrand(); const { custom, house } = useDeckThemes();
  return useMemo(() => resolveTheme(id || house?.theme_id || null, custom, { primary: b.primary, accent: b.accent, serif: b.serif }), [id, custom, house?.theme_id, b.primary, b.accent, b.serif]);
}
export const ALL_BUILTIN = BUILTIN_THEMES;

// ---------------------------------------------------------------- drawing
const IN = 100 / SW; // cqw per inch
const PT = IN / 72;  // cqw per point
const box = (x: number, y: number, w: number, h: number): React.CSSProperties => ({ position: 'absolute', left: `${x * IN}cqw`, top: `${y * IN}cqw`, width: `${w * IN}cqw`, height: `${h * IN}cqw` });

function ChartSvg({ c, colors, ink, muted, grid }: { c: ChartSpec; colors: string[]; ink: string; muted: string; grid: string }) {
  const W = 600, H = 300; const pal = colors;
  if (c.type === 'pie' || c.type === 'doughnut') {
    const s = c.series[0]; const total = s.values.reduce((x, y) => x + Math.max(0, y), 0) || 1; let a0 = -Math.PI / 2; const r = 120, cx = 150, cy = 150;
    return <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" style={{ width: '100%', height: '100%' }}>{s.values.map((v, i) => { const a1 = a0 + Math.max(0, v) / total * Math.PI * 2; const large = a1 - a0 > Math.PI ? 1 : 0; const d = `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`; a0 = a1; return <path key={i} d={d} fill={pal[i % pal.length]} stroke="#fff" strokeWidth="2" />; })}
      {c.type === 'doughnut' && <circle cx={cx} cy={cy} r={66} fill="#fff" />}
      {c.labels.map((l, i) => <g key={l + i}><rect x={310} y={40 + i * 30} width={14} height={14} rx={3} fill={pal[i % pal.length]} /><text x={332} y={52 + i * 30} fontSize="15" fill={ink}>{l} — {s.values[i]}</text></g>)}</svg>;
  }
  const vals = c.series.flatMap(s => s.values); const max = Math.max(1, ...vals); const n = c.labels.length; const gw = (W - 40) / n; const base = H - 34, ch = H - 80;
  return <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
    {c.title && <text x={20} y={16} fontSize="14" fontWeight="700" fill={ink}>{c.title}</text>}
    <line x1={20} y1={base} x2={W - 20} y2={base} stroke={grid} />
    {c.labels.map((l, i) => <text key={l + i} x={20 + gw * i + gw / 2} y={base + 20} fontSize="13" textAnchor="middle" fill={muted}>{l}</text>)}
    {c.type === 'line' ? c.series.map((s, si) => <g key={si}><polyline fill="none" stroke={pal[si % pal.length]} strokeWidth="3.5" points={s.values.map((v, i) => `${20 + gw * i + gw / 2},${base - v / max * ch}`).join(' ')} />{s.values.map((v, i) => <g key={i}><circle cx={20 + gw * i + gw / 2} cy={base - v / max * ch} r={5} fill={pal[si % pal.length]} /><text x={20 + gw * i + gw / 2} y={base - v / max * ch - 10} fontSize="12" textAnchor="middle" fill={ink}>{v}</text></g>)}</g>)
      : c.series.map((s, si) => s.values.map((v, i) => { const k = c.series.length; const bw = Math.min(56, gw * 0.7 / k); const x = 20 + gw * i + (gw - bw * k) / 2 + si * bw; const h = Math.max(0, v) / max * ch; return <g key={`${si}-${i}`}><rect x={x} y={base - h} width={bw - 4} height={h} rx={3} fill={pal[si % pal.length]} /><text x={x + (bw - 4) / 2} y={base - h - 6} fontSize="12" textAnchor="middle" fill={ink}>{v}</text></g>; }))}
    {c.series.length > 1 && c.series.map((s, si) => <g key={s.name}><rect x={20 + si * 160} y={22} width={12} height={12} rx={2} fill={pal[si % pal.length]} /><text x={38 + si * 160} y={33} fontSize="13" fill={ink}>{s.name}</text></g>)}
  </svg>;
}

function Part({ p, th, logo, cover }: { p: Prim; th: DeckTheme; logo?: string | null; cover?: string | null }) {
  const face = (f: 'head' | 'body') => th.fonts[f];
  const fam = (f: 'head' | 'body') => { const n = fontFamily(face(f)); return `'${n}', ${/georgia|garamond|cambria|times|palatino|antiqua|constantia/i.test(n) ? "Georgia, 'Times New Roman', serif" : "'Segoe UI', Calibri, Arial, sans-serif"}`; };
  switch (p.t) {
    case 'rect': return <div style={{ ...box(p.x, p.y, p.w, p.h), background: p.fill || 'transparent', opacity: p.alpha ? 1 - p.alpha / 100 : undefined, border: p.line ? `${(p.lineW || 1) * PT}cqw solid ${p.line}` : undefined, borderRadius: p.radius ? `${p.radius * IN}cqw` : undefined, boxSizing: 'border-box' }} />;
    case 'ellipse': return <div style={{ ...box(p.x, p.y, p.w, p.h), background: p.fill, opacity: p.alpha ? 1 - p.alpha / 100 : undefined, borderRadius: '50%' }} />;
    case 'poly': { const xs = p.points.map(q => q[0]), ys = p.points.map(q => q[1]); const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y; return <div style={{ ...box(x, y, w, h), background: p.fill, opacity: p.alpha ? 1 - p.alpha / 100 : undefined, clipPath: `polygon(${p.points.map(([px, py]) => `${((px - x) / w) * 100}% ${((py - y) / h) * 100}%`).join(',')})` }} />; }
    case 'line': { const vertical = Math.abs(p.x1 - p.x2) < Math.abs(p.y1 - p.y2); return <div style={{ ...box(Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(Math.abs(p.x2 - p.x1), 0.001), Math.max(Math.abs(p.y2 - p.y1), 0.001)), ...(vertical ? { borderLeft: `${Math.max(0.5, p.w) * PT}cqw solid ${p.color}` } : { borderTop: `${Math.max(0.5, p.w) * PT}cqw solid ${p.color}` }) }} />; }
    case 'seg': { const a = Math.atan2(p.y2 - p.y1, p.x2 - p.x1); const sw = p.w / 72; const L = Math.max(0.16, p.w * 0.05), Wd = L * 0.55; const bx = p.x2 - L * Math.cos(a), by = p.y2 - L * Math.sin(a);
      return <svg style={{ ...box(0, 0, SW, SH), overflow: 'visible', pointerEvents: 'none' }} viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none"><line x1={p.x1} y1={p.y1} x2={p.arrow ? bx : p.x2} y2={p.arrow ? by : p.y2} stroke={p.color} strokeWidth={sw} strokeLinecap="round" />{p.arrow && <polygon points={`${p.x2},${p.y2} ${bx - Wd * Math.sin(a)},${by + Wd * Math.cos(a)} ${bx + Wd * Math.sin(a)},${by - Wd * Math.cos(a)}`} fill={p.color} />}</svg>; }
    case 'image': { const src = p.src.startsWith('data:') ? p.src : p.src.startsWith('asset:') ? `/brand/deck/${p.src.slice(6)}` : p.src === 'logo' ? logo : p.src === 'cover' ? cover : p.src === 'wm-dark' ? '/brand/ip-dome-wm-white.png' : '/brand/ip-dome-wm-navy.png'; return src ? <img src={src} alt="" style={{ ...box(p.x, p.y, p.w, p.h), objectFit: p.fit, objectPosition: p.fit === 'contain' ? (p.src.startsWith('wm') ? 'center bottom' : 'left center') : 'center', opacity: p.alpha ? 1 - p.alpha / 100 : undefined }} /> : null; }
    case 'text': { const f = face(p.font); return <div className="s-txt" style={{ ...box(p.x, p.y, p.w, p.h), display: 'flex', flexDirection: 'column', justifyContent: p.valign === 'bottom' ? 'flex-end' : p.valign === 'middle' ? 'center' : 'flex-start', textAlign: p.align || 'left', fontFamily: fam(p.font), fontSize: `${p.size * PT}cqw`, lineHeight: p.lh || 1.15, color: p.color, fontWeight: p.bold ? fontWeight(f) : fontWeight(f) === 300 ? 300 : 400, fontStyle: p.italic ? 'italic' : undefined, letterSpacing: p.spacing ? `${p.spacing * PT}cqw` : undefined, whiteSpace: 'pre-wrap', overflow: 'hidden' }}><span>{p.text}</span></div>; }
    case 'list': return <ol className={`s-list b-${p.bullet}`} style={{ ...box(p.x, p.y, p.w, p.h), fontFamily: fam('body'), fontSize: `${p.size * PT}cqw`, lineHeight: p.lh || 1.3, color: p.color, ['--bc' as any]: p.bulletColor, gap: `${p.size * p.gap * PT}cqw` }}>{p.items.map((t, i) => <li key={i}>{t}</li>)}</ol>;
    case 'chart': return <div style={box(p.x, p.y, p.w, p.h)}><ChartSvg c={p.chart} colors={p.colors} ink={p.ink} muted={p.muted} grid={p.grid} /></div>;
  }
}

// ---------------------------------------------------------------- editing text straight on the slide
/** Which part of the slide a drawn text or list came from (title, subtitle, points, a column, a number, the quote…). */
type Field = 'title' | 'subtitle' | 'bullets' | 'quote' | 'by' | 'left.heading' | 'left.bullets' | 'right.heading' | 'right.bullets' | `stats.${number}.value` | `stats.${number}.label`;
const norm = (v?: string | null) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
const same = (a: string[], b?: string[]) => !!b && a.length === b.length && a.every((x, i) => norm(x) === norm(b[i]));
function fieldOf(p: Prim, sl: Slide, deck: Deck): Field | null {
  if (p.t === 'list') { if (same(p.items, sl.bullets)) return 'bullets'; if (same(p.items, sl.left?.bullets)) return 'left.bullets'; if (same(p.items, sl.right?.bullets)) return 'right.bullets'; return null; }
  if (p.t !== 'text' || !p.text.trim()) return null;
  const t = norm(p.text);
  if (t === norm(sl.title) || (!sl.title && ['title', 'closing'].includes(sl.layout) && t === norm(deck.title))) return 'title';
  if (sl.subtitle && t === norm(sl.subtitle)) return 'subtitle';
  if (sl.quote && t === norm(sl.quote)) return 'quote';
  if (sl.by && t === norm(`— ${sl.by}`)) return 'by';
  if (sl.left?.heading && t === norm(sl.left.heading)) return 'left.heading';
  if (sl.right?.heading && t === norm(sl.right.heading)) return 'right.heading';
  const k = (sl.stats || []).findIndex(x => norm(x.value) === t); if (k >= 0) return `stats.${k}.value`;
  const j = (sl.stats || []).findIndex(x => norm(x.label) === t); if (j >= 0) return `stats.${j}.label`;
  return null;
}
function readField(sl: Slide, deck: Deck, f: Field): string {
  if (f === 'title') return sl.title || (['title', 'closing'].includes(sl.layout) ? deck.title : '') || '';
  if (f === 'bullets') return (sl.bullets || []).join('\n');
  if (f === 'left.bullets' || f === 'right.bullets') return (sl[f.split('.')[0] as 'left' | 'right']?.bullets || []).join('\n');
  if (f === 'left.heading' || f === 'right.heading') return sl[f.split('.')[0] as 'left' | 'right']?.heading || '';
  if (f.startsWith('stats.')) { const [, i, k] = f.split('.'); return (sl.stats || [])[Number(i)]?.[k as 'value' | 'label'] || ''; }
  return String((sl as any)[f] || '');
}
/** The change to the slide when a field is edited. */
export function patchField(sl: Slide, f: Field, v: string): Partial<Slide> {
  const items = () => v.split('\n').map(x => x.trim()).filter(Boolean);
  if (f === 'bullets') return { bullets: items() };
  if (f === 'left.bullets' || f === 'right.bullets') { const c = f.split('.')[0] as 'left' | 'right'; return { [c]: { heading: sl[c]?.heading || '', bullets: items() } } as Partial<Slide>; }
  if (f === 'left.heading' || f === 'right.heading') { const c = f.split('.')[0] as 'left' | 'right'; return { [c]: { heading: v.trim(), bullets: sl[c]?.bullets || [] } } as Partial<Slide>; }
  if (f.startsWith('stats.')) { const [, i, k] = f.split('.'); const st = (sl.stats || []).slice(); st[Number(i)] = { ...st[Number(i)], [k]: v.trim() }; return { stats: st }; }
  return { [f]: f === 'quote' ? v.trim() : v.replace(/\n+/g, ' ').trim() } as Partial<Slide>;
}
export type InlineEdit = { onChange: (p: Partial<Slide>) => void; onOpenPanel?: () => void; onFocusField?: (label: string | null) => void };
const FIELD_LABEL = (f: Field) => f === 'title' ? 'title' : f === 'subtitle' ? 'subtitle' : f === 'bullets' ? 'points' : f === 'quote' ? 'quote' : f === 'by' ? 'quote author' : f.startsWith('left') ? `left column ${f.endsWith('heading') ? 'heading' : 'points'}` : f.startsWith('right') ? `right column ${f.endsWith('heading') ? 'heading' : 'points'}` : f.endsWith('value') ? `number ${Number(f.split('.')[1]) + 1}` : `number ${Number(f.split('.')[1]) + 1} label`;

export function SlideView({ slide, deck, index, small, theme: themeOverride, inline }: { slide: Slide; deck: Deck; index: number; small?: boolean; theme?: DeckTheme; inline?: InlineEdit }) {
  const b = useBrand(); const resolved = useTheme(deck.theme); const th = themeOverride || resolved;
  const aspect = useLogoAspect(b.logo_url); const cover = useCoverUrl(th);
  const art = useMemo(() => layoutSlide(deck, slide, index, th, { business: b.business_name, logoAspect: b.logo_url ? aspect || 3 : null, hasCover: !!th.image, watermark: deck.watermark !== false }), [deck, slide, index, th, b.business_name, b.logo_url, aspect]);
  const [active, setActive] = useState<{ i: number; f: Field; v: string } | null>(null);
  useEffect(() => { setActive(null); }, [slide.id]);
  const targets = useMemo(() => inline ? art.prims.map(p => fieldOf(p, slide, deck)) : [], [inline, art, slide, deck]);
  const commit = () => { if (!active || !inline) return; if (active.v !== readField(slide, deck, active.f)) inline.onChange(patchField(slide, active.f, active.v)); setActive(null); inline.onFocusField?.(null); };
  const fam = (f: 'head' | 'body') => { const n = fontFamily(th.fonts[f]); return `'${n}', 'Segoe UI', Calibri, Arial, sans-serif`; };
  return <div className={`slide v2${art.dark ? ' dark' : ''}${small ? ' small' : ''}${inline ? ' inline-edit' : ''}`} style={{ background: art.bg }} onDoubleClick={inline?.onOpenPanel && !active ? (e => { if (e.target === e.currentTarget) inline.onOpenPanel!(); }) : undefined}>
    {art.prims.map((p, i) => <Part key={i} p={p} th={th} logo={b.logo_url} cover={cover} />)}
    {inline && art.prims.map((p, i) => { const f = targets[i]; if (!f || (p.t !== 'text' && p.t !== 'list') || active?.i === i) return null;
      return <div key={`e${i}`} className="s-edit-hit" style={box(p.x, p.y, p.w, p.h)} title={`Double-click to edit the ${FIELD_LABEL(f)}`}
        onDoubleClick={e => { e.stopPropagation(); setActive({ i, f, v: readField(slide, deck, f) }); inline.onFocusField?.(FIELD_LABEL(f)); }} />; })}
    {inline && active && (() => { const p = art.prims[active.i] as Extract<Prim, { t: 'text' } | { t: 'list' }>; const multi = p.t === 'list' || active.f === 'quote';
      const st: React.CSSProperties = { ...box(p.x, p.y, p.w, Math.max(p.h, p.t === 'list' ? p.h : 0.5)), fontSize: `${p.size * PT}cqw`, lineHeight: p.lh || 1.2, color: p.color, fontFamily: fam(p.t === 'text' ? p.font : 'body'), fontWeight: p.t === 'text' && p.bold ? 700 : 400, fontStyle: p.t === 'text' && p.italic ? 'italic' : undefined, textAlign: p.t === 'text' ? p.align || 'left' : 'left' };
      return <textarea className="s-edit-box" style={st} autoFocus value={active.v} spellCheck
        onChange={e => setActive({ ...active, v: e.target.value })} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setActive(null); inline.onFocusField?.(null); } else if (e.key === 'Enter' && (!multi || e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); } }}
        onDoubleClick={e => e.stopPropagation()} placeholder={p.t === 'list' ? 'One point per line' : ''} />; })()}
  </div>;
}

/** A small preview of a template: its cover or a content slide. */
export function ThemePreview({ theme, which = 'cover' }: { theme: DeckTheme; which?: 'cover' | 'content' }) {
  const sample: Deck = useMemo(() => {
    const o = theme.outline; const st = o?.slides.find((x: any) => x.layout === 'stats');
    if (o) return { title: o.title, theme: theme.id, slides: [{ id: 'a', layout: 'title', title: o.title, subtitle: o.subtitle }, { id: 'b', layout: 'stats', title: st?.title || o.title, stats: (st?.stats || []).slice(0, 3) }] };
    return { title: 'Kangaroo Point Towers', theme: theme.id, slides: [
      { id: 'a', layout: 'title', title: 'Kangaroo Point Towers', subtitle: 'Investor presentation · October 2026' },
      { id: 'b', layout: 'stats', title: 'A landmark riverside opportunity', stats: [{ value: '$42m', label: 'Gross development value' }, { value: '186', label: 'Apartments' }, { value: '2028', label: 'Completion' }] },
    ] };
  }, [theme.id, theme.outline]);
  return <SlideView slide={sample.slides[which === 'cover' ? 0 : 1]} deck={sample} index={which === 'cover' ? 0 : 1} small theme={theme} />;
}
