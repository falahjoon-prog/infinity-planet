import { getSupabaseAdmin } from './supabase';
import { BUCKET, ensureBucket } from './documents';
import { getBrand, invalidateBrand } from './brand';

export const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' };
export const LOGO_MAX = 3 * 1024 * 1024;

export async function getLogo(): Promise<{ bytes: Buffer; mime: string } | null> {
  const b = await getBrand();
  if (!b.logo) { const { builtinFile, RHC_LOGO, isRhc } = await import('./brand-defaults'); if (!isRhc(b.business_name)) return null; const f = await builtinFile(RHC_LOGO); return f ? { bytes: f, mime: 'image/png' } : null; }
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(b.logo.path);
  if (error || !data) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), mime: b.logo.mime };
}

/** The logo as a data: URL — used to embed it in exported designs so they work offline. */
export async function logoDataUrl(): Promise<string | null> {
  const l = await getLogo();
  return l ? `data:${l.mime};base64,${l.bytes.toString('base64')}` : null;
}

export async function saveLogo(bytes: Buffer, mime: string, actorId: string) {
  const ext = LOGO_TYPES[mime];
  const db = getSupabaseAdmin();
  await ensureBucket();
  const old = (await getBrand()).logo;
  const v = Date.now();
  const path = `branding/logo-${v}.${ext}`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
  if (up.error) throw up.error;
  const { error } = await db.from('app_settings').upsert({ key: 'business_logo', value: { path, mime, v }, updated_by: actorId, updated_at: new Date().toISOString() });
  if (error) throw error;
  if (old?.path && old.path !== path) await db.storage.from(BUCKET).remove([old.path]);
  invalidateBrand();
  return { path, mime, v };
}

export async function removeLogo(actorId: string) {
  const db = getSupabaseAdmin();
  const old = (await getBrand()).logo;
  { const { error } = await db.from('app_settings').upsert({ key: 'business_logo', value: {}, updated_by: actorId, updated_at: new Date().toISOString() }); if (error) throw error; }
  if (old?.path) await db.storage.from(BUCKET).remove([old.path]);
  invalidateBrand();
}
