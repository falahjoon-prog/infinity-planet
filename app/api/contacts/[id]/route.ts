import { NextRequest } from 'next/server';
import { route, ok, body, pick } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const PATCH = route(async (req: NextRequest, { params }) => {
  await requireWriter(req); const { id } = await params;
  const { data, error } = await getSupabaseAdmin().from('contacts').update({ ...pick(await body(req), ['counterparty_id', 'project_id', 'full_name', 'position', 'email', 'phone', 'notes']), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error; return ok({ contact: data });
});
export const DELETE = route(async (req: NextRequest, { params }) => {
  await requireWriter(req); const { id } = await params;
  const { error } = await getSupabaseAdmin().from('contacts').delete().eq('id', id);
  if (error) throw error; return ok({ deleted: true });
});
