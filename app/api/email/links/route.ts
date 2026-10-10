import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('email_links').select('*, project:projects(name)').order('sent_at', { ascending: false, nullsFirst: false }).limit(200);
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  if (sp.get('thread_id')) q = q.eq('gmail_thread_id', sp.get('thread_id')!);
  const { data, error } = await q; if (error) throw error;
  return ok({ links: data || [] });
});
/** Link a Gmail message to a project/deal. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.gmail_message_id, 'gmail_message_id is required'); must(b.project_id || b.deal_id, 'Choose a project or deal');
  let sent: string | null = null; try { sent = b.date ? new Date(b.date).toISOString() : null; } catch {}
  const { data, error } = await getSupabaseAdmin().from('email_links').upsert({ gmail_message_id: b.gmail_message_id, gmail_thread_id: b.thread_id || null, project_id: b.project_id || null, deal_id: b.deal_id || null, subject: b.subject || null, from_address: b.from || null, snippet: b.snippet || null, sent_at: sent, linked_by: actor.id }, { onConflict: 'gmail_message_id,project_id' }).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'email.linked', entityType: 'project', entityId: b.project_id || null, metadata: { subject: b.subject } });
  return ok({ link: data }, 201);
});
export const DELETE = route(async (req: NextRequest) => {
  await requireWriter(req);
  const id = req.nextUrl.searchParams.get('id'); must(id, 'id required');
  await getSupabaseAdmin().from('email_links').delete().eq('id', id!);
  return ok({ deleted: true });
});
