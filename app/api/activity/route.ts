import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('audit_events').select('id,action,entity_type,entity_id,metadata,created_at, actor:profiles!audit_events_actor_id_fkey(full_name)').order('created_at', { ascending: false }).limit(Math.min(Number(sp.get('limit') || 50), 200));
  if (sp.get('entity_id')) q = q.eq('entity_id', sp.get('entity_id')!);
  if (sp.get('entity_type')) q = q.eq('entity_type', sp.get('entity_type')!);
  if (sp.get('before')) q = q.lt('created_at', sp.get('before')!);
  const { data, error } = await q;
  if (error) throw error;
  return ok({ events: data || [] });
});
