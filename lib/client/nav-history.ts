'use client';
/**
 * Back and forward that behave like a desktop app.
 *  - The app keeps a mirror of the browser history for this tab (sessionStorage): every page you visit is a step, and
 *    each browser history entry is stamped with its step number (history.state.__ipNav), so Back/Forward always know
 *    where they are — even after a reload. The ← → buttons in the top bar use it.
 *  - A window inside a page (a document, approval, email, task, note, asset, presentation) lives in the address
 *    (…?open=id) and is a step of its own, so Back first closes the window and only then leaves the section.
 *  - Closing (✕, Esc, a page's back button) goes back to where you came from — the same section and tab — instead of
 *    jumping to a fixed list.
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const KEY = 'ip-nav', EVT = 'ip-nav', IDX = '__ipNav';
const load = (): string[] => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; } };
const save = (s: string[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(s.slice(0, 300))); } catch {} };
const pathOf = (u: string) => u.split('?')[0];
const here = () => (typeof location === 'undefined' ? '' : location.pathname + location.search);
const outside = (u: string) => !u || /^\/(login|sign\/)/.test(u);
const changed = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT)); };
const urlOf = (u?: string | URL | null) => { if (u == null) return here(); try { const x = new URL(String(u), location.href); return x.pathname + x.search; } catch { return here(); } };
/** The step number of the browser entry we are on (null for an entry made before the app took over, e.g. the login page). */
const cur = (): number | null => { if (typeof history === 'undefined') return null; const st: any = history.state; return st && typeof st[IDX] === 'number' ? st[IDX] : null; };
const stamp = (data: any, i: number) => (data && typeof data === 'object' ? { ...data, [IDX]: i } : { [IDX]: i });

let installed = false, rawReplace: ((data: any, unused: string, url?: string | URL | null) => void) | null = null;
/** Called once by the app shell: follows every page change (links, buttons, Back/Forward). */
export function installNavHistory() {
  if (installed || typeof window === 'undefined') return; installed = true;
  const push = history.pushState.bind(history), replace = history.replaceState.bind(history); rawReplace = replace;
  history.pushState = function (data: any, unused: string, url?: string | URL | null) {
    const u = urlOf(url); const c = cur(); const s = load(); const i = c == null ? s.length : c + 1;
    s.length = Math.min(s.length, i); s[i] = u; save(s); push(stamp(data, i), unused, url); changed();
  };
  history.replaceState = function (data: any, unused: string, url?: string | URL | null) {
    const u = urlOf(url); const c = cur(); const s = load(); const i = c == null ? s.length : c;
    s[i] = u; save(s); replace(stamp(data, i), unused, url); changed();
  };
  window.addEventListener('popstate', changed);
  if (cur() == null) { const s = load(); const i = s.length; s[i] = here(); save(s); replace(stamp(history.state, i), '', location.href); } // first page of this tab
  changed();
}

/** Back / Forward state for the top bar: the step behind and the step ahead, if any. */
export function useNavSteps() {
  const [st, setSt] = useState({ back: null as string | null, fwd: null as string | null });
  useEffect(() => {
    const up = () => { const s = load(); const c = cur(); setSt({ back: c != null && c > 0 ? s[c - 1] : null, fwd: c != null && s[c + 1] ? s[c + 1] : null }); };
    up(); window.addEventListener(EVT, up); return () => window.removeEventListener(EVT, up);
  }, []);
  return st;
}

/** The page you came from: the latest step before this one that is a different page (and the number of steps back it is). */
export function cameFrom(samePage?: (url: string) => boolean): { url: string; steps: number } | null {
  const h = here(); const same = samePage || ((u: string) => pathOf(u) === pathOf(h));
  const s = load(); const c = cur(); if (c == null) return null;
  for (let i = c - 1; i >= 0; i--) { const u = s[i]; if (u === h || same(u) || outside(u)) continue; return { url: u, steps: c - i }; }
  return null;
}

type Nav = { push: (href: string) => void; back: () => void };
/** Leave the current page: back to where you came from, otherwise to the fallback list. */
export function leave(router: Nav, fallback: string, samePage?: (url: string) => boolean) {
  const from = cameFrom(samePage);
  if (from && from.steps === 1) { router.back(); return; } // the step right before: a real Back
  router.push(from?.url || fallback);
}

/** Move on from this page without keeping it in the way back (e.g. after saving a signed copy → show the copy; closing it returns to where you started). */
export function replaceWith(router: { replace: (href: string) => void }, href: string) { router.replace(href); }

/**
 * A window inside a page that lives in the address (…?open=id):
 *  open(id)  → shows it as a new step (switching to another item while one is open replaces the step, so Back doesn't walk through every item);
 *  set(id)   → shows it without adding a step (null closes);
 *  close()   → closes it the way Back would: back to the list in this page, or — if it was opened from another section — back there.
 */
export function useOpenWindow(param = 'open') {
  const router = useRouter(); const sp = useSearchParams(); const pathname = usePathname();
  const value = sp.get(param);
  const urlWith = (v: string | null) => { const q = new URLSearchParams(sp.toString()); if (v) q.set(param, v); else q.delete(param); const s = q.toString(); return pathname + (s ? `?${s}` : ''); };
  const close = () => {
    if (!value) return;
    const s = load(); const c = cur(); const prev = c != null && c > 0 ? s[c - 1] : null;
    if (prev && (prev === urlWith(null) || pathOf(prev) !== pathname)) { router.back(); return; } // the step before is this list, or the section it was opened from
    router.replace(urlWith(null), { scroll: false });
  };
  const open = (id: string) => { if (!id || id === value) return; if (value) router.replace(urlWith(id), { scroll: false }); else router.push(urlWith(id), { scroll: false }); };
  const set = (id: string | null) => { if (!id) close(); else router.replace(urlWith(id), { scroll: false }); };
  return { value, open, set, close };
}
