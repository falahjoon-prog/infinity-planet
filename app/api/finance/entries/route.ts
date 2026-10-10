import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { partyId, cleanEntry } from '@/lib/finance';
export const dynamic = 'force-dynamic';

const SELECT = '*, party:finance_parties(id,name,kind,abn), project:projects(id,name)';

/** Money in and out. ?kind=income|expense  ?invoices=1 (bills received)  ?status=  ?q=  ?from=&to= */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams; const db = getSupabaseAdmin();
  let q = db.from('finance_entries').select(SELECT).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  if (sp.get('kind')) q = q.eq('kind', sp.get('kind')!);
  if (sp.get('invoices') === '1') q = q.eq('is_invoice', true);
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  if (sp.get('review') === '1') q = q.eq('needs_review', true);
  if (sp.get('category')) q = q.eq('category', sp.get('category')!);
  if (sp.get('party')) q = q.eq('party_id', sp.get('party')!);
  if (sp.get('from')) q = q.gte('entry_date', sp.get('from')!);
  if (sp.get('to')) q = q.lte('entry_date', sp.get('to')!);
  const term = (sp.get('q') || '').trim().replace(/[%,()]/g, ' ');
  if (term) q = q.or(`description.ilike.%${term}%,party_name.ilike.%${term}%,reference.ilike.%${term}%,email_subject.ilike.%${term}%`);
  const { data, error } = await q; if (error) throw error;
  return ok({ entries: data || [] });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req); const row = cleanEntry(b);
  if (!row.kind) throw new HttpError(400, 'Choose income or expense');
  if (!row.total_cents && !row.amount_cents) throw new HttpError(400, 'Enter an amount');
  if (!row.party_id && b.party_name) row.party_id = await partyId(b.party_name, b.party_kind || (row.kind === 'income' ? 'investor' : 'supplier'), {}, actor.id);
  if (!row.status) row.status = row.kind === 'income' ? 'received' : 'unpaid';
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('finance_entries').insert({ ...row, source: 'manual', created_by: actor.id }).select(SELECT).single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: `finance.${row.kind}.created`, entityType: 'finance_entry', entityId: data.id, metadata: { total_cents: data.total_cents, party: data.party_name || data.party?.name } });
  return ok({ entry: data }, 201);
});
