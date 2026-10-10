import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

/** Global quick search for the command bar. */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const raw = (req.nextUrl.searchParams.get('q') || '').trim();
  if (raw.length < 2) return ok({ results: [] });
  const q = `%${raw.replace(/[%_,()]/g, ' ')}%`;
  const db = getSupabaseAdmin();
  const [p, d, doc, t, n, c] = await Promise.all([
    db.from('projects').select('id,name,status').ilike('name', q).limit(6),
    db.from('deals').select('id,title,counterparty,stage').or(`title.ilike.${q},counterparty.ilike.${q}`).limit(6),
    db.from('documents').select('id,name,status').ilike('name', q).limit(6),
    db.from('tasks').select('id,title,status,project_id').ilike('title', q).limit(6),
    db.from('notes').select('id,title,project_id').or(`title.ilike.${q},body.ilike.${q}`).limit(6),
    db.from('contacts').select('id,full_name,email,project_id').or(`full_name.ilike.${q},email.ilike.${q}`).limit(6),
  ]);
  const results = [
    ...(p.data || []).map(x => ({ type: 'project', id: x.id, title: x.name, sub: x.status, href: `/projects/${x.id}` })),
    ...(d.data || []).map(x => ({ type: 'deal', id: x.id, title: x.title || x.counterparty, sub: x.stage, href: `/crm/${x.id}` })),
    ...(doc.data || []).map(x => ({ type: 'document', id: x.id, title: x.name, sub: x.status, href: `/documents?open=${x.id}` })),
    ...(t.data || []).map(x => ({ type: 'task', id: x.id, title: x.title, sub: x.status, href: `/tasks?open=${x.id}` })),
    ...(n.data || []).map(x => ({ type: 'note', id: x.id, title: x.title, sub: 'note', href: `/notes?open=${x.id}` })),
    ...(c.data || []).map(x => ({ type: 'contact', id: x.id, title: x.full_name, sub: x.email || 'contact', href: x.project_id ? `/projects/${x.project_id}?tab=contacts` : '/crm?tab=contacts' })),
  ];
  return ok({ results });
});
