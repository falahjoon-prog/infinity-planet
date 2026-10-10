import crypto from 'crypto';
const alg = 'aes-256-gcm';
function key() {
  const raw = process.env.GOOGLE_ENCRYPTION_KEY || '';
  if (raw.length < 32) throw new Error('GOOGLE_ENCRYPTION_KEY must be set to a random secret of at least 32 characters');
  return crypto.createHash('sha256').update(raw).digest();
}
export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv(alg, key(), iv);
  const enc = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return [iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}
export function decryptSecret(value: string) {
  const [iv, tag, data] = value.split('.');
  const d = crypto.createDecipheriv(alg, key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}
