import { NextRequest } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { getActor, requireRole } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { letterheadArtInfo, saveLetterheadArt, removeLetterheadArt } from '@/lib/letterhead-art';
import { imageSize } from '@/lib/letterhead';
export const runtime = 'nodejs';

const MAX = 4 * 1024 * 1024;

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  return ok({ art: await letterheadArtInfo() });
});

/** Admin: save the top and bottom bands of the business's own letterhead (PNG images cut from one of its documents). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const fd = await req.formData().catch(() => null);
  if (!fd) throw new HttpError(400, 'Nothing was sent');
  const read = async (k: string) => {
    const f = fd.get(k);
    if (!f || typeof f === 'string') return null;
    if ((f as File).type !== 'image/png') throw new HttpError(400, 'The letterhead parts must be PNG images');
    if ((f as File).size > MAX) throw new HttpError(400, 'The letterhead image is too large');
    const b = Buffer.from(await (f as File).arrayBuffer());
    const sz = imageSize(b, 'image/png');
    if (!sz || sz.width < 200 || sz.height < 10) throw new HttpError(400, 'The letterhead image could not be read');
    return b;
  };
  const header = await read('header'); const footer = await read('footer');
  if (!header && !footer) throw new HttpError(400, 'Choose the top or bottom of the letterhead');
  const source = String(fd.get('source') || '').slice(0, 200) || null;
  await saveLetterheadArt({ header, footer, source }, actor.id);
  await writeAudit({ actorId: actor.id, action: 'settings.letterhead_updated', metadata: { source, header: !!header, footer: !!footer } });
  return ok({ art: await letterheadArtInfo() });
});

export const DELETE = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  await removeLetterheadArt(actor.id);
  await writeAudit({ actorId: actor.id, action: 'settings.letterhead_removed' });
  return ok({ art: null });
});
