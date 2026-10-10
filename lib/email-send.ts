/**
 * Sends a saved draft through Gmail: branded or classic HTML (with the person's real signature),
 * plain-text copy, Cc/Bcc, attachments, threading headers. Used by "Send now" and by scheduled sending.
 */
import { google } from 'googleapis';
import { HttpError } from './http';
import { getSupabaseAdmin } from './supabase';
import { mailClient, googleCall } from './google';
import { getSetting } from './settings';
import { writeAudit } from './audit';
import { BUCKET } from './documents';
import { getEmailLook, renderEmailHtml, renderEmailText, buildMime, fromHeader, MimeAttachment, useClassic } from './email-html';
import { quotedFor } from './email-history';
import { signatureFor } from './email-signature';

/** Turns "column does not exist" errors into a clear instruction to run migration 006. */
export function migrationHint(error: any) {
  const m = String(error?.message || error || '');
  if (/bcc_addresses|attachments|scheduled_at|scheduled_by|forward_of/.test(m) && /column|schema cache/i.test(m)) return new HttpError(409, 'Email options need a one-time database update: run supabase/migrations/006_email_options_4_3.sql in Supabase → SQL Editor (Settings → Health check shows when it is applied).');
  return error;
}

export type DraftAttachment = { path: string; name: string; mime: string; size: number };

export async function loadAttachments(list: DraftAttachment[] | null | undefined): Promise<MimeAttachment[]> {
  const db = getSupabaseAdmin();
  const out: MimeAttachment[] = [];
  for (const a of list || []) {
    const { data, error } = await db.storage.from(BUCKET).download(a.path);
    if (error || !data) throw new HttpError(409, `Attachment “${a.name}” could not be read — remove it and attach it again`);
    out.push({ name: a.name, mime: a.mime || 'application/octet-stream', bytes: Buffer.from(await data.arrayBuffer()) });
  }
  return out;
}

/** Everything needed to show or send a draft exactly as the recipient will see it. */
/** senderId: who sends it (their name, signature and own mailbox); defaults to the draft's author. */
export async function renderDraft(d: any, opts: { forSend: boolean; logoAsDataUrl?: boolean; senderId?: string | null }) {
  const db = getSupabaseAdmin();
  const authorId = opts.senderId || d.created_by;
  const [look, sigInfo, author, quoted, mbox] = await Promise.all([
    getEmailLook(), authorId ? signatureFor(authorId) : Promise.resolve({ mode: 'generated' as const, html: null, sig: {} }),
    authorId ? db.from('profiles').select('full_name').eq('id', authorId).maybeSingle() : Promise.resolve({ data: null } as any),
    d.quoted ? Promise.resolve(d.quoted) : quotedFor({ ...d, created_by: authorId }).catch(() => null),
    authorId ? mailClient(authorId).catch(() => null) : Promise.resolve(null),
  ]);
  const mailbox = mbox?.mailbox || null;
  const inp = { subject: d.subject || '', body: d.body || '', sig: sigInfo.sig, sigHtml: sigInfo.mode === 'none' ? null : sigInfo.html, quoted, senderEmail: mailbox };
  const classic = useClassic(inp, look);
  const branded = look.style.branded || classic;
  const logoSrc = look.logo ? (opts.logoAsDataUrl ? `data:${look.logo.mime};base64,${look.logo.bytes.toString('base64')}` : 'cid:brandlogo') : null;
  const html = branded ? renderEmailHtml({ ...inp, logoSrc }, look) : null;
  return { look, html, text: renderEmailText(inp, look), classic, signature_mode: sigInfo.mode, from: fromHeader(author?.data?.full_name, look.businessName, mailbox), mailbox, quoted };
}

export async function sendDraft(id: string, actorId: string, opts: { scheduled?: boolean } = {}) {
  const db = getSupabaseAdmin();
  const { data: d } = await db.from('email_drafts').select('*').eq('id', id).maybeSingle();
  if (!d) throw new HttpError(404, 'Draft not found');
  if (d.status === 'sent') throw new HttpError(409, 'Already sent');
  if (d.created_by && d.created_by !== actorId) throw new HttpError(403, 'Only the person who wrote this email can send it — it goes from their own mailbox.');
  // Each member sends their own email: no approval step (the Send dialog reminds them to Cc anyone who should know).
  // Sent from the sender's own mailbox (their @company address), never someone else's.
  const { auth, provider } = await mailClient(actorId);
  const gmail = google.gmail({ version: 'v1', auth });
  const r0 = await renderDraft(d, { forSend: true, senderId: actorId });
  const attachments = await loadAttachments(d.attachments);
  const raw = Buffer.from(buildMime({
    from: r0.from, to: d.to_addresses, cc: d.cc_addresses, bcc: d.bcc_addresses, subject: d.subject,
    inReplyTo: d.in_reply_to, references: (r0.quoted as any)?.references || d.in_reply_to, text: r0.text, html: r0.html,
    logo: r0.html && !r0.classic ? r0.look.logo : null, attachments,
  })).toString('base64url');
  try {
    const r = await googleCall(provider, () => gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: d.gmail_thread_id || undefined } }));
    const now = new Date().toISOString();
    await db.from('email_drafts').update({ status: 'sent', gmail_message_id: r.data.id, sent_by: actorId, sent_at: now, error: null, updated_at: now }).eq('id', id);
    if (d.project_id) await db.from('email_links').upsert({ gmail_message_id: r.data.id!, gmail_thread_id: r.data.threadId, project_id: d.project_id, deal_id: d.deal_id, subject: d.subject, from_address: `${r0.look.businessName} (sent)`, snippet: d.body.slice(0, 200), sent_at: now, linked_by: actorId }, { onConflict: 'gmail_message_id,project_id' });
    await writeAudit({ actorId, action: opts.scheduled ? 'email.sent_scheduled' : 'email.sent', entityType: 'email_draft', entityId: id, metadata: { to: d.to_addresses, subject: d.subject, gmail_id: r.data.id, layout: r0.classic ? 'classic' : r0.html ? 'branded' : 'text', attachments: attachments.length } });
    return { sent: true, gmail_message_id: r.data.id, branded: !!r0.html, classic: r0.classic };
  } catch (e: any) {
    await db.from('email_drafts').update({ status: 'failed', error: e?.message || 'Send failed' }).eq('id', id);
    throw e;
  }
}

/** Sends scheduled emails that are due (called every minute by the server). */
let running = false;
export async function sendDueScheduled() {
  if (running) return; running = true;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('email_drafts').select('id,scheduled_by,created_by').lte('scheduled_at', new Date().toISOString()).not('scheduled_at', 'is', null).neq('status', 'sent').limit(20);
    if (error) return;
    for (const d of data || []) {
      try { await sendDraft(d.id, d.scheduled_by || d.created_by, { scheduled: true }); }
      catch (e: any) { await db.from('email_drafts').update({ scheduled_at: null, status: 'failed', error: `Scheduled send failed: ${e?.message || e}` }).eq('id', d.id); }
    }
  } finally { running = false; }
}
