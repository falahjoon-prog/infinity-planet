import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor, requireRole } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { getSupabaseAdmin } from '@/lib/supabase';

/** The company's stamp template: every member makes their own stamp from it by adding their name and position. */
const DEFAULT = { shape: 'round', company: 'Infinity Planet', caption: 'Official Seal', color: '#C8102E', dome: true, texture: true };
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const t = await getSetting<any>('stamp_template').catch(() => null);
  return ok({ template: { ...DEFAULT, ...(t || {}) } });
});
export const PATCH = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const b = await body(req);
  const t = { shape: b.shape === 'rect' ? 'rect' : 'round', company: String(b.company || DEFAULT.company).slice(0, 40), caption: String(b.caption ?? DEFAULT.caption).slice(0, 30), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : DEFAULT.color, dome: b.dome !== false, texture: b.texture !== false };
  await getSupabaseAdmin().from('app_settings').upsert({ key: 'stamp_template', value: t, updated_by: actor.id, updated_at: new Date().toISOString() });
  return ok({ template: t });
});
