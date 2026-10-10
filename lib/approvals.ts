import { getSupabaseAdmin } from './supabase';
import { Actor, canApprove, EXECUTIVE } from './auth';
import { HttpError } from './http';
import { writeAudit } from './audit';

export type EntityType = 'contract_review' | 'generated_document' | 'marketing_asset' | 'email_draft' | 'document' | 'template' | 'legal_clause';

export const ENTITY: Record<EntityType, { table: string; statusField: string; category: string; label: string; titleField: string }> = {
  contract_review: { table: 'contract_reviews', statusField: 'status', category: 'legal', label: 'Legal review', titleField: 'title' },
  generated_document: { table: 'generated_documents', statusField: 'status', category: 'contract', label: 'Generated document', titleField: 'title' },
  marketing_asset: { table: 'marketing_assets', statusField: 'status', category: 'marketing', label: 'Marketing / design', titleField: 'title' },
  email_draft: { table: 'email_drafts', statusField: 'status', category: 'email', label: 'Outgoing email', titleField: 'subject' },
  document: { table: 'documents', statusField: 'review_status', category: 'document', label: 'Document', titleField: 'name' },
  template: { table: 'document_templates', statusField: 'status', category: 'template', label: 'Template', titleField: 'name' },
  legal_clause: { table: 'legal_clauses', statusField: 'status', category: 'legal', label: 'Clause position', titleField: 'name' },
};

const PENDING_STATUS: Record<EntityType, string> = {
  contract_review: 'awaiting_approval', generated_document: 'awaiting_approval', marketing_asset: 'awaiting_approval',
  email_draft: 'awaiting_approval', document: 'awaiting_review', template: 'under_review', legal_clause: 'under_review',
};

function decidedStatus(type: EntityType, decision: 'approved' | 'rejected' | 'changes_requested') {
  if (type === 'document') return decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'reviewed';
  if (type === 'template') return decision === 'approved' ? 'approved' : 'draft';
  if (type === 'legal_clause') return decision === 'approved' ? 'approved' : 'draft';
  return decision;
}

export function isEntityType(t: unknown): t is EntityType { return typeof t === 'string' && t in ENTITY; }

/** Who may decide an approval: the named approvers when there are any (only them), otherwise anyone whose role can approve this category. */
export function mayDecide(actor: Actor, a: any) {
  if (a.status !== 'pending') return false;
  const named: string[] = Array.isArray(a.approvers) ? a.approvers : [];
  if (a.requested_by === actor.id && !EXECUTIVE.includes(actor.role) && !named.includes(actor.id)) return false;
  if (named.length) return named.includes(actor.id);
  if (a.reviewer_id) return a.reviewer_id === actor.id || EXECUTIVE.includes(actor.role);
  return canApprove(actor, a.category || 'general');
}
/** While an item is under approval, only its named approvers (or, with none named, authorised approvers) may change it. */
export async function assertCanAmend(actor: Actor, type: EntityType, entityId: string) {
  const { data: a } = await getSupabaseAdmin().from('approvals').select('*').eq('entity_type', type).eq('entity_id', entityId).eq('status', 'pending').maybeSingle();
  if (!a) return null;
  if (!mayDecide(actor, a)) throw new HttpError(403, 'This item is under approval. Only its assigned approver(s) can change it — you can view it and comment.');
  return a;
}

export async function requestApproval(actor: Actor, type: EntityType, entityId: string, opts: { summary?: string; reviewer_id?: string | null; approvers?: string[] | null } = {}) {
  if (type === 'email_draft') throw new HttpError(400, 'Emails do not need approval — open it in Gmail → Drafts and press Send.');
  const db = getSupabaseAdmin();
  const approvers = [...new Set((opts.approvers || []).concat(opts.reviewer_id ? [opts.reviewer_id] : []).filter(x => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))];
  if (approvers.includes(actor.id) && !EXECUTIVE.includes(actor.role)) throw new HttpError(400, 'You cannot approve your own request — choose someone else as the approver.');
  if (!approvers.length) {
    const { getSetting } = await import('./settings');
    if (await getSetting<boolean>('approvals_require_approver') !== false) throw new HttpError(400, 'Choose who will approve this (at least one person).');
  } else {
    const { data: ppl } = await db.from('profiles').select('id,role,active').in('id', approvers);
    if ((ppl || []).length !== approvers.length || (ppl || []).some((p: any) => p.role === 'viewer' || p.active === false)) throw new HttpError(400, 'Approvers must be active team members (not viewers).');
  }
  // Company structure: requests to someone higher go through the requester's managers first (or copy them)
  const { getOrg, routeFor } = await import('./org');
  const org = await getOrg().catch(() => null);
  const { data: ppl2 } = await db.from('profiles').select('id,full_name,email');
  const names: Record<string, string> = Object.fromEntries((ppl2 || []).map((p: any) => [p.id, p.full_name || p.email]));
  const route = org && approvers.length ? routeFor(org, actor.id, approvers, names) : { steps: [], copies: [], explain: null };
  const firstStep = route.steps.length ? route.steps[0] : approvers;
  const cfg = ENTITY[type];
  const { data: entity, error } = await db.from(cfg.table).select('*').eq('id', entityId).single();
  if (error || !entity) throw new HttpError(404, `${cfg.label} not found`);
  const { data: existing } = await db.from('approvals').select('id').eq('entity_type', type).eq('entity_id', entityId).eq('status', 'pending').maybeSingle();
  if (existing) throw new HttpError(409, 'An approval request is already pending for this item');
  const { data: approval, error: e2 } = await db.from('approvals').insert({
    entity_type: type, entity_id: entityId, requested_by: actor.id, reviewer_id: firstStep.length === 1 ? firstStep[0] : null, ...(firstStep.length ? { approvers: firstStep } : {}),
    status: 'pending', title: `${cfg.label}: ${entity[cfg.titleField] || 'Untitled'}`, summary: opts.summary || null,
    project_id: entity.project_id || null, category: cfg.category,
  }).select().single();
  if (e2) throw new HttpError(/approvers/.test(e2.message) ? 409 : 500, /approvers/.test(e2.message) ? 'Named approvers need the 4.3 database update (supabase/migrations/006_email_options_4_3.sql).' : e2.message);
  const patch: Record<string, any> = { [cfg.statusField]: PENDING_STATUS[type] };
  if (['contract_review', 'generated_document', 'marketing_asset', 'email_draft'].includes(type)) patch.approval_id = approval.id;
  if (type !== 'document' && type !== 'legal_clause' && type !== 'template') patch.updated_at = new Date().toISOString();
  await db.from(cfg.table).update(patch).eq('id', entityId);
  if (route.steps.length) {
    const { storeRoute } = await import('./org');
    await storeRoute(approval.id, { remaining: [...route.steps.slice(1), approvers], final: approvers, step: 1, total: route.steps.length + 1, requester: actor.id, explain: route.explain });
  }
  if (route.copies.length) { const { addCopies } = await import('./org'); await addCopies(approval.id, route.copies, approval.title); }
  if (route.explain) await db.from('approval_comments').insert({ approval_id: approval.id, author_id: actor.id, body: `Company structure: ${route.explain}` });
  await writeAudit({ actorId: actor.id, action: 'approval.requested', entityType: type, entityId, metadata: { approval_id: approval.id, title: approval.title, route: route.explain } });
  return { ...approval, route: route.explain };
}

export async function decideApproval(actor: Actor, approvalId: string, decision: 'approved' | 'rejected' | 'changes_requested', note?: string) {
  const db = getSupabaseAdmin();
  const { data: a, error } = await db.from('approvals').select('*').eq('id', approvalId).single();
  if (error || !a) throw new HttpError(404, 'Approval not found');
  if (a.status !== 'pending') throw new HttpError(409, `This approval was already ${a.status}`);
  const type = a.entity_type as EntityType;
  const cfg = ENTITY[type];
  const category = a.category || cfg?.category || 'general';
  const named: string[] = Array.isArray(a.approvers) ? a.approvers : [];
  if (named.length && !named.includes(actor.id)) throw new HttpError(403, 'Only the assigned approver(s) can decide this approval.');
  if (!named.length && !canApprove(actor, category)) throw new HttpError(403, `Your role (${actor.role}) cannot decide ${category} approvals`);
  if (a.requested_by === actor.id && !EXECUTIVE.includes(actor.role) && !named.includes(actor.id)) throw new HttpError(403, 'You cannot approve your own request. Ask another approver.');
  if (!named.length && a.reviewer_id && a.reviewer_id !== actor.id && !EXECUTIVE.includes(actor.role)) throw new HttpError(403, 'This approval is assigned to a different reviewer');
  const now = new Date().toISOString();
  // A routed request: this manager's approval passes it to the next level instead of finishing it
  if (decision === 'approved') {
    const { advanceRoute } = await import('./org');
    const next = await advanceRoute(approvalId);
    if (next) {
      const { data: moved, error: e3 } = await db.from('approvals').update({ approvers: next.next, reviewer_id: next.next.length === 1 ? next.next[0] : null, updated_at: now }).eq('id', approvalId).select().single();
      if (e3) throw new HttpError(500, e3.message);
      const { data: who } = await db.from('profiles').select('id,full_name,email').in('id', next.next);
      await db.from('approval_comments').insert({ approval_id: approvalId, author_id: actor.id, body: `Approved at step ${next.step - 1} of ${next.total}${note ? `: ${note}` : ''}. Passed to ${(who || []).map((p: any) => p.full_name || p.email).join(' / ')} (reporting line).` });
      await writeAudit({ actorId: actor.id, action: 'approval.step_approved', entityType: type, entityId: a.entity_id, metadata: { approval_id: approvalId, step: next.step - 1, next: next.next } });
      return { ...moved, passed_on: true };
    }
  } else { const { dropRoute } = await import('./org'); await dropRoute(approvalId); }
  const { data: updated, error: e2 } = await db.from('approvals').update({ status: decision, decided_by: actor.id, decided_at: now, decision_note: note || null, updated_at: now, reviewer_id: a.reviewer_id || actor.id }).eq('id', approvalId).select().single();
  if (e2) throw new HttpError(500, e2.message);
  if (cfg) {
    const patch: Record<string, any> = { [cfg.statusField]: decidedStatus(type, decision) };
    if (type === 'contract_review') patch.reviewed_by = actor.id;
    if (['template', 'legal_clause', 'marketing_asset'].includes(type) && decision === 'approved') patch.approved_by = actor.id;
    if (type !== 'document') patch.updated_at = now;
    await db.from(cfg.table).update(patch).eq('id', a.entity_id);
  }
  if (note) await db.from('approval_comments').insert({ approval_id: approvalId, author_id: actor.id, body: `Decision (${decision.replace('_', ' ')}): ${note}` });
  await writeAudit({ actorId: actor.id, action: `approval.${decision}`, entityType: type, entityId: a.entity_id, metadata: { approval_id: approvalId, note: note || null } });
  if (decision === 'approved' && (type === 'marketing_asset' || type === 'generated_document')) {
    // File the final copy (PDF on the letterhead) in Documents — never blocks the approval itself.
    await import('./final-copy').then(m => m.fileFinalCopy(type, a.entity_id, actor.id)).catch(e => console.warn('[final copy]', e?.message || e));
  }
  return updated;
}
