import { NextRequest, NextResponse } from 'next/server';
import { route, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { getLetterhead, docxWithLetterhead, pdfWithLetterhead } from '@/lib/letterhead';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

/** Export is only allowed once the document has been approved. */
export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const format = req.nextUrl.searchParams.get('format') || 'docx';
  const db = getSupabaseAdmin();
  const { data: d } = await db.from('generated_documents').select('*').eq('id', id).maybeSingle();
  if (!d) throw new HttpError(404, 'Document not found');
  // Preview (PDF with letterhead and a DRAFT watermark) is available before approval; final export needs approval.
  if (req.nextUrl.searchParams.get('preview') === '1') {
    const lh = await getLetterhead();
    const buf = await pdfWithLetterhead(d.title, d.body, lh, { watermark: ['approved', 'exported'].includes(d.status) ? undefined : 'DRAFT', final: ['approved', 'exported'].includes(d.status) });
    return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/pdf', 'content-disposition': contentDisposition(`${d.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'Document'} (preview).pdf`, false) } });
  }
  if (!['approved', 'exported'].includes(d.status)) throw new HttpError(409, 'This document must be approved before it can be exported. Request approval first.');
  const safe = d.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'Document';
  await db.from('generated_documents').update({ status: 'exported', updated_at: new Date().toISOString() }).eq('id', id);
  await writeAudit({ actorId: actor.id, action: 'generated_document.exported', entityType: 'generated_document', entityId: id, metadata: { format } });
  if (format === 'txt') return new NextResponse(d.body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': contentDisposition(`${safe}.txt`, true) } });
  const lh = await getLetterhead();
  if (format === 'pdf') {
    const buf = await pdfWithLetterhead(d.title, d.body, lh, { final: true });
    return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/pdf', 'content-disposition': contentDisposition(`${safe}.pdf`, true) } });
  }
  const buf = await docxWithLetterhead(d.title, d.body, lh, { final: true });
  return new NextResponse(new Uint8Array(buf), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': contentDisposition(`${safe}.docx`, true) } });
});
