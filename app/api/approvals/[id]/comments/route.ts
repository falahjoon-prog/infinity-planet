import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const text = must<string>(String((await body(req)).body || '').trim(), 'Comment is empty');
  const { data, error } = await getSupabaseAdmin().from('approval_comments').insert({ approval_id: id, author_id: actor.id, body: text }).select().single();
  if (error) throw error;
  return ok({ comment: { ...data, author: { full_name: actor.full_name } } }, 201);
});
