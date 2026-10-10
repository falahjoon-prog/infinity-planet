import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { route } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { mailClient, googleCall } from '@/lib/google';
import { contentDisposition } from '@/lib/file-links';
export const runtime = 'nodejs';

/** Download (or open) an attachment of a Gmail message. */
export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id, aid } = await params;
  const sp = req.nextUrl.searchParams;
  const name = String(sp.get('name') || 'attachment').replace(/[\r\n"]/g, '').slice(0, 200);
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(sp.get('type') || '') ? sp.get('type')! : 'application/octet-stream';
  const { auth, provider } = await mailClient(actor.id);
  const gmail = google.gmail({ version: 'v1', auth });
  const a = (await googleCall(provider, () => gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: aid }))).data;
  const bytes = Buffer.from(String(a.data || ''), 'base64url');
  const inline = sp.get('inline') === '1' && /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(mime);
  return new NextResponse(new Uint8Array(bytes), { headers: { 'content-type': inline ? mime : 'application/octet-stream', 'content-disposition': contentDisposition(name, !inline), 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=600' } });
});
