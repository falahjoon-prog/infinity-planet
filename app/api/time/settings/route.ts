import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { getTimeApproval } from '@/lib/time';

/** Who approves time that needs checking, and signs off weekly hours: each member's manager (company structure), the HR person, or one chosen person. */
export const GET = route(async (req: NextRequest) => { await getActor(req); return ok({ approval: await getTimeApproval() }); });
export const PATCH = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const b = await body(req);
  if (!['manager', 'hr', 'person'].includes(b.mode)) throw new HttpError(400, 'Choose manager, HR or a person');
  if (b.mode === 'person' && !(typeof b.person_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.person_id))) throw new HttpError(400, 'Choose the person who approves');
  const value = { mode: b.mode, person_id: b.mode === 'person' ? b.person_id : null };
  const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: 'time_approval', value, updated_by: actor.id, updated_at: new Date().toISOString() }); if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'settings.time_approval', metadata: value });
  return ok({ approval: value });
});
