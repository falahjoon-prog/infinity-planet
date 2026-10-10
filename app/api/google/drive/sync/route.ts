import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { googleClient, googleCall } from '@/lib/google';
import { syncDriveFolder } from '@/lib/drive';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Synchronise a whole Drive folder (e.g. the RHC folder) into RHC knowledge. New/changed files only. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const folderId = must<string>(b.folder_id, 'Choose a Drive folder');
  const db = getSupabaseAdmin();
  const { data: sync } = await db.from('knowledge_syncs').insert({ provider: 'google_drive', cursor: folderId, status: 'running', last_started_at: new Date().toISOString(), metadata: { folder_id: folderId, folder_name: b.folder_name || null, project_id: b.project_id || null, recursive: b.recursive !== false, by: actor.id } }).select().single();
  try {
    const { auth } = await googleClient();
    const results = await googleCall(() => syncDriveFolder(auth, folderId, { projectId: b.project_id || null, actorId: actor.id, recursive: b.recursive !== false, maxFiles: Math.min(Number(b.max_files) || 300, 500) }));
    const summary = results.reduce((a: Record<string, number>, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
    if (sync) await db.from('knowledge_syncs').update({ status: 'complete', last_completed_at: new Date().toISOString(), metadata: { ...(sync.metadata || {}), summary }, updated_at: new Date().toISOString() }).eq('id', sync.id);
    await writeAudit({ actorId: actor.id, action: 'drive.synced', entityType: 'knowledge_sync', entityId: sync?.id || null, metadata: { folder: b.folder_name || folderId, summary } });
    return ok({ summary, results });
  } catch (e: any) {
    if (sync) await db.from('knowledge_syncs').update({ status: 'failed', last_error: e?.message, updated_at: new Date().toISOString() }).eq('id', sync.id);
    throw e;
  }
});
export const GET = route(async (req: NextRequest) => {
  await requireWriter(req);
  const { data } = await getSupabaseAdmin().from('knowledge_syncs').select('*').eq('provider', 'google_drive').order('created_at', { ascending: false }).limit(20);
  return ok({ syncs: data || [] });
});
