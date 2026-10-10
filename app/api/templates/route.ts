import { NextRequest } from 'next/server';
import { route, ok, body, must } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { ensureSeeded } from '@/lib/templates/store';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  await ensureSeeded();
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('document_templates').select('*, approver:profiles!document_templates_approved_by_fkey(full_name)').neq('status', 'archived').order('kind').order('name');
  if (sp.get('kind')) q = q.eq('kind', sp.get('kind')!);
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  const { data, error } = await q;
  if (error) throw error;
  return ok({ templates: data || [] });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.name, 'Template name is required'); must(b.body, 'Template body is required');
  const { data, error } = await getSupabaseAdmin().from('document_templates').insert({ name: b.name, category: b.category || 'general', kind: b.kind === 'marketing' ? 'marketing' : 'document', description: b.description || null, body: b.body, status: 'draft', version: 1, created_by: actor.id }).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'template.created', entityType: 'template', entityId: data.id, metadata: { name: data.name } });
  return ok({ template: data }, 201);
});
