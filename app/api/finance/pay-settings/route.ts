import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { TAX_SCALES, SUPER_RATE } from '@/lib/finance';
export const dynamic = 'force-dynamic';

const DEFAULTS = { pay_type: 'employee', rate_type: 'hourly', hourly_rate_cents: 0, annual_salary_cents: 0, salary_hours: 38, tax_scale: '2', study_loan: false, super_rate: SUPER_RATE, super_fund: null, super_member_no: null, abn: null, gst_registered: false, active: true, notes: null };

/** Every team member with their pay settings (defaults until an admin sets them). */
export const GET = route(async (req: NextRequest) => {
  await getActor(req); const db = getSupabaseAdmin();
  const [{ data: people, error }, { data: settings }] = await Promise.all([
    db.from('profiles').select('id,full_name,email,title,role,active,color').order('full_name'),
    db.from('pay_settings').select('*'),
  ]);
  if (error) throw error;
  const members = (people || []).filter((p: any) => p.active !== false).map((p: any) => ({ ...p, pay: { ...DEFAULTS, profile_id: p.id, ...((settings || []).find((s: any) => s.profile_id === p.id) || {}), saved: !!(settings || []).find((s: any) => s.profile_id === p.id) } }));
  return ok({ members, scales: TAX_SCALES, super_rate: SUPER_RATE });
});

/** Save one member's pay settings. Only admins and directors. */
export const PUT = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  if (!['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only admins and directors can set pay rates');
  const b = await body(req); if (!b.profile_id) throw new HttpError(400, 'Choose a team member');
  const n = (v: any) => Math.max(0, Math.round(Number(v) || 0));
  const row = {
    profile_id: b.profile_id, pay_type: b.pay_type === 'contractor' ? 'contractor' : 'employee', rate_type: b.rate_type === 'salary' ? 'salary' : 'hourly',
    hourly_rate_cents: n(b.hourly_rate_cents), annual_salary_cents: n(b.annual_salary_cents), salary_hours: Math.min(80, Math.max(1, Number(b.salary_hours) || 38)),
    tax_scale: TAX_SCALES.some(s => s.value === String(b.tax_scale)) ? String(b.tax_scale) : '2', study_loan: !!b.study_loan,
    super_rate: Math.min(30, Math.max(0, Number(b.super_rate ?? SUPER_RATE))), super_fund: b.super_fund || null, super_member_no: b.super_member_no || null,
    abn: b.abn || null, gst_registered: !!b.gst_registered, active: b.active !== false, notes: b.notes || null, updated_by: actor.id, updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabaseAdmin().from('pay_settings').upsert(row).select().single(); if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'payroll.settings.updated', entityType: 'profile', entityId: b.profile_id, metadata: { pay_type: row.pay_type, rate_type: row.rate_type } });
  return ok({ pay: data });
});
