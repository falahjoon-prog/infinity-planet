import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { calcPay, SUPER_RATE, SCHEDULE_NOTE, type PaySetting } from '@/lib/finance';
import { weekStart, weekRange, isWeek, COUNTED, signoffs } from '@/lib/time';
export const dynamic = 'force-dynamic';

const DEFAULT_PAY = { pay_type: 'employee', rate_type: 'hourly', hourly_rate_cents: 0, annual_salary_cents: 0, salary_hours: 38, tax_scale: '2', super_rate: SUPER_RATE, gst_registered: false, active: true };

/** Hours each person worked in a week: the signed-off hours if the week was signed off, otherwise app use + counted real-world time. */
async function weekHours(week: string, ids: string[]) {
  const db = getSupabaseAdmin(); const { from, to } = weekRange(week);
  const days = Array.from({ length: 7 }, (_, i) => new Date(new Date(`${week}T00:00:00Z`).getTime() + i * 864e5).toISOString().slice(0, 10));
  const mins: Record<string, number> = {};
  for (let page = 0; page < 60; page++) {
    const { data, error } = await db.from('activity_minutes').select('user_id').in('user_id', ids).gte('minute', from).lt('minute', to).range(page * 1000, page * 1000 + 999);
    if (error) break; for (const m of data || []) mins[m.user_id] = (mins[m.user_id] || 0) + 1; if (!data || data.length < 1000) break;
  }
  const { data: logs } = await db.from('time_logs').select('user_id,status,counted_minutes').in('user_id', ids).gte('occurred_on', days[0]).lte('occurred_on', days[6]);
  for (const l of logs || []) if (COUNTED.includes(l.status)) mins[l.user_id] = (mins[l.user_id] || 0) + Number(l.counted_minutes || 0);
  const signs = await signoffs();
  const out: Record<string, { hours: number; source: string }> = {};
  for (const id of ids) { const so = signs[`${id}:${week}`]; out[id] = so ? { hours: Math.round(so.minutes / 60 * 100) / 100, source: 'signed off' } : { hours: Math.round((mins[id] || 0) / 60 * 100) / 100, source: mins[id] ? 'app + logged time (not signed off)' : 'no hours recorded' }; }
  return out;
}

/** A week's pay run: the saved one, or a fresh preview worked out from everyone's hours and pay settings. Also lists past runs. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req); const db = getSupabaseAdmin();
  const qw = req.nextUrl.searchParams.get('week');
  const lastWeek = weekStart(new Date(Date.now() - 7 * 864e5));
  const week = isWeek(qw) ? weekStart(`${qw}T12:00:00+10:00`) : lastWeek;
  const [{ data: people }, { data: settings }, { data: run }, { data: runs }] = await Promise.all([
    db.from('profiles').select('id,full_name,email,title,role,active').order('full_name'),
    db.from('pay_settings').select('*'),
    db.from('pay_runs').select('*, lines:pay_lines(*)').eq('week_start', week).maybeSingle(),
    db.from('pay_runs').select('id,week_start,pay_date,status,gross_cents,tax_cents,super_cents,net_cents').order('week_start', { ascending: false }).limit(30),
  ]);
  const active = (people || []).filter((p: any) => p.active !== false);
  const setOf = (id: string) => ({ ...DEFAULT_PAY, profile_id: id, ...((settings || []).find((s: any) => s.profile_id === id) || {}) }) as PaySetting & Record<string, any>;
  const paid = active.filter(p => { const s = setOf(p.id); return s.active !== false && (Number(s.hourly_rate_cents) > 0 || Number(s.annual_salary_cents) > 0); });
  const hours = await weekHours(week, paid.map(p => p.id));
  const lines = paid.map((p: any) => {
    const saved = (run?.lines || []).find((l: any) => l.profile_id === p.id);
    const s = setOf(p.id); const h = saved ? Number(saved.hours) : hours[p.id].hours;
    const calc = saved && run?.status !== 'draft' ? { rate_cents: saved.rate_cents, gross_cents: saved.gross_cents, tax_cents: saved.tax_cents, super_cents: saved.super_cents, gst_cents: saved.gst_cents, net_cents: saved.net_cents } : calcPay(s, h);
    return { profile_id: p.id, name: p.full_name || p.email, title: p.title, pay_type: s.pay_type, rate_type: s.rate_type, tax_scale: s.tax_scale, super_rate: s.super_rate, super_fund: s.super_fund, abn: s.abn,
      hours: h, recorded_hours: hours[p.id].hours, hours_source: saved?.hours_source || hours[p.id].source, note: saved?.note || null, ...calc };
  });
  const missing = active.filter(p => !paid.find(x => x.id === p.id)).map((p: any) => ({ id: p.id, name: p.full_name || p.email }));
  const tot = (k: string) => lines.reduce((s, l: any) => s + Number(l[k] || 0), 0);
  return ok({ week, last_week: lastWeek, run: run ? { ...run, lines: undefined } : null, lines, missing, runs: runs || [], totals: { gross: tot('gross_cents'), tax: tot('tax_cents'), super: tot('super_cents'), gst: tot('gst_cents'), net: tot('net_cents') }, note: SCHEDULE_NOTE });
});

/**
 * Save a week's pay run. body: { week, pay_date, lines: [{ profile_id, hours, note }], finalise?: boolean }
 * Finalising locks the figures and records them under Finance: wages (net pay), PAYG withheld (owed to the ATO) and super (owed to the funds).
 */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  if (!['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only admins and directors can run payroll');
  const b = await body(req); if (!isWeek(b.week)) throw new HttpError(400, 'Choose a week');
  const week = weekStart(`${b.week}T12:00:00+10:00`); const db = getSupabaseAdmin();
  const { data: existing } = await db.from('pay_runs').select('id,status').eq('week_start', week).maybeSingle();
  if (existing && existing.status !== 'draft') throw new HttpError(409, 'This week has already been finalised.');
  const { data: settings } = await db.from('pay_settings').select('*');
  const hours = await weekHours(week, (b.lines || []).map((l: any) => l.profile_id));
  const lines = (Array.isArray(b.lines) ? b.lines : []).map((l: any) => {
    const s = { ...DEFAULT_PAY, profile_id: l.profile_id, ...((settings || []).find((x: any) => x.profile_id === l.profile_id) || {}) } as PaySetting & Record<string, any>;
    const h = Math.max(0, Math.min(168, Number(l.hours) || 0)); const c = calcPay(s, h);
    const rec = hours[l.profile_id]; const source = rec && Math.abs(rec.hours - h) < 0.01 ? rec.source : 'entered by ' + (actor.full_name || 'admin');
    return { profile_id: l.profile_id, pay_type: s.pay_type, hours: h, hours_source: source, tax_scale: s.tax_scale, note: l.note || null, ...c };
  });
  const tot = (k: string) => lines.reduce((s: number, l: any) => s + Number(l[k] || 0), 0);
  const finalise = !!b.finalise; const payDate = /^\d{4}-\d{2}-\d{2}$/.test(b.pay_date || '') ? b.pay_date : new Date().toISOString().slice(0, 10);
  const runRow = { week_start: week, pay_date: payDate, status: finalise ? 'finalised' : 'draft', gross_cents: tot('gross_cents'), tax_cents: tot('tax_cents'), super_cents: tot('super_cents'), net_cents: tot('net_cents'), notes: b.notes || null, updated_at: new Date().toISOString(), ...(finalise ? { finalised_by: actor.id, finalised_at: new Date().toISOString() } : {}) };
  const r = existing ? await db.from('pay_runs').update(runRow).eq('id', existing.id).select().single() : await db.from('pay_runs').insert({ ...runRow, created_by: actor.id }).select().single();
  if (r.error) throw r.error; const run = r.data;
  await db.from('pay_lines').delete().eq('run_id', run.id);
  if (lines.length) { const { error } = await db.from('pay_lines').insert(lines.map((l: any) => ({ ...l, run_id: run.id }))); if (error) throw error; }
  if (finalise) {
    const d = payDate, wk = `week of ${week}`;
    const rows: any[] = [];
    const net = lines.filter((l: any) => l.pay_type === 'employee').reduce((s: number, l: any) => s + l.net_cents, 0);
    const contractors = lines.filter((l: any) => l.pay_type === 'contractor');
    if (net) rows.push({ kind: 'expense', category: 'wages', description: `Wages (net pay) — ${wk}`, total_cents: net, amount_cents: net, status: 'unpaid', entry_date: d, due_date: d });
    if (run.tax_cents) rows.push({ kind: 'expense', category: 'payg_withheld', party_name: 'Australian Taxation Office', description: `PAYG withheld — ${wk}`, total_cents: run.tax_cents, amount_cents: run.tax_cents, status: 'unpaid', entry_date: d });
    if (run.super_cents) rows.push({ kind: 'expense', category: 'super', description: `Superannuation — ${wk} (payday super: pay with the wages)`, total_cents: run.super_cents, amount_cents: run.super_cents, status: 'unpaid', entry_date: d, due_date: d });
    for (const c of contractors) rows.push({ kind: 'expense', category: 'consultancy', description: `Contractor hours — ${wk}`, party_name: (await db.from('profiles').select('full_name,email').eq('id', c.profile_id).single()).data?.full_name || null, total_cents: c.net_cents, amount_cents: c.gross_cents, gst_cents: c.gst_cents, status: 'unpaid', entry_date: d, due_date: d });
    // every row needs every column (a bulk insert fills missing ones with null, not the default)
    const full = rows.map(x => ({ party_name: null, due_date: null, gst_cents: 0, ...x, source: 'payroll', pay_run_id: run.id, created_by: actor.id }));
    if (full.length) { const { error } = await db.from('finance_entries').insert(full); if (error) { await db.from('pay_runs').update({ status: 'draft', finalised_by: null, finalised_at: null }).eq('id', run.id); throw error; } }
  }
  await writeAudit({ actorId: actor.id, action: finalise ? 'payroll.run.finalised' : 'payroll.run.saved', entityType: 'pay_run', entityId: run.id, metadata: { week, people: lines.length, gross_cents: run.gross_cents } });
  return ok({ run });
});
