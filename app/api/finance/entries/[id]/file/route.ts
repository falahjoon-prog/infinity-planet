import { NextRequest, NextResponse } from 'next/server';
import { route, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { FIN_BUCKET } from '@/lib/finance';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

/** The invoice/receipt file attached to an entry (?inline=1 to view a PDF or picture). */
export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req); const { id } = await params; const db = getSupabaseAdmin();
  const { data: e } = await db.from('finance_entries').select('file_path,file_name,file_mime').eq('id', id).maybeSingle();
  if (!e?.file_path) throw new HttpError(404, 'No file attached');
  const { data, error } = await db.storage.from(FIN_BUCKET).download(e.file_path); if (error || !data) throw new HttpError(404, 'File not found');
  const mime = e.file_mime || 'application/octet-stream';
  const inline = req.nextUrl.searchParams.get('inline') === '1' && /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(mime);
  return new NextResponse(new Uint8Array(await data.arrayBuffer()), { headers: { 'content-type': inline ? mime : 'application/octet-stream', 'content-disposition': contentDisposition(e.file_name || 'invoice', !inline), 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=300' } });
});
