import { NextRequest } from 'next/server';
import { route, ok, body, must, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { parseDriveUrl, describeDriveId, syncDriveLink } from '@/lib/drive-links';
import { writeAudit } from '@/lib/audit';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Saved Google Drive links (folders or files) that feed the knowledge base. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const { data, error } = await getSupabaseAdmin().from('drive_links').select('*, project:projects(name)').order('created_at', { ascending: false });
  if (error) throw error;
  return ok({ links: data || [] });
});

/** Add a link: { url, project_id?, recursive?, purpose?: 'knowledge'|'brand_book', sync?: true } */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const url = must<string>(String(b.url || '').trim(), 'Paste a Google Drive link');
  const id = parseDriveUrl(url);
  if (!id) throw new HttpError(400, 'That does not look like a Google Drive link. Use the "Share → Copy link" address of a folder or file.');
  const meta = await describeDriveId(id);
  const kind = meta.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file';
  const purpose = b.purpose === 'brand_book' ? 'brand_book' : 'knowledge';
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('drive_links').upsert({ url, file_id: id, kind, name: meta.name || null, project_id: b.project_id || null, recursive: b.recursive !== false, purpose, created_by: actor.id }, { onConflict: 'file_id' }).select('*').single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'drive.link_added', entityType: 'drive_link', entityId: data.id, metadata: { name: meta.name, kind, purpose } });
  let sync: any = null; let sync_error: string | null = null;
  if (b.sync !== false) { try { sync = await syncDriveLink(data.id, actor.id); } catch (e: any) { sync_error = e?.message || 'Sync failed'; } }
  const { data: fresh } = await db.from('drive_links').select('*, project:projects(name)').eq('id', data.id).single();
  return ok({ link: fresh, sync, sync_error }, 201);
});
