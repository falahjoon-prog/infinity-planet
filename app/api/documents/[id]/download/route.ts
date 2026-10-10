import { NextRequest } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { BUCKET } from '@/lib/documents';

/** Returns a short-lived signed URL for preview/download. */
export const GET = route(async (req: NextRequest, { params }) => {
  const actor = await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: doc } = await db.from('documents').select('id,name,storage_path,web_url').eq('id', id).maybeSingle();
  if (!doc) throw new HttpError(404, 'Document not found');
  if (!doc.storage_path) { if (doc.web_url) return ok({ url: doc.web_url, external: true }); throw new HttpError(404, 'This document has no stored file'); }
  const download = req.nextUrl.searchParams.get('download') === '1';
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(doc.storage_path, 300, download ? { download: doc.name } : undefined);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: download ? 'document.downloaded' : 'document.viewed', entityType: 'document', entityId: id });
  return ok({ url: data.signedUrl, name: doc.name });
});
