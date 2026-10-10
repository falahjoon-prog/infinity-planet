import { NextRequest } from 'next/server';
import { route, ok, body, must, pick } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const { data, error } = await getSupabaseAdmin().from('counterparties').select('*, contacts(id,full_name,email,phone,position)').order('name');
  if (error) throw error;
  return ok({ counterparties: data || [] });
});
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req); must(b.name, 'Name is required');
  const { data, error } = await getSupabaseAdmin().from('counterparties').insert({ ...pick(b, ['name', 'kind', 'abn', 'website', 'notes']), created_by: actor.id }).select().single();
  if (error) throw error;
  return ok({ counterparty: data }, 201);
});
