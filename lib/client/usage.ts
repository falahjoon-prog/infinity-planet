'use client';
import { useEffect } from 'react';
import { api } from './api';
import { pageArea } from '@/lib/access';

/**
 * Counts the minutes a person actually uses the app — not just being signed in.
 * A minute counts when the window is in front AND they typed, clicked, scrolled or moved the mouse in the last 2 minutes.
 * Minutes are queued on this device (so nothing is lost if the connection drops) and sent every 2 minutes.
 */
const QUEUE = 'ip-usage-queue';
const IDLE_MS = 120_000;
type Q = { m: string; a?: string };
const read = (): Q[] => { try { return JSON.parse(localStorage.getItem(QUEUE) || '[]'); } catch { return []; } };
const write = (q: Q[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-1500))); } catch {} };

export function useUsageTracker() {
  useEffect(() => {
    let last = Date.now(); let sending = false;
    const touch = () => { last = Date.now(); };
    let moveAt = 0; const move = () => { const n = Date.now(); if (n - moveAt > 5000) { moveAt = n; last = n; } };
    const evs: [string, any][] = [['keydown', touch], ['pointerdown', touch], ['wheel', touch], ['touchstart', touch], ['scroll', touch], ['pointermove', move]];
    for (const [e, f] of evs) window.addEventListener(e, f, { passive: true, capture: true });
    const active = () => document.visibilityState === 'visible' && (document.hasFocus() || !!(window as any).rhcDesktop) && Date.now() - last < IDLE_MS;
    const mark = () => {
      if (!active()) return;
      const m = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
      const q = read(); if (q.some(x => x.m === m)) return;
      q.push({ m, a: pageArea(location.pathname, location.search) || (location.pathname === '/' ? 'today' : location.pathname.split('/')[1] || 'other') }); write(q);
    };
    const flush = async () => {
      if (sending) return; const q = read(); if (!q.length) return;
      sending = true;
      try { const batch = q.slice(0, 300); await api.post('/api/activity/usage', { minutes: batch }); const sent = new Set(batch.map(x => x.m)); write(read().filter(x => !sent.has(x.m))); }
      catch (e: any) { if (e?.status === 409) write([]); /* database not updated yet: don't pile up */ }
      finally { sending = false; }
    };
    mark();
    const t1 = setInterval(mark, 20_000); // several checks a minute so a short burst of work still counts
    const t2 = setInterval(flush, 120_000);
    const hide = () => { if (document.visibilityState === 'hidden') { mark(); flush(); } else touch(); };
    document.addEventListener('visibilitychange', hide);
    const first = setTimeout(flush, 15_000);
    return () => { clearInterval(t1); clearInterval(t2); clearTimeout(first); document.removeEventListener('visibilitychange', hide); for (const [e, f] of evs) window.removeEventListener(e, f, { capture: true } as any); };
  }, []);
}
