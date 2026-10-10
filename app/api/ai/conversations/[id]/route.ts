import { NextRequest } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: conversation } = await db.from('ai_conversations').select('*').eq('id', id).maybeSingle();
  if (!conversation) throw new HttpError(404, 'Conversation not found');
  const { data, error } = await db.from('ai_messages').select('id,role,content,provider,source_ids,metadata,created_at').eq('conversation_id', id).order('created_at');
  if (error) throw error;
  return ok({ conversation, messages: data || [] });
});
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: c } = await db.from('ai_conversations').select('created_by').eq('id', id).maybeSingle();
  if (!c) throw new HttpError(404, 'Conversation not found');
  if (c.created_by !== actor.id && !['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'You can only archive your own conversations');
  await db.from('ai_conversations').update({ archived: true }).eq('id', id);
  return ok({ archived: true });
});
/** Rename or pin a conversation. */
export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const b = await req.json().catch(() => ({}));
  const { data: c } = await db.from('ai_conversations').select('created_by').eq('id', id).maybeSingle();
  if (!c) throw new HttpError(404, 'Conversation not found');
  if (c.created_by !== actor.id && !['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'You can only change your own conversations');
  const patch: Record<string, unknown> = {};
  if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim().slice(0, 120);
  if (typeof b.pinned === 'boolean') patch.pinned = b.pinned;
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change');
  const { data, error } = await db.from('ai_conversations').update(patch).eq('id', id).select('id,title,pinned,updated_at').single();
  if (error) throw error;
  return ok({ conversation: data });
});
