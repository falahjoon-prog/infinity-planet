export const money = (v: any, compact = false) => {
  const n = Number(v); if (v === null || v === undefined || v === '' || !isFinite(n)) return '—';
  if (compact && Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (compact && Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
};
export const date = (v: any, withTime = false) => {
  if (!v) return '—'; const d = new Date(v); if (isNaN(+d)) return '—';
  return d.toLocaleString('en-AU', withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
};
export const time = (v: any) => v ? new Date(v).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : '';
export const ago = (v: any) => {
  if (!v) return ''; const s = (Date.now() - +new Date(v)) / 1000; const f = s < 0;
  const a = Math.abs(s);
  const t = a < 60 ? 'just now' : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : a < 86400 * 30 ? `${Math.round(a / 86400)}d` : date(v);
  if (t === 'just now' || t.includes(' ')) return t;
  return f ? `in ${t}` : `${t} ago`;
};
export const dueLabel = (v: any) => {
  if (!v) return null; const d = new Date(v); const days = Math.floor((+new Date(d.toDateString()) - +new Date(new Date().toDateString())) / 864e5);
  if (days < 0) return { text: `${-days}d overdue`, tone: 'red' }; if (days === 0) return { text: 'Due today', tone: 'amber' }; if (days === 1) return { text: 'Tomorrow', tone: 'amber' };
  if (days < 7) return { text: `In ${days} days`, tone: 'blue' }; return { text: date(v), tone: '' };
};
export const initials = (s?: string | null) => (s || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || '?';
export const label = (s?: string | null) => String(s ?? '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
export const toLocalInput = (v: any) => { if (!v) return ''; const d = new Date(v); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
export const bytes = (n: any) => { const x = Number(n); if (!x) return ''; return x > 1048576 ? `${(x / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(x / 1024))} KB`; };
const COLORS = ['#1c3a63', '#2f6fd0', '#6b4fb3', '#2f8a57', '#b7791f', '#c0392b', '#0f766e', '#7a5a1c'];
export const colorFor = (s?: string | null) => { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) | 0; return COLORS[Math.abs(h) % COLORS.length]; };
/** A person's display name: their real name, or a tidy name made from their email ("falah.joon@…" → "Falah Joon") — never the raw email. */
export const personName = (p?: { full_name?: string | null; email?: string | null } | null) => {
  const n = String(p?.full_name || '').trim();
  if (n && !n.includes('@')) return n;
  const src = n.includes('@') ? n : String(p?.email || '');
  const local = src.split('@')[0] || '';
  return local.split(/[._\-+0-9]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || src || 'Someone';
};
export const firstName = (p?: { full_name?: string | null; email?: string | null } | null) => personName(p).split(/\s+/)[0];
