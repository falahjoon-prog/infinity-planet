import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { mailClient, googleCall, header, inPool } from '@/lib/google';
import { getSupabaseAdmin } from '@/lib/supabase';
import { emailState } from '@/lib/email-state';

/**
 * List/search Gmail messages (q uses Gmail search syntax), each with a clear status:
 * unread · needs_reply · replied · waiting (we wrote last, no answer yet) · draft (reply drafted in the app) · fyi (automated/newsletter/calendar).
 */
const g = globalThis as any;
const THREAD_CACHE: Map<string, { at: number; messages: any[] }> = g.__ipThreadCache || (g.__ipThreadCache = new Map());
/** Forget cached conversations (after starring, archiving, sending…). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function forgetThread(id?: string | null) { if (id) THREAD_CACHE.delete(id); else THREAD_CACHE.clear(); }

export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const sp = req.nextUrl.searchParams;
  const { auth, integration, provider } = await mailClient(actor.id);
  const mailbox = String((integration as any)?.account_email || '').toLowerCase();
  const gmail = google.gmail({ version: 'v1', auth });
  const list = await googleCall(provider, () => gmail.users.messages.list({ userId: 'me', maxResults: Math.min(Number(sp.get('limit') || 25), 50), q: sp.get('q') || 'in:inbox', pageToken: sp.get('pageToken') || undefined }));
  const ids = (list.data.messages || []).map(m => m.id!);
  const H = ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe', 'Auto-Submitted', 'Precedence', 'Content-Type'];
  // One metadata call per conversation (it holds every message, so no separate per-message call), a few at a time, briefly cached.
  const threadIds = [...new Set((list.data.messages || []).map(m => m.threadId!).filter(Boolean))];
  const threads = new Map<string, any[]>();
  const fresh = sp.get('fresh') === '1';
  await inPool(threadIds, 4, async t => {
    const c = THREAD_CACHE.get(t);
    if (!fresh && c && Date.now() - c.at < 45_000) { threads.set(t, c.messages); return; }
    const msgs = await googleCall(provider, () => gmail.users.threads.get({ userId: 'me', id: t, format: 'metadata', metadataHeaders: H })).then(r => r.data.messages || []).catch(() => [] as any[]);
    threads.set(t, msgs); THREAD_CACHE.set(t, { at: Date.now(), messages: msgs });
    if (THREAD_CACHE.size > 600) { const old = [...THREAD_CACHE.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 200); old.forEach(([k]) => THREAD_CACHE.delete(k)); }
  });
  let messages = ids.map(id => { const m = (list.data.messages || []).find(x => x.id === id); return (threads.get(m?.threadId || '') || []).find((x: any) => x.id === id); });
  // Rare: a message missing from its thread result — fetch it on its own
  const missing = ids.filter((id, i) => !messages[i]);
  if (missing.length) { const got = await inPool(missing, 3, id => googleCall(provider, () => gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: H })).then(r => r.data).catch(() => null)); messages = messages.map((m, i) => m || got[missing.indexOf(ids[i])] || null); }
  messages = messages.filter(Boolean);
  const db = getSupabaseAdmin();
  const [{ data: links }, { data: drafts }] = await Promise.all([
    ids.length ? db.from('email_links').select('gmail_message_id,project_id, project:projects(name)').in('gmail_message_id', ids) : Promise.resolve({ data: [] as any[] }),
    threadIds.length ? db.from('email_drafts').select('gmail_thread_id,status').in('gmail_thread_id', threadIds).eq('created_by', actor.id).neq('status', 'sent') : Promise.resolve({ data: [] as any[] }),
  ]);
  return ok({
    nextPageToken: list.data.nextPageToken || null,
    messages: (messages as any[]).map(m => {
      const h = m.payload?.headers;
      const st = emailState({
        labels: m.labelIds || [], from: header(h, 'From'), subject: header(h, 'Subject'), mailbox,
        auto: !!(header(h, 'List-Unsubscribe') || /auto-(generated|replied)/i.test(header(h, 'Auto-Submitted')) || /bulk|list|junk/i.test(header(h, 'Precedence')) || /text\/calendar/i.test(header(h, 'Content-Type'))),
        internalDate: Number(m.internalDate || 0),
        thread: (threads.get(m.threadId!) || []).map((x: any) => ({ labels: x.labelIds || [], from: header(x.payload?.headers, 'From'), internalDate: Number(x.internalDate || 0) })),
        draft: (drafts || []).find((d: any) => d.gmail_thread_id === m.threadId)?.status || null,
      });
      return {
        id: m.id, threadId: m.threadId, snippet: m.snippet, unread: (m.labelIds || []).includes('UNREAD'), labels: m.labelIds || [],
        starred: (m.labelIds || []).includes('STARRED'), important: (m.labelIds || []).includes('IMPORTANT'),
        from: header(h, 'From'), to: header(h, 'To'), subject: header(h, 'Subject'), date: header(h, 'Date'),
        internalDate: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
        state: st.state, state_label: st.label, state_at: st.at, state_by: st.by || null, thread_count: (threads.get(m.threadId!) || []).length,
        projects: (links || []).filter((l: any) => l.gmail_message_id === m.id).map((l: any) => ({ id: l.project_id, name: l.project?.name })),
      };
    }),
  });
});
