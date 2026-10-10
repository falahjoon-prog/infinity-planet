/**
 * Presentation templates (themes). One theme drives the on-screen slides, the PowerPoint file and the PDF,
 * so all three look the same. Built-in themes below; the business can add its own by importing a
 * PowerPoint template (.pptx / .potx) or by learning from its decks in Google Drive (stored in app_settings 'deck_themes').
 * Fonts are ones that come with Windows and Office, so PowerPoint files look right on every team PC.
 */
export type CoverStyle = 'solid' | 'split' | 'band' | 'frame' | 'minimal' | 'image' | 'house';
export type HeadStyle = 'rule' | 'bar' | 'kicker' | 'band' | 'underline' | 'plain' | 'bands';
export type BulletStyle = 'square' | 'dot' | 'dash' | 'number' | 'check';
export type StatStyle = 'card' | 'big' | 'outline' | 'filled';
export type DecoStyle = 'none' | 'corner' | 'stripe' | 'circle' | 'grid';

/** Where text sits on a ready-made artwork slide (inches on the 13.333 × 7.5 slide). */
export type TextBox = { x: number; y: number; w: number; h: number; ink: string; sub?: string; num?: string; align?: 'left' | 'center' | 'right'; size?: number; valign?: 'top' | 'middle' | 'bottom' };
export type Spot = { x: number; y: number; h: number; light?: boolean; align?: 'left' | 'right'; box?: boolean; /** use the logo with the tagline ("Endless Possibilities") instead of the one with the descriptor */ tag?: boolean };
/** Ready-made artwork for a template (files in public/brand/deck/…). */
export type DeckArt = {
  cover?: string; coverText?: TextBox; coverMark?: Spot | null; coverLogo?: Spot | null; kicker?: string;
  section?: string; sectionText?: TextBox; sectionBg?: string; sectionDark?: boolean;
  closing?: string; closingText?: TextBox; closingMark?: Spot | null; closingLogo?: Spot | null; closingBg?: string;
  /** Number slides: background picture and the colours on it. */
  dark?: string; darkColors?: { bg: string; ink: string; muted: string; accent: string; line: string };
  /** Content slides: a wavy photo strip at the bottom, a picture band behind the title, a photo column on the right, or a paper background. */
  strip?: string; band?: string; bandInk?: string; side?: string; paper?: string;
  mark?: string; markLight?: string; markAspect?: number;
  /** The logo with the tagline (closing slides). */
  tagMark?: string; tagMarkLight?: string; tagAspect?: number;
};

export type DeckTheme = {
  id: string; name: string; category: string; description?: string;
  /** Use the business's own primary/accent colours (Settings → Business details) instead of the theme's. */
  brand?: boolean;
  colors: {
    bg: string; ink: string; muted: string; primary: string; accent: string; soft: string; line: string;
    cover: string; coverInk: string; coverMuted: string;
  };
  fonts: { head: string; body: string };
  cover: CoverStyle; heading: HeadStyle; bullet: BulletStyle; stats: StatStyle; deco: DecoStyle;
  /** Corner rounding of cards, 0–1 (0 = square). */
  round?: number;
  upper?: boolean;
  /** Custom themes: cover background picture (served by /api/decks/themes/<id>/image). */
  image?: string | null;
  /** House templates: ready-made artwork (files in public/brand/deck) — cover, section, dark (number slides), closing, a wavy photo strip, a paper background and the Infinity Planet logo. */
  art?: DeckArt | null;
  /** Topic templates: the slides a new presentation starts with (facts from our own decks; [●] = fill in). */
  outline?: { title: string; subtitle?: string; slides: any[] } | null;
  /** Custom themes: where it came from. */
  source?: { kind: 'pptx' | 'drive'; name: string; at: string } | null;
};

import { COLLECTION } from './deck-collection';

const T = (id: string, name: string, category: string, description: string, colors: DeckTheme['colors'], fonts: DeckTheme['fonts'], s: Pick<DeckTheme, 'cover' | 'heading' | 'bullet' | 'stats' | 'deco'> & Partial<DeckTheme>): DeckTheme => ({ id, name, category, description, colors, fonts, ...s });

export const BUILTIN_THEMES: DeckTheme[] = [
  T('infinity', 'Infinity Planet', 'Our decks', 'From our Infinity Planet presentation — cyan cover, navy section slides with the swoosh, wavy photo strip.',
    { bg: '#FFFFFF', ink: '#1F2937', muted: '#5B6B7A', primary: '#00324A', accent: '#00C2E0', soft: '#E6F8FC', line: '#D7E3EA', cover: '#00E4FD', coverInk: '#00324A', coverMuted: '#00324A' },
    { head: 'Segoe UI', body: 'Segoe UI' }, { cover: 'house', heading: 'plain', bullet: 'dot', stats: 'big', deco: 'none', round: 0.3,
      art: { cover: 'ip-cover.jpg', section: 'ip-section.jpg', dark: 'ip-dark.jpg', closing: 'ip-closing.jpg', strip: 'ip-strip.png', mark: 'ip-logo.png', markLight: 'ip-logo-light.png', markAspect: 1.26 } }),
  T('investor', 'Investor Plan', 'Our decks', 'From our Investment Plan — navy bands, red headings, light-blue panels; confidential investor packs.',
    { bg: '#FFFFFF', ink: '#1F2937', muted: '#5B6B7A', primary: '#00324A', accent: '#C00000', soft: '#CFE4F5', line: '#C5DCEF', cover: '#00E4FD', coverInk: '#00324A', coverMuted: '#C00000' },
    { head: 'Cambria', body: 'Calibri' }, { cover: 'house', heading: 'bands', bullet: 'square', stats: 'card', deco: 'none', round: 0.15,
      art: { cover: 'ip-cover.jpg', section: 'ip-section.jpg', closing: 'ip-closing.jpg', paper: 'ip-paper.jpg', mark: 'ip-logo.png', markLight: 'ip-logo-light.png', markAspect: 1.26, kicker: 'Investor planning · Confidential' } }),
  T('brand', 'Our colours', 'Business', 'Your logo and business colours — clean and corporate.',
    { bg: '#FFFFFF', ink: '#1F2937', muted: '#6B7280', primary: '#13294B', accent: '#C8A45C', soft: '#F3F5F8', line: '#E5E7EB', cover: '#13294B', coverInk: '#FFFFFF', coverMuted: '#D9C59A' },
    { head: 'Calibri', body: 'Calibri' }, { cover: 'solid', heading: 'rule', bullet: 'square', stats: 'card', deco: 'none', brand: true, round: 0.4 }),
  T('executive', 'Executive Navy', 'Corporate', 'Navy and gold, serif titles — board papers and investors.',
    { bg: '#FFFFFF', ink: '#1B2433', muted: '#667085', primary: '#0B1F3A', accent: '#B8892E', soft: '#F5F1E8', line: '#E4E0D6', cover: '#0B1F3A', coverInk: '#FFFFFF', coverMuted: '#D8C08C' },
    { head: 'Georgia', body: 'Calibri' }, { cover: 'split', heading: 'kicker', bullet: 'dash', stats: 'big', deco: 'none', round: 0 }),
  T('consulting', 'Consulting Blue', 'Corporate', 'Crisp blue strategy-firm style with takeaway titles.',
    { bg: '#FFFFFF', ink: '#1A1A1A', muted: '#5F6B7A', primary: '#002B5C', accent: '#0090D0', soft: '#EEF4FA', line: '#D7DEE7', cover: '#002B5C', coverInk: '#FFFFFF', coverMuted: '#9CC9EA' },
    { head: 'Arial', body: 'Arial' }, { cover: 'band', heading: 'underline', bullet: 'square', stats: 'big', deco: 'stripe', round: 0 }),
  T('property', 'Property Prospectus', 'Property', 'Warm stone and bronze — projects, sales and prospectuses.',
    { bg: '#FBF8F3', ink: '#2B2622', muted: '#7A6F64', primary: '#4A3A2C', accent: '#A9824C', soft: '#F1EAE0', line: '#E3D9CB', cover: '#2F2621', coverInk: '#FBF8F3', coverMuted: '#CDB590' },
    { head: 'Georgia', body: 'Century Gothic' }, { cover: 'band', heading: 'kicker', bullet: 'dash', stats: 'card', deco: 'none', round: 0.2 }),
  T('architect', 'Architect', 'Property', 'Graphite and safety orange with fine lines — development and design.',
    { bg: '#FFFFFF', ink: '#25292C', muted: '#6C7377', primary: '#2F3437', accent: '#D9480F', soft: '#F2F3F3', line: '#D5D8DA', cover: '#2F3437', coverInk: '#FFFFFF', coverMuted: '#F6A57D' },
    { head: 'Bahnschrift', body: 'Segoe UI' }, { cover: 'frame', heading: 'underline', bullet: 'square', stats: 'outline', deco: 'grid', round: 0, upper: true }),
  T('pitch', 'Investor Pitch', 'Pitch', 'Confident blue with a fresh green — raising capital and partners.',
    { bg: '#FFFFFF', ink: '#0F172A', muted: '#64748B', primary: '#1E3A8A', accent: '#10B981', soft: '#EEF2FF', line: '#E2E8F0', cover: '#1E3A8A', coverInk: '#FFFFFF', coverMuted: '#A7F3D0' },
    { head: 'Segoe UI', body: 'Segoe UI' }, { cover: 'split', heading: 'bar', bullet: 'check', stats: 'filled', deco: 'circle', round: 0.6 }),
  T('teal', 'Modern Teal', 'Modern', 'Teal and amber, rounded and friendly — updates and proposals.',
    { bg: '#FFFFFF', ink: '#111827', muted: '#6B7280', primary: '#0F766E', accent: '#F59E0B', soft: '#ECFDF5', line: '#E5E7EB', cover: '#0F766E', coverInk: '#FFFFFF', coverMuted: '#FDE68A' },
    { head: 'Segoe UI Semibold', body: 'Segoe UI' }, { cover: 'band', heading: 'rule', bullet: 'dot', stats: 'card', deco: 'corner', round: 0.8 }),
  T('minimal', 'Minimal White', 'Minimal', 'Lots of white space, one bold accent — modern and calm.',
    { bg: '#FFFFFF', ink: '#111111', muted: '#6E6E6E', primary: '#111111', accent: '#E4572E', soft: '#F4F4F4', line: '#E6E6E6', cover: '#FFFFFF', coverInk: '#111111', coverMuted: '#6E6E6E' },
    { head: 'Segoe UI Light', body: 'Segoe UI' }, { cover: 'minimal', heading: 'plain', bullet: 'dot', stats: 'big', deco: 'none', round: 0 }),
  T('editorial', 'Editorial Mono', 'Minimal', 'Black and white, serif headlines — like a magazine.',
    { bg: '#FFFFFF', ink: '#121212', muted: '#5C5C5C', primary: '#121212', accent: '#121212', soft: '#F2F2F0', line: '#121212', cover: '#121212', coverInk: '#FFFFFF', coverMuted: '#BDBDBD' },
    { head: 'Garamond', body: 'Georgia' }, { cover: 'minimal', heading: 'underline', bullet: 'number', stats: 'big', deco: 'none', round: 0 }),
  T('charcoal', 'Bold Charcoal', 'Bold', 'Dark slides with bright yellow — high impact on big screens.',
    { bg: '#1C1C1E', ink: '#F5F5F5', muted: '#A1A1AA', primary: '#FFFFFF', accent: '#F5B700', soft: '#2A2A2E', line: '#3A3A3F', cover: '#111113', coverInk: '#FFFFFF', coverMuted: '#F5B700' },
    { head: 'Segoe UI Black', body: 'Segoe UI' }, { cover: 'solid', heading: 'bar', bullet: 'square', stats: 'outline', deco: 'none', round: 0.3 }),
  T('midnight', 'Midnight Gold', 'Bold', 'Deep midnight with gold — luxury residential and premium launches.',
    { bg: '#0E1116', ink: '#F3EEE3', muted: '#A39C8E', primary: '#E7C873', accent: '#D4AF37', soft: '#171B22', line: '#2A2F38', cover: '#0E1116', coverInk: '#F3EEE3', coverMuted: '#D4AF37' },
    { head: 'Georgia', body: 'Segoe UI' }, { cover: 'frame', heading: 'kicker', bullet: 'dash', stats: 'outline', deco: 'none', round: 0 }),
  T('forest', 'Forest', 'Modern', 'Deep green and sand — land, sustainability and community.',
    { bg: '#FFFFFF', ink: '#1E2B24', muted: '#66756C', primary: '#1F4D3A', accent: '#C9A46A', soft: '#EEF3EF', line: '#DCE5DF', cover: '#1F4D3A', coverInk: '#FFFFFF', coverMuted: '#E3CFA6' },
    { head: 'Cambria', body: 'Calibri' }, { cover: 'split', heading: 'rule', bullet: 'dash', stats: 'card', deco: 'stripe', round: 0.3 }),
  T('coral', 'Coral & Violet', 'Bold', 'Violet with coral — marketing, launches and events.',
    { bg: '#FFFFFF', ink: '#1F1B2E', muted: '#6B6680', primary: '#3D2C8D', accent: '#FF6B6B', soft: '#F3F0FF', line: '#E6E1F5', cover: '#3D2C8D', coverInk: '#FFFFFF', coverMuted: '#FFC2C2' },
    { head: 'Trebuchet MS', body: 'Trebuchet MS' }, { cover: 'solid', heading: 'kicker', bullet: 'dot', stats: 'filled', deco: 'circle', round: 0.8 }),
  T('terracotta', 'Terracotta', 'Property', 'Terracotta and saffron on warm white — lifestyle and hospitality.',
    { bg: '#FFF8F1', ink: '#2E1F17', muted: '#7D6556', primary: '#9C3D1E', accent: '#E9A23B', soft: '#F8E9DB', line: '#EBD8C6', cover: '#9C3D1E', coverInk: '#FFF8F1', coverMuted: '#F6CF8E' },
    { head: 'Segoe UI Semibold', body: 'Segoe UI' }, { cover: 'split', heading: 'bar', bullet: 'dot', stats: 'card', deco: 'corner', round: 0.5 }),
];

BUILTIN_THEMES.splice(2, 0, ...COLLECTION);

export const DEFAULT_THEME = 'infinity';

const HEX = /^#[0-9a-f]{6}$/i;
const okHex = (v: any, d: string) => typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : d;
/** Mixes a colour with white (w > 0) or black (w < 0). */
export function shade(h: string, w: number): string {
  const n = parseInt(h.replace('#', ''), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(w >= 0 ? v + (255 - v) * w : v * (1 + w)));
  return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function luminance(h: string): number { const n = parseInt(h.replace('#', ''), 16); const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); }
export const isDark = (h: string) => luminance(h) < 0.25;

/** A theme ready to draw: brand colours applied when the theme follows the business. */
export function resolveTheme(id: string | null | undefined, custom: DeckTheme[] = [], brand?: { primary?: string | null; accent?: string | null; serif?: boolean }): DeckTheme {
  const base = custom.find(t => t.id === id) || BUILTIN_THEMES.find(t => t.id === id) || BUILTIN_THEMES[0];
  const t: DeckTheme = JSON.parse(JSON.stringify(base));
  if (t.brand && brand) {
    const p = okHex(brand.primary, t.colors.primary), a = okHex(brand.accent, t.colors.accent);
    t.colors.primary = p; t.colors.accent = a; t.colors.cover = p; t.colors.coverMuted = shade(a, 0.35);
    t.colors.soft = shade(p, 0.94); t.colors.line = shade(p, 0.85);
    if (brand.serif) t.fonts = { head: 'Georgia', body: 'Georgia' };
  }
  return t;
}

/** Cleans a theme from storage or an import. */
export function sanitizeTheme(x: any): DeckTheme | null {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(x.id)) return null;
  const d = BUILTIN_THEMES[0];
  const c = x.colors || {};
  const pick = <T extends string>(v: any, list: readonly T[], def: T): T => list.includes(v) ? v : def;
  const font = (v: any, def: string) => typeof v === 'string' && /^[\w .'-]{2,40}$/.test(v) ? v : def;
  return {
    id: x.id, name: String(x.name || 'Our template').slice(0, 60), category: String(x.category || 'Your templates').slice(0, 30), description: x.description ? String(x.description).slice(0, 160) : undefined,
    brand: !!x.brand,
    colors: Object.fromEntries(Object.entries(d.colors).map(([k, v]) => [k, okHex(c[k], v)])) as DeckTheme['colors'],
    fonts: { head: font(x.fonts?.head, 'Calibri'), body: font(x.fonts?.body, 'Calibri') },
    cover: pick(x.cover, ['solid', 'split', 'band', 'frame', 'minimal', 'image'] as const, 'solid'),
    heading: pick(x.heading, ['rule', 'bar', 'kicker', 'band', 'underline', 'plain'] as const, 'rule'),
    bullet: pick(x.bullet, ['square', 'dot', 'dash', 'number', 'check'] as const, 'square'),
    stats: pick(x.stats, ['card', 'big', 'outline', 'filled'] as const, 'card'),
    deco: pick(x.deco, ['none', 'corner', 'stripe', 'circle', 'grid'] as const, 'none'),
    round: Math.max(0, Math.min(1, Number(x.round) || 0)), upper: !!x.upper,
    image: typeof x.image === 'string' && /^deck-themes\/[\w.-]+$/.test(x.image) ? x.image : null,
    source: x.source && typeof x.source === 'object' ? { kind: x.source.kind === 'drive' ? 'drive' : 'pptx', name: String(x.source.name || '').slice(0, 120), at: String(x.source.at || '') } : null,
  };
}

/** Web font stacks for the on-screen preview (Windows has the Office fonts; phones fall back). */
export function cssFont(f: string): string {
  const serif = /georgia|garamond|cambria|times|palatino|book antiqua/i.test(f);
  const weight = /black/i.test(f) ? 900 : /semibold/i.test(f) ? 600 : /light/i.test(f) ? 300 : null;
  const family = f.replace(/\s+(Black|Semibold|Light)$/i, '');
  return `'${family}', ${serif ? "Georgia, 'Times New Roman', serif" : "'Segoe UI', Calibri, Arial, sans-serif"}${weight ? `;--fw:${weight}` : ''}`;
}
export const fontWeight = (f: string) => /black/i.test(f) ? 900 : /semibold/i.test(f) ? 600 : /light/i.test(f) ? 300 : 700;
export const fontFamily = (f: string) => f.replace(/\s+(Black|Semibold|Light)$/i, '');
