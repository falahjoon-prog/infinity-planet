import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { mailClient, googleCall, header, decodeBody, calendarPart, inPool } from '@/lib/google';
import { tidyEmailText, sanitizeEmailHtml, parseIcs, CalEvent } from '@/lib/email-clean';

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Word's blank placeholder pictures (~WRD0002.jpg …) show as empty boxes — take them out. */
const isBlankPic = (name?: string) => /^~WRD\d+/i.test(String(name || ''));
const dropCid = (html: string, cid: string) => html.replace(new RegExp(`<img\\b[^>]*\\bsrc\\s*=\\s*["']cid:${esc(cid)}["'][^>]*>`, 'gi'), '');

export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const { auth, provider } = await mailClient(actor.id);
  const gmail = google.gmail({ version: 'v1', auth });
  const m = (await googleCall(provider, () => gmail.users.messages.get({ userId: 'me', id, format: 'full' }))).data;
  const h = m.payload?.headers;
  const { text, html } = decodeBody(m.payload);
  // Calendar invites: read the .ics into a simple event (title, when, where, who)
  let event: CalEvent | null = null;
  const cal = calendarPart(m.payload);
  if (cal) {
    try {
      const ics = cal.data ?? (cal.attachmentId ? Buffer.from(String((await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: cal.attachmentId })).data.data || ''), 'base64url').toString('utf8') : '');
      event = parseIcs(ics);
    } catch { event = null; }
  }
  // Opening an email marks it as read (like Gmail)
  if ((m.labelIds || []).includes('UNREAD') && req.nextUrl.searchParams.get('mark') !== '0') gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } }).catch(() => {});
  const attachments: { id: string; filename: string; mimeType: string; size: number }[] = [];
  const inline: { cid: string; mime: string; data?: string | null; attachmentId?: string | null; size: number; filename?: string }[] = [];
  const walk = (p: any) => {
    if (!p) return;
    const cid = String(header(p.headers, 'Content-ID') || '').replace(/[<>]/g, '').trim();
    const disp = String(header(p.headers, 'Content-Disposition') || '');
    if (cid && /^image\//.test(p.mimeType || '') && !/^attachment/i.test(disp)) inline.push({ cid, filename: p.filename || '', mime: p.mimeType, data: p.body?.data || null, attachmentId: p.body?.attachmentId || null, size: p.body?.size || 0 });
    else if (p.filename && p.body?.attachmentId) attachments.push({ id: p.body.attachmentId, filename: p.filename, mimeType: p.mimeType, size: p.body.size });
    (p.parts || []).forEach(walk);
  };
  walk(m.payload);
  // A picture that has a Content-ID but is NOT used inside the email text is a real attachment (a photo, a drawing) — list it.
  for (const im of inline) if (im.filename && im.attachmentId && !(html || '').includes(`cid:${im.cid}`)) attachments.push({ id: im.attachmentId, filename: im.filename, mimeType: im.mime, size: im.size });
  // Pictures inside the email (logos, signatures) are referenced as "cid:" — put the actual image in, like Gmail does.
  let fullHtml = html;
  if (fullHtml && inline.length) {
    for (const im of inline.slice(0, 20)) {
      if (isBlankPic(im.filename)) { fullHtml = dropCid(fullHtml, im.cid); continue; }
      if (!fullHtml.includes(`cid:${im.cid}`) || im.size > 2_500_000) continue;
      try {
        const b64 = im.data ?? (im.attachmentId ? String((await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: im.attachmentId })).data.data || '') : '');
        if (b64) fullHtml = fullHtml.split(`cid:${im.cid}`).join(`data:${im.mime};base64,${Buffer.from(b64, 'base64url').toString('base64')}`);
      } catch {}
    }
  }
  // Outlook's signature pictures (image001.png…) are not real files, so they are left out of the attachment list below.
  // Quoted earlier emails point at pictures (signatures, logos) that are stored in the OTHER emails of the conversation — fetch those too.
  if (fullHtml && /cid:/i.test(fullHtml) && m.threadId) {
    const want = new Set<string>(); for (const mt of fullHtml.matchAll(/cid:([^"'\s)>]+)/gi)) want.add(mt[1]);
    try {
      const t = (await googleCall(provider, () => gmail.users.threads.get({ userId: 'me', id: m.threadId as string, format: 'full' }))).data;
      const found = new Map<string, { mime: string; data?: string | null; attachmentId?: string | null; size: number; mid: string; filename?: string }>();
      const walk2 = (p: any, mid: string) => { if (!p) return; const c = String(header(p.headers, 'Content-ID') || '').replace(/[<>]/g, '').trim(); if (c && /^image\//.test(p.mimeType || '') && !found.has(c)) found.set(c, { filename: p.filename || '', mime: p.mimeType, data: p.body?.data || null, attachmentId: p.body?.attachmentId || null, size: p.body?.size || 0, mid }); (p.parts || []).forEach((x: any) => walk2(x, mid)); };
      for (const tm of t.messages || []) if (tm.id !== id) walk2(tm.payload, tm.id as string);
      const safe = (x: string) => { try { return decodeURIComponent(x); } catch { return x; } };
      for (const c of want) { const im = found.get(c) || found.get(safe(c)); if (im && isBlankPic(im.filename)) fullHtml = dropCid(fullHtml, c); }
      const todo = [...want].map(c => ({ c, im: found.get(c) || found.get(safe(c)) })).filter(x => x.im && x.im.size <= 1_500_000).slice(0, 40);
      const got = await inPool(todo, 5, async ({ c, im }) => {
        try { const b64 = im!.data ?? (im!.attachmentId ? String((await gmail.users.messages.attachments.get({ userId: 'me', messageId: im!.mid, id: im!.attachmentId })).data.data || '') : ''); return b64 ? { c, uri: `data:${im!.mime};base64,${Buffer.from(b64, 'base64url').toString('base64')}` } : null; } catch { return null; }
      });
      for (const g of got) if (g) fullHtml = fullHtml.split(`cid:${g.c}`).join(g.uri);
    } catch { /* the pictures stay missing; they are removed below */ }
    // Anything still pointing at a picture we could not find would show as a broken box with the file name — take it out.
    fullHtml = fullHtml.replace(/<img\b[^>]*\bsrc\s*=\s*["']cid:[^"']*["'][^>]*>/gi, '');
  }
  return ok({ message: { id: m.id, threadId: m.threadId, from: header(h, 'From'), to: header(h, 'To'), cc: header(h, 'Cc'), subject: header(h, 'Subject'), references: header(h, 'References'), date: header(h, 'Date'), messageId: header(h, 'Message-ID'), body: text.slice(0, 100_000), clean_text: tidyEmailText(text).slice(0, 100_000), html: sanitizeEmailHtml(fullHtml), event, attachments: (event ? attachments.filter(a => !/\.ics$/i.test(a.filename)) : attachments).filter(a => !(/^image\//.test(a.mimeType || '') && /^(image\d+|~WRD\d+|outlook-\w+|spacer|clip_image\d+)\.\w+$/i.test(a.filename || ''))), labels: m.labelIds || [] } });
});
