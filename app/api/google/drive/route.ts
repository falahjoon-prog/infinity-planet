import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { googleClient, googleCall } from '@/lib/google';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signFileLink } from '@/lib/file-links';

/** Browse Google Drive: folder listing or search. Shows which files are already imported. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  const { auth } = await googleClient();
  const drive = google.drive({ version: 'v3', auth });
  const folder = sp.get('folder');
  const text = sp.get('q');
  const parts = ['trashed = false'];
  if (text) parts.push(`(name contains '${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' or fullText contains '${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`);
  else parts.push(`'${(folder || 'root').replace(/'/g, '')}' in parents`);
  const r = await googleCall(() => drive.files.list({ q: parts.join(' and '), pageSize: 100, pageToken: sp.get('pageToken') || undefined, orderBy: ({ name: 'folder,name', modified: 'folder,modifiedTime desc', size: 'folder,quotaBytesUsed desc' } as Record<string, string>)[sp.get('sort') || 'name'] || 'folder,name', fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,size,parents,iconLink,hasThumbnail,owners(displayName))', supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'allDrives' }));
  const files = r.data.files || [];
  const { data: existing } = files.length ? await getSupabaseAdmin().from('documents').select('id,external_id,external_modified_at,project_id').eq('source', 'google_drive').in('external_id', files.map(f => f.id!)) : { data: [] as any[] };
  const map = new Map((existing || []).map((d: any) => [d.external_id, d]));
  let folderName: string | null = null;
  if (folder && folder !== 'root') { try { folderName = (await drive.files.get({ fileId: folder, fields: 'name', supportsAllDrives: true })).data.name || null; } catch {} }
  return ok({ folder: folder || 'root', folderName, nextPageToken: r.data.nextPageToken || null, files: files.map(f => { const e: any = map.get(f.id); const isFolder = f.mimeType === 'application/vnd.google-apps.folder'; return { ...f, isFolder, thumb_url: !isFolder && f.hasThumbnail ? signFileLink({ k: 'dthumb', p: f.id!, n: 'thumb' }) : null, preview_url: isFolder ? null : signFileLink({ k: 'drive', p: f.id!, n: f.name || 'file' }), download_url: isFolder ? null : signFileLink({ k: 'drive', p: f.id!, n: f.name || 'file', dl: 1 }), imported: !!e, document_id: e?.id || null, stale: !!e && e.external_modified_at && f.modifiedTime && new Date(f.modifiedTime) > new Date(e.external_modified_at) }; }) });
});
