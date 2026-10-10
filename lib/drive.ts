import { google, drive_v3 } from 'googleapis';
import { getSupabaseAdmin } from './supabase';
import { ingestDocument } from './documents';

const EXPORTS: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  'application/vnd.google-apps.spreadsheet': { mime: 'text/csv', ext: '.csv' },
  'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
};
const SKIP = /^application\/vnd\.google-apps\.(folder|form|map|site|shortcut|drawing|script|jam)/;
const MAX = 50 * 1024 * 1024;

export type DriveImportResult = { id: string; name: string; status: 'imported' | 'updated' | 'unchanged' | 'skipped' | 'failed'; document_id?: string; message?: string };

/** Download (or export) one Drive file and ingest it into RHC documents. Re-imports only when Drive has a newer version. */
export async function importDriveFile(drive: drive_v3.Drive, file: drive_v3.Schema$File, opts: { projectId?: string | null; actorId?: string | null; force?: boolean }): Promise<DriveImportResult> {
  const name = file.name || 'Untitled';
  try {
    if (!file.id || !file.mimeType) return { id: file.id || '', name, status: 'skipped', message: 'Missing metadata' };
    if (SKIP.test(file.mimeType)) return { id: file.id, name, status: 'skipped', message: 'Unsupported Google type' };
    if (file.size && Number(file.size) > MAX) return { id: file.id, name, status: 'skipped', message: 'Larger than 50 MB' };
    const db = getSupabaseAdmin();
    const { data: existing } = await db.from('documents').select('id,external_modified_at,project_id').eq('source', 'google_drive').eq('external_id', file.id).maybeSingle();
    if (existing && !opts.force && existing.external_modified_at && file.modifiedTime && new Date(file.modifiedTime) <= new Date(existing.external_modified_at)) return { id: file.id, name, status: 'unchanged', document_id: existing.id };
    const exp = EXPORTS[file.mimeType];
    let bytes: Buffer; let mime = file.mimeType; let fname = name;
    if (exp) {
      const r = await drive.files.export({ fileId: file.id, mimeType: exp.mime }, { responseType: 'arraybuffer' });
      bytes = Buffer.from(r.data as ArrayBuffer); mime = exp.mime; if (!fname.toLowerCase().endsWith(exp.ext)) fname += exp.ext;
    } else if (file.mimeType.startsWith('application/vnd.google-apps')) {
      return { id: file.id, name, status: 'skipped', message: 'Google type cannot be exported' };
    } else {
      const r = await drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      bytes = Buffer.from(r.data as ArrayBuffer);
    }
    const res = await ingestDocument({ bytes, name: fname, mimeType: mime, projectId: opts.projectId ?? existing?.project_id ?? null, source: 'google_drive', externalId: file.id, webUrl: file.webViewLink || null, externalModifiedAt: file.modifiedTime || null, actorId: opts.actorId, existingId: existing?.id || null, extraMeta: { drive_mime: file.mimeType } });
    return { id: file.id, name: fname, status: existing ? 'updated' : 'imported', document_id: res.document.id, message: res.extraction.status };
  } catch (e: any) { return { id: file.id || '', name, status: 'failed', message: e?.message || 'Import failed' }; }
}

/** Walk a Drive folder (optionally recursively) and import every supported file. */
export async function syncDriveFolder(auth: any, folderId: string, opts: { projectId?: string | null; actorId?: string | null; recursive?: boolean; maxFiles?: number }) {
  const drive = google.drive({ version: 'v3', auth });
  const results: DriveImportResult[] = [];
  const queue = [folderId]; const max = opts.maxFiles || 300; let visited = 0;
  while (queue.length && results.length < max && visited < 100) {
    const id = queue.shift()!; visited++;
    let pageToken: string | undefined;
    do {
      const r = await drive.files.list({ q: `'${id.replace(/'/g, '')}' in parents and trashed = false`, pageSize: 200, pageToken, fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,size)', supportsAllDrives: true, includeItemsFromAllDrives: true });
      for (const f of r.data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') { if (opts.recursive) queue.push(f.id!); continue; }
        if (results.length >= max) break;
        results.push(await importDriveFile(drive, f, opts));
      }
      pageToken = r.data.nextPageToken || undefined;
    } while (pageToken && results.length < max);
  }
  return results;
}
