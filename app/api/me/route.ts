import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { getActor, APPROVAL_CATEGORIES, canApprove } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const approves = APPROVAL_CATEGORIES.filter(c => canApprove(actor, c));
  const extra = await getSupabaseAdmin().from('profiles').select('color,language,title').eq('id', actor.id).maybeSingle();
  return ok({ user: { ...actor, ...(extra.error ? {} : extra.data || {}) }, can: { write: actor.role !== 'viewer', admin: ['admin', 'director'].includes(actor.role), approve: approves } });
});

export const PATCH = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  const patch = pick(b, ['full_name', 'title', 'avatar_url', 'color', 'language']);
  if (patch.color && !/^#[0-9a-f]{6}$/i.test(String(patch.color))) delete patch.color;
  if (patch.language && !['en', 'fa'].includes(String(patch.language))) delete patch.language;
  const { data, error } = await getSupabaseAdmin().from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', actor.id).select('*').single();
  if (error && /color|language/.test(error.message)) throw new HttpError(409, 'Saving your colour and language needs the 4.3 database update: run supabase/migrations/006_email_options_4_3.sql in Supabase → SQL Editor, then try again.');
  if (error) throw error;
  return ok({ user: data });
});
