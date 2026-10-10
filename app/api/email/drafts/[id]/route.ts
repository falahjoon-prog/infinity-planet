import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { cleanAddressList } from '@/lib/google';
import { migrationHint } from '@/lib/email-send';

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const patch = pick(b, ['subject', 'body', 'project_id', 'deal_id']);
  if (b.to_addresses) patch.to_addresses = cleanAddressList(b.to_addresses);
  if ('cc_addresses' in b) patch.cc_addresses = b.cc_addresses ? cleanAddressList(b.cc_addresses) : null;
  if ('bcc_addresses' in b) patch.bcc_addresses = b.bcc_addresses ? cleanAddressList(b.bcc_addresses) : null;
  const db = getSupabaseAdmin();
  const { data: cur } = await db.from('email_drafts').select('status,scheduled_at,created_by').eq('id', id).single();
  if (cur?.created_by && cur.created_by !== actor.id) throw new HttpError(403, 'This is someone else\'s email — only they can change it');
  if (cur?.status === 'sent') throw new HttpError(409, 'This email has already been sent');
  // Emails need no approval. Editing a scheduled email cancels the schedule (schedule it again after the change).
  const { data, error } = await db.from('email_drafts').update({ ...patch, ...(['approved', 'awaiting_approval', 'changes_requested', 'rejected'].includes(cur?.status) ? { status: 'draft' } : {}), ...(cur?.scheduled_at ? { scheduled_at: null } : {}), updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw migrationHint(error);
  return ok({ draft: data });
});
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  await getSupabaseAdmin().from('email_drafts').delete().eq('id', id).eq('created_by', actor.id).neq('status', 'sent');
  return ok({ deleted: true });
});
