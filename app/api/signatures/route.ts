import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { listSignatures, saveSignature, removeSignature } from '@/lib/signatures';
import { writeAudit } from '@/lib/audit';

/** My signatures (handwritten, typed, initials, stamp) and the company stamp. */
export const GET = route(async (req: NextRequest) => { const actor = await getActor(req); return ok({ signatures: await listSignatures(actor.id) }); });
/** Save one: { kind: signature|typed|initials|stamp, image: data URL, company?: true (admins: company stamp) } */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  const company = b.company === true;
  if (company && !['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only an admin or director can set the company stamp');
  await saveSignature(company ? 'company' : actor.id, String(b.kind), String(b.image || ''));
  await writeAudit({ actorId: actor.id, action: 'signature.saved', metadata: { kind: b.kind, company } });
  return ok({ signatures: await listSignatures(actor.id) }, 201);
});
export const DELETE = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const kind = req.nextUrl.searchParams.get('kind') || ''; const company = req.nextUrl.searchParams.get('company') === '1';
  if (company && !['admin', 'director'].includes(actor.role)) throw new HttpError(403, 'Only an admin or director can remove the company stamp');
  await removeSignature(company ? 'company' : actor.id, kind);
  return ok({ signatures: await listSignatures(actor.id) });
});
