import { NextRequest } from 'next/server';
import { google } from 'googleapis';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { googleClient, googleCall } from '@/lib/google';
import { importDriveFile } from '@/lib/drive';
import { writeAudit } from '@/lib/audit';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Import selected Drive files into RHC documents (stored, extracted, indexed). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const ids: string[] = Array.isArray(b.file_ids) ? b.file_ids.slice(0, 50) : [];
  if (!ids.length) throw new HttpError(400, 'Choose at least one file');
  const { auth } = await googleClient();
  const drive = google.drive({ version: 'v3', auth });
  const results = [];
  for (const id of ids) {
    const f = await googleCall(() => drive.files.get({ fileId: id, fields: 'id,name,mimeType,modifiedTime,webViewLink,size', supportsAllDrives: true }));
    results.push(await importDriveFile(drive, f.data, { projectId: b.project_id || null, actorId: actor.id, force: !!b.force }));
  }
  await writeAudit({ actorId: actor.id, action: 'drive.imported', entityType: 'project', entityId: b.project_id || null, metadata: { count: results.length, imported: results.filter(r => r.status === 'imported' || r.status === 'updated').length } });
  return ok({ results });
});
