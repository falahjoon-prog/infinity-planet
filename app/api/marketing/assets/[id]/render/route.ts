import { NextRequest, NextResponse } from 'next/server';
import { route, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { renderDesign, Design, defaultDesign } from '@/lib/designer';
import { BUCKET } from '@/lib/documents';
import { writeAudit } from '@/lib/audit';
import { logoDataUrl } from '@/lib/brand-logo';
import { getBrand } from '@/lib/brand';

/** Rendered HTML for a design. Unapproved designs are watermarked; ?export=1 requires approval. */
export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: a } = await db.from('marketing_assets').select('*').eq('id', id).maybeSingle();
  if (!a || a.kind !== 'design') throw new HttpError(404, 'Design not found');
  const exporting = req.nextUrl.searchParams.get('export') === '1';
  const approved = a.status === 'approved';
  if (exporting && !approved) throw new HttpError(409, 'This design must be approved before export. Request approval first.');
  const design: Design = { ...defaultDesign(a.layout || 'flyer_a4', (await getBrand()).business_name), ...(a.design || {}) };
  if (design.content?.logo_image?.startsWith('/api/brand/logo')) design.content = { ...design.content, logo_image: (await logoDataUrl()) || undefined };
  // pictures from our own library (newsletter): embed them so the exported HTML is self-contained
  const embed = async (u?: string) => { if (!u || !/^\/brand\/[\w/.-]+\.(png|jpe?g)$/i.test(u) || u.includes('..')) return u; const { promises: fs } = await import('fs'); const path = await import('path'); const b = await fs.readFile(path.join(process.cwd(), 'public', u)).catch(() => null); return b ? `data:${/\.png$/i.test(u) ? 'image/png' : 'image/jpeg'};base64,${b.toString('base64')}` : u; };
  if (design.content) design.content = { ...design.content, logo_image: await embed(design.content.logo_image), image_lib: await embed(design.content.image_lib) };
  if (design.content?.image_path) {
    const s = await db.storage.from(BUCKET).createSignedUrl(design.content.image_path, 3600);
    if (s.data) design.content = { ...design.content, image_url: s.data.signedUrl };
  }
  if (exporting) await writeAudit({ actorId: actor.id, action: 'design.exported', entityType: 'marketing_asset', entityId: id });
  const html = renderDesign(design, { watermark: approved ? null : 'DRAFT — NOT APPROVED', forPrint: exporting });
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
});
