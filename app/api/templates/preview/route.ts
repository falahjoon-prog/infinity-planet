import { NextRequest, NextResponse } from 'next/server';
import { route, body } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getLetterhead, pdfWithLetterhead } from '@/lib/letterhead';
import { contentDisposition } from '@/lib/file-links';
import { getBrand, brandText } from '@/lib/brand';
export const runtime = 'nodejs';

/** A template shown as it will look when exported: business header (logo + name) and company footer, with sample placeholders. */
export const POST = route(async (req: NextRequest) => {
  await getActor(req);
  const b = await body(req);
  const brand = await getBrand();
  const text = brandText(String(b.body || ''), brand).replace(/\{\{clause:[a-z_]+\|([\s\S]*?)\}\}/g, '$1').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => `[${k.replace(/_/g, ' ')}]`);
  const buf = await pdfWithLetterhead(String(b.name || 'Template'), text, await getLetterhead(), { watermark: 'SAMPLE' });
  return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/pdf', 'content-disposition': contentDisposition('template-preview.pdf', false) } });
});
