import { NextRequest } from 'next/server';
import { route, ok, body, must, pick } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('marketing_assets').select('id,title,kind,layout,channel,status,engine,project_id,template_id,version,updated_at,created_at, project:projects(name), author:profiles!marketing_assets_created_by_fkey(full_name)').neq('status', 'archived').order('updated_at', { ascending: false });
  for (const k of ['project_id', 'kind', 'status']) if (sp.get(k)) q = q.eq(k, sp.get(k)!);
  const { data, error } = await q;
  if (error) throw error;
  return ok({ assets: data || [] });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.title, 'Title is required');
  const row = pick(b, ['title', 'content', 'project_id', 'template_id', 'kind', 'layout', 'design', 'channel', 'engine']);
  if (!row.content) row.content = row.kind === 'design' ? (b.design?.content?.headline || b.title) : '';
  must(row.content, 'Content is required');
  const { data, error } = await getSupabaseAdmin().from('marketing_assets').insert({ ...row, kind: row.kind === 'design' ? 'design' : row.kind === 'deck' ? 'deck' : 'copy', status: 'draft', created_by: actor.id }).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: data.kind === 'design' ? 'design.created' : 'marketing.created', entityType: 'marketing_asset', entityId: data.id, metadata: { title: data.title, project_id: data.project_id } });
  return ok({ asset: data }, 201);
});
