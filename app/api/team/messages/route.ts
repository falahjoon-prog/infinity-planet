import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireWriter, Actor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { BUCKET, ensureBucket, safeName } from '@/lib/documents';
import { signFileLink } from '@/lib/file-links';
import { runAgent } from '@/lib/agent';
import { AI_NAME } from '@/lib/brand';
import { readAttachments } from '@/lib/attachments';
export const maxDuration = 300;

const SELECT = 'id,channel,body,project_id,created_at,edited_at,sender_id,attachments,is_bot,bot_meta,sender:profiles!team_messages_sender_id_fkey(full_name,email)';
const MAX_FILE = 50 * 1024 * 1024;
const BOT_RE = /(^|\s)@(ai|infinity|bot)\b/i;
const BOT_CHANNEL = 'ai-assistant';

function withLinks(rows: any[]) {
  return rows.map(r => ({ ...r, attachments: (Array.isArray(r.attachments) ? r.attachments : []).map((a: any) => ({ ...a, url: signFileLink({ k: 'storage', p: a.path, n: a.name, m: a.mime }), download: signFileLink({ k: 'storage', p: a.path, n: a.name, m: a.mime, dl: 1 }) })) }));
}

/** Messages for a channel. ?after=ISO for new messages, ?before=ISO for older history, ?q= to search the channel. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  const channel = sp.get('channel') || 'general';
  const limit = Math.min(Number(sp.get('limit')) || 60, 200);
  let q = getSupabaseAdmin().from('team_messages').select(SELECT).eq('channel', channel).order('created_at', { ascending: false }).limit(limit);
  if (sp.get('after')) q = q.gt('created_at', sp.get('after')!);
  if (sp.get('before')) q = q.lt('created_at', sp.get('before')!);
  if (sp.get('q')) q = q.ilike('body', `%${sp.get('q')!.replace(/[%_]/g, m => `\\${m}`)}%`);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []).reverse();
  return ok({ messages: withLinks(rows), has_more: (data || []).length === limit });
});

/** Post a message (JSON, or multipart with files). Mention @ai — or post in "Ask Infinity AI" — to have the bot answer and act. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const db = getSupabaseAdmin();
  let text = ''; let channel = 'general'; let files: File[] = [];
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const fd = await req.formData();
    text = String(fd.get('body') || ''); channel = String(fd.get('channel') || 'general');
    files = fd.getAll('file').filter((f): f is File => typeof f !== 'string');
  } else { const b = await body(req); text = String(b.body || ''); channel = String(b.channel || 'general'); }
  text = text.trim();
  if (!text && !files.length) throw new HttpError(400, 'Message is empty');
  if (text.length > 8000) throw new HttpError(400, 'Message is too long');
  if (files.length > 10) throw new HttpError(400, 'Attach up to 10 files at a time');
  const { data: ch } = await db.from('team_channels').select('slug,project_id').eq('slug', channel).maybeSingle();
  if (!ch) throw new HttpError(404, 'Channel not found');

  const attachments: any[] = [];
  if (files.length) {
    await ensureBucket();
    for (const f of files) {
      if (f.size > MAX_FILE) throw new HttpError(400, `${f.name} is larger than 50 MB`);
      const path = `team/${channel}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safeName(f.name)}`;
      const up = await db.storage.from(BUCKET).upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type || 'application/octet-stream', upsert: false });
      if (up.error) throw new HttpError(500, `Upload failed for ${f.name}: ${up.error.message}`);
      attachments.push({ path, name: f.name, mime: f.type || 'application/octet-stream', size: f.size });
    }
  }
  const { data, error } = await db.from('team_messages').insert({ channel, body: text, project_id: ch.project_id || null, sender_id: actor.id, attachments }).select(SELECT).single();
  if (error) throw error;
  await db.from('team_presence').upsert({ user_id: actor.id, status: 'online', last_seen: new Date().toISOString() });

  const botWanted = !!text && (channel === BOT_CHANNEL || BOT_RE.test(text));
  if (botWanted) {
    const job = botReply(actor, text, channel, ch.project_id || null, data.id, attachments);
    if (req.nextUrl.searchParams.get('wait') === '1') await job; else job.catch(() => {});
  }
  return ok({ message: withLinks([data])[0], bot: botWanted }, 201);
});

async function botReply(actor: Actor, text: string, channel: string, projectId: string | null, replyTo: string, files: any[] = []) {
  const db = getSupabaseAdmin();
  try {
    const { data: recent } = await db.from('team_messages').select('body,is_bot,created_at, sender:profiles!team_messages_sender_id_fkey(full_name)').eq('channel', channel).lt('created_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(12);
    const ctxText = (recent || []).reverse().slice(0, -1).map((m: any) => `${m.is_bot ? AI_NAME : m.sender?.full_name || 'Member'}: ${String(m.body || '').slice(0, 300)}`).join('\n');
    const history = channel === BOT_CHANNEL ? (recent || []).reverse().slice(-9, -1).filter((m: any) => m.body).map((m: any) => ({ role: m.is_bot ? 'assistant' as const : 'user' as const, content: String(m.body).slice(0, 1500) })) : [];
    const attachments = files.length ? await readAttachments(files) : [];
    const r = await runAgent({ actor, text, projectId, history, attachments, channelContext: channel === BOT_CHANNEL ? undefined : ctxText });
    const reply = `${r.note ? `_${r.note}_\n\n` : ''}${r.reply}`;
    await db.from('team_messages').insert({ channel, body: reply.slice(0, 8000), project_id: projectId, sender_id: null, is_bot: true, bot_meta: { engine: r.engine, actions: r.actions, citations: r.citations || [], reply_to: replyTo, for: actor.id } });
  } catch (e: any) {
    await db.from('team_messages').insert({ channel, body: `⚠️ I couldn't complete that: ${e?.message || 'unexpected error'}`, project_id: projectId, sender_id: null, is_bot: true, bot_meta: { error: true, reply_to: replyTo, for: actor.id } });
  }
}
