import { NextRequest, NextResponse } from 'next/server';
import { route, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getLetterhead, pdfWithLetterhead } from '@/lib/letterhead';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

/** Preview any unsaved text on the business letterhead. Always marked DRAFT — final files come from approved items. */
export const POST = route(async (req: NextRequest) => {
  await getActor(req);
  const b = await body(req);
  const text = String(b.body || '');
  if (!text.trim()) throw new HttpError(400, 'Nothing to preview yet');
  if (text.length > 400_000) throw new HttpError(413, 'This document is too long to preview');
  const title = String(b.title || 'Document').slice(0, 200);
  const buf = await pdfWithLetterhead(title, text, await getLetterhead(), { watermark: 'DRAFT' });
  return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store', 'content-disposition': contentDisposition(`${title.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'Document'} (draft).pdf`, false) } });
});
