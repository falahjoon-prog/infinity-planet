/**
 * Presentations: the deck model, plus the built-in (no AI) deck writer and editor.
 * A deck is a list of slides with simple layouts that map cleanly to PowerPoint, PDF and the on-screen preview.
 */
export type ChartSpec = { type: 'bar' | 'line' | 'pie' | 'doughnut'; title?: string; labels: string[]; series: { name: string; values: number[] }[] };
export type Slide = {
  id: string;
  layout: 'title' | 'section' | 'bullets' | 'two_column' | 'stats' | 'quote' | 'chart' | 'closing';
  title?: string; subtitle?: string; bullets?: string[];
  left?: { heading?: string; bullets: string[] }; right?: { heading?: string; bullets: string[] };
  stats?: { value: string; label: string }[]; quote?: string; by?: string; chart?: ChartSpec | null; notes?: string; sources?: string[];
  /** A photo beside the text (bullets and quote slides): a library photo ("asset:photos/p46.jpg"), an uploaded picture, or "none" (no photo — don't add one). */
  photo?: string;
  /** Things placed by hand on top of (or behind) the template: photos, lines, arrows, boxes, circles, text. Array order = stacking order. */
  extras?: Extra[];
};
/** A hand-placed item, in inches on the 13.333 × 7.5 slide. Lines/arrows run from (x, y) to (x + w, y + h). */
export type Extra = { id: string; kind: 'image' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text'; x: number; y: number; w: number; h: number; layer: 'front' | 'back';
  src?: string; color?: string; fill?: string; stroke?: number; text?: string; size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; fit?: 'cover' | 'contain'; alpha?: number };
const HEXC = /^#[0-9a-f]{6}$/i;
export function sanitizeExtras(v: any): Extra[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const n = (x: any, lo: number, hi: number, d = 0) => { const k = Number(x); return isFinite(k) ? Math.max(lo, Math.min(hi, Math.round(k * 1000) / 1000)) : d; };
  const out = v.slice(0, 40).map((e: any): Extra | null => {
    if (!e || typeof e !== 'object' || !['image', 'line', 'arrow', 'rect', 'ellipse', 'text'].includes(e.kind)) return null;
    const line = e.kind === 'line' || e.kind === 'arrow';
    const src = e.kind === 'image' && typeof e.src === 'string' && (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(e.src) && e.src.length < 3_500_000 || /^asset:([\w-]+\/)?[\w.-]+\.(png|jpe?g)$/i.test(e.src)) ? e.src : undefined;
    if (e.kind === 'image' && !src) return null;
    return { id: String(e.id || '').replace(/[^\w-]/g, '').slice(0, 20) || Math.random().toString(36).slice(2, 9), kind: e.kind,
      x: n(e.x, -13, 26), y: n(e.y, -7.5, 15), w: line ? n(e.w, -26, 26) : n(e.w, 0.05, 26, 2), h: line ? n(e.h, -15, 15) : n(e.h, 0.05, 15, 1), layer: e.layer === 'back' ? 'back' : 'front',
      ...(src ? { src, fit: e.fit === 'contain' ? 'contain' : 'cover' } : {}),
      ...(HEXC.test(e.color) ? { color: e.color } : {}), ...(HEXC.test(e.fill) ? { fill: e.fill } : {}),
      ...(e.stroke != null ? { stroke: n(e.stroke, 0, 20, 2) } : {}), ...(e.alpha != null ? { alpha: n(e.alpha, 0, 100, 0) } : {}),
      ...(e.kind === 'text' ? { text: String(e.text || '').slice(0, 600), size: n(e.size, 6, 120, 18), bold: !!e.bold, align: ['center', 'right'].includes(e.align) ? e.align : 'left' } : {}) };
  }).filter(Boolean) as Extra[];
  return out.length ? out : undefined;
}
/** theme: a template id from lib/deck-themes (built-in or the business's own). */
export type Deck = { title: string; subtitle?: string; slides: Slide[]; theme?: string; /** the Infinity Planet dome as a faint watermark on cover and section slides */ watermark?: boolean };

import { BUILTIN_THEMES } from './deck-themes';
import { cleanPhoto, photoFits, libId, bestPhoto, photoSrc, autoPhotos } from './deck-photos';
export const LAYOUTS: Slide['layout'][] = ['title', 'section', 'bullets', 'two_column', 'stats', 'quote', 'chart', 'closing'];
const sid = () => Math.random().toString(36).slice(2, 9);
const str = (v: any, n = 300) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : typeof v === 'number' ? String(v) : '';
const list = (v: any, n = 8, len = 220) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : []).map((x: any) => str(typeof x === 'object' && x ? x.text || x.title || '' : x, len).replace(/^[-•*]\s*/, '')).filter(Boolean).slice(0, n);
const num = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };

/** Makes any deck-shaped input safe and consistent (also used on AI output). */
export function normalizeDeck(raw: any, fallbackTitle = 'Presentation'): Deck {
  const d = raw && typeof raw === 'object' ? raw : {};
  const slides: Slide[] = (Array.isArray(d.slides) ? d.slides : []).slice(0, 40).map((s: any): Slide => {
    const layout: Slide['layout'] = LAYOUTS.includes(s?.layout) ? s.layout : s?.chart ? 'chart' : s?.stats ? 'stats' : s?.left || s?.right ? 'two_column' : s?.quote ? 'quote' : 'bullets';
    const col = (c: any) => c && typeof c === 'object' ? { heading: str(c.heading || c.title, 80) || undefined, bullets: list(c.bullets || c.points, 7) } : undefined;
    let chart: ChartSpec | null = null;
    if (s?.chart && typeof s.chart === 'object') {
      const labels = list(s.chart.labels, 12, 40);
      const series = (Array.isArray(s.chart.series) ? s.chart.series : [{ name: s.chart.name || 'Value', values: s.chart.values }]).slice(0, 4).map((x: any, i: number) => ({ name: str(x?.name, 40) || `Series ${i + 1}`, values: (Array.isArray(x?.values) ? x.values : []).slice(0, labels.length).map(num) }));
      if (labels.length && series.some((x: any) => x.values.length)) chart = { type: ['bar', 'line', 'pie', 'doughnut'].includes(s.chart.type) ? s.chart.type : 'bar', title: str(s.chart.title, 80) || undefined, labels, series };
    }
    return {
      id: str(s?.id, 20) || sid(), layout: layout === 'chart' && !chart ? 'bullets' : layout,
      title: str(s?.title, 120) || undefined, subtitle: str(s?.subtitle, 200) || undefined, bullets: list(s?.bullets || s?.points),
      left: col(s?.left), right: col(s?.right),
      stats: (Array.isArray(s?.stats) ? s.stats : []).slice(0, 4).map((x: any) => ({ value: str(x?.value, 24), label: str(x?.label, 80) })).filter((x: any) => x.value),
      quote: str(s?.quote, 400) || undefined, by: str(s?.by || s?.author, 80) || undefined, chart, notes: str(s?.notes, 1500) || undefined,
      sources: list(s?.sources, 6, 300),
      ...(s?.extras ? { extras: sanitizeExtras(s.extras) } : {}),
      ...(cleanPhoto(s?.photo) ? { photo: cleanPhoto(s.photo) } : {}),
    };
  });
  const theme = typeof d.theme === 'string' && /^[a-z0-9-]{3,40}$/.test(d.theme) ? d.theme : undefined;
  return { title: str(d.title, 140) || fallbackTitle, subtitle: str(d.subtitle, 200) || undefined, slides, ...(theme ? { theme } : {}), ...(d.watermark === false ? { watermark: false } : {}) };
}

/** Plain-text outline of a deck (search index, final copy, AI context). */
export function deckOutline(d: Deck): string {
  const out = [`# ${d.title}`, d.subtitle || ''];
  d.slides.forEach((s, i) => {
    out.push('', `## ${i + 1}. ${s.title || s.layout}`);
    if (s.subtitle) out.push(s.subtitle);
    for (const b of s.bullets || []) out.push(`- ${b}`);
    for (const c of [s.left, s.right]) if (c) { if (c.heading) out.push(`**${c.heading}**`); for (const b of c.bullets) out.push(`- ${b}`); }
    for (const st of s.stats || []) out.push(`- ${st.value} — ${st.label}`);
    if (s.quote) out.push(`"${s.quote}"${s.by ? ` — ${s.by}` : ''}`);
    if (s.chart) out.push(`Chart (${s.chart.type}): ${s.chart.labels.map((l, k) => `${l} ${s.chart!.series.map(x => x.values[k]).join('/')}`).join(', ')}`);
  });
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

// ------------------------------------------------------------------ built-in writer (no AI)
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\s*\[(\d+|KB-\d+|[A-Z]+-\d+)\]/g, '').replace(/\s+([.,;:])/g, '$1').replace(/\s+/g, ' ').trim();

/** Markdown / outline text → slides ("## " starts a slide, "- " bullets). Used for research reports and pasted outlines. */
export function outlineToSlides(text: string): Slide[] {
  const slides: Slide[] = []; let cur: Slide | null = null; let skip = false;
  const push = () => { if (cur && (cur.title || cur.bullets?.length)) slides.push(cur); };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const t = raw.trim(); if (!t) continue;
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^#{2,3}\s+(.+)$/)) || (m = t.match(/^\*\*([^*]{3,80})\*\*$/))) { push(); const title = clean(m[1]).replace(/^\d+\.\s*/, ''); if (/^(sources?|references?)$/i.test(title)) { cur = null; skip = true; continue; } skip = false; cur = { id: sid(), layout: 'bullets', title, bullets: [] }; continue; }
    if (skip) continue;
    if (/^#\s/.test(t)) continue;
    if (/^(sources?|references?):?$/i.test(t)) { push(); cur = null; skip = true; continue; }
    if (!cur) cur = { id: sid(), layout: 'bullets', title: 'Overview', bullets: [] };
    const item = clean(t.replace(/^([-*•]|\d+[.)])\s+/, ''));
    if (!item || /^https?:\/\//.test(item)) continue;
    // long paragraphs → first sentence or two as bullets
    const parts = item.length > 220 ? item.split(/(?<=[.!?])\s+/).slice(0, 3) : [item];
    for (const p of parts) if (cur.bullets!.length < 6) cur.bullets!.push(p.length > 200 ? `${p.slice(0, 197)}…` : p);
    if (cur.bullets!.length >= 6) { push(); cur = { id: sid(), layout: 'bullets', title: `${cur.title} (cont.)`, bullets: [] }; }
  }
  push();
  return slides.filter(s => s.bullets?.length || s.layout !== 'bullets');
}

/** First deck with no AI: title, agenda, the user's points / research / project facts, next steps, contact. */
export function builtinDeck(o: { request: string; title?: string | null; project?: any; research?: string | null; business: string; contact?: { name?: string | null; title?: string | null; email?: string | null; phone?: string | null }; structure?: string[] }): Deck {
  const req = o.request.trim();
  const titleM = req.match(/\b(?:presentation|deck|slides|pitch)\s+(?:about|on|for)\s+([^,.\n]{3,80})/i) || req.match(/\b(?:about|on)\s+([^,.\n]{3,80})/i);
  const named = titleM ? titleM[1].replace(/\s+(covering|including|with|that|to show|showing|for (?:our|the) )\b.*$/i, '').trim() : '';
  const title = o.title || (o.project?.name && (!named || named.toLowerCase().includes(String(o.project.name).toLowerCase().split(' ')[0])) ? o.project.name : named ? cap(named) : o.project?.name || 'Presentation');
  const slides: Slide[] = [{ id: sid(), layout: 'title', title, subtitle: [o.business, new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })].join(' · ') }];
  const body: Slide[] = [];
  const p = o.project;
  if (p) {
    if (p.description) body.push({ id: sid(), layout: 'bullets', title: `About ${p.name}`, bullets: String(p.description).split(/(?<=[.!?])\s+|\n+/).map(clean).filter(Boolean).slice(0, 5) });
    const stats = [p.deal_value ? { value: `$${Number(p.deal_value) >= 1e6 ? `${(Number(p.deal_value) / 1e6).toFixed(Number(p.deal_value) % 1e6 ? 1 : 0)}m` : Number(p.deal_value).toLocaleString('en-AU')}`, label: 'Project value' } : null, p.location ? { value: String(p.location).split(',')[0], label: 'Location' } : null, p.project_type ? { value: cap(String(p.project_type)), label: 'Type' } : null, p.status ? { value: cap(String(p.status).replace(/_/g, ' ')), label: 'Stage' } : null].filter(Boolean) as { value: string; label: string }[];
    if (stats.length >= 2) body.push({ id: sid(), layout: 'stats', title: 'Key facts', stats: stats.slice(0, 4) });
    const hl = String(p.highlights || '').split(/\n|;|•/).map(clean).filter(Boolean);
    if (hl.length) body.push({ id: sid(), layout: 'bullets', title: 'Highlights', bullets: hl.slice(0, 6) });
  }
  if (o.research) body.push(...outlineToSlides(o.research).slice(0, 10));
  // The user's own points ("cover X, Y and Z", lines, bullets)
  const pointsText = /\b(cover|covering|include|including|with sections on)\b/i.test(req) ? req.replace(/^.*?\b(?:cover|covering|include|including|with sections on)\b\s*:?\s*/i, '') : req.replace(/^.*?\b(?:about|on)\b\s*:?\s*/i, '');
  const pts = (/\n/.test(req) ? req.split('\n').slice(1) : pointsText.split(/,|;|\band\b/)).map(x => clean(x.replace(/^[-*•\d.)\s]+/, ''))).filter(x => x.length > 2 && x.length < 120);
  if (!o.research && pts.length >= 2) for (const pt of pts.slice(0, 8)) body.push({ id: sid(), layout: 'bullets', title: cap(pt), bullets: ['[● key point]', '[● supporting detail]', '[● evidence or example]'] });
  // No project, research or points: follow how this business usually structures its decks (learned from its own decks)
  const house = (o.structure || []).filter(x => !/^(agenda|contact)$/i.test(x));
  if (!body.length && house.length >= 3) for (const sec of house.slice(0, 10)) body.push(/^next steps$/i.test(sec) ? { id: sid(), layout: 'bullets', title: sec, bullets: ['[● next step and date]', '[● who is responsible]', '[● decision needed]'] } : /^financials$/i.test(sec) ? { id: sid(), layout: 'stats', title: sec, stats: [{ value: '[●]', label: '[● key figure]' }, { value: '[●]', label: '[● key figure]' }, { value: '[●]', label: '[● key figure]' }] } : { id: sid(), layout: 'bullets', title: sec, bullets: ['[● key point]', '[● supporting detail]', '[● evidence or example]'] });
  if (body.length >= 3) slides.push({ id: sid(), layout: 'bullets', title: 'Agenda', bullets: body.map(s => s.title || '').filter(Boolean).filter((t, i, a) => a.indexOf(t) === i && !/\(cont\.\)$/.test(t)).slice(0, 7) });
  slides.push(...body);
  if (body.length === 0) slides.push({ id: sid(), layout: 'bullets', title: 'Overview', bullets: ['[● main message]', '[● why it matters]', '[● what we propose]'] });
  if (!body.some(x => /^next steps$/i.test(x.title || ''))) slides.push({ id: sid(), layout: 'bullets', title: 'Next steps', bullets: ['[● next step and date]', '[● who is responsible]', '[● decision needed]'] });
  const c = o.contact || {};
  slides.push({ id: sid(), layout: 'closing', title: 'Thank you', subtitle: [c.name, c.title, c.email, c.phone].filter(Boolean).join(' · ') || o.business });
  return { title, subtitle: o.business, slides };
}

/** Simple deck changes with no AI. Returns null when the request isn't understood. */
export function builtinDeckEdit(deck: Deck, request: string): { deck: Deck; reply: string } | null {
  const q = request.trim(); let m: RegExpMatchArray | null;
  const d: Deck = JSON.parse(JSON.stringify(deck)); const n = d.slides.length;
  const at = (x: string) => { const k = parseInt(x, 10) - 1; return k >= 0 && k < d.slides.length ? k : -1; };
  // photos: "add a photo of the hotel to slide 3", "remove the photo from slide 3", "add photos"
  if ((m = q.match(/^(?:remove|delete|take (?:out|off)|no)\s+(?:the\s+)?(?:photo|picture|image)s?\s+(?:from|on)\s+slide\s+(\d+)/i))) { const k = at(m[1]); if (k < 0) return { deck, reply: `There is no slide ${m[1]}.` }; d.slides[k].photo = 'none'; return { deck: d, reply: `Removed the photo from slide ${m[1]}.` }; }
  if ((m = q.match(/^(?:add|put|use|show|insert)\s+(?:a\s+|the\s+|another\s+)?(?:photo|picture|image)(?:\s+(?:of|showing|with)\s+(.+?))?\s+(?:on|to|in)(?:to)?\s+slide\s+(\d+)\.?$/i))) {
    const k = at(m[2]); if (k < 0) return { deck, reply: `There is no slide ${m[2]}.` }; const sl = d.slides[k];
    if (!photoFits({ ...sl, bullets: (sl.bullets || []).slice(0, 5) })) return { deck, reply: `Slide ${m[2]} is a ${sl.layout.replace('_', ' ')} slide — photos go on bullet and quote slides. Use "Photos & drawing" to place one anywhere.` };
    const used = new Set(d.slides.map(x => libId(x.photo)).filter(Boolean) as string[]); const cur = libId(sl.photo); if (cur) used.add(cur);
    const p = bestPhoto(m[1] || `${sl.title || ''} ${(sl.bullets || []).join(' ')}`, used) || bestPhoto('project overview aerial', used);
    if (!p) return { deck, reply: 'No matching photo in our library — use "Photos & drawing" to upload one.' };
    sl.photo = photoSrc(p.id); if ((sl.bullets?.length || 0) > 5) sl.bullets = sl.bullets!.slice(0, 5);
    return { deck: d, reply: `Slide ${m[2]} now has the "${p.label}" photo. Say "another photo on slide ${m[2]}" for a different one, or pick one in Edit this slide.` };
  }
  if (/^(?:add|put in|use)\s+(?:some\s+|more\s+)?(?:photos|pictures|images)\.?$/i.test(q)) { for (const sl of d.slides) if (sl.photo === 'none') delete sl.photo; const r = autoPhotos(d, 10); const c = r.slides.filter(x => x.photo && x.photo !== 'none').length; return { deck: r, reply: c ? `${c} slides now have photos from our library.` : 'None of the slides matched a photo in our library — pick one in Edit this slide.' }; }
  if ((m = q.match(/^(?:remove|delete|drop)\s+slide\s+(\d+)/i))) { const k = at(m[1]); if (k < 0) return { deck, reply: `There is no slide ${m[1]} (the deck has ${n}).` }; const [s] = d.slides.splice(k, 1); return { deck: d, reply: `Removed slide ${m[1]} ("${s.title || s.layout}").` }; }
  if ((m = q.match(/^move\s+slide\s+(\d+)\s+(?:to|before)\s+(?:slide\s+|position\s+)?(\d+)/i))) { const a = at(m[1]), b = Math.min(Math.max(parseInt(m[2], 10) - 1, 0), n - 1); if (a < 0) return { deck, reply: `There is no slide ${m[1]}.` }; const [s] = d.slides.splice(a, 1); d.slides.splice(b, 0, s); return { deck: d, reply: `Moved slide ${m[1]} to position ${b + 1}.` }; }
  if ((m = q.match(/^(?:rename|retitle|change the title of)\s+slide\s+(\d+)\s+(?:to\s+)?["“']?(.+?)["”']?\.?$/i))) { const k = at(m[1]); if (k < 0) return { deck, reply: `There is no slide ${m[1]}.` }; d.slides[k].title = cap(m[2]); return { deck: d, reply: `Slide ${m[1]} is now "${cap(m[2])}".` }; }
  if ((m = q.match(/^(?:change|set|rename)\s+(?:the\s+)?(?:deck|presentation)?\s*title\s+(?:to\s+)?["“']?(.+?)["”']?\.?$/i))) { d.title = cap(m[1]); if (d.slides[0]?.layout === 'title') d.slides[0].title = d.title; return { deck: d, reply: `Title changed to "${d.title}".` }; }
  if ((m = q.match(/^add\s+(?:a\s+)?(?:point|bullet|line)\s+(?:to\s+slide\s+(\d+)\s*)?(?:saying|that|:)?\s*(.+)$/i))) { const k = m[1] ? at(m[1]) : (() => { for (let i = d.slides.length - 1; i >= 0; i--) if (d.slides[i].layout === 'bullets') return i; return -1; })(); if (k < 0) return { deck, reply: 'Which slide? e.g. "add a point to slide 3: …"' }; d.slides[k].bullets = [...(d.slides[k].bullets || []), cap(m[2].trim())].slice(0, 8); if (!['bullets', 'two_column'].includes(d.slides[k].layout)) d.slides[k].layout = 'bullets'; return { deck: d, reply: `Added the point to slide ${k + 1}.` }; }
  if ((m = q.match(/^(?:make|turn)\s+slide\s+(\d+)\s+(?:into\s+)?(?:a\s+)?(bar|line|pie|doughnut)?\s*chart(?:\s+(?:of|with|showing))?\s*:?\s*(.+)$/i))) {
    const k = at(m[1]); if (k < 0) return { deck, reply: `There is no slide ${m[1]}.` };
    const pairs = m[3].split(/;|,(?!\d{3}\b)/).map(part => part.trim().match(/^(.+?)\s*(?:=|:|-|\s)\s*\$?(-?[\d][\d.,]*)\s*(?:m|k|%|b|bn)?\s*$/i)).filter(Boolean).map(x => ({ label: x![1].trim(), value: parseFloat(x![2].replace(/,/g, '')) })).filter(p => isFinite(p.value));
    if (pairs.length < 2) return { deck, reply: 'Give me the numbers, e.g. "make slide 4 a bar chart: 2024 = 12, 2025 = 18, 2026 = 25".' };
    d.slides[k] = { ...d.slides[k], layout: 'chart', chart: { type: (m[2] as any) || 'bar', labels: pairs.map(p => p.label), series: [{ name: d.slides[k].title || 'Value', values: pairs.map(p => p.value) }] } };
    return { deck: d, reply: `Slide ${k + 1} is now a ${m[2] || 'bar'} chart.` };
  }
  if ((m = q.match(/^add\s+(?:a\s+)?(?:new\s+)?slide\s+(?:about|on|for|called|titled)?\s*["“']?([^:"”]+?)["”']?(?:\s*(?:with|:)\s*(.+))?$/i))) {
    const title = cap(m[1].trim()); const bullets = m[2] ? m[2].split(/;|,(?!\d)|\band\b/).map(x => cap(x.trim())).filter(Boolean).slice(0, 7) : ['[● key point]', '[● supporting detail]'];
    const closeAt = d.slides.findIndex(s => s.layout === 'closing' || /^next steps$/i.test(s.title || ''));
    const s: Slide = { id: sid(), layout: 'bullets', title, bullets };
    if (closeAt > 0) d.slides.splice(closeAt, 0, s); else d.slides.push(s);
    return { deck: d, reply: `Added a slide "${title}" (slide ${d.slides.indexOf(s) + 1}).${m[2] ? '' : ' Tell me the points to put on it.'}` };
  }
  if ((m = q.match(/^(?:replace|change)\s+["“']?(.+?)["”']?\s+(?:with|to)\s+["“']?(.+?)["”']?\.?$/i))) {
    const json = JSON.stringify(d); const re = new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); const count = (json.match(re) || []).length;
    if (!count) return { deck, reply: `I couldn't find "${m[1]}".` };
    return { deck: JSON.parse(json.replace(re, m[2].replace(/"/g, '\\"'))), reply: `Changed "${m[1]}" to "${m[2]}" (${count} place${count === 1 ? '' : 's'}).` };
  }
  return null;
}

export const DECK_HELP = 'Without an AI writer I can: "add a slide about funding: point one; point two", "remove slide 4", "add a photo of the hotel to slide 3", "remove the photo from slide 3", "move slide 6 to 2", "rename slide 3 to Market", "add a point to slide 5: …", "make slide 4 a bar chart: 2024 = 12, 2025 = 18", "replace X with Y", "change the title to …". Connect an AI writer in Settings → AI for free-form changes and research.';

/** "use the Executive Navy template", "change the look to minimal", "switch theme to our colours" → that template. */
export function themeFromRequest(request: string, custom: { id: string; name: string }[] = []): { id: string; name: string } | null {
  const q = request.toLowerCase();
  if (!/\b(template|theme|look|style|design|colours?|colors?)\b/.test(q) || !/\b(use|switch|change|apply|make it|try|set)\b/.test(q)) return null;
  const all = [...custom, ...BUILTIN_THEMES.map(t => ({ id: t.id, name: t.name }))];
  const words = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'our', 'style', 'house'].includes(w));
  let best: { id: string; name: string } | null = null; let score = 0;
  for (const t of all) { const w = words(t.name); const n = w.filter(x => q.includes(x)).length; if (n > score || (n === score && n > 0 && w.length < words(best!.name).length)) { best = t; score = n; } }
  if (!best && /\bour (business |brand |own )?colou?rs\b/.test(q)) return { id: 'brand', name: 'Our colours' };
  return score > 0 ? best : null;
}
