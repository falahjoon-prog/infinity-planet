import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { migrationHint } from '@/lib/email-send';

/** Schedule an email to be sent later ({ at: ISO time }). The server sends it within a minute of that time. */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const at = new Date(String(b.at || ''));
  if (isNaN(at.getTime())) throw new HttpError(400, 'Choose a valid date and time');
  if (at.getTime() < Date.now() - 60_000) throw new HttpError(400, 'Choose a time in the future');
  if (at.getTime() > Date.now() + 366 * 86400_000) throw new HttpError(400, 'Schedule within the next 12 months');
  const db = getSupabaseAdmin();
  const { data: d, error: e0 } = await db.from('email_drafts').select('status').eq('id', id).maybeSingle();
  if (e0) throw migrationHint(e0);
  if (!d) throw new HttpError(404, 'Draft not found');
  if (d.status === 'sent') throw new HttpError(409, 'Already sent');
  const { data, error } = await db.from('email_drafts').update({ scheduled_at: at.toISOString(), scheduled_by: actor.id, error: null, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw migrationHint(error);
  await writeAudit({ actorId: actor.id, action: 'email.scheduled', entityType: 'email_draft', entityId: id, metadata: { at: at.toISOString() } });
  return ok({ draft: data });
});
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('email_drafts').update({ scheduled_at: null, scheduled_by: null }).eq('id', id).neq('status', 'sent');
  if (error) throw migrationHint(error);
  await writeAudit({ actorId: actor.id, action: 'email.schedule_cancelled', entityType: 'email_draft', entityId: id });
  return ok({ cancelled: true });
});
