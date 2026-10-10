import { NextRequest, NextResponse } from 'next/server';
import { route, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { getLetterhead, docxWithLetterhead, pdfWithLetterhead } from '@/lib/letterhead';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

/** A written marketing asset on the letterhead. ?preview=1 works any time (DRAFT mark until approved); downloads need approval. */
export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const sp = req.nextUrl.searchParams; const format = sp.get('format') === 'docx' ? 'docx' : 'pdf';
  const { data: a } = await getSupabaseAdmin().from('marketing_assets').select('*').eq('id', id).maybeSingle();
  if (!a || a.kind === 'design') throw new HttpError(404, 'Asset not found');
  const approved = a.status === 'approved';
  const safe = String(a.title || 'Document').replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'Document';
  const lh = await getLetterhead();
  if (sp.get('preview') === '1') {
    const buf = await pdfWithLetterhead(a.title, a.content, lh, { watermark: approved ? undefined : 'DRAFT', final: approved });
    return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store', 'content-disposition': contentDisposition(`${safe}${approved ? '' : ' (draft)'}.pdf`, false) } });
  }
  if (!approved) throw new HttpError(409, 'This asset must be approved before it can be downloaded. Request approval first.');
  await writeAudit({ actorId: actor.id, action: 'marketing_asset.exported', entityType: 'marketing_asset', entityId: id, metadata: { format } });
  if (format === 'pdf') return new NextResponse(new Uint8Array(await pdfWithLetterhead(a.title, a.content, lh, { final: true })), { headers: { 'content-type': 'application/pdf', 'content-disposition': contentDisposition(`${safe}.pdf`, true) } });
  return new NextResponse(new Uint8Array(await docxWithLetterhead(a.title, a.content, lh, { final: true })), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': contentDisposition(`${safe}.docx`, true) } });
});
