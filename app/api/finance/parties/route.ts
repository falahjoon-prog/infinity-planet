import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
const KINDS = ['investor', 'consultant', 'supplier', 'customer', 'government', 'other'];

/** Investors, consultants and suppliers, with what has come in from / gone out to each. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req); const db = getSupabaseAdmin(); const kind = req.nextUrl.searchParams.get('kind');
  let q = db.from('finance_parties').select('*').order('name'); if (kind) q = q.eq('kind', kind);
  const [{ data, error }, { data: sums }] = await Promise.all([q, db.from('finance_entries').select('party_id,kind,total_cents,status').neq('status', 'cancelled').limit(5000)]);
  if (error) throw error;
  const parties = (data || []).map((p: any) => { const mine = (sums || []).filter((e: any) => e.party_id === p.id); return { ...p, received_cents: mine.filter((e: any) => e.kind === 'income' && e.status !== 'expected').reduce((s: number, e: any) => s + Number(e.total_cents), 0), paid_cents: mine.filter((e: any) => e.kind === 'expense' && e.status === 'paid').reduce((s: number, e: any) => s + Number(e.total_cents), 0), owing_cents: mine.filter((e: any) => e.kind === 'expense' && e.status === 'unpaid').reduce((s: number, e: any) => s + Number(e.total_cents), 0), entries: mine.length }; });
  return ok({ parties });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req); const b = await body(req);
  const row = { name: must(String(b.name || '').trim(), 'Enter a name'), kind: KINDS.includes(b.kind) ? b.kind : 'supplier', abn: b.abn || null, email: b.email || null, phone: b.phone || null, notes: b.notes || null, created_by: actor.id };
  const { data, error } = await getSupabaseAdmin().from('finance_parties').insert(row).select().single();
  if (error) throw /duplicate/i.test(error.message) ? new Error(`${row.name} is already on the list`) : error;
  return ok({ party: data }, 201);
});
