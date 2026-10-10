'use client';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './api';

/**
 * Several accounts signed in on this device (e.g. a personal admin account and a work account).
 * Each account's session is remembered here so the person can switch with one click instead of signing out and in.
 * Sessions stay on this device only, like the normal sign-in.
 */
export type SavedAccount = { id: string; email: string; name?: string | null; label?: string | null; access_token: string; refresh_token: string; at: number };
const KEY = 'ip-accounts';
export function savedAccounts(): SavedAccount[] { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function store(list: SavedAccount[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 6))); } catch {} window.dispatchEvent(new Event('ip-accounts')); }

/** Remember (or refresh) the signed-in session. */
export function rememberSession(s: Session | null, extra: { name?: string | null; label?: string | null } = {}) {
  if (!s?.user?.id || !s.refresh_token) return;
  const list = savedAccounts(); const old = list.find(a => a.id === s.user.id);
  const next: SavedAccount = { id: s.user.id, email: s.user.email || old?.email || '', name: extra.name ?? old?.name ?? null, label: extra.label ?? old?.label ?? null, access_token: s.access_token, refresh_token: s.refresh_token, at: Date.now() };
  store([next, ...list.filter(a => a.id !== s.user.id)]);
}
export function forgetAccount(id: string) { store(savedAccounts().filter(a => a.id !== id)); }

/** Switch to another remembered account (no password needed). Returns false if that sign-in has expired. */
export async function switchAccount(id: string): Promise<boolean> {
  const sb = supabase();
  const { data: cur } = await sb.auth.getSession(); rememberSession(cur.session);
  const a = savedAccounts().find(x => x.id === id); if (!a) return false;
  const { data, error } = await sb.auth.setSession({ access_token: a.access_token, refresh_token: a.refresh_token });
  if (error || !data.session) { forgetAccount(id); return false; }
  rememberSession(data.session);
  try { sessionStorage.removeItem('ip-recovery'); } catch {}
  window.location.href = '/';
  return true;
}

/** The browser storage key the Supabase client keeps the current sign-in under (lib/client/api.ts). */
const AUTH_KEY = 'rhc-city-auth';
/**
 * Keep this account signed in and open the sign-in page for another one.
 * Important: never call signOut here — that ends the session on the server too, and the remembered account
 * could not be switched back to without a password. We only put the current sign-in aside on this computer.
 */
export async function addAnotherAccount() {
  const sb = supabase();
  const { data } = await sb.auth.getSession(); rememberSession(data.session);
  try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(`${AUTH_KEY}-code-verifier`); } catch {}
  window.location.href = '/login?add=1';
}

/** Sign out of the current account only; if another account is remembered, switch to it. */
export async function signOutCurrent(): Promise<void> {
  const sb = supabase();
  const { data } = await sb.auth.getSession(); const me = data.session?.user?.id;
  if (me) forgetAccount(me);
  await sb.auth.signOut({ scope: 'local' });
  const other = savedAccounts()[0];
  if (other && await switchAccount(other.id)) return;
  window.location.href = '/login';
}
/** Switch without signing anything out: the account being left stays signed in and remembered. */
export function canSwitch(): boolean { return savedAccounts().length > 1;
}
