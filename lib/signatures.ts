/**
 * Saved signatures: each person's handwritten signature, typed (digital) signature, initials and personal stamp,
 * plus the company stamp (admins). Stored as transparent PNGs in private storage.
 */
import { getSupabaseAdmin } from './supabase';
import { BUCKET, ensureBucket } from './documents';
import { HttpError } from './http';
import { signFileLink } from './file-links';

export const SIG_KINDS = ['signature', 'typed', 'initials', 'stamp'] as const;
export type SigKind = typeof SIG_KINDS[number];
const pathFor = (owner: string, kind: string) => `signatures/${owner}/${kind}.png`;

export function decodePng(dataUrl: string): Buffer {
  const m = String(dataUrl || '').match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(400, 'The signature must be a PNG or JPEG image');
  const b = Buffer.from(m[2], 'base64');
  if (b.length > 2 * 1024 * 1024) throw new HttpError(413, 'The signature image is larger than 2 MB');
  return b;
}

export async function saveSignature(owner: string, kind: string, dataUrl: string) {
  if (!(SIG_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, 'Unknown signature type');
  const bytes = decodePng(dataUrl);
  await ensureBucket();
  const mime = dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
  const { error } = await getSupabaseAdmin().storage.from(BUCKET).upload(pathFor(owner, kind), bytes, { contentType: mime, upsert: true });
  if (error) throw new HttpError(500, error.message);
}
export async function removeSignature(owner: string, kind: string) {
  await getSupabaseAdmin().storage.from(BUCKET).remove([pathFor(owner, kind)]);
}
/** The person's saved signatures (and the company stamp) with short-lived image links. */
export async function listSignatures(userId: string) {
  const db = getSupabaseAdmin();
  const out: { owner: 'me' | 'company'; kind: string; url: string; updated_at?: string }[] = [];
  for (const [owner, key] of [['me', userId], ['company', 'company']] as const) {
    const { data } = await db.storage.from(BUCKET).list(`signatures/${key}`, { limit: 20 });
    for (const f of data || []) {
      const kind = f.name.replace(/\.png$/, '');
      if (!(SIG_KINDS as readonly string[]).includes(kind)) continue;
      out.push({ owner, kind, url: signFileLink({ k: 'storage', p: pathFor(key, kind), n: f.name, m: 'image/png' }) + `?v=${encodeURIComponent((f as any).updated_at || '')}`, updated_at: (f as any).updated_at });
    }
  }
  return out;
}
