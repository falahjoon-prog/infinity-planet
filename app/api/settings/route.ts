import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { invalidateBrand } from '@/lib/brand';

const EDITABLE = ['ai_system_instructions', 'email_requires_approval', 'home_jurisdiction', 'rhc_entity_names', 'rhc_entity_details', 'business_name', 'business_short_name', 'brand_style', 'bot_provider', 'signup', 'email_style', 'approvals_require_approver', 'ui_theme'];
export const GET = route(async (req: NextRequest) => { await getActor(req); return ok({ settings: await getSettings() }); });
export const PATCH = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const b = await body<Record<string, unknown>>(req);
  for (const k of ['business_name', 'business_short_name']) if (k in b) { b[k] = String(b[k] ?? '').trim().slice(0, 80); if (k === 'business_name' && !b[k]) throw new HttpError(400, 'Business name cannot be empty'); }
  const rows = Object.entries(b).filter(([k]) => EDITABLE.includes(k)).map(([key, value]) => ({ key, value, updated_by: actor.id, updated_at: new Date().toISOString() }));
  if (!rows.length) throw new HttpError(400, 'No editable settings supplied');
  const { error } = await getSupabaseAdmin().from('app_settings').upsert(rows);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'settings.updated', metadata: { keys: rows.map(r => r.key) } });
  invalidateBrand();
  return ok({ settings: await getSettings() });
});
