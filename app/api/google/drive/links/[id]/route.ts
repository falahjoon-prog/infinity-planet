import { NextRequest } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { syncDriveLink } from '@/lib/drive-links';
import { writeAudit } from '@/lib/audit';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Sync one link now. Use id "all" to sync every saved link. */
export const POST = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  if (id !== 'all') return ok(await syncDriveLink(id, actor.id));
  const { data } = await getSupabaseAdmin().from('drive_links').select('id,name');
  const out: any[] = [];
  for (const l of data || []) { try { const r = await syncDriveLink(l.id, actor.id); out.push({ id: l.id, name: l.name, summary: r.summary }); } catch (e: any) { out.push({ id: l.id, name: l.name, error: e?.message }); } }
  return ok({ links: out });
});

/** Remove a link. Documents already imported stay in the library. */
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin().from('drive_links').delete().eq('id', id).select('name').maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Drive link not found');
  await writeAudit({ actorId: actor.id, action: 'drive.link_removed', entityType: 'drive_link', entityId: id, metadata: { name: data.name } });
  return ok({ removed: true });
});
