import { NextRequest } from 'next/server';
import { route, ok, body, must, HttpError } from '@/lib/http';
import { getActor, requireRole, ROLES, APPROVAL_CATEGORIES } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';
import { writeAudit } from '@/lib/audit';
import { AREAS, CustomRole, cleanAreas } from '@/lib/access';
import { getDuties } from '@/lib/duties';

const BUILT_IN: Record<string, string> = {
  admin: 'Everything, including team, settings and the Google connection.', director: 'Everything; approves all items.', manager: 'All work; approves general, email and document items.',
  legal: 'Approves legal reviews, contracts and clause positions.', marketing: 'Approves marketing and designs.', project: 'Creates and edits work; requests approvals.', member: 'Creates and edits work; requests approvals.', viewer: 'Read-only.',
};
const load = async () => { const v = await getSetting<CustomRole[]>('custom_roles'); return Array.isArray(v) ? v : []; };

/** Built-in roles plus the business's own roles (e.g. "Site Supervisor", based on Member, with chosen areas). */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  return ok({ built_in: ROLES.map(r => ({ key: r, label: r[0].toUpperCase() + r.slice(1), description: BUILT_IN[r] })), custom: await load(), areas: AREAS.map(a => ({ key: a.key, label: a.label })), duties: await getDuties(), approval_categories: APPROVAL_CATEGORIES });
});
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const b = await body(req);
  must(String(b.label || '').trim(), 'Name the role');
  if (!ROLES.includes(b.base) || b.base === 'admin') throw new HttpError(400, 'Choose what the role can do (based on a built-in role other than Admin)');
  const list = await load();
  const key = String(b.key || b.label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  if (ROLES.includes(key as any)) throw new HttpError(400, 'That name is a built-in role');
  const known = new Set((await getDuties()).map(d => d.key));
  const role: CustomRole = { key, label: String(b.label).trim().slice(0, 60), base: b.base, areas: cleanAreas(b.areas), description: b.description ? String(b.description).slice(0, 200) : undefined,
    duties: (Array.isArray(b.duties) ? b.duties : []).filter((x: any) => known.has(x)), approves: (Array.isArray(b.approves) ? b.approves : []).filter((x: any) => APPROVAL_CATEGORIES.includes(x)) };
  const next = [...list.filter(r => r.key !== key), role];
  const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: 'custom_roles', value: next, updated_by: actor.id, updated_at: new Date().toISOString() });
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'team.role_saved', metadata: { role } });
  return ok({ role, custom: next }, 201);
});
export const DELETE = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const key = req.nextUrl.searchParams.get('key') || '';
  const db = getSupabaseAdmin();
  const { data: users } = await db.from('profiles').select('id').eq('custom_role', key).limit(1);
  if (users?.length) throw new HttpError(409, 'Some team members still have this role — give them another role first.');
  const next = (await load()).filter(r => r.key !== key);
  const { error } = await db.from('app_settings').upsert({ key: 'custom_roles', value: next, updated_by: actor.id, updated_at: new Date().toISOString() });
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'team.role_deleted', metadata: { key } });
  return ok({ custom: next });
});
