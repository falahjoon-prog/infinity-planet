import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { mailClient, googleCall } from '@/lib/google';

const ACTIONS: Record<string, { add?: string[]; remove?: string[] }> = {
  read: { remove: ['UNREAD'] }, unread: { add: ['UNREAD'] }, star: { add: ['STARRED'] }, unstar: { remove: ['STARRED'] },
  important: { add: ['IMPORTANT'] }, unimportant: { remove: ['IMPORTANT'] }, archive: { remove: ['INBOX'] }, inbox: { add: ['INBOX'] },
};
/** Inbox actions on a message: read / unread / star / unstar / important / archive / inbox / trash / untrash (trash is recoverable for 30 days in Gmail). */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  const action = String(b.action || '');
  const { auth, provider } = await mailClient(actor.id);
  const gmail = google.gmail({ version: 'v1', auth });
  if (action === 'trash') { await googleCall(provider, () => gmail.users.messages.trash({ userId: 'me', id })); return ok({ done: true }); }
  if (action === 'untrash') { await googleCall(provider, () => gmail.users.messages.untrash({ userId: 'me', id })); return ok({ done: true }); }
  const a = ACTIONS[action];
  if (!a) throw new HttpError(400, 'Unknown action');
  const r = await googleCall(provider, () => gmail.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds: a.add, removeLabelIds: a.remove } }));
  return ok({ done: true, labels: r.data.labelIds || [] });
});
