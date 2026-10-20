/**
 * Gmail context for replies: the whole thread, plus earlier emails with the same person that relate
 * to the same topic (and the project they were linked to in Infinity Planet).
 */
import { google } from 'googleapis';
import { mailClient, googleCall, header, decodeBody } from './google';
import { getSupabaseAdmin } from './supabase';
import { tidyEmailText } from './email-clean';
import { stripQuoted, rankRelated, parseAddress, ThreadMessage, RelatedEmail } from './email-craft';

export type FullThreadMessage = ThreadMessage & { id: string; threadId: string; messageId: string; references: string; cc?: string; attachments: { id?: string; filename: string; mimeType: string; size: number }[] };

/** The Gmail API for one person's own mailbox (see mailClient). */
export async function gmailApi(userId: string) { const { auth, mailbox, provider } = await mailClient(userId); return { gmail: google.gmail({ version: 'v1', auth }), mailbox: mailbox as string | null, provider }; }

function toMsg(m: any): FullThreadMessage {
  const h = m.payload?.headers;
  const attachments: FullThreadMessage['attachments'] = [];
  const walk = (p: any) => { if (!p) return; const cid = String(header(p.headers, 'Content-ID') || '').trim(); const isPic = cid && /^image\//.test(p.mimeType || '') && !/^attachment/i.test(String(header(p.headers, 'Content-Disposition') || '')); if (p.filename && p.body?.attachmentId && !isPic && !(/^image\//.test(p.mimeType || '') && /^(image\d+|~WRD\d+|outlook-\w+|spacer|clip_image\d+)\.\w+$/i.test(p.filename))) attachments.push({ id: p.body.attachmentId, filename: p.filename, mimeType: p.mimeType, size: p.body.size }); (p.parts || []).forEach(walk); };
  walk(m.payload);
  return { id: m.id, threadId: m.threadId, from: header(h, 'From'), to: header(h, 'To'), cc: header(h, 'Cc'), subject: header(h, 'Subject'), date: header(h, 'Date'), messageId: header(h, 'Message-ID'), references: header(h, 'References'), body: tidyEmailText(decodeBody(m.payload).text).slice(0, 60_000), attachments };
}

/** All messages in a thread, oldest first. */
export async function readThread(threadId: string, userId: string): Promise<FullThreadMessage[]> {
  const { gmail } = await gmailApi(userId);
  const t = (await googleCall(() => gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' }))).data;
  return (t.messages || []).map(toMsg);
}
export async function readMessage(id: string, userId: string): Promise<FullThreadMessage> {
  const { gmail } = await gmailApi(userId);
  return toMsg((await googleCall(() => gmail.users.messages.get({ userId: 'me', id, format: 'full' }))).data);
}

/**
 * Earlier emails to/from the same person (last 2 years, outside this thread), ranked by how closely
 * they relate to this topic. The two closest are read in full so the reply can refer to them.
 */
export async function relatedEmails(opts: { userId: string; email: string; subject: string; body?: string; threadId?: string; limit?: number }): Promise<{ related: RelatedEmail[]; searched: number; project: { id: string; name: string } | null }> {
  if (!opts.email) return { related: [], searched: 0, project: null };
  const { gmail } = await gmailApi(opts.userId);
  const domain = opts.email.split('@')[1] || '';
  const generic = /^(gmail|outlook|hotmail|yahoo|icloud|live|bigpond|optusnet)\./i.test(domain);
  const q = `(from:${opts.email} OR to:${opts.email}${!generic && domain ? ` OR from:@${domain}` : ''}) newer_than:2y -in:chats`;
  const list = await googleCall(() => gmail.users.messages.list({ userId: 'me', q, maxResults: 40 }));
  const ids = (list.data.messages || []).filter(m => m.threadId !== opts.threadId).map(m => m.id!).slice(0, 30);
  const metas = await Promise.all(ids.map(id => googleCall(() => gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'] })).then(r => r.data).catch(() => null)));
  const db = getSupabaseAdmin();
  const { data: links } = ids.length ? await db.from('email_links').select('gmail_message_id,gmail_thread_id,project_id, project:projects(id,name)').or(`gmail_message_id.in.(${ids.join(',')}),gmail_thread_id.in.(${[...new Set(metas.filter(Boolean).map(m => m!.threadId))].join(',') || 'none'})`) : { data: [] as any[] };
  const projectOf = (m: any) => (links || []).find((l: any) => l.gmail_message_id === m.id || l.gmail_thread_id === m.threadId)?.project || null;
  // One entry per thread (newest message)
  const seen = new Set<string>();
  const past: RelatedEmail[] = [];
  for (const m of metas) {
    if (!m || seen.has(m.threadId!)) continue; seen.add(m.threadId!);
    if (/^(invitation|updated invitation|accepted|declined|tentatively accepted|cancell?ed event)\s*:/i.test(header(m.payload?.headers, 'Subject'))) continue;
    const p: any = projectOf(m);
    past.push({ id: m.id!, threadId: m.threadId!, subject: header(m.payload?.headers, 'Subject'), from: header(m.payload?.headers, 'From'), date: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : header(m.payload?.headers, 'Date'), snippet: (m.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'), project: p?.name || null });
  }
  const ranked = rankRelated({ subject: opts.subject, body: opts.body, threadId: opts.threadId }, past).slice(0, opts.limit || 5);
  for (const r of ranked.slice(0, 2)) { try { const full = await readMessage(r.id!, opts.userId); r.body = stripQuoted(full.body).slice(0, 4000); } catch {} }
  const pid = ranked.map(r => (links || []).find((l: any) => l.gmail_thread_id === r.threadId || l.gmail_message_id === r.id)).find(Boolean) as any;
  return { related: ranked, searched: past.length, project: pid?.project ? { id: pid.project.id, name: pid.project.name } : null };
}

/** The most recent email from a person or company name/email (for "reply to the latest email from Harbourline"). */
export async function latestFrom(who: string, userId: string): Promise<FullThreadMessage | null> {
  const { gmail } = await gmailApi(userId);
  const w = String(who || '').trim().replace(/["()]/g, '');
  if (!w) return null;
  const q = /@/.test(w) ? `from:${w}` : `from:(${w}) OR subject:(${w})`;
  const list = await googleCall(() => gmail.users.messages.list({ userId: 'me', q: `${q} -from:me`, maxResults: 1 }));
  const id = list.data.messages?.[0]?.id;
  return id ? readMessage(id, userId) : null;
}

export { parseAddress };

/** The message a draft replies to, for quoting under the reply (looked up live from Gmail). */
export async function quotedFor(d: { gmail_thread_id?: string | null; in_reply_to?: string | null; created_by?: string | null }): Promise<{ from?: string; date?: string; body?: string; references?: string } | null> {
  if (!d.gmail_thread_id || !d.created_by) return null;
  try {
    const msgs = await readThread(d.gmail_thread_id, d.created_by);
    const m = msgs.find(x => d.in_reply_to && x.messageId === d.in_reply_to) || msgs[msgs.length - 1];
    if (!m) return null;
    return { from: m.from, date: m.date, body: stripQuoted(m.body).slice(0, 6000), references: [m.references, m.messageId].filter(Boolean).join(' ').trim() };
  } catch { return null; }
}
