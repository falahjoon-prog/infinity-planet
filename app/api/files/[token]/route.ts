import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { verifyFileLink, contentDisposition } from '@/lib/file-links';
import { getSupabaseAdmin } from '@/lib/supabase';
import { BUCKET } from '@/lib/documents';
import { googleClient } from '@/lib/google';
export const dynamic = 'force-dynamic';

const GOOGLE_EXPORT: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.drawing': { mime: 'image/png', ext: '.png' },
};
// Types a browser may show inline. Everything else downloads (prevents HTML/SVG running on this site).
const INLINE = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|text\/plain|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg|webm))$/;

/** Serves a file from a time-limited signed link (team-chat attachments, Google Drive previews). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = verifyFileLink(token);
  if (!link) return NextResponse.json({ error: 'This file link has expired. Reload the page to get a new one.' }, { status: 403 });
  try {
    let bytes: Buffer; let mime = link.m || 'application/octet-stream'; let name = link.n || 'file';
    if (link.k === 'dthumb') {
      // Google Drive thumbnail (first page of PDFs/Docs, images, videos) fetched with the server's Google access.
      const { auth } = await googleClient();
      const drive = google.drive({ version: 'v3', auth });
      const meta = (await drive.files.get({ fileId: link.p, fields: 'thumbnailLink', supportsAllDrives: true })).data;
      if (!meta.thumbnailLink) return new NextResponse(null, { status: 404 });
      const tok = await auth.getAccessToken();
      const r = await fetch(meta.thumbnailLink.replace(/=s\d+$/, '=s480'), { headers: tok.token ? { Authorization: `Bearer ${tok.token}` } : {} });
      if (!r.ok) return new NextResponse(null, { status: 404 });
      const ct = r.headers.get('content-type') || 'image/png';
      return new NextResponse(new Uint8Array(await r.arrayBuffer()), { headers: { 'content-type': /^image\//.test(ct) ? ct : 'image/png', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
    }
    if (link.k === 'storage') {
      const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(link.p);
      if (error || !data) return NextResponse.json({ error: 'File not found' }, { status: 404 });
      bytes = Buffer.from(await data.arrayBuffer()); mime = link.m || data.type || mime;
    } else {
      const { auth } = await googleClient();
      const drive = google.drive({ version: 'v3', auth });
      const meta = (await drive.files.get({ fileId: link.p, fields: 'name,mimeType,size', supportsAllDrives: true })).data;
      name = meta.name || name; mime = meta.mimeType || mime;
      const exp = GOOGLE_EXPORT[mime];
      if (exp) {
        const r = await drive.files.export({ fileId: link.p, mimeType: exp.mime }, { responseType: 'arraybuffer' });
        bytes = Buffer.from(r.data as ArrayBuffer); mime = exp.mime; if (!name.toLowerCase().endsWith(exp.ext)) name += exp.ext;
      } else if (mime.startsWith('application/vnd.google-apps')) {
        return NextResponse.json({ error: 'This Google item cannot be previewed here — open it in Google Drive.' }, { status: 415 });
      } else {
        if (meta.size && Number(meta.size) > 100 * 1024 * 1024) return NextResponse.json({ error: 'File is larger than 100 MB — open it in Google Drive.' }, { status: 413 });
        const r = await drive.files.get({ fileId: link.p, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
        bytes = Buffer.from(r.data as ArrayBuffer);
      }
    }
    const inline = !link.dl && INLINE.test(mime);
    return new NextResponse(new Uint8Array(bytes), { headers: {
      'content-type': inline ? mime : (mime.startsWith('text/html') || mime.includes('svg') || mime.includes('xml') ? 'application/octet-stream' : mime),
      'content-disposition': contentDisposition(name, !inline),
      'cache-control': 'private, max-age=600', 'x-content-type-options': 'nosniff',
      // Chrome's PDF viewer will not render inside a sandboxed response, so PDFs skip the sandbox (they cannot run page scripts here anyway).
      ...(inline && mime === 'application/pdf' ? {} : { 'content-security-policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load the file' }, { status: 502 });
  }
}
