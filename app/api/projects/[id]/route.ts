import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter, requireRole } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

const FIELDS = ['name', 'description', 'project_type', 'status', 'risk', 'deal_value', 'owner_id', 'location', 'counterparty', 'next_action', 'next_action_at', 'tags', 'highlights'];

/** Full project workspace bundle. */
export const GET = route(async (req: NextRequest, { params }) => {
  await getActor(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: project, error } = await db.from('projects').select('*, owner:profiles!projects_owner_id_fkey(full_name)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!project) throw new HttpError(404, 'Project not found');
  const [deals, documents, tasks, notes, reviews, conversations, marketing, emails, drafts, events, approvals, contacts, generated, activity] = await Promise.all([
    db.from('deals').select('*').eq('project_id', id).order('updated_at', { ascending: false }),
    db.from('documents').select('id,name,mime_type,status,authority,review_status,source,category,web_url,updated_at,metadata').eq('project_id', id).order('updated_at', { ascending: false }),
    db.from('tasks').select('*, assignee:profiles!tasks_assigned_to_fkey(full_name)').eq('project_id', id).order('due_at', { ascending: true, nullsFirst: false }),
    db.from('notes').select('*, author:profiles!notes_created_by_fkey(full_name)').eq('project_id', id).order('important', { ascending: false }).order('updated_at', { ascending: false }),
    db.from('contract_reviews').select('id,title,status,risk_rating,risk_score,engine,provider,document_id,created_at,updated_at').eq('project_id', id).order('created_at', { ascending: false }),
    db.from('ai_conversations').select('id,title,provider,updated_at').eq('project_id', id).order('updated_at', { ascending: false }).limit(30),
    db.from('marketing_assets').select('id,title,kind,layout,status,updated_at').eq('project_id', id).order('updated_at', { ascending: false }),
    db.from('email_links').select('*').eq('project_id', id).order('sent_at', { ascending: false, nullsFirst: false }),
    db.from('email_drafts').select('id,subject,to_addresses,status,updated_at,sent_at').eq('project_id', id).order('updated_at', { ascending: false }),
    db.from('calendar_events').select('*').eq('project_id', id).order('starts_at', { ascending: true }),
    db.from('approvals').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    db.from('contacts').select('*, counterparty:counterparties(name)').eq('project_id', id).order('full_name'),
    db.from('generated_documents').select('id,title,doc_type,status,updated_at').eq('project_id', id).order('updated_at', { ascending: false }),
    db.from('audit_events').select('*, actor:profiles!audit_events_actor_id_fkey(full_name)').eq('entity_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  // Activity across the project's related entities
  const relatedIds = [
    ...(deals.data || []).map((x: any) => x.id), ...(documents.data || []).map((x: any) => x.id), ...(tasks.data || []).map((x: any) => x.id),
    ...(reviews.data || []).map((x: any) => x.id), ...(marketing.data || []).map((x: any) => x.id), ...(generated.data || []).map((x: any) => x.id),
  ].slice(0, 300);
  const related = relatedIds.length ? await db.from('audit_events').select('*, actor:profiles!audit_events_actor_id_fkey(full_name)').in('entity_id', relatedIds).order('created_at', { ascending: false }).limit(80) : { data: [] as any[] };
  const all = [...(activity.data || []), ...(related.data || [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 80);
  return ok({
    project, deals: deals.data || [], documents: documents.data || [], tasks: tasks.data || [], notes: notes.data || [], reviews: reviews.data || [],
    conversations: conversations.data || [], marketing: marketing.data || [], emails: emails.data || [], email_drafts: drafts.data || [],
    events: events.data || [], approvals: approvals.data || [], contacts: contacts.data || [], generated: generated.data || [], activity: all,
  });
});

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), FIELDS);
  if (!Object.keys(patch).length) throw new HttpError(400, 'No editable fields supplied');
  const { data, error } = await getSupabaseAdmin().from('projects').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: patch.status ? 'project.stage_changed' : 'project.updated', entityType: 'project', entityId: id, metadata: patch });
  return ok({ project: data });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const { id } = await params;
  const db = getSupabaseAdmin();
  // Archive rather than hard-delete to keep documents and the audit trail.
  const { data, error } = await db.from('projects').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  await writeAudit({ actorId: actor.id, action: 'project.archived', entityType: 'project', entityId: id, metadata: { name: data.name } });
  return ok({ project: data });
});
