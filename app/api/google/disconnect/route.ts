import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { googleClient } from '@/lib/google';

export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  try { const { auth } = await googleClient(); const t = await auth.getAccessToken(); if (t.token) await auth.revokeToken(t.token); } catch {}
  await getSupabaseAdmin().from('integrations').update({ status: 'disconnected', encrypted_refresh_token: null, updated_at: new Date().toISOString() }).eq('provider', 'google');
  await writeAudit({ actorId: actor.id, action: 'integration.google_disconnected', entityType: 'integration' });
  return ok({ disconnected: true });
});
