/** App appearance: the admin's theme (bar colours, accent, buttons, background) and each person's light/dark mode. */
export type UiTheme = { preset?: string; sidebar?: string; sidebar_text?: string; accent?: string; primary?: string; background?: string; radius?: number; /** saved with 4.6 or later */ v?: number };
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
  try { localStorage.setItem('ip-theme-vars', JSON.stringify(vars)); } catch {}
}
export function applyMode(mode: string | null | undefined) {
  if (typeof document === 'undefined') return;
  const m = mode === 'dark' || (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', m);
  try { localStorage.setItem('ip-theme-mode', mode || 'light'); } catch {}
}
