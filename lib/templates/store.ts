import { getSupabaseAdmin } from '../supabase';
import { DOCUMENT_TEMPLATES, MARKETING_TEMPLATES } from './seeds';
import { getSetting } from '../settings';
import { longDate, money, bulletList } from './render';

/** Inserts any missing starter templates (status under_review — never auto-approved). */
export async function ensureSeeded() {
  const db = getSupabaseAdmin();
  const { data } = await db.from('document_templates').select('name').eq('system_seed', true);
  const have = new Set((data || []).map(r => r.name));
  const rows = [...DOCUMENT_TEMPLATES, ...MARKETING_TEMPLATES].filter(t => !have.has(t.name)).map(t => ({
    name: t.name, category: t.category, kind: t.kind, description: t.description, body: t.body, status: 'under_review', version: 1, system_seed: true, metadata: { fields: t.fields, starter: true },
  }));
  if (rows.length) { const { error } = await db.from('document_templates').insert(rows); if (error && !/duplicate/i.test(error.message)) throw error; }
}

export type EntityDetails = { name?: string; abn?: string; address?: string; signatory_name?: string; signatory_title?: string; email?: string; phone?: string };

/** Values available to templates from settings + project + deal + form inputs. Form inputs win. */
export async function templateValues(opts: { project?: any; deal?: any; inputs?: Record<string, any>; contact?: any; preparedBy?: string | null }) {
  const [entity, names, home] = await Promise.all([
    getSetting<EntityDetails>('rhc_entity_details'), getSetting<string[]>('rhc_entity_names'), getSetting<string>('home_jurisdiction'),
  ]);
  const businessName = String((await getSetting<string>('business_name')) || 'RHC City');
  const e = entity || {}; const p = opts.project || {}; const d = opts.deal || {};
  const statusLabel: Record<string, string> = { active: 'Active', due_diligence: 'Due diligence', negotiation: 'Negotiation', marketing: 'Marketing', completed: 'Completed', archived: 'Archived' };
  const base: Record<string, any> = {
    short: String((await getSetting<string>('business_short_name')) || '').trim() || businessName, business: businessName, business_tag: businessName.replace(/[^A-Za-z0-9]/g, ''),
    date: longDate(), rhc_entity: e.name || names?.[0] || businessName, rhc_abn: e.abn || '', rhc_acn: (e as any).acn || '', rhc_address: e.address || '',
    signatory_name: e.signatory_name || '', signatory_title: e.signatory_title || '', governing_law: home || 'Queensland',
    project_name: p.name || '', project_location: p.location || '', project_description: p.description || '',
    location: p.location || '', description: p.description || '', project_type: p.project_type || '', status_label: statusLabel[p.status] || '',
    value: p.deal_value ? money(p.deal_value) : '', highlights_list: bulletList(p.highlights), next_action: p.next_action || '',
    counterparty: d.counterparty || p.counterparty || '', recipient_name: d.contact_name || opts.contact?.full_name || '',
    offer_amount: d.expected_value ? money(d.expected_value) : '', consideration: d.expected_value ? money(d.expected_value) : '',
    contact_name: e.signatory_name || '', contact_email: e.email || '', contact_phone: e.phone || '',
    hashtag: String(p.name || '').replace(/[^A-Za-z0-9]/g, ''),
  };
  if (p.id) {
    const db = getSupabaseAdmin();
    const [tasks, deals, reviews] = await Promise.all([
      db.from('tasks').select('title,status,due_at,priority, assignee:profiles!tasks_assigned_to_fkey(full_name)').eq('project_id', p.id).neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(25),
      db.from('deals').select('title,counterparty,stage,expected_value').eq('project_id', p.id).limit(15),
      db.from('contract_reviews').select('title,risk_rating,status,created_at').eq('project_id', p.id).order('created_at', { ascending: false }).limit(10),
    ]);
    const now = Date.now(); const t = tasks.data || [];
    const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }) : '';
    base.open_task_count = String(t.length);
    base.overdue_task_count = String(t.filter((x: any) => x.due_at && new Date(x.due_at).getTime() < now).length);
    base.open_tasks_list = t.length ? t.map((x: any) => `• ${x.title}${x.assignee?.full_name ? ` — ${x.assignee.full_name}` : ''}${x.due_at ? ` (due ${fmt(x.due_at)})` : ''}${['high', 'urgent'].includes(x.priority) ? ` [${x.priority}]` : ''}`).join('\n') : 'No open tasks.';
    base.deals_list = (deals.data || []).length ? (deals.data || []).map((x: any) => `• ${x.title || x.counterparty || 'Deal'}${x.counterparty ? ` with ${x.counterparty}` : ''} — ${String(x.stage || '').replace(/_/g, ' ')}${x.expected_value ? `, ${money(x.expected_value)}` : ''}`).join('\n') : 'No deals recorded.';
    base.legal_reviews_list = (reviews.data || []).length ? (reviews.data || []).map((x: any) => `• ${x.title} — ${x.risk_rating || 'unrated'} risk, ${String(x.status || '').replace(/_/g, ' ')} (${fmt(x.created_at)})`).join('\n') : 'No legal reviews recorded.';
    base.project_risk = p.risk ? String(p.risk).replace(/^./, (c: string) => c.toUpperCase()) : 'Not rated';
    base.summary = p.description || '';
  }
  base.prepared_by = opts.preparedBy || e.signatory_name || businessName;
  for (const [k, v] of Object.entries(opts.inputs || {})) if (v !== undefined && v !== null && String(v).trim() !== '') base[k] = v;
  if (base.key_terms && !String(base.key_terms).includes('•')) base.key_terms = bulletList(base.key_terms);
  return base;
}
