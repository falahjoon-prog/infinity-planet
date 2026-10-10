import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';
import { BUCKET } from './documents';
import { saveLogo, LOGO_TYPES } from './brand-logo';
import { invalidateBrand } from './brand';
import { writeAudit } from './audit';
import { HttpError } from './http';

export type ApplyInput = { details?: Record<string, string | undefined | null>; logo_document_id?: string | null; primary?: string | null; accent?: string | null; website?: string | null };

/** Saves chosen business details (Settings → Business details): legal entity, ABN/ACN, address, phone, email, website, colours and logo. */
export async function applyBusinessDetails(actorId: string, input: ApplyInput) {
  const db = getSupabaseAdmin();
  const changed: string[] = [];
  const entity = { ...((await getSetting<any>('rhc_entity_details')) || {}) };
  for (const k of ['name', 'abn', 'acn', 'address', 'phone', 'email']) {
    const v = input.details?.[k]; if (typeof v === 'string' && v.trim() && v.trim() !== entity[k]) { entity[k] = v.trim(); changed.push(k === 'name' ? 'legal name' : k.toUpperCase() === k ? k : k); }
  }
  const style = { letterhead: true, ...((await getSetting<any>('brand_style')) || {}) };
  const site = input.website || input.details?.website;
  if (site && site !== style.website) { style.website = site; changed.push('website'); }
  for (const k of ['primary', 'accent'] as const) { const v = input[k]; if (v && /^#[0-9a-f]{6}$/i.test(v) && v !== style[k]) { style[k] = v; changed.push(`${k} colour`); } }
  const now = new Date().toISOString();
  const { error } = await db.from('app_settings').upsert([{ key: 'rhc_entity_details', value: entity, updated_by: actorId, updated_at: now }, { key: 'brand_style', value: style, updated_by: actorId, updated_at: now }]);
  if (error) throw error;
  if (input.logo_document_id) {
    const { data: d } = await db.from('documents').select('name,mime_type,storage_path').eq('id', input.logo_document_id).maybeSingle();
    if (!d || !LOGO_TYPES[d.mime_type]) throw new HttpError(400, 'That file is not a usable logo image (PNG, JPG, WebP, SVG or GIF)');
    const { data: blob } = await db.storage.from(BUCKET).download(d.storage_path);
    if (!blob) throw new HttpError(404, 'Logo file not found in storage');
    await saveLogo(Buffer.from(await blob.arrayBuffer()), d.mime_type, actorId);
    changed.push('logo');
  }
  invalidateBrand();
  await writeAudit({ actorId, action: 'settings.business_autofilled', metadata: { changed } });
  return { changed, entity, style };
}
