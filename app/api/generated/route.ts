import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('generated_documents').select('id,title,doc_type,status,engine,provider,project_id,deal_id,updated_at,created_at, project:projects(name), author:profiles!generated_documents_created_by_fkey(full_name)').order('updated_at', { ascending: false }).limit(200);
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  const { data, error } = await q;
  if (error) throw error;
  return ok({ generated: data || [] });
});
