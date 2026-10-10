import { NextRequest, NextResponse } from 'next/server';
import { route, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { themeImage } from '@/lib/deck-theme-store';
export const runtime = 'nodejs';

/** A template's cover picture. */
export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await getActor(req);
  const { id } = await ctx.params;
  const img = await themeImage(id); if (!img) throw new HttpError(404, 'No picture');
  return new NextResponse(new Uint8Array(img.bytes), { headers: { 'content-type': img.mime, 'cache-control': 'private, max-age=3600' } });
});
