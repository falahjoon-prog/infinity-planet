import { NextResponse } from 'next/server';
import { getBrand, getBrandStyle, APP_NAME, APP_TAGLINE, AI_NAME, SEARCH_NAME, APP_VERSION } from '@/lib/brand';
export const dynamic = 'force-dynamic';

/** Public: product + business identity for the sign-in page, sidebar and installed apps. Contains no private data. */
export async function GET() {
  let b; let st: any = {};
  try { b = await getBrand(); st = await getBrandStyle(); } catch { b = { business_name: 'RHC City', short_name: 'RHC', logo_url: null }; }
  return NextResponse.json({ app_name: APP_NAME, tagline: APP_TAGLINE, ai_name: AI_NAME, search_name: SEARCH_NAME, version: APP_VERSION, business_name: b.business_name, short_name: b.short_name, logo_url: b.logo_url, primary: st.primary || '#13294b', accent: st.accent || '#c8a45c', serif: st.font === 'serif' }, { headers: { 'cache-control': 'no-store' } });
}
