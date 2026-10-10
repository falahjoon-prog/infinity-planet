import { NextRequest } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { readInvoiceFile, storeFinanceFile, partyId } from '@/lib/finance';
export const runtime = 'nodejs';

/** Upload invoices/receipts (PDF, Word, photos): each is read, sorted into a category and saved as a bill to check. */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const form = await req.formData();
  const kind = form.get('kind') === 'income' ? 'income' : 'expense';
  const files = form.getAll('file').filter((f): f is File => typeof f !== 'string');
  if (!files.length) throw new HttpError(400, 'Choose a file');
  const db = getSupabaseAdmin(); const made: any[] = [];
  for (const f of files.slice(0, 20)) {
    if (f.size > 25 * 1024 * 1024) throw new HttpError(413, `${f.name} is over 25 MB`);
    const bytes = Buffer.from(await f.arrayBuffer()); const mime = f.type || 'application/octet-stream';
    const { read } = await readInvoiceFile(bytes, mime, f.name);
    const path = await storeFinanceFile(bytes, f.name, mime);
    const pid = await partyId(read.supplier, kind === 'income' ? 'investor' : (read.category === 'consultancy' ? 'consultant' : 'supplier'), { abn: read.abn }, actor.id);
    const { data, error } = await db.from('finance_entries').insert({
      kind, category: kind === 'income' ? 'other_income' : read.category, party_id: pid, party_name: read.supplier, description: f.name.replace(/\.[a-z0-9]+$/i, ''),
      reference: read.reference, amount_cents: read.amount_cents || 0, gst_cents: read.gst_cents || 0, total_cents: read.total_cents || 0,
      entry_date: read.invoice_date || new Date().toISOString().slice(0, 10), due_date: read.due_date, status: kind === 'income' ? 'received' : 'unpaid',
      is_invoice: kind === 'expense', needs_review: true, source: 'upload', file_path: path, file_name: f.name, file_mime: mime, extracted: read, created_by: actor.id,
    }).select('*, party:finance_parties(id,name,kind,abn)').single();
    if (error) throw error; made.push(data);
  }
  await writeAudit({ actorId: actor.id, action: 'finance.upload', entityType: 'finance_entry', metadata: { files: made.length } });
  return ok({ entries: made }, 201);
});
