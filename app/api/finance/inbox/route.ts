import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { mailClient, googleCall, header } from '@/lib/google';
import { readInvoiceFile, storeFinanceFile, partyId } from '@/lib/finance';
export const runtime = 'nodejs';
export const maxDuration = 120;

const SEARCH = 'has:attachment (invoice OR "tax invoice" OR bill OR receipt OR statement OR "amount due" OR remittance) -in:chats';
const WANTED = /^(application\/pdf|image\/(png|jpe?g|webp|heic|tiff)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;

function parts(p: any, out: any[] = []): any[] { if (!p) return out; if (p.filename && p.body?.attachmentId) out.push(p); (p.parts || []).forEach((x: any) => parts(x, out)); return out; }

/**
 * Look through your mailbox for emails with invoices attached (last ?days, default 90), read each attachment,
 * sort it into a category and file it under Finance → Invoices as a bill to check. Already-imported attachments are skipped.
 */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req); const days = Math.min(Math.max(Number(b.days) || 90, 7), 730);
  let mc; try { mc = await mailClient(actor.id); } catch (e: any) { throw new HttpError(409, 'Connect your email first (Inbox → Gmail), then look for invoices again.'); }
  const gmail = google.gmail({ version: 'v1', auth: mc.auth });
  const db = getSupabaseAdmin();
  const list = await googleCall(mc.provider, () => gmail.users.messages.list({ userId: 'me', q: `${SEARCH} newer_than:${days}d`, maxResults: 60 }));
  const ids = (list.data.messages || []).map(m => m.id!).filter(Boolean);
  let found = 0, added = 0, skipped = 0; const made: any[] = [];
  for (const id of ids) {
    const msg = (await googleCall(mc.provider, () => gmail.users.messages.get({ userId: 'me', id, format: 'full' }))).data;
    const hs = msg.payload?.headers || []; const from = header(hs, 'From'); const subject = header(hs, 'Subject');
    const date = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString().slice(0, 10) : null;
    for (const p of parts(msg.payload)) {
      const mime = String(p.mimeType || ''); if (!WANTED.test(mime) && !/\.pdf$/i.test(p.filename)) continue;
      if (/^(logo|image\d*|signature|outlook-)/i.test(p.filename) && /^image\//.test(mime)) continue; // email signature pictures
      found++;
      const key = `${id}:${p.filename}`.slice(0, 300);
      const { data: dup } = await db.from('finance_entries').select('id').eq('gmail_attachment_key', key).maybeSingle();
      if (dup) { skipped++; continue; }
      const a = (await googleCall(mc.provider, () => gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: p.body.attachmentId }))).data;
      const bytes = Buffer.from(String(a.data || ''), 'base64url'); if (!bytes.length || bytes.length > 25 * 1024 * 1024) continue;
      const { read } = await readInvoiceFile(bytes, mime || 'application/pdf', p.filename, { from, subject });
      if (!read.is_invoice && !read.total_cents) { skipped++; continue; } // not an invoice (a brochure, a photo…)
      const email = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
      const path = await storeFinanceFile(bytes, p.filename, mime || 'application/pdf');
      const pid = await partyId(read.supplier, read.category === 'consultancy' ? 'consultant' : 'supplier', { abn: read.abn, email }, actor.id);
      const { data, error } = await db.from('finance_entries').insert({
        kind: 'expense', category: read.category, party_id: pid, party_name: read.supplier, description: subject || p.filename, reference: read.reference,
        amount_cents: read.amount_cents || 0, gst_cents: read.gst_cents || 0, total_cents: read.total_cents || 0,
        entry_date: read.invoice_date || date || new Date().toISOString().slice(0, 10), due_date: read.due_date, status: 'unpaid', is_invoice: true, needs_review: true,
        source: 'email', file_path: path, file_name: p.filename, file_mime: mime || 'application/pdf', gmail_message_id: id, gmail_attachment_key: key,
        email_from: from.slice(0, 300), email_subject: (subject || '').slice(0, 300), extracted: read, created_by: actor.id,
      }).select('id,party_name,total_cents,category').single();
      if (error) { if (/duplicate/i.test(error.message)) { skipped++; continue; } throw error; }
      added++; made.push(data);
    }
  }
  await writeAudit({ actorId: actor.id, action: 'finance.inbox.scan', entityType: 'finance_entry', metadata: { emails: ids.length, found, added, skipped, mailbox: mc.mailbox } });
  return ok({ emails: ids.length, attachments: found, added, skipped, entries: made, mailbox: mc.mailbox });
});
