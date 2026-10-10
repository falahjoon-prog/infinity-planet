import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireRole } from '@/lib/auth';
import { getOrg, saveOrg, routeFor } from '@/lib/org';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

/** The company structure (positions, who holds them, who reports to whom) used to route approvals. */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const org = await getOrg();
  const sp = req.nextUrl.searchParams; const to = (sp.get('preview_to') || '').split(',').filter(Boolean);
  let preview = null;
  if (to.length) { const { data } = await getSupabaseAdmin().from('profiles').select('id,full_name,email'); const names = Object.fromEntries((data || []).map((p: any) => [p.id, p.full_name || p.email])); preview = routeFor(org, actor.id, to, names); }
  return ok({ org, preview });
});

export const PATCH = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const b = await body(req);
  if (!Array.isArray(b.positions) || !b.positions.length) throw new HttpError(400, 'Add at least one position');
  const org = await saveOrg({ positions: b.positions, routing: b.routing === 'copy' ? 'copy' : 'through' }, actor.id);
  await writeAudit({ actorId: actor.id, action: 'settings.org_chart', metadata: { positions: org.positions.length, routing: org.routing } });
  return ok({ org: { ...org, saved: true } });
});
