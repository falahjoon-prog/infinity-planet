import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Endpoints that must work without a session (liveness checks and the Google OAuth redirect target).
const PUBLIC = new Set(['/api/health', '/api/system/health', '/api/google/callback', '/api/auth/request-access', '/api/auth/signup-config']);
// Read-only public endpoints: business name/logo for the sign-in page, and time-limited signed file links.
const PUBLIC_GET = new Set(['/api/brand', '/api/brand/logo']);
const PUBLIC_GET_PREFIX = ['/api/files/'];
// Client e-signing links (the token in the URL is the credential; it is hashed in the database and expires).
const PUBLIC_PREFIX = ['/api/sign/'];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Never trust a client-supplied actor header.
  const h = new Headers(req.headers);
  h.delete('x-rhc-actor-id');
  if (PUBLIC.has(path) || PUBLIC_PREFIX.some(p => path.startsWith(p))) return NextResponse.next({ request: { headers: h } });
  if (req.method === 'GET' && (PUBLIC_GET.has(path) || PUBLIC_GET_PREFIX.some(p => path.startsWith(p)))) return NextResponse.next({ request: { headers: h } });
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Supabase authentication is not configured on the Infinity Planet server' }, { status: 503 });
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: 'Your session has expired — please sign in again' }, { status: 401 });
  h.set('x-rhc-actor-id', data.user.id);
  return NextResponse.next({ request: { headers: h } });
}
export const config = { matcher: ['/api/:path*'] };
