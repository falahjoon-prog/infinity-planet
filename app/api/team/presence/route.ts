import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Heartbeat from the signed-in user. */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  const status = ['online', 'away', 'busy', 'offline'].includes(b.status) ? b.status : 'online';
  const { error } = await getSupabaseAdmin().from('team_presence').upsert({ user_id: actor.id, status, last_seen: new Date().toISOString() });
  if (error) throw error;
  return ok({ status });
});
