import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Chat history: your conversations (pinned first, newest next). ?q= searches titles and message text. */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const sp = req.nextUrl.searchParams;
  const db = getSupabaseAdmin();
  let q = db.from('ai_conversations').select('id,title,provider,project_id,created_by,updated_at,pinned, project:projects(name)').eq('archived', false).order('pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(Math.min(Number(sp.get('limit')) || 100, 300));
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  if (sp.get('mine') !== '0') q = q.eq('created_by', actor.id);
  const text = (sp.get('q') || '').trim();
  if (text) {
    const like = `%${text.replace(/[%_]/g, m => `\\${m}`)}%`;
    const { data: hits } = await db.from('ai_messages').select('conversation_id').ilike('content', like).limit(300);
    const ids = [...new Set((hits || []).map(h => h.conversation_id))];
    q = ids.length ? q.or(`title.ilike.${like.replace(/,/g, '')},id.in.(${ids.join(',')})`) : q.ilike('title', like);
  }
  const { data, error } = await q;
  if (error) throw error;
  return ok({ conversations: data || [] });
});
