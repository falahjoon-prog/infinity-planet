/**
 * The business's own letterhead artwork, taken from one of its real documents:
 * the top band (logo, pattern) and the bottom band (address, colour blocks) of page 1, saved as images.
 * Exported PDFs and Word files place these exactly as they appear on the business's own documents.
 */
import { getSupabaseAdmin } from './supabase';
import { BUCKET, ensureBucket } from './documents';
import { getSetting } from './settings';
import { imageSize } from './letterhead';

export type ArtImage = { bytes: Buffer; width: number; height: number };
export type LetterheadArt = { header: ArtImage | null; footer: ArtImage | null; source: string | null };
type Stored = { header_path?: string | null; footer_path?: string | null; source_name?: string | null; v?: number } | null;

let cache: { v: number; art: LetterheadArt } | null = null;

async function load(path?: string | null): Promise<ArtImage | null> {
  if (!path) return null;
  const { data } = await getSupabaseAdmin().storage.from(BUCKET).download(path);
  if (!data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  const sz = imageSize(bytes, 'image/png');
  return sz ? { bytes, ...sz } : null;
}

async function builtinArt(): Promise<LetterheadArt | null> {
  const { builtinFile, RHC_HEADER, RHC_FOOTER, isRhc } = await import('./brand-defaults');
  if (!isRhc((await (await import('./brand')).getBrand()).business_name)) return null;
  const img = async (rel: string) => { const b = await builtinFile(rel); const sz = b ? imageSize(b, 'image/png') : null; return b && sz ? { bytes: b, ...sz } : null; };
  const [header, footer] = await Promise.all([img(RHC_HEADER), img(RHC_FOOTER)]);
  return header || footer ? { header, footer, source: 'RHC letterhead (built in)' } : null;
}

export async function getLetterheadArt(): Promise<LetterheadArt | null> {
  const s = await getSetting<Stored>('letterhead_art').catch(() => null);
  if (!s || (!s.header_path && !s.footer_path)) return builtinArt();
  if (cache && cache.v === s.v) return cache.art;
  const [header, footer] = await Promise.all([load(s.header_path), load(s.footer_path)]);
  const art = { header, footer, source: s.source_name || null };
  cache = { v: s.v || 0, art };
  return header || footer ? art : null;
}

export async function letterheadArtInfo() {
  const s = await getSetting<Stored>('letterhead_art').catch(() => null);
  if (!s || (!s.header_path && !s.footer_path)) return !(await import('./brand-defaults')).isRhc((await (await import('./brand')).getBrand()).business_name) ? null : { source_name: 'RHC letterhead (built in)', header_url: '/letterhead/rhc-header.png', footer_url: '/letterhead/rhc-footer.png', v: 0, builtin: true };
  const db = getSupabaseAdmin();
  const sign = async (p?: string | null) => p ? (await db.storage.from(BUCKET).createSignedUrl(p, 3600)).data?.signedUrl || null : null;
  return { source_name: s.source_name || null, header_url: await sign(s.header_path), footer_url: await sign(s.footer_path), v: s.v || 0 };
}

export async function saveLetterheadArt(o: { header: Buffer | null; footer: Buffer | null; source: string | null }, actorId: string) {
  const db = getSupabaseAdmin(); await ensureBucket();
  const old = await getSetting<Stored>('letterhead_art').catch(() => null);
  const v = Date.now();
  const put = async (b: Buffer | null, part: string) => {
    if (!b) return null;
    const path = `branding/letterhead-${part}-${v}.png`;
    const up = await db.storage.from(BUCKET).upload(path, b, { contentType: 'image/png', upsert: true });
    if (up.error) throw up.error;
    return path;
  };
  const [header_path, footer_path] = await Promise.all([put(o.header, 'header'), put(o.footer, 'footer')]);
  const { error } = await db.from('app_settings').upsert({ key: 'letterhead_art', value: { header_path, footer_path, source_name: o.source, v }, updated_by: actorId, updated_at: new Date().toISOString() });
  if (error) throw error;
  const stale = [old?.header_path, old?.footer_path].filter((p): p is string => !!p && p !== header_path && p !== footer_path);
  if (stale.length) await db.storage.from(BUCKET).remove(stale);
  cache = null;
}

export async function removeLetterheadArt(actorId: string) {
  const db = getSupabaseAdmin();
  const old = await getSetting<Stored>('letterhead_art').catch(() => null);
  { const { error } = await db.from('app_settings').upsert({ key: 'letterhead_art', value: {}, updated_by: actorId, updated_at: new Date().toISOString() }); if (error) throw error; }
  const stale = [old?.header_path, old?.footer_path].filter((p): p is string => !!p);
  if (stale.length) await db.storage.from(BUCKET).remove(stale);
  cache = null;
}
