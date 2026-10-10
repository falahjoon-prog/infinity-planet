import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { route, ok, body, must, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';

type Snippet = { id: string; name: string; body: string; by?: string; at?: string };
const load = async () => { const v = await getSetting<Snippet[]>('email_snippets'); return Array.isArray(v) ? v : []; };
const save = async (list: Snippet[], by: string) => { const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: 'email_snippets', value: list, updated_by: by, updated_at: new Date().toISOString() }); if (error) throw error; };

/** Saved replies shared by the team (insert into any email in one click). */
export const GET = route(async (req: NextRequest) => { await getActor(req); return ok({ snippets: await load() }); });
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(String(b.name || '').trim(), 'Give the saved reply a name'); must(String(b.body || '').trim(), 'The saved reply is empty');
  const list = await load();
  if (list.length >= 200) throw new HttpError(400, 'You have 200 saved replies — delete some first');
  const s: Snippet = { id: crypto.randomUUID(), name: String(b.name).trim().slice(0, 80), body: String(b.body).slice(0, 10_000), by: actor.id, at: new Date().toISOString() };
  await save([...list, s], actor.id);
  return ok({ snippet: s }, 201);
});
export const DELETE = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const id = req.nextUrl.searchParams.get('id');
  await save((await load()).filter(s => s.id !== id), actor.id);
  return ok({ deleted: true });
});
