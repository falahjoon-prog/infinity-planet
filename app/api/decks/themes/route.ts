import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getActor, requireRole } from '@/lib/auth';
import { customThemes, houseDeck, importPptxTheme, removeTheme, saveHouseDeck } from '@/lib/deck-theme-store';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { COLLECTION } from '@/lib/deck-collection';
export const runtime = 'nodejs';
export const maxDuration = 120;

/** Presentation templates: the business's own (imported or learned) and the learned house structure. Built-in ones live in the app. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const [custom, house] = await Promise.all([customThemes(), houseDeck()]);
  return ok({ custom, house, collection: COLLECTION.map(t => ({ id: t.id, name: t.name, slides: t.outline?.slides.length || 0, ...(req.nextUrl.searchParams.get('outlines') === '1' ? { outline: t.outline, art: t.art } : {}) })) });
});

/** Import a PowerPoint template: upload a .pptx/.potx (form field "file"), or { document_id } of one in Documents. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director', 'manager', 'marketing']);
  let bytes: Buffer | null = null; let name = 'Our template';
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const fd = await req.formData().catch(() => null); const f = fd?.get('file') as File | null;
    if (!f || typeof f === 'string') throw new HttpError(400, 'Choose a PowerPoint file (.pptx or .potx)');
    if (f.size > 60 * 1024 * 1024) throw new HttpError(400, 'That file is over 60 MB');
    bytes = Buffer.from(await f.arrayBuffer()); name = f.name || name;
  } else {
    const b = await body(req); if (!b.document_id) throw new HttpError(400, 'Upload a PowerPoint file or choose one from Documents');
    const db = getSupabaseAdmin(); const { data: d } = await db.from('documents').select('name,storage_path').eq('id', b.document_id).maybeSingle();
    if (!d?.storage_path) throw new HttpError(404, 'Document not found');
    const { data: blob } = await db.storage.from('rhc-documents').download(d.storage_path); if (!blob) throw new HttpError(404, 'File not found');
    bytes = Buffer.from(await blob.arrayBuffer()); name = d.name;
  }
  if (bytes.subarray(0, 2).toString() !== 'PK') throw new HttpError(400, 'That is not a PowerPoint (.pptx / .potx) file. Old .ppt files: open in PowerPoint and Save As .pptx first.');
  try {
    const { theme, reading } = await importPptxTheme(bytes, name, actor.id, 'pptx');
    await writeAudit({ actorId: actor.id, action: 'deck.template_imported', metadata: { name, id: theme.id } });
    return ok({ theme, read: { slides: reading.slideCount, fonts: reading.fonts, colours: Object.keys(reading.colors).length, cover: !!reading.coverImage } });
  } catch (e: any) { throw new HttpError(400, e?.message || 'Could not read that PowerPoint file'); }
});

export const DELETE = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director', 'manager', 'marketing']);
  const id = req.nextUrl.searchParams.get('id'); if (!id) throw new HttpError(400, 'Which template?');
  try { await removeTheme(id, actor.id); } catch (e: any) { throw new HttpError(404, e.message); }
  const h = await houseDeck(); if (h?.theme_id === id) await saveHouseDeck({ ...h, theme_id: null }, actor.id);
  return ok({ custom: await customThemes() });
});

/** Set the default template for new presentations: { default: "<id>" }. */
export const PATCH = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director', 'manager', 'marketing']);
  const b = await body(req); const id = typeof b.default === 'string' && /^[a-z0-9-]{3,40}$/.test(b.default) ? b.default : null;
  const h = (await houseDeck()) || { structure: [], examples: [], from: [], learned_at: '', theme_id: null };
  await saveHouseDeck({ ...h, theme_id: id }, actor.id);
  return ok({ house: { ...h, theme_id: id } });
});
