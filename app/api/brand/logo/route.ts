import { NextRequest, NextResponse } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { getLogo, saveLogo, removeLogo, LOGO_TYPES, LOGO_MAX } from '@/lib/brand-logo';
import { getBrand } from '@/lib/brand';
import { writeAudit } from '@/lib/audit';
export const dynamic = 'force-dynamic';

/** Public: the business logo image (shown on the sign-in page before anyone is signed in). */
export async function GET() {
  const l = await getLogo().catch(() => null);
  if (!l) return new NextResponse('No logo', { status: 404 });
  const headers: Record<string, string> = { 'content-type': l.mime, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' };
  if (l.mime === 'image/svg+xml') headers['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new NextResponse(new Uint8Array(l.bytes), { headers });
}

/** Admin: upload or replace the business logo (PNG, JPG, WebP, SVG or GIF, up to 3 MB). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const fd = await req.formData().catch(() => null);
  const f = fd?.get('file');
  if (!f || typeof f === 'string') throw new HttpError(400, 'Choose an image file');
  const mime = (f as File).type || '';
  if (!LOGO_TYPES[mime]) throw new HttpError(400, 'The logo must be a PNG, JPG, WebP, SVG or GIF image');
  if ((f as File).size > LOGO_MAX) throw new HttpError(400, 'The logo must be 3 MB or smaller');
  const bytes = Buffer.from(await (f as File).arrayBuffer());
  if (mime === 'image/svg+xml' && /<script|on\w+\s*=|javascript:/i.test(bytes.toString('utf8'))) throw new HttpError(400, 'This SVG contains scripts and cannot be used as a logo');
  await saveLogo(bytes, mime, actor.id);
  await writeAudit({ actorId: actor.id, action: 'settings.logo_updated', metadata: { mime, size: bytes.length } });
  return ok({ brand: await getBrand() });
});

export const DELETE = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  await removeLogo(actor.id);
  await writeAudit({ actorId: actor.id, action: 'settings.logo_removed' });
  return ok({ brand: await getBrand() });
});
