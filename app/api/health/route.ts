import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
/** Public liveness check — reveals nothing about configuration. */
export async function GET() { return NextResponse.json({ ok: true, app: 'Infinity Planet', version: '4.12.2', timestamp: new Date().toISOString() }); }
