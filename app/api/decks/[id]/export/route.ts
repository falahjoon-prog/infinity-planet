import { NextRequest, NextResponse } from 'next/server';
import { route, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { normalizeDeck } from '@/lib/deck';
import { deckToPptx, deckToPdf } from '@/lib/deck-render';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

/** A saved deck as PowerPoint or PDF. Marked DRAFT until it is approved (Finalise). */
export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const { data: a } = await getSupabaseAdmin().from('marketing_assets').select('*').eq('id', id).maybeSingle();
  if (!a || a.kind !== 'deck') throw new HttpError(404, 'Presentation not found');
  const approved = a.status === 'approved'; const format = req.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'pptx';
  const deck = normalizeDeck(a.design, a.title); const safe = String(a.title).replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'Presentation';
  await writeAudit({ actorId: actor.id, action: 'presentation.exported', entityType: 'marketing_asset', entityId: id, metadata: { format, approved } });
  const name = `${safe}${approved ? '' : ' (draft)'}.${format}`;
  if (format === 'pdf') return new NextResponse(new Uint8Array(await deckToPdf(deck, { draft: !approved })), { headers: { 'content-type': 'application/pdf', 'content-disposition': contentDisposition(name, req.nextUrl.searchParams.get('inline') !== '1') } });
  return new NextResponse(new Uint8Array(await deckToPptx(deck, { draft: !approved })), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-disposition': contentDisposition(name, true) } });
});
