'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/client/api';
import { applyMode } from '@/lib/client/theme';

export const SIZES = [{ v: 'auto', l: 'Fit to window' }, { v: '0.9', l: 'Compact' }, { v: '1', l: 'Normal' }, { v: '1.1', l: 'Large' }];
export const TEXT_SIZES = [{ v: '0.9', l: 'Small' }, { v: '1', l: 'Normal' }, { v: '1.1', l: 'Large' }, { v: '1.25', l: 'Extra large' }];
const get = (k: string, d: string) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const ACCOUNT_KEY: Record<string, string> = { 'ip-ui-scale': 'ui_scale', 'ip-text-size': 'text_size', 'ip-theme-mode': 'theme_mode' };
/** Saves the choice on this computer AND in the person's account, so it follows them to every device. */
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} (window as any).__applyUiScale?.(); supabase().auth.updateUser({ data: { [ACCOUNT_KEY[k]]: v } }).catch(() => {}); };
/** On sign-in: bring this person's saved display choices to this device. */
export async function syncDisplayFromAccount() {
  try {
    const { data } = await supabase().auth.getUser(); const m: any = data.user?.user_metadata || {};
    if (m.ui_scale) localStorage.setItem('ip-ui-scale', m.ui_scale);
    if (m.text_size) localStorage.setItem('ip-text-size', m.text_size);
    if (m.theme_mode) { localStorage.setItem('ip-theme-mode', m.theme_mode); applyMode(m.theme_mode); }
    (window as any).__applyUiScale?.();
  } catch {}
}
export const setUiScale = (v: string) => set('ip-ui-scale', v);
export const getUiScale = () => get('ip-ui-scale', 'auto');

/** Screen size (whole layout), text size (fonts only) and light/dark mode — each person chooses their own; saved to their account. */
export function DisplaySize({ compact }: { compact?: boolean }) {
  const [v, setV] = useState('auto'); const [t, setT] = useState('1'); const [m, setM] = useState('light');
  useEffect(() => { setV(get('ip-ui-scale', 'auto')); setT(get('ip-text-size', '1')); setM(get('ip-theme-mode', 'light')); }, []);
  const row = (opts: { v: string; l: string }[], cur: string, on: (x: string) => void) => <div className="pick-chips">{opts.map(s => <button key={s.v} type="button" className={cur === s.v ? 'on' : ''} onClick={e => { e.stopPropagation(); on(s.v); }}>{compact ? s.l.replace('Fit to window', 'Fit').replace('Extra large', 'XL') : s.l}</button>)}</div>;
  return <div className="stack" style={{ gap: 8 }}>
    <div><div className="tiny muted" style={{ marginBottom: 4 }}>Screen size</div>{row(SIZES, v, x => { setV(x); set('ip-ui-scale', x); })}</div>
    <div><div className="tiny muted" style={{ marginBottom: 4 }}>Text size</div>{row(TEXT_SIZES, t, x => { setT(x); set('ip-text-size', x); })}</div>
    <div><div className="tiny muted" style={{ marginBottom: 4 }}>Mode</div>{row([{ v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }, { v: 'system', l: compact ? 'Auto' : 'Same as Windows' }], m, x => { setM(x); applyMode(x); set('ip-theme-mode', x); })}{!compact && m === 'system' && <div className="tiny muted" style={{ marginTop: 6 }}>Windows is set to {typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'} right now, so the app is {typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'} too. It follows Windows when you change it.</div>}</div>
  </div>;
}
