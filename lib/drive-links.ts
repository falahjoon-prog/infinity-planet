import { google } from 'googleapis';
import { getSupabaseAdmin } from './supabase';
import { googleClient, googleCall } from './google';
import { syncDriveFolder, importDriveFile } from './drive';
import { writeAudit } from './audit';
import { HttpError } from './http';

/** Extracts a Drive file/folder id from any Google Drive / Docs / Sheets / Slides link, or a bare id. */
export function parseDriveUrl(url: string): string | null {
  const u = String(url || '').trim();
  if (/drive\.google\.com\/drive\/(u\/\d+\/)?(home|my-drive)\b/.test(u) || /^(root|my drive)$/i.test(u)) return 'root';
  const m = u.match(/\/folders\/([\w-]{10,})/) || u.match(/\/d\/([\w-]{10,})/) || u.match(/[?&]id=([\w-]{10,})/) || u.match(/^([\w-]{20,})$/);
  return m ? m[1] : null;
}

export async function describeDriveId(id: string) {
  const { auth } = await googleClient();
  const drive = google.drive({ version: 'v3', auth });
  const r = await googleCall(() => drive.files.get({ fileId: id, fields: 'id,name,mimeType,webViewLink,modifiedTime,size', supportsAllDrives: true }));
  return r.data;
}

/** Syncs one saved Drive link into knowledge (new and changed files only). */
export async function syncDriveLink(linkId: string, actorId: string | null) {
  const db = getSupabaseAdmin();
  const { data: link } = await db.from('drive_links').select('*').eq('id', linkId).maybeSingle();
  if (!link) throw new HttpError(404, 'Drive link not found');
  try {
    const { auth } = await googleClient();
    let results: any[];
    if (link.kind === 'folder') results = await googleCall(() => syncDriveFolder(auth, link.file_id, { projectId: link.project_id, actorId, recursive: link.recursive, maxFiles: 500 }));
    else {
      const drive = google.drive({ version: 'v3', auth });
      const f = (await googleCall(() => drive.files.get({ fileId: link.file_id, fields: 'id,name,mimeType,modifiedTime,webViewLink,size', supportsAllDrives: true }))).data;
      results = [await importDriveFile(drive, f, { projectId: link.project_id, actorId })];
    }
    const ids = results.map(r => r.document_id).filter(Boolean);
    if (link.purpose === 'brand_book' && ids.length) await db.from('documents').update({ category: 'brand_book' }).in('id', ids);
    const summary = results.reduce((a: Record<string, number>, r: any) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
    await db.from('drive_links').update({ last_synced_at: new Date().toISOString(), last_status: results.some(r => r.status === 'failed') ? 'partial' : 'ok', last_result: { summary, failed: results.filter(r => r.status === 'failed').slice(0, 20) } }).eq('id', linkId);
    await writeAudit({ actorId, action: 'drive.link_synced', entityType: 'drive_link', entityId: linkId, metadata: { name: link.name, summary } });
    return { summary, results };
  } catch (e: any) {
    await db.from('drive_links').update({ last_synced_at: new Date().toISOString(), last_status: 'failed', last_result: { error: e?.message || 'Sync failed' } }).eq('id', linkId);
    throw e;
  }
}
