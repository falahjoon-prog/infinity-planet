/**
 * Learns how the business makes presentations from its real decks:
 *  - Google Drive (Google Slides and PowerPoint files, newest first, or one folder), and
 *  - PowerPoint files uploaded to Documents.
 * It saves the usual order of sections ("house structure") for the AI and the built-in writer,
 * and turns the best-looking deck's colours, fonts and cover into a template ("house style").
 */
import { google } from 'googleapis';
import { getSupabaseAdmin } from './supabase';
import { googleClient } from './google';
import { googleConnected } from './drive-live';
import { readPptx, structureFrom, importPptxTheme, saveHouseDeck, houseDeck, customThemes, removeTheme, HouseDeck } from './deck-theme-store';

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SLIDES = 'application/vnd.google-apps.presentation';

type Found = { name: string; bytes: Buffer; when: string };

async function fromDrive(folderId: string | null, max: number): Promise<{ files: Found[]; note?: string }> {
  if (!(await googleConnected().catch(() => false))) return { files: [], note: 'Google is not connected, so I only used PowerPoint files uploaded to Documents.' };
  const { auth } = await googleClient(); const drive = google.drive({ version: 'v3', auth });
  const q = [`(mimeType='${SLIDES}' or mimeType='${PPTX}')`, 'trashed = false', folderId ? `'${folderId.replace(/'/g, '')}' in parents` : ''].filter(Boolean).join(' and ');
  const list = await drive.files.list({ q, orderBy: 'modifiedTime desc', pageSize: Math.min(25, max * 2), fields: 'files(id,name,mimeType,modifiedTime,size)', supportsAllDrives: true, includeItemsFromAllDrives: true });
  const out: Found[] = [];
  for (const f of list.data.files || []) {
    if (out.length >= max) break;
    if (f.size && Number(f.size) > 60 * 1024 * 1024) continue;
    try {
      const r = f.mimeType === SLIDES
        ? await drive.files.export({ fileId: f.id!, mimeType: PPTX }, { responseType: 'arraybuffer' })
        : await drive.files.get({ fileId: f.id!, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      out.push({ name: f.name || 'Presentation', bytes: Buffer.from(r.data as ArrayBuffer), when: f.modifiedTime || '' });
    } catch { /* skip unreadable files */ }
  }
  return { files: out };
}

async function fromLibrary(max: number): Promise<Found[]> {
  const db = getSupabaseAdmin();
  const { data } = await db.from('documents').select('name,storage_path,updated_at,mime_type').or(`mime_type.eq.${PPTX},name.ilike.%.pptx`).order('updated_at', { ascending: false }).limit(max);
  const out: Found[] = [];
  for (const d of data || []) { if (!d.storage_path) continue; const { data: blob } = await db.storage.from('rhc-documents').download(d.storage_path); if (blob) out.push({ name: d.name, bytes: Buffer.from(await blob.arrayBuffer()), when: d.updated_at }); }
  return out;
}

export async function learnDecks(opts: { actorId: string; folderId?: string | null; max?: number; makeTemplate?: boolean }): Promise<{ house: HouseDeck; read: { name: string; slides: number }[]; template?: { id: string; name: string } | null; note?: string }> {
  const max = Math.max(1, Math.min(15, opts.max || 8));
  const [drive, lib] = await Promise.all([fromDrive(opts.folderId || null, max).catch((e: any) => ({ files: [] as Found[], note: `Google Drive could not be read (${String(e?.message || e).slice(0, 120)}).` })), opts.folderId ? Promise.resolve([] as Found[]) : fromLibrary(max).catch(() => [] as Found[])]);
  const seen = new Set<string>(); const files = [...drive.files, ...lib].filter(f => { const k = f.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max);
  if (!files.length) throw new Error(`I couldn't find any presentations to learn from.${drive.note ? ` ${drive.note}` : ''} Put your decks (Google Slides or PowerPoint) in Google Drive, or upload a .pptx to Documents.`);
  const decks: { name: string; titles: string[]; bytes: Buffer; slides: number; colorful: number }[] = [];
  for (const f of files) {
    try { const r = await readPptx(f.bytes); const colorful = Object.keys(r.colors).length + (r.coverImage ? 3 : 0) + (r.fonts.major ? 1 : 0); decks.push({ name: f.name, titles: r.titles, bytes: f.bytes, slides: r.slideCount, colorful }); } catch { /* not a readable deck */ }
  }
  if (!decks.length) throw new Error('The presentations I found could not be read. Try exporting one as PowerPoint (.pptx) and uploading it.');
  const structure = structureFrom(decks);
  let template: { id: string; name: string } | null = null;
  const prev = await houseDeck().catch(() => null);
  if (opts.makeTemplate !== false) {
    const best = [...decks].sort((a, b) => b.colorful - a.colorful || b.slides - a.slides)[0];
    const { theme } = await importPptxTheme(best.bytes, `House style — ${best.name}`, opts.actorId, 'drive');
    template = { id: theme.id, name: theme.name };
    // replace the previous learned house template
    if (prev?.theme_id && prev.theme_id !== theme.id && (await customThemes()).some(t => t.id === prev.theme_id && t.source?.kind === 'drive')) await removeTheme(prev.theme_id, opts.actorId).catch(() => null);
  }
  const house: HouseDeck = { structure, examples: decks.slice(0, 8).map(d => ({ name: d.name, titles: d.titles.filter(Boolean).slice(0, 30) })), theme_id: template?.id || prev?.theme_id || null, learned_at: new Date().toISOString(), from: decks.map(d => d.name) };
  await saveHouseDeck(house, opts.actorId);
  return { house, read: decks.map(d => ({ name: d.name, slides: d.slides })), template, note: drive.note };
}

/** For the AI writer: how this business structures its decks. */
export async function houseDeckBlock(): Promise<string> {
  const h = await houseDeck().catch(() => null); if (!h) return '';
  return `HOW THIS BUSINESS STRUCTURES ITS PRESENTATIONS (learned from ${h.from.length} of its own decks — follow this order and these section names unless the request needs otherwise):\n${h.structure.length ? h.structure.map((s, i) => `${i + 1}. ${s}`).join('\n') : '(no clear pattern)'}\n${h.examples.slice(0, 3).map(e => `Example "${e.name}": ${e.titles.slice(0, 18).join(' → ')}`).join('\n')}`;
}
