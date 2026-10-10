import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

/** Totals for the Finance overview: this financial year (1 July – 30 June), by month and by category, plus bills to pay and check. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req); const db = getSupabaseAdmin();
  const now = new Date(Date.now() + 10 * 3600e3); const fyStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fy = req.nextUrl.searchParams.get('fy') ? Number(req.nextUrl.searchParams.get('fy')) : fyStartYear;
  const from = `${fy}-07-01`, to = `${fy + 1}-06-30`;
  const { data, error } = await db.from('finance_entries').select('kind,category,total_cents,gst_cents,status,entry_date,due_date,needs_review,is_invoice,party_name').gte('entry_date', from).lte('entry_date', to).neq('status', 'cancelled').limit(10000);
  if (error) throw error;
  const rows = data || [];
  const sum = (f: (e: any) => boolean) => rows.filter(f).reduce((s, e: any) => s + Number(e.total_cents || 0), 0);
  const months = Array.from({ length: 12 }, (_, i) => { const y = i < 6 ? fy : fy + 1; const m = ((i + 6) % 12) + 1; const key = `${y}-${String(m).padStart(2, '0')}`; return { month: key, income: sum(e => e.kind === 'income' && e.status !== 'expected' && e.entry_date.startsWith(key)), expense: sum(e => e.kind === 'expense' && e.entry_date.startsWith(key)) }; });
  const byCat = (kind: string) => { const m: Record<string, number> = {}; for (const e of rows) if (e.kind === kind) m[e.category] = (m[e.category] || 0) + Number(e.total_cents || 0); return Object.entries(m).map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents); };
  const today = now.toISOString().slice(0, 10);
  const { data: open } = await db.from('finance_entries').select('id,party_name,total_cents,due_date,description,category').eq('kind', 'expense').eq('status', 'unpaid').order('due_date', { ascending: true, nullsFirst: false }).limit(200);
  const { count: review } = await db.from('finance_entries').select('id', { count: 'exact', head: true }).eq('needs_review', true);
  const { data: runs } = await db.from('pay_runs').select('gross_cents,tax_cents,super_cents,net_cents,status,week_start').gte('week_start', from).lte('week_start', to);
  return ok({
    fy, from, to,
    income: sum(e => e.kind === 'income' && e.status !== 'expected'), expected: sum(e => e.kind === 'income' && e.status === 'expected'),
    expense: sum(e => e.kind === 'expense'), paid: sum(e => e.kind === 'expense' && e.status === 'paid'),
    gst_paid: rows.filter(e => e.kind === 'expense').reduce((s, e: any) => s + Number(e.gst_cents || 0), 0),
    unpaid: (open || []).reduce((s, e: any) => s + Number(e.total_cents || 0), 0), overdue: (open || []).filter((e: any) => e.due_date && e.due_date < today).reduce((s, e: any) => s + Number(e.total_cents || 0), 0),
    bills: (open || []).slice(0, 12), review: review || 0,
    months, income_by_category: byCat('income'), expense_by_category: byCat('expense'),
    payroll: { gross: (runs || []).reduce((s, r: any) => s + Number(r.gross_cents), 0), tax: (runs || []).reduce((s, r: any) => s + Number(r.tax_cents), 0), super: (runs || []).reduce((s, r: any) => s + Number(r.super_cents), 0), runs: (runs || []).length },
  });
});
