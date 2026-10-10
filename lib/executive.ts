import { getSupabaseAdmin } from './supabase';

export const STAGES = ['lead', 'opportunity', 'negotiation', 'due_diligence', 'contract', 'completed', 'lost'] as const;

/** Live executive metrics — every number is computed from the business's own records. */
export async function executiveData(actorId: string) {
  const db = getSupabaseAdmin();
  const now = new Date(); const nowIso = now.toISOString();
  const in14 = new Date(now.getTime() + 14 * 864e5).toISOString();
  const [projects, deals, tasks, docsAwaiting, reviews, events, approvals, activity, recentDocs] = await Promise.all([
    db.from('projects').select('id,name,status,risk,deal_value,next_action,next_action_at,updated_at,location').neq('status', 'archived').order('updated_at', { ascending: false }),
    db.from('deals').select('id,title,counterparty,stage,probability,expected_value,next_action,next_action_at,project_id,updated_at'),
    db.from('tasks').select('id,title,status,priority,due_at,project_id,assigned_to, project:projects(name), assignee:profiles!tasks_assigned_to_fkey(full_name)').neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(300),
    db.from('documents').select('id,name,review_status,status,project_id,updated_at').in('review_status', ['unreviewed', 'awaiting_review']).order('updated_at', { ascending: false }).limit(200),
    db.from('contract_reviews').select('id,title,risk_rating,risk_score,status,project_id,created_at').in('risk_rating', ['High', 'Critical']).not('status', 'in', '(approved,rejected)').order('created_at', { ascending: false }).limit(50),
    db.from('calendar_events').select('id,title,starts_at,ends_at,location,project_id').gte('starts_at', nowIso).lte('starts_at', in14).order('starts_at').limit(30),
    db.from('approvals').select('id,title,entity_type,entity_id,category,status,requested_by,reviewer_id,created_at, requester:profiles!approvals_requested_by_fkey(full_name)').eq('status', 'pending').order('created_at', { ascending: false }),
    db.from('audit_events').select('id,action,entity_type,entity_id,metadata,created_at, actor:profiles!audit_events_actor_id_fkey(full_name)').order('created_at', { ascending: false }).limit(25),
    db.from('documents').select('id,name,status,authority,review_status,project_id,updated_at, project:projects(name)').order('updated_at', { ascending: false }).limit(8),
  ]);
  for (const r of [projects, deals, tasks, docsAwaiting, reviews, events, approvals, activity, recentDocs]) if (r.error) throw r.error;
  const P = projects.data || [], D = deals.data || [], T = tasks.data || [];
  const projectName = new Map(P.map(p => [p.id, p.name]));
  const activeProjects = P.filter(p => !['completed', 'archived'].includes(p.status));
  const openDeals = D.filter(d => !['completed', 'lost'].includes(d.stage));
  const pipelineValue = openDeals.reduce((n, d) => n + (Number(d.expected_value) || 0), 0);
  const weightedPipeline = openDeals.reduce((n, d) => n + (Number(d.expected_value) || 0) * (Number(d.probability) || 0) / 100, 0);
  const overdue = T.filter(t => t.due_at && t.due_at < nowIso);
  const highRisk = activeProjects.filter(p => p.risk === 'high' || p.risk === 'critical');
  const deadlines = [
    ...T.filter(t => t.due_at && t.due_at <= in14).map(t => ({ kind: 'task', id: t.id, title: t.title, at: t.due_at, project: (t as any).project?.name || null, overdue: t.due_at! < nowIso })),
    ...openDeals.filter(d => d.next_action_at && d.next_action_at <= in14).map(d => ({ kind: 'deal', id: d.id, title: `${d.title || d.counterparty}: ${d.next_action || 'next action'}`, at: d.next_action_at, project: projectName.get(d.project_id) || null, overdue: d.next_action_at < nowIso })),
    ...activeProjects.filter(p => p.next_action_at && p.next_action_at <= in14).map(p => ({ kind: 'project', id: p.id, title: `${p.name}: ${p.next_action || 'next action'}`, at: p.next_action_at, project: p.name, overdue: p.next_action_at < nowIso })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, 15);
  const pipeline = STAGES.map(s => { const ds = D.filter(d => d.stage === s); return { stage: s, count: ds.length, value: ds.reduce((n, d) => n + (Number(d.expected_value) || 0), 0) }; });
  const myApprovals = (approvals.data || []).filter(a => !a.reviewer_id || a.reviewer_id === actorId);
  return {
    generatedAt: nowIso,
    kpis: {
      activeProjects: activeProjects.length, pipelineValue, weightedPipeline, openDeals: openDeals.length,
      openTasks: T.length, overdueTasks: overdue.length, documentsAwaitingReview: (docsAwaiting.data || []).length,
      legalRisks: (reviews.data || []).length, upcomingMeetings: (events.data || []).length, pendingApprovals: (approvals.data || []).length,
      highRiskProjects: highRisk.length,
    },
    highRiskProjects: highRisk.slice(0, 10),
    deadlines, pipeline,
    openWork: T.slice(0, 12),
    overdueTasks: overdue.slice(0, 12),
    legalRisks: (reviews.data || []).slice(0, 8).map(r => ({ ...r, project: projectName.get(r.project_id) || null })),
    meetings: (events.data || []).slice(0, 8).map(e => ({ ...e, project: projectName.get(e.project_id) || null })),
    approvals: (approvals.data || []).slice(0, 10), myApprovalCount: myApprovals.length,
    documentsAwaiting: (docsAwaiting.data || []).slice(0, 8).map(d => ({ ...d, project: projectName.get(d.project_id) || null })),
    recentDocuments: recentDocs.data || [],
    activity: activity.data || [],
    activeProjects: activeProjects.slice(0, 12),
  };
}

const aud = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString('en-AU')}`;
/** Deterministic executive summary built from the live metrics (used when no AI provider is selected). */
export function rulesSummary(d: Awaited<ReturnType<typeof executiveData>>, businessName = 'RHC City') {
  const k = d.kpis; const lines: string[] = [];
  lines.push(`${businessName} has ${k.activeProjects} active project${k.activeProjects === 1 ? '' : 's'} and ${k.openDeals} open deal${k.openDeals === 1 ? '' : 's'} worth ${aud(k.pipelineValue)} (${aud(k.weightedPipeline)} probability-weighted).`);
  const attention: string[] = [];
  if (k.overdueTasks) attention.push(`${k.overdueTasks} overdue task${k.overdueTasks === 1 ? '' : 's'}`);
  if (k.highRiskProjects) attention.push(`${k.highRiskProjects} high-risk project${k.highRiskProjects === 1 ? '' : 's'} (${d.highRiskProjects.slice(0, 3).map(p => p.name).join(', ')})`);
  if (k.legalRisks) attention.push(`${k.legalRisks} high/critical legal review${k.legalRisks === 1 ? '' : 's'} not yet resolved`);
  if (k.pendingApprovals) attention.push(`${k.pendingApprovals} pending approval${k.pendingApprovals === 1 ? '' : 's'}`);
  if (k.documentsAwaitingReview) attention.push(`${k.documentsAwaitingReview} document${k.documentsAwaitingReview === 1 ? '' : 's'} awaiting review`);
  lines.push(attention.length ? `Needs attention: ${attention.join('; ')}.` : 'Nothing is overdue or flagged high-risk right now.');
  const next = d.deadlines.filter(x => !x.overdue).slice(0, 3);
  if (next.length) lines.push(`Coming up: ${next.map(x => `${x.title} (${String(x.at).slice(0, 10)})`).join('; ')}.`);
  if (k.upcomingMeetings) lines.push(`${k.upcomingMeetings} meeting${k.upcomingMeetings === 1 ? '' : 's'} in the next 14 days.`);
  const top = d.pipeline.filter(s => !['completed', 'lost'].includes(s.stage) && s.count).sort((a, b) => b.value - a.value)[0];
  if (top) lines.push(`Largest pipeline stage: ${top.stage.replace('_', ' ')} (${top.count} deal${top.count === 1 ? '' : 's'}, ${aud(top.value)}).`);
  return lines.join(' ');
}
