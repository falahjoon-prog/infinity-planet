import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';
import { writeAudit } from '@/lib/audit';
import { getDuties, cleanDuty, DEFAULT_DUTIES } from '@/lib/duties';
import { AREA_KEYS } from '@/lib/access';
import { APPROVAL_CATEGORIES } from '@/lib/auth';

const own = async () => { const v = await getSetting<any[]>('duty_catalog').catch(() => null); return Array.isArray(v) ? v : []; };
const store = async (list: any[], actorId: string) => { const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: 'duty_catalog', value: list, updated_by: actorId, updated_at: new Date().toISOString() }); if (error) throw error; };

/** The list of duties (who does what): built-in ones plus the business's own. */
export const GET = route(async (req: NextRequest) => { await getActor(req); return ok({ duties: await getDuties() }); });

/** Add or rename a duty (admins and directors). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const d = cleanDuty(await body(req)); if (!d) throw new HttpError(400, 'Name the duty');
  d.areas = d.areas.filter(a => AREA_KEYS.includes(a)); d.approves = (d.approves || []).filter(a => APPROVAL_CATEGORIES.includes(a));
  if (DEFAULT_DUTIES.some(x => x.key === d.key)) delete d.custom;
  const list = (await own()).filter((x: any) => x.key !== d.key); list.push(d);
  await store(list, actor.id);
  await writeAudit({ actorId: actor.id, action: 'team.duty_saved', metadata: { duty: d.label } });
  return ok({ duties: await getDuties() }, 201);
});

/** Remove a duty (a built-in one is hidden). It is taken off anyone who had it. */
export const DELETE = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const key = req.nextUrl.searchParams.get('key') || '';
  let list = (await own()).filter((x: any) => x.key !== key);
  if (DEFAULT_DUTIES.some(x => x.key === key)) list = [...list, { key, hidden: true }];
  await store(list, actor.id);
  const db = getSupabaseAdmin();
  const { data } = await db.from('profiles').select('id,duties').contains('duties', [key]);
  for (const p of data || []) await db.from('profiles').update({ duties: (p.duties || []).filter((x: string) => x !== key) }).eq('id', p.id);
  await writeAudit({ actorId: actor.id, action: 'team.duty_removed', metadata: { key } });
  return ok({ duties: await getDuties() });
});
