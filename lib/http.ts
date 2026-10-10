import { NextRequest, NextResponse } from 'next/server';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

type Ctx = { params: Promise<Record<string, string>> };
/** Wraps a route handler with consistent error handling. */
export function route<C extends Ctx = Ctx>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try { return await fn(req, ctx); }
    catch (e: any) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      const message = e?.message || String(e) || 'Request failed';
      console.error('[Infinity API]', req.method, req.nextUrl.pathname, message);
      // A column/table from a newer version is missing → the database update has not been run yet
      if (/schema cache|does not exist/i.test(message) && /column|relation|table/i.test(message)) return fail(409, `The database needs updating for this feature: in Supabase → SQL Editor run the newest file in supabase/migrations (007_activity_hours_4_7.sql), then reload. (${message})`);
      return fail(500, message);
    }
  };
}

export async function body<T = any>(req: NextRequest): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

/** Keep only allowed keys; convert '' to null. */
export function pick(src: Record<string, any>, keys: string[]) {
  const out: Record<string, any> = {};
  for (const k of keys) if (k in src) out[k] = src[k] === '' ? null : src[k];
  return out;
}

export function must<T>(v: T | null | undefined, message: string, status = 400): T {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) throw new HttpError(status, message);
  return v;
}

export function dbCheck<T extends { error: any }>(r: T): T {
  if (r.error) throw new HttpError(500, r.error.message || 'Database error');
  return r;
}

export const nowIso = () => new Date().toISOString();

/** The address people use to reach this server (RHC_PUBLIC_URL, else the request's host — never 0.0.0.0). */
export function publicBase(req: { headers: Headers; nextUrl: { protocol: string; host: string } }) {
  if (process.env.RHC_PUBLIC_URL) return process.env.RHC_PUBLIC_URL.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'http';
  return /^0\.0\.0\.0/.test(host) ? 'http://localhost:3300' : `${proto}://${host}`;
}
