import crypto from 'crypto';
const alg = 'aes-256-gcm';
// The key is pasted into settings by hand (PC .env.local, Render): stray spaces or a Windows line ending around it are ignored.
function rawKey() { return (process.env.GOOGLE_ENCRYPTION_KEY || '').replace(/^\s+|\s+$/g, '').replace(/^["']|["']$/g, ''); }
function key(raw = rawKey()) {
  if (raw.length < 32) throw new Error('GOOGLE_ENCRYPTION_KEY must be set to a random secret of at least 32 characters');
  return crypto.createHash('sha256').update(raw).digest();
}
/** Keys to try when reading: the cleaned key first, then the value exactly as set (older saves), then with a Windows line ending. */
function readKeys() { const raw = process.env.GOOGLE_ENCRYPTION_KEY || ''; return [...new Set([rawKey(), raw, `${rawKey()}\r`])].filter(k => k.length >= 32); }
export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv(alg, key(), iv);
  const enc = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return [iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}
export function decryptSecret(value: string) {
  const [iv, tag, data] = value.split('.');
  const keys = readKeys(); if (!keys.length) key(); // throws the "must be set" message
  for (const k of keys) {
    try { const d = crypto.createDecipheriv(alg, key(k), Buffer.from(iv, 'base64url')); d.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8'); }
    catch { /* try the next form of the key */ }
  }
  throw new Error('This connection was saved with a different GOOGLE_ENCRYPTION_KEY than this server has. The PC and the online server must use exactly the same key (copy it again from .env.local into Render → Environment), or connect the account again.');
}
