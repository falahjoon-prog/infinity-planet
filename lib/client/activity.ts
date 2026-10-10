import { label } from './format';

/** Human description of an audit event. */
export function describe(e: any) {
  const m = e.metadata || {};
  const name = m.name || m.title || m.subject || '';
  const map: Record<string, string> = {
    'project.created': 'created project', 'project.updated': 'updated a project', 'project.stage_changed': `moved a project to ${label(m.status)}`, 'project.archived': 'archived a project',
    'deal.created': 'created deal', 'deal.updated': 'updated a deal', 'deal.stage_changed': `moved a deal ${label(m.from)} → ${label(m.to)}`,
    'document.uploaded': 'uploaded', 'document.created': 'created document', 'document.deleted': 'deleted', 'document.extracted': 're-indexed a document', 'document.ocr_completed': 'ran OCR on a document', 'document.generated': `generated a ${m.template || 'document'}`,
    'contract_review.created': `ran a legal review (${m.rating || 'unrated'})`, 'approval.requested': 'requested approval', 'approval.approved': 'approved', 'approval.rejected': 'rejected', 'approval.changes_requested': 'requested changes',
    'task.created': 'created task', 'task.completed': 'completed a task', 'task.updated': 'updated a task', 'note.created': 'added note', 'email.sent': 'sent email', 'email.linked': 'linked an email', 'ai.message': 'asked RHC AI',
    'calendar.event_created': 'scheduled', 'marketing.created': 'created marketing copy', 'design.created': 'created a design', 'design.exported': 'exported a design', 'drive.synced': 'synced Google Drive', 'drive.imported': 'imported from Drive',
    'team.member_created': 'added a team member', 'settings.updated': 'updated settings', 'integration.google_connected': 'connected Google Workspace',
  };
  return `${map[e.action] || label(e.action.replace('.', ' '))}${name && !String(map[e.action] || '').includes(name) ? ` “${String(name).slice(0, 60)}”` : ''}`;
}

