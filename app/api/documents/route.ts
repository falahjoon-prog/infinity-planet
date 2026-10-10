import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signFileLink } from '@/lib/file-links';
import { writeAudit } from '@/lib/audit';
import { replaceChunks } from '@/lib/documents';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('documents').select('id,name,mime_type,source,external_id,web_url,status,authority,review_status,category,metadata,project_id,deal_id,created_at,updated_at,storage_path, project:projects(id,name), uploader:profiles!documents_created_by_fkey(full_name)').order('updated_at', { ascending: false }).limit(Math.min(Number(sp.get('limit') || 200), 500));
  for (const k of ['project_id', 'deal_id', 'status', 'authority', 'review_status', 'source', 'category']) if (sp.get(k)) q = q.eq(k, sp.get(k)!);
  if (sp.get('q')) q = q.ilike('name', `%${sp.get('q')!.replace(/[%_]/g, '')}%`);
  const { data, error } = await q;
  if (error) throw error;
  // Preview links for photos and PDFs (thumbnails in the grid view); storage paths are not sent to the browser.
  const docs = (data || []).map((d: any) => { const { storage_path, ...rest } = d; const previewable = storage_path && /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(d.mime_type || ''); return { ...rest, has_file: !!storage_path, file_url: previewable ? signFileLink({ k: 'storage', p: storage_path, n: d.name, m: d.mime_type }, 3600) : null }; });
  return ok({ documents: docs });
});

/** Create a text document directly (e.g. pasted text or a saved AI output). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  const name = must<string>(b.name, 'name is required');
  const text = String(b.content_text || '').trim();
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('documents').insert({ name, mime_type: 'text/plain', project_id: b.project_id || null, deal_id: b.deal_id || null, source: b.source || 'manual', content_text: text || null, status: text ? 'indexed' : 'pending', authority: b.authority || 'draft', category: b.category || null, metadata: { created_in_app: true }, created_by: actor.id }).select().single();
  if (error) throw error;
  if (text) await replaceChunks(data.id, data.project_id, text, 'manual');
  await writeAudit({ actorId: actor.id, action: 'document.created', entityType: 'document', entityId: data.id, metadata: { name } });
  return ok({ document: data }, 201);
});
