import { NextRequest } from 'next/server';
import { route, ok, body, must, pick } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('contacts').select('*, counterparty:counterparties(id,name), project:projects(id,name)').order('full_name');
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  if (sp.get('q')) q = q.or(`full_name.ilike.%${sp.get('q')!.replace(/[%_,()]/g, '')}%,email.ilike.%${sp.get('q')!.replace(/[%_,()]/g, '')}%`);
  const { data, error } = await q;
  if (error) throw error;
  return ok({ contacts: data || [] });
});
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req); must(b.full_name, 'Contact name is required');
  const db = getSupabaseAdmin();
  const row = pick(b, ['counterparty_id', 'project_id', 'full_name', 'position', 'email', 'phone', 'notes']);
  if (!row.counterparty_id && b.counterparty_name) {
    const { data: cp } = await db.from('counterparties').select('id').ilike('name', b.counterparty_name).maybeSingle();
    row.counterparty_id = cp?.id || (await db.from('counterparties').insert({ name: b.counterparty_name, created_by: actor.id }).select('id').single()).data?.id || null;
  }
  const { data, error } = await db.from('contacts').insert({ ...row, created_by: actor.id }).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'contact.created', entityType: 'contact', entityId: data.id, metadata: { name: data.full_name, project_id: data.project_id } });
  return ok({ contact: data }, 201);
});
