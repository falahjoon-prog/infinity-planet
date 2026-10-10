import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { mailClient } from '@/lib/google';
import { writeAudit } from '@/lib/audit';

const scopeHelp = 'Google needs one extra permission for auto-reply. Reconnect your email in My profile → Email (it asks once), then try again.';
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e: any) {
    const msg = e?.response?.data?.error?.message || e?.message || '';
    if (e?.code === 403 || /insufficient|scope|permission/i.test(msg)) throw new HttpError(403, scopeHelp);
    throw new HttpError(502, `Google: ${msg || 'request failed'}`);
  }
}

/** Gmail auto-reply (vacation responder) for the person's own mailbox. */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const { auth, provider } = await mailClient(actor.id);
  const gmail = google.gmail({ version: 'v1', auth });
  const r = await call(() => gmail.users.settings.getVacation({ userId: 'me' }));
  return ok({ vacation: r.data });
});
export const PATCH = route(async (req: NextRequest) => {
  const actor = await requireWriter(req); // everyone sets their own mailbox's auto-reply
  const b = await body(req);
  const start = b.start ? new Date(b.start).getTime() : undefined;
  const end = b.end ? new Date(b.end).getTime() : undefined;
  if (start && end && end <= start) throw new HttpError(400, 'The end date must be after the start date');
  const { auth, provider } = await mailClient(actor.id);
  const gmail = google.gmail({ version: 'v1', auth });
  const requestBody = {
    enableAutoReply: !!b.enabled, responseSubject: String(b.subject || '').slice(0, 200), responseBodyHtml: String(b.html || '').slice(0, 20_000) || undefined,
    responseBodyPlainText: String(b.text || '').slice(0, 20_000), restrictToContacts: !!b.contacts_only, restrictToDomain: !!b.domain_only,
    startTime: start ? String(start) : undefined, endTime: end ? String(end) : undefined,
  };
  const r = await call(() => gmail.users.settings.updateVacation({ userId: 'me', requestBody }));
  await writeAudit({ actorId: actor.id, action: b.enabled ? 'email.autoreply_on' : 'email.autoreply_off', metadata: { subject: requestBody.responseSubject } });
  return ok({ vacation: r.data });
});
