import { NextRequest } from 'next/server';
import { route, ok, body, must, pick } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { cleanAddressList } from '@/lib/google';
import { writeAudit } from '@/lib/audit';
import { migrationHint } from '@/lib/email-send';

export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('email_drafts').select('*, project:projects(name), author:profiles!email_drafts_created_by_fkey(full_name)').eq('created_by', actor.id).order('updated_at', { ascending: false }).limit(200); // each person sees only their own email
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  const { data, error } = await q; if (error) throw error;
  return ok({ drafts: data || [] });
});
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.to_addresses, 'Recipient is required'); must(b.subject, 'Subject is required'); must(b.body || b.allow_empty, 'Message body is required');
  if (!b.body) b.body = ' ';
  const row = pick(b, ['project_id', 'deal_id', 'in_reply_to', 'gmail_thread_id', 'subject', 'body', 'engine']);
  const extra: Record<string, unknown> = {};
  if (b.bcc_addresses) extra.bcc_addresses = cleanAddressList(b.bcc_addresses);
  if (b.forward_of) extra.forward_of = String(b.forward_of).slice(0, 200);
  const { data, error } = await getSupabaseAdmin().from('email_drafts').insert({ ...row, ...extra, to_addresses: cleanAddressList(b.to_addresses), cc_addresses: b.cc_addresses ? cleanAddressList(b.cc_addresses) : null, status: 'draft', created_by: actor.id }).select().single();
  if (error) throw migrationHint(error);
  await writeAudit({ actorId: actor.id, action: 'email.draft_created', entityType: 'email_draft', entityId: data.id, metadata: { subject: data.subject } });
  return ok({ draft: data }, 201);
});
