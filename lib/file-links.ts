import crypto from 'crypto';

/**
 * Short-lived signed links for files, so <img>, <iframe> and downloads work
 * without the browser sending a sign-in token. Signed with a server-only secret.
 */
export type FileLink = { k: 'storage' | 'drive' | 'dthumb'; p: string; n: string; m?: string; dl?: 1; e: number };

const secret = () => {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.GOOGLE_ENCRYPTION_KEY;
  if (!s) throw new Error('Server secret is not configured');
  return crypto.createHash('sha256').update(`infinity-file-links:${s}`).digest();
};
const b64 = (b: Buffer) => b.toString('base64url');

export function signFileLink(l: Omit<FileLink, 'e'>, ttlSeconds = 3600): string {
  const payload: FileLink = { ...l, e: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  return `/api/files/${body}.${sig}`;
}

export function verifyFileLink(token: string): FileLink | null {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const l = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as FileLink;
    if (!l.e || l.e < Math.floor(Date.now() / 1000)) return null;
    return l;
  } catch { return null; }
}

export function contentDisposition(name: string, download: boolean) {
  const ascii = name.replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '_');
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
