import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), ['name', 'category', 'description', 'body']);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  const db = getSupabaseAdmin();
  const { data: cur } = await db.from('document_templates').select('version,status').eq('id', id).single();
  // Editing the wording creates a new version that must be re-approved.
  const extra = patch.body ? { version: (cur?.version || 1) + 1, status: 'draft', approved_by: null } : {};
  const { data, error } = await db.from('document_templates').update({ ...patch, ...extra, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'template.updated', entityType: 'template', entityId: id, metadata: { fields: Object.keys(patch), new_version: (extra as any).version || null } });
  return ok({ template: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  if (!['admin', 'director', 'legal', 'marketing'].includes(actor.role)) throw new HttpError(403, 'Not permitted');
  const { id } = await params;
  const { error } = await getSupabaseAdmin().from('document_templates').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'template.archived', entityType: 'template', entityId: id });
  return ok({ archived: true });
});
