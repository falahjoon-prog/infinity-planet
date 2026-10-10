import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { sendDraft } from '@/lib/email-send';

/** Sends a draft now (branded or classic HTML with the real signature, Cc/Bcc, attachments). Requires explicit confirmation. */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const b = await body(req);
  if (b.confirm !== true) throw new HttpError(400, 'Sending requires explicit confirmation');
  return ok(await sendDraft(id, actor.id));
});
