import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

/** Mark a finalised run as paid (its wages, PAYG and super entries become paid), or delete a draft. */
export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req); if (!['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only admins and directors can run payroll');
  const { id } = await params; const b = await body(req); const db = getSupabaseAdmin();
  if (b.status !== 'paid') throw new HttpError(400, 'Only "paid" can be set here');
  const { data: run } = await db.from('pay_runs').select('status').eq('id', id).single();
  if (run?.status !== 'finalised') throw new HttpError(409, 'Finalise the pay run first');
  const today = new Date().toISOString().slice(0, 10);
  await db.from('pay_runs').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', id);
  await db.from('finance_entries').update({ status: 'paid', paid_date: today }).eq('pay_run_id', id).in('category', ['wages', 'super', 'consultancy']);
  await writeAudit({ actorId: actor.id, action: 'payroll.run.paid', entityType: 'pay_run', entityId: id });
  return ok({ ok: true });
});
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req); if (!['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only admins and directors can run payroll');
  const { id } = await params; const db = getSupabaseAdmin();
  const { data: run } = await db.from('pay_runs').select('status').eq('id', id).single();
  if (run?.status !== 'draft') throw new HttpError(409, 'Only a draft pay run can be deleted');
  await db.from('pay_runs').delete().eq('id', id); return ok({ ok: true });
});
