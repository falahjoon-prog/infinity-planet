import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';
export const dynamic = 'force-dynamic';

/** Public: whether the sign-in page offers "Request access", and for which email domains. */
export async function GET() {
  const s = await getSetting<any>('signup').catch(() => null);
  return NextResponse.json({ enabled: !!(s?.enabled && s?.domains?.length), domains: s?.enabled ? s.domains || [] : [] });
}
