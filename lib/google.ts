import { google } from 'googleapis';
import crypto from 'crypto';
import { getSupabaseAdmin } from './supabase';
import { decryptSecret } from './crypto';
import { HttpError } from './http';

export const GOOGLE_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic', // auto-reply (vacation responder) and reading the Gmail signature
  'https://www.googleapis.com/auth/calendar',
];

export function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${(process.env.RHC_PUBLIC_URL || 'http://localhost:3300').replace(/\/$/, '')}/api/google/callback`;
}

export function googleConfigured() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }

export function googleOAuth() {
  if (!googleConfigured()) throw new HttpError(503, 'Google OAuth is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the Infinity Planet server');
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri());
}

function stateSecret() { return process.env.GOOGLE_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
/** Signed OAuth state so only a signed-in admin can attach a Google account. */
export function signState(actorId: string, kind: 'company' | 'user' = 'company') {
  const payload = Buffer.from(JSON.stringify({ a: actorId, k: kind, e: Date.now() + 10 * 60_000, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyState(state: string | null): string {
  if (!state) throw new HttpError(400, 'Missing OAuth state');
  const [payload, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', stateSecret()).update(payload || '').digest('base64url');
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new HttpError(400, 'Invalid OAuth state');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (Date.now() > data.e) throw new HttpError(400, 'OAuth request expired — start the connection again');
  return data.a as string;
}
/** Who started the connection, and whether it is the company account or a member's own mailbox. */
export function readState(state: string | null): { actorId: string; kind: 'company' | 'user' } {
  const actorId = verifyState(state);
  const data = JSON.parse(Buffer.from(String(state).split('.')[0], 'base64url').toString('utf8'));
  return { actorId, kind: data.k === 'user' ? 'user' : 'company' };
}

export async function googleIntegration() {
  const { data } = await getSupabaseAdmin().from('integrations').select('provider,account_email,status,scopes,updated_at,metadata').eq('provider', 'google').maybeSingle();
  return data;
}

export async function googleClient() {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('integrations').select('*').eq('provider', 'google').eq('status', 'connected').maybeSingle();
  if (error || !data?.encrypted_refresh_token) throw new HttpError(409, 'Google Workspace is not connected. An admin can connect it in Settings → Google.');
  const auth = googleOAuth();
  auth.setCredentials({ refresh_token: decryptSecret(data.encrypted_refresh_token) });
  return { auth, db, integration: data };
}

// ------------------------------------------------------------------ each member's own mailbox
/**
 * Every team member connects their own Google account (their @company address) once, in My profile → Email.
 * Their inbox, sending and auto-reply then use only their own mailbox — nobody sees anyone else's.
 * The company Google account (Settings → Google) is still used for Drive and Calendar, and admins/directors can
 * open it as the "shared mailbox". Members' tokens are stored in integrations as provider "google_user:<id>".
 */
export const MAIL_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.settings.basic'];
export const userProvider = (userId: string) => `google_user:${userId}`;
export type MailClient = { auth: InstanceType<typeof google.auth.OAuth2>; integration: any; mailbox: string | null; kind: 'own' | 'shared'; provider: string };
const EXEC = ['admin', 'director'];

export async function ownMailbox(userId: string) {
  const { data } = await getSupabaseAdmin().from('integrations').select('provider,account_email,status,updated_at').eq('provider', userProvider(userId)).maybeSingle();
  return data;
}
/** Admins/directors can switch between their own mailbox and the shared (company) one. */
export async function mailboxChoice(userId: string): Promise<'own' | 'shared' | null> {
  const { data } = await getSupabaseAdmin().from('app_settings').select('value').eq('key', 'mailbox_choice').maybeSingle();
  const v = (data?.value || {})[userId]; return v === 'shared' || v === 'own' ? v : null;
}
export async function setMailboxChoice(userId: string, choice: 'own' | 'shared') {
  const db = getSupabaseAdmin();
  const { data } = await db.from('app_settings').select('value').eq('key', 'mailbox_choice').maybeSingle();
  await db.from('app_settings').upsert({ key: 'mailbox_choice', value: { ...(data?.value || {}), [userId]: choice }, updated_at: new Date().toISOString() });
}

/**
 * The mailbox a person reads and sends from: their own when connected. Admins/directors without their own
 * (or who chose "Shared mailbox") use the company account. Other members must connect their own first.
 */
export async function mailClient(userId: string): Promise<MailClient> {
  const db = getSupabaseAdmin();
  const [{ data: prof }, { data: own }, choice] = await Promise.all([
    db.from('profiles').select('role').eq('id', userId).maybeSingle(),
    db.from('integrations').select('*').eq('provider', userProvider(userId)).eq('status', 'connected').maybeSingle(),
    mailboxChoice(userId),
  ]);
  const exec = EXEC.includes(prof?.role);
  const shared = async (): Promise<MailClient> => { const c = await googleClient(); return { auth: c.auth, integration: c.integration, mailbox: (c.integration as any)?.account_email || null, kind: 'shared', provider: 'google' }; };
  // Chose the shared mailbox but the company Google account isn't connected (yet)? Use their own mailbox instead of failing.
  if (exec && choice === 'shared') { try { return await shared(); } catch (e) { if (!own?.encrypted_refresh_token) throw e; } }
  if (own?.encrypted_refresh_token) {
    const auth = googleOAuth(); auth.setCredentials({ refresh_token: decryptSecret(own.encrypted_refresh_token) });
    return { auth, integration: own, mailbox: own.account_email || null, kind: 'own', provider: own.provider };
  }
  if (exec) return shared();
  throw new HttpError(409, 'Connect your own email first: My profile → Email → “Connect my Google account” (sign in with your own work address). Each person reads and sends only from their own mailbox.');
}

const isRateLimit = (e: any) => {
  const code = Number(e?.code || e?.response?.status || 0);
  const reason = JSON.stringify(e?.response?.data?.error?.errors || e?.errors || '') + ' ' + (e?.message || '');
  return code === 429 || (code === 403 && /rateLimitExceeded|userRateLimitExceeded|quota/i.test(reason)) || /Quota exceeded|rate limit/i.test(reason);
};
/** Runs fn over items with at most n in flight (Gmail allows only short bursts per user). */
export async function inPool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

/** Turn googleapis errors into readable messages and flag revoked tokens. Retries automatically when Google says "slow down". */
/** googleCall(fn) for the company account, or googleCall(provider, fn) for a member's own mailbox (so an expired token is marked on the right connection). */
export async function googleCall<T>(a: string | (() => Promise<T>), b?: () => Promise<T>): Promise<T> {
  const provider = typeof a === 'string' ? a : 'google';
  const fn = (typeof a === 'string' ? b : a) as () => Promise<T>;
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e: any) {
      if (attempt < 3 && isRateLimit(e)) { await new Promise(r => setTimeout(r, 800 * 2 ** attempt + Math.random() * 400)); continue; }
      if (isRateLimit(e)) throw new HttpError(429, 'Gmail is busy right now (Google limits how many requests can be made each minute). Wait a minute, then press Retry.');
      return await googleCallOnce(() => Promise.reject(e), provider);
    }
  }
}
async function googleCallOnce<T>(fn: () => Promise<T>, provider = 'google'): Promise<T> {
  try { return await fn(); }
  catch (e: any) {
    const msg = e?.response?.data?.error_description || e?.response?.data?.error?.message || e?.message || 'Google request failed';
    if (/invalid_grant/i.test(String(e?.response?.data?.error || msg))) {
      await getSupabaseAdmin().from('integrations').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('provider', provider);
      throw new HttpError(409, provider === 'google' ? 'Google access has expired or was revoked. Reconnect Google in Settings → Google.' : 'Your email connection has expired or was revoked. Reconnect it in My profile → Email.');
    }
    if (e instanceof HttpError) throw e;
    throw new HttpError(e?.code && Number(e.code) >= 400 && Number(e.code) < 600 ? Number(e.code) : 502, `Google: ${msg}`);
  }
}

export function header(headers: any[] | undefined, name: string) {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

export function decodeBody(payload: any): { text: string; html: string } {
  let text = '', html = '';
  const walk = (p: any) => {
    if (!p) return;
    const data = p.body?.data ? Buffer.from(p.body.data, 'base64url').toString('utf8') : '';
    if (p.mimeType === 'text/plain' && data && !text) text = data;
    else if (p.mimeType === 'text/html' && data && !html) html = data;
    for (const c of p.parts || []) walk(c);
  };
  walk(payload);
  if (!text && html) text = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  return { text: text.trim(), html };
}

/** The calendar invite (.ics) inside an email: inline text, or the attachment id to fetch. */
export function calendarPart(payload: any): { data?: string; attachmentId?: string } | null {
  let found: { data?: string; attachmentId?: string } | null = null;
  const walk = (p: any) => {
    if (!p || found) return;
    const isCal = /^text\/calendar|^application\/ics/i.test(p.mimeType || '') || /\.ics$/i.test(p.filename || '');
    if (isCal && p.body?.data) found = { data: Buffer.from(p.body.data, 'base64url').toString('utf8') };
    else if (isCal && p.body?.attachmentId) found = { attachmentId: p.body.attachmentId };
    for (const c of p.parts || []) walk(c);
  };
  walk(payload);
  return found;
}

/** RFC 2047 encode a header value if it has non-ASCII characters. */
export function encodeHeader(v: string) {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`;
}
export function cleanAddressList(v: string) {
  const list = v.split(/[,;]/).map(x => x.trim()).filter(Boolean);
  for (const a of list) if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(a.replace(/^.*<([^>]+)>$/, '$1'))) throw new HttpError(400, `Invalid email address: ${a}`);
  if (/[\r\n]/.test(v)) throw new HttpError(400, 'Invalid characters in address');
  return list.join(', ');
}
