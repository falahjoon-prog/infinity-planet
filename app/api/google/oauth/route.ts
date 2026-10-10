import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { googleOAuth, GOOGLE_SCOPES, signState } from '@/lib/google';

/** Admin starts the Google Workspace connection; returns the consent URL. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const url = googleOAuth().generateAuthUrl({ access_type: 'offline', prompt: 'consent', include_granted_scopes: true, scope: GOOGLE_SCOPES, state: signState(actor.id) });
  return ok({ url });
});
