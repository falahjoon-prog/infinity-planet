import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { googleOAuth, googleConfigured, googleIntegration, MAIL_SCOPES, signState, ownMailbox, mailboxChoice, setMailboxChoice, userProvider } from '@/lib/google';
import { decryptSecret } from '@/lib/crypto';
export const dynamic = 'force-dynamic';

const EXEC = ['admin', 'director'];

/** My own mailbox: whether it is connected, which address, and (admins/directors) whether they are looking at the shared mailbox. */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const [own, company, choice] = await Promise.all([ownMailbox(actor.id), googleIntegration(), mailboxChoice(actor.id)]);
  const ownOk = own?.status === 'connected';
  const exec = EXEC.includes(actor.role);
  const sharedOk = exec && company?.status === 'connected';
  const using = exec && choice === 'shared' && sharedOk ? 'shared' : ownOk ? 'own' : sharedOk ? 'shared' : null;
  return ok({
    configured: googleConfigured(),
    own: own ? { email: own.account_email, status: own.status, since: own.updated_at } : null,
    shared: exec ? { email: company?.account_email || null, connected: company?.status === 'connected' } : null,
    can_shared: exec, using, mailbox: using === 'own' ? own?.account_email : using === 'shared' ? company?.account_email : null,
  });
});

/** Start connecting my own Google account (only the email permissions — not Drive or Calendar). */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const url = googleOAuth().generateAuthUrl({ access_type: 'offline', prompt: 'consent select_account', scope: MAIL_SCOPES, state: signState(actor.id, 'user'), login_hint: actor.email || undefined });
  return ok({ url });
});

/** Admins/directors: switch between "My mailbox" and the shared company mailbox. */
export const PATCH = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  if (!EXEC.includes(actor.role)) throw new HttpError(403, 'Only admins and directors can open the shared mailbox');
  if (b.choice !== 'own' && b.choice !== 'shared') throw new HttpError(400, 'Choose own or shared');
  if (b.choice === 'own' && (await ownMailbox(actor.id))?.status !== 'connected') throw new HttpError(409, 'Connect your own Google account first (My profile → Email)');
  await setMailboxChoice(actor.id, b.choice);
  return ok({ choice: b.choice });
});

/** Disconnect my own mailbox (revokes the app's access to it). */
export const DELETE = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const db = getSupabaseAdmin();
  const { data } = await db.from('integrations').select('encrypted_refresh_token').eq('provider', userProvider(actor.id)).maybeSingle();
  if (data?.encrypted_refresh_token) { try { const auth = googleOAuth(); await auth.revokeToken(decryptSecret(data.encrypted_refresh_token)); } catch {} }
  await db.from('integrations').update({ status: 'disconnected', encrypted_refresh_token: null, updated_at: new Date().toISOString() }).eq('provider', userProvider(actor.id));
  await writeAudit({ actorId: actor.id, action: 'integration.mailbox_disconnected', entityType: 'integration' });
  return ok({ disconnected: true });
});
