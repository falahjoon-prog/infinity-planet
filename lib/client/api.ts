'use client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

let client: SupabaseClient | null = null;
export function supabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the Infinity Planet server and rebuild.');
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rhc-city-auth' } });
  }
  return client;
}

export class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

async function token() {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token || null;
}

export async function apiFetch(url: string, init: RequestInit = {}) {
  const t = await token();
  const headers = new Headers(init.headers);
  if (t) headers.set('Authorization', `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let res: Response;
  try { res = await fetch(url, { ...init, headers }); }
  catch { throw new ApiError(0, 'Cannot reach the Infinity Planet server. Check your connection.'); }
  if (res.status === 401) { window.dispatchEvent(new CustomEvent('rhc:unauthorized')); }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error || (typeof data === 'string' && data.slice(0, 200)) || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => apiFetch(url).then(r => parse<T>(r)),
  post: <T = any>(url: string, body?: unknown) => apiFetch(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }).then(r => parse<T>(r)),
  patch: <T = any>(url: string, body?: unknown) => apiFetch(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }).then(r => parse<T>(r)).then(d => {
    // A task was just completed: ask how long it took (components/time-check.tsx)
    if (/^\/api\/tasks\/[0-9a-f-]{36}$/i.test(url) && (body as any)?.status === 'done') window.dispatchEvent(new CustomEvent('ip-time-check'));
    return d;
  }),
  del: <T = any>(url: string) => apiFetch(url, { method: 'DELETE' }).then(r => parse<T>(r)),
  text: (url: string) => apiFetch(url).then(async r => { if (!r.ok) { const j = await r.json().catch(() => ({})); throw new ApiError(r.status, j.error || `Request failed (${r.status})`); } return r.text(); }),
  blob: (url: string) => apiFetch(url).then(async r => { if (!r.ok) { const j = await r.json().catch(() => ({})); throw new ApiError(r.status, j.error || `Request failed (${r.status})`); } return { blob: await r.blob(), name: /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'download' }; }),
};

/** Data hook: GET a URL, with reload(). Pass null to skip. */
export function useApi<T = any>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const seq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!url) { setLoading(false); return; }
    const n = ++seq.current;
    if (!quiet) setLoading(true);
    try { const d = await api.get<T>(url); if (n === seq.current) { setData(d); setError(null); } }
    catch (e: any) { if (n === seq.current) setError(e.message); }
    finally { if (n === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: () => load(true), setData };
}

export function downloadBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
