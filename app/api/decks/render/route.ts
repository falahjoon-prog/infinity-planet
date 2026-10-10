import { NextRequest, NextResponse } from 'next/server';
import { route, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { normalizeDeck } from '@/lib/deck';
import { deckToPptx, deckToPdf } from '@/lib/deck-render';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

/** An unsaved deck as PowerPoint or PDF — always marked DRAFT (final files come from finalised decks). */
export const POST = route(async (req: NextRequest) => {
  await getActor(req);
  const b = await body(req);
  const deck = normalizeDeck(b.deck); if (!deck.slides.length) throw new HttpError(400, 'The presentation has no slides yet');
  const safe = deck.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'Presentation';
  if (b.format === 'pdf') return new NextResponse(new Uint8Array(await deckToPdf(deck, { draft: true })), { headers: { 'content-type': 'application/pdf', 'content-disposition': contentDisposition(`${safe} (draft).pdf`, b.download !== false) } });
  return new NextResponse(new Uint8Array(await deckToPptx(deck, { draft: true })), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'content-disposition': contentDisposition(`${safe} (draft).pptx`, true) } });
});
