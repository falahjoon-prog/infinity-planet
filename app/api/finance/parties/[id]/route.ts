import { NextRequest } from 'next/server';
import { route, ok, body, pick } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const PATCH = route(async (req: NextRequest, { params }) => {
  await getActor(req); const { id } = await params; const b = pick(await body(req), ['name', 'kind', 'abn', 'email', 'phone', 'notes', 'active']);
  const { data, error } = await getSupabaseAdmin().from('finance_parties').update({ ...b, updated_at: new Date().toISOString() }).eq('id', id).select().single(); if (error) throw error;
  if (b.name) await getSupabaseAdmin().from('finance_entries').update({ party_name: b.name }).eq('party_id', id);
  return ok({ party: data });
});
export const DELETE = route(async (req: NextRequest, { params }) => {
  await getActor(req); const { id } = await params;
  const { error } = await getSupabaseAdmin().from('finance_parties').delete().eq('id', id); if (error) throw error;
  return ok({ ok: true });
});
