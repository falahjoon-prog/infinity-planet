/** App appearance: the admin's theme (bar colours, accent, buttons, background) and each person's light/dark mode. */
export type UiTheme = { preset?: string; sidebar?: string; sidebar_text?: string; accent?: string; primary?: string; background?: string; radius?: number;
  /** 4.13: every other colour (light mode). Empty = automatic (picked to be readable on its background). */
  page_title?: string; page_note?: string; surface?: string; card_title?: string; text?: string; faint?: string; topbar?: string; topbar_text?: string; button_text?: string;
  /** saved with 4.6 or later */ v?: number };
/** The 4.13 colours: what each one changes (shown in Settings → Theme & colours). */
export const EXTRA_KEYS = ['page_title', 'page_note', 'surface', 'card_title', 'text', 'faint', 'topbar', 'topbar_text', 'button_text'] as const;
/** 4.6: the new Slate & Teal look is the default; a theme saved before 4.6 is replaced by it. */
export const THEME_VERSION = 46;
export const PRESETS: Record<string, { label: string; t: UiTheme }> = {
  slateteal: { label: 'Slate & Teal (default)', t: { sidebar: '#1e293b', sidebar_text: '#cbd5e1', accent: '#14b8a6', primary: '#0f766e', background: '#f3f5f7' } },
  light: { label: 'Light', t: { sidebar: '#ffffff', sidebar_text: '#46536a', accent: '#b8902f', primary: '#13294b', background: '#f6f7f9' } },
  navy: { label: 'Navy sidebar', t: { sidebar: '#0d1b2e', sidebar_text: '#a9b7cb', accent: '#c8a45c', primary: '#13294b', background: '#f4f6f9' } },
  charcoal: { label: 'Charcoal & copper', t: { sidebar: '#1f2327', sidebar_text: '#b7bcc2', accent: '#c27c4a', primary: '#2b3036', background: '#f5f5f4' } },
  emerald: { label: 'Emerald', t: { sidebar: '#0b2a24', sidebar_text: '#a7c4bb', accent: '#d4a72c', primary: '#0f5a49', background: '#f3f7f5' } },
  royal: { label: 'Royal blue', t: { sidebar: '#14215b', sidebar_text: '#aeb8e6', accent: '#f2b33d', primary: '#2340b0', background: '#f3f5fb' } },
  burgundy: { label: 'Burgundy', t: { sidebar: '#2b0f17', sidebar_text: '#d3b3bb', accent: '#c9a35b', primary: '#6d1a2c', background: '#f8f4f4' } },
  slate: { label: 'Light sidebar', t: { sidebar: '#eef1f5', sidebar_text: '#44526a', accent: '#2f6fd0', primary: '#1c3a63', background: '#ffffff' } },
};
const hex = (v: any) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null;
function shade(h: string, amt: number) { const n = parseInt(h.slice(1), 16); const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt)))); return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(x => x.toString(16).padStart(2, '0')).join('')}`; }
const lum = (h: string) => { const n = parseInt(h.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** WCAG contrast ratio between two #rrggbb colours (1 = invisible, 4.5+ = easy to read). */
export const contrast = (a: string, b: string) => { if (!hex(a) || !hex(b)) return 21; const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** A readable text colour for a background: dark or light, strong or soft. */
export const readableOn = (bg: string, soft = false) => {
  const dark = soft ? '#334155' : '#0f172a', lite = soft ? '#e2e8f0' : '#ffffff';
  const d = contrast(dark, bg), l = contrast(lite, bg);
  if (soft && Math.max(d, l) < 4.5) return d >= l ? '#0f172a' : '#ffffff'; // mid-grey backgrounds: use full black/white
  return d >= l ? dark : lite;
};
const light = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 160; };

export function applyTheme(t: UiTheme | null | undefined) {
  if (typeof document === 'undefined') return;
  const vars: Record<string, string> = {};
  const r = { setProperty: (k: string, v: string) => { vars[k] = v; document.documentElement.style.setProperty(k, v); } };
  if (!t || (t.v || 0) < THEME_VERSION) t = { preset: 'slateteal' };
  const base = PRESETS[t?.preset || 'slateteal']?.t || PRESETS.slateteal.t;
  const sidebar = hex(t?.sidebar) || base.sidebar!, side = hex(t?.sidebar_text) || base.sidebar_text!, accent = hex(t?.accent) || base.accent!, primary = hex(t?.primary) || base.primary!, bg = hex(t?.background) || base.background!;
  r.setProperty('--side-bg', sidebar); r.setProperty('--navy-900', shade(primary, -0.32)); r.setProperty('--navy-950', shade(primary, -0.55)); r.setProperty('--side-ink', side); r.setProperty('--side-ink-strong', light(sidebar) ? '#0d1b2e' : '#ffffff');
  r.setProperty('--side-hover', light(sidebar) ? 'rgba(16,32,51,.05)' : 'rgba(255,255,255,.06)'); r.setProperty('--side-line', light(sidebar) ? '#e6e9ee' : 'rgba(255,255,255,.07)'); r.setProperty('--side-muted', light(sidebar) ? '#8a95a7' : '#7f90a8');
  r.setProperty('--gold', accent); r.setProperty('--gold-soft', shade(accent, 0.82)); r.setProperty('--gold-ink', shade(accent, -0.45));
  r.setProperty('--navy-800', primary); r.setProperty('--navy-700', shade(primary, 0.15)); r.setProperty('--navy-600', shade(primary, 0.3));
  r.setProperty('--bg-light', bg);
  if (t?.radius) r.setProperty('--radius', `${Math.max(4, Math.min(18, t.radius))}px`);
  // 4.13 — everything else (light mode only; dark mode keeps its own colours). Unset = automatic and always readable.
  const surface = hex(t?.surface) || '#ffffff';
  const auto = (v: any, on: string, def: string, min: number, soft = false) => hex(v) || (contrast(def, on) >= min ? def : readableOn(on, soft));
  r.setProperty('--c-page-title', auto(t?.page_title, bg, '#0f172a', 4.5));
  r.setProperty('--c-page-note', auto(t?.page_note, bg, '#64748b', 4, true));
  const st = document.documentElement.style;
  if (hex(t?.surface)) { r.setProperty('--c-surface', surface); r.setProperty('--c-surface-2', shade(surface, -0.025)); r.setProperty('--c-line', shade(surface, -0.11)); r.setProperty('--c-line-2', shade(surface, -0.06)); }
  else ['--c-surface', '--c-surface-2', '--c-line', '--c-line-2'].forEach(k => st.removeProperty(k));
  document.documentElement.classList.toggle('c-surface', !!hex(t?.surface));
  const text = auto(t?.text, surface, '#0f172a', 4.5);
  r.setProperty('--c-text', text); r.setProperty('--c-text-2', auto(null, surface, '#475569', 4.5, true));
  if (hex(t?.text)) r.setProperty('--c-text-2', text);
  r.setProperty('--c-faint', auto(t?.faint, surface, '#64748b', 4, true)); r.setProperty('--c-faint-2', auto(t?.faint, surface, '#94a3b8', 2.5, true));
  r.setProperty('--c-card-title', auto(t?.card_title, surface, text, 4.5));
  const top = hex(t?.topbar); if (top) r.setProperty('--c-topbar', top); else st.removeProperty('--c-topbar'); document.documentElement.classList.toggle('c-topbar', !!top); document.documentElement.classList.toggle('c-topbar-ink', !!top || !!hex(t?.topbar_text)); r.setProperty('--c-topbar-text', auto(t?.topbar_text, top || surface, '#0f172a', 4.5));
  r.setProperty('--c-button-text', auto(t?.button_text, primary, '#ffffff', 4.5));
  vars.__cls = ['c-surface', 'c-topbar', 'c-topbar-ink'].filter(c => document.documentElement.classList.contains(c)).join(' '); // restored before the page paints (app/layout.tsx)
  try { localStorage.setItem('ip-theme-vars', JSON.stringify(vars)); } catch {}
}
export function applyMode(mode: string | null | undefined) {
  if (typeof document === 'undefined') return;
  const m = mode === 'dark' || (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', m);
  try { localStorage.setItem('ip-theme-mode', mode || 'light'); } catch {}
}

/* ---------- 4.13: each person's own colours ----------
 * The admin's theme is the company default. Anyone can override any colour for themselves only;
 * it is kept on this device and in their account (so it follows them), and never changes anyone else's screen. */
export const MY_THEME_KEY = 'ip-my-theme';
const normal = (t: UiTheme | null | undefined): UiTheme => (t && (t.v || 0) >= THEME_VERSION) ? t : { preset: 'slateteal', v: THEME_VERSION };
export function getMyTheme(): UiTheme | null { try { const v = JSON.parse(localStorage.getItem(MY_THEME_KEY) || 'null'); return v && typeof v === 'object' && Object.keys(v).length ? v : null; } catch { return null; } }
/** Company default with the person's own choices on top. */
export function effectiveTheme(company: UiTheme | null | undefined, mine: UiTheme | null = getMyTheme()): UiTheme {
  const c = normal(company); if (!mine) return c;
  const own = mine.preset && PRESETS[mine.preset] ? { ...PRESETS[mine.preset].t } : {};
  return { ...c, ...own, ...mine, v: THEME_VERSION };
}
/** Remembers the company theme and applies company + mine. Call again after either changes. */
export function applyEffective(company?: UiTheme | null) {
  if (typeof window === 'undefined') return;
  if (company !== undefined) (window as any).__ipCompanyTheme = company;
  else if (!('__ipCompanyTheme' in window)) return; // the company theme hasn't loaded yet — it applies both when it arrives
  applyTheme(effectiveTheme((window as any).__ipCompanyTheme));
}
export const companyTheme = (): UiTheme => normal(typeof window === 'undefined' ? null : (window as any).__ipCompanyTheme);
