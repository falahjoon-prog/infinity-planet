import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
/** Public readiness check (used by the desktop app to validate the server address). */
export async function GET() {
  let supabase = false;
  try { const { error } = await getSupabaseAdmin().from('profiles').select('id').limit(1); supabase = !error; } catch {}
  return NextResponse.json({ ok: supabase, app: 'Infinity Planet', version: '4.10.0', supabase }, { status: supabase ? 200 : 503 });
}
