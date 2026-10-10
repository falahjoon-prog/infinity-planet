/**
 * The business's own presentation templates (imported from PowerPoint or learned from Google Drive)
 * and the "house deck" — how the business usually structures its presentations.
 * Stored in app_settings ('deck_themes', 'deck_house'); cover pictures in the documents bucket under deck-themes/.
 */
import JSZip from 'jszip';
import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';
import { DeckTheme, sanitizeTheme, resolveTheme, shade, isDark, luminance, BUILTIN_THEMES } from './deck-themes';

const BUCKET = 'rhc-documents';
export type HouseDeck = { structure: string[]; examples: { name: string; titles: string[] }[]; theme_id?: string | null; learned_at: string; from: string[] };

export async function customThemes(): Promise<DeckTheme[]> {
  const v = await getSetting<{ themes?: any[] }>('deck_themes').catch(() => null);
  return (v?.themes || []).map(sanitizeTheme).filter(Boolean) as DeckTheme[];
}
async function saveThemes(themes: DeckTheme[], actorId?: string | null) {
  const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: 'deck_themes', value: { themes: themes.slice(-30) }, updated_by: actorId || null, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export async function addTheme(t: DeckTheme, actorId?: string | null) { const all = (await customThemes()).filter(x => x.id !== t.id); all.push(t); await saveThemes(all, actorId); return t; }
export async function removeTheme(id: string, actorId?: string | null) {
  const all = await customThemes(); const t = all.find(x => x.id === id); if (!t) throw new Error('Template not found');
  if (t.image) await getSupabaseAdmin().storage.from(BUCKET).remove([t.image]).catch(() => null);
  await saveThemes(all.filter(x => x.id !== id), actorId);
}
export async function themeImage(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const t = (await customThemes()).find(x => x.id === id); if (!t?.image) return null;
  const { data } = await getSupabaseAdmin().storage.from(BUCKET).download(t.image); if (!data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  return { bytes, mime: /\.png$/i.test(t.image) ? 'image/png' : 'image/jpeg' };
}
/** The theme to draw a deck with, brand colours applied. */
export async function deckTheme(id: string | null | undefined): Promise<DeckTheme> {
  const [custom, house, { getBrandStyle }] = await Promise.all([customThemes().catch(() => []), houseDeck().catch(() => null), import('./brand')]);
  const style = await getBrandStyle().catch(() => ({} as any));
  return resolveTheme(id || house?.theme_id || null, custom, { primary: style.primary, accent: style.accent, serif: style.font === 'serif' });
}

export async function houseDeck(): Promise<HouseDeck | null> { const v = await getSetting<HouseDeck>('deck_house').catch(() => null); return v && Array.isArray(v.structure) ? v : null; }
export async function saveHouseDeck(h: HouseDeck, actorId?: string | null) { const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: 'deck_house', value: h, updated_by: actorId || null, updated_at: new Date().toISOString() }); if (error) throw new Error(error.message); }

// ------------------------------------------------------------------ reading a PowerPoint file
const attr = (xml: string, tag: string) => { const m = xml.match(new RegExp(`<a:${tag}>\\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")`)); return m ? `#${(m[1] || m[2]).toUpperCase()}` : null; };
const texts = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join(' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();

export type PptxReading = {
  colors: Record<string, string>; fonts: { major: string | null; minor: string | null };
  titles: string[]; slideCount: number; coverImage: { bytes: Buffer; ext: string } | null; coverDark: boolean | null;
};

/** Reads a .pptx/.potx: theme colours and fonts, slide titles in order, and the title slide's background picture. */
export async function readPptx(bytes: Buffer): Promise<PptxReading> {
  const zip = await JSZip.loadAsync(bytes);
  const themeFile = Object.keys(zip.files).filter(f => /^ppt\/theme\/theme\d+\.xml$/.test(f)).sort()[0];
  if (!themeFile) throw new Error('This does not look like a PowerPoint file (no theme inside).');
  const theme = await zip.file(themeFile)!.async('string');
  const colors: Record<string, string> = {};
  for (const k of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']) { const v = attr(theme, k); if (v) colors[k] = v; }
  const font = (kind: string) => theme.match(new RegExp(`<a:${kind}>[\\s\\S]*?<a:latin typeface="([^"]+)"`))?.[1] || null;
  const fonts = { major: font('majorFont'), minor: font('minorFont') };
  // slides in presentation order
  const pres = await zip.file('ppt/presentation.xml')?.async('string') || '';
  const presRels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string') || '';
  const relTarget = (rels: string, id: string) => rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))?.[1] || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${id}"`))?.[1] || null;
  let order = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map(m => relTarget(presRels, m[1])).filter(Boolean).map(t => `ppt/${String(t).replace(/^\/?ppt\//, '').replace(/^\.\.\//, '')}`);
  if (!order.length) order = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => parseInt(a.match(/\d+/g)!.pop()!) - parseInt(b.match(/\d+/g)!.pop()!));
  const titles: string[] = [];
  for (const f of order.slice(0, 80)) {
    const x = await zip.file(f)?.async('string'); if (!x) continue;
    const shapes = x.split('<p:sp>').slice(1);
    const titleShape = shapes.find(sp => /<p:ph[^>]*type="(title|ctrTitle)"/.test(sp));
    let t = titleShape ? texts(titleShape) : '';
    if (!t) { const first = shapes.map(texts).find(s => s.length > 2 && s.length < 90); t = first || ''; }
    titles.push(t.slice(0, 120));
  }
  // cover picture: title layout background, else master background, else the first slide's background
  let coverImage: PptxReading['coverImage'] = null;
  const bgImage = async (file: string) => {
    const x = await zip.file(file)?.async('string'); if (!x) return null;
    const bg = x.match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0] || ''; const id = bg.match(/r:embed="([^"]+)"/)?.[1]; if (!id) return null;
    const relsFile = file.replace(/([^/]+)$/, '_rels/$1.rels'); const rels = await zip.file(relsFile)?.async('string') || '';
    const target = relTarget(rels, id); if (!target) return null;
    const path = new URL(target, `http://x/${file}`).pathname.slice(1);
    const img = zip.file(path); if (!img || !/\.(png|jpe?g)$/i.test(path)) return null;
    return { bytes: Buffer.from(await img.async('uint8array')), ext: /\.png$/i.test(path) ? 'png' : 'jpg' };
  };
  const layouts = Object.keys(zip.files).filter(f => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f));
  for (const f of layouts) { const x = await zip.file(f)!.async('string'); if (/type="title"/.test(x.slice(0, 600))) { coverImage = await bgImage(f); if (coverImage) break; } }
  if (!coverImage && order[0]) coverImage = await bgImage(order[0]);
  if (!coverImage) { const m = Object.keys(zip.files).find(f => /^ppt\/slideMasters\/slideMaster1\.xml$/.test(f)); if (m) coverImage = await bgImage(m); }
  if (coverImage && coverImage.bytes.length > 4 * 1024 * 1024) coverImage = null;
  return { colors, fonts, titles, slideCount: order.length, coverImage, coverDark: null };
}

const sat = (h: string) => { const n = parseInt(h.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const SAFE_FONTS = /^(Calibri|Calibri Light|Cambria|Candara|Consolas|Constantia|Corbel|Segoe UI( \w+)?|Arial( \w+)?|Georgia|Garamond|Times New Roman|Trebuchet MS|Verdana|Tahoma|Century Gothic|Gill Sans MT|Franklin Gothic( \w+)?|Palatino Linotype|Book Antiqua|Bahnschrift|Aptos( \w+)?|Lato|Montserrat|Open Sans|Roboto|Helvetica( \w+)?)$/i;

/** Turns what was read from a PowerPoint into a template. */
export function themeFromPptx(r: PptxReading, name: string, kind: 'pptx' | 'drive' = 'pptx'): DeckTheme {
  const c = r.colors;
  const accents = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(k => c[k]).filter(Boolean) as string[];
  const dk2 = c.dk2 && sat(c.dk2) > 0.15 && luminance(c.dk2) < 0.2 ? c.dk2 : null;
  const primary = dk2 || accents.filter(a => luminance(a) < 0.3).sort((a, b) => sat(b) - sat(a))[0] || accents[0] || '#13294B';
  const accent = accents.filter(a => a !== primary).sort((a, b) => (sat(b) + luminance(b) / 2) - (sat(a) + luminance(a) / 2))[0] || shade(primary, 0.4);
  const bg = c.lt1 && luminance(c.lt1) > 0.8 ? c.lt1 : '#FFFFFF';
  const ink = c.dk1 && luminance(c.dk1) < 0.15 ? c.dk1 : '#1F2937';
  const head = r.fonts.major && SAFE_FONTS.test(r.fonts.major) ? r.fonts.major : r.fonts.major ? 'Calibri' : 'Calibri';
  const body = r.fonts.minor && SAFE_FONTS.test(r.fonts.minor) ? r.fonts.minor : 'Calibri';
  const serif = /georgia|garamond|cambria|times|palatino|book antiqua|constantia/i.test(head);
  const id = `${kind}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id, name: name.replace(/\.(pptx|potx|pptm)$/i, '').slice(0, 60) || 'Our template', category: 'Your templates',
    description: `Colours and fonts from “${name.slice(0, 80)}”.${r.fonts.major && head !== r.fonts.major ? ` (${r.fonts.major} isn't on every PC, so ${head} is used.)` : ''}`,
    colors: { bg, ink, muted: shade(ink, 0.45), primary, accent, soft: shade(primary, 0.94), line: shade(primary, 0.85), cover: primary, coverInk: '#FFFFFF', coverMuted: shade(accent, 0.35) },
    fonts: { head, body }, cover: r.coverImage ? 'image' : 'split', heading: serif ? 'kicker' : 'rule', bullet: 'square', stats: 'card', deco: 'none', round: 0.3,
    image: null, source: { kind, name: name.slice(0, 120), at: new Date().toISOString() },
  };
}

/** Saves a template read from a PowerPoint, with its cover picture. */
export async function importPptxTheme(bytes: Buffer, name: string, actorId?: string | null, kind: 'pptx' | 'drive' = 'pptx') {
  const r = await readPptx(bytes);
  const t = themeFromPptx(r, name, kind);
  if (r.coverImage) {
    let img = r.coverImage;
    try { const sharp = (await import('sharp')).default; const out = await sharp(img.bytes).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); img = { bytes: out, ext: 'jpg' }; const st = await sharp(out).resize(16, 9).raw().toBuffer(); let sum = 0; for (let i = 0; i < st.length; i += 3) sum += 0.2126 * st[i] + 0.7152 * st[i + 1] + 0.0722 * st[i + 2]; const dark = sum / (st.length / 3) < 140; if (!dark) { t.colors.coverInk = t.colors.ink; t.colors.coverMuted = t.colors.muted; } } catch { /* keep original */ }
    const path = `deck-themes/${t.id}.${img.ext}`;
    const up = await getSupabaseAdmin().storage.from(BUCKET).upload(path, img.bytes, { contentType: img.ext === 'png' ? 'image/png' : 'image/jpeg', upsert: true });
    if (!up.error) t.image = path; else t.cover = 'split';
  }
  if (isDark(t.colors.bg)) { t.colors.ink = '#F5F5F5'; t.colors.muted = '#B5B5B5'; t.colors.soft = shade(t.colors.bg, 0.08); }
  await addTheme(t, actorId);
  return { theme: t, reading: r };
}

// ------------------------------------------------------------------ house structure from real decks
const GENERIC = /^(title|untitled|click to (add|edit) title|slide \d+|\d+|thank you|thanks|questions\??|q ?& ?a)$/i;
const BUCKETS: [RegExp, string][] = [
  [/\b(agenda|contents|overview|outline)\b/i, 'Agenda'],
  [/\b(executive summary|summary|at a glance|snapshot)\b/i, 'Executive summary'],
  [/\b(about (us|rhc|the company)|who we are|our (company|story|team)|company profile|introduction)\b/i, 'About us'],
  [/\b(opportunit|why now|the problem|challenge|context|background|market)\b/i, 'The opportunity'],
  [/\b(site|location|precinct|map|land|property details?|the project|project overview)\b/i, 'The site / project'],
  [/\b(design|masterplan|concept|architecture|render|floor ?plan|product)\b/i, 'Design & concept'],
  [/\b(financ|feasibility|returns?|irr|budget|cost|revenue|numbers|valuation|capital|funding)\b/i, 'Financials'],
  [/\b(timeline|programme|program|schedule|milestones|roadmap|stages?)\b/i, 'Timeline'],
  [/\b(team|people|partners|consultants|track record|experience|case stud)\b/i, 'Team & track record'],
  [/\b(risk|mitigation|due diligence)\b/i, 'Risks'],
  [/\b(proposal|offer|structure|terms|deal|investment)\b/i, 'The proposal'],
  [/\b(next steps?|call to action|way forward|recommendation|decision)\b/i, 'Next steps'],
  [/\b(contact|get in touch)\b/i, 'Contact'],
];
/** From real decks' slide titles: the usual order of sections. */
export function structureFrom(decks: { name: string; titles: string[] }[]): string[] {
  const score: Record<string, { n: number; pos: number }> = {};
  for (const d of decks) {
    const seen = new Set<string>(); const len = Math.max(1, d.titles.length);
    d.titles.forEach((t, i) => { if (!t || GENERIC.test(t.trim())) return; const b = BUCKETS.find(([re]) => re.test(t))?.[1]; if (!b || seen.has(b)) return; seen.add(b); score[b] = score[b] || { n: 0, pos: 0 }; score[b].n++; score[b].pos += i / len; });
  }
  const min = decks.length >= 3 ? 2 : 1;
  return Object.entries(score).filter(([, v]) => v.n >= min).sort((a, b) => a[1].pos / a[1].n - b[1].pos / b[1].n).map(([k]) => k);
}
export { BUILTIN_THEMES };
