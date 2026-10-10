import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { googleOAuth, readState, userProvider } from '@/lib/google';
import { encryptSecret } from '@/lib/crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  // Send the browser back to the address people actually use (RHC_PUBLIC_URL, else the Host header) —
  // never the server's bind address (e.g. 0.0.0.0), which browsers cannot open.
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const base = process.env.RHC_PUBLIC_URL || (host && !host.startsWith('0.0.0.0') ? `${req.headers.get('x-forwarded-proto') || 'http'}://${host}` : 'http://localhost:3300');
  const back = (q: string) => NextResponse.redirect(new URL(`/system?${q}`, base.replace(/\/$/, '') + '/'));
  const err = req.nextUrl.searchParams.get('error');
  if (err) return back(`google=error&message=${encodeURIComponent(err)}`);
  try {
    const { actorId, kind } = readState(req.nextUrl.searchParams.get('state'));
    const code = req.nextUrl.searchParams.get('code');
    if (!code) throw new Error('Authorization code missing');
    const auth = googleOAuth();
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Remove Infinity Planet from your Google account permissions and connect again.');
    auth.setCredentials(tokens);
    let email: string | null = null;
    try { email = (await google.oauth2({ version: 'v2', auth }).userinfo.get()).data.email || null; } catch {}
    const db = getSupabaseAdmin();
    if (kind === 'user') {
      // A member's own mailbox: it must be their own address (admins and directors may connect any account).
      const { data: prof } = await db.from('profiles').select('email,role').eq('id', actorId).maybeSingle();
      const mine = String(prof?.email || '').toLowerCase();
      if (!email) throw new Error('Google did not say which address was used — try again');
      if (!['admin', 'director'].includes(prof?.role) && mine && email.toLowerCase() !== mine) { try { await auth.revokeToken(tokens.access_token || ''); } catch {} throw new Error(`Please sign in with your own work address (${mine}), not ${email}.`); }
      const { error: e1 } = await db.from('integrations').upsert({ provider: userProvider(actorId), account_email: email, scopes: String(tokens.scope || '').split(' ').filter(Boolean), encrypted_refresh_token: encryptSecret(tokens.refresh_token), status: 'connected', metadata: { token_type: tokens.token_type || 'Bearer', kind: 'mailbox' }, connected_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'provider' });
      if (e1) throw e1;
      await writeAudit({ actorId, action: 'integration.mailbox_connected', entityType: 'integration', metadata: { email } });
      return NextResponse.redirect(new URL('/gmail?mailbox=connected', base.replace(/\/$/, '') + '/'));
    }
    const { error } = await db.from('integrations').upsert({ provider: 'google', account_email: email, scopes: String(tokens.scope || '').split(' ').filter(Boolean), encrypted_refresh_token: encryptSecret(tokens.refresh_token), status: 'connected', metadata: { token_type: tokens.token_type || 'Bearer' }, connected_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'provider' });
    if (error) throw error;
    await writeAudit({ actorId, action: 'integration.google_connected', entityType: 'integration', metadata: { email } });
    return back('google=connected');
  } catch (e: any) { return back(`google=error&message=${encodeURIComponent(e?.message || 'Google OAuth failed')}`); }
}
