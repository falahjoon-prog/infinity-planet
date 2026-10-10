/**
 * Duties: who does what part of the work (design, contracts, agenda…).
 * A member can hold several duties. Ticking a duty in Settings → Team & access suggests the areas and approval rights it needs.
 * The list is the built-in one plus the business's own duties (app_settings 'duty_catalog').
 */
import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';

export type Duty = { key: string; label: string; hint?: string; areas: string[]; approves?: string[]; custom?: boolean };

export const DEFAULT_DUTIES: Duty[] = [
  { key: 'design', label: 'Design & graphics', hint: 'Flyers, social posts, brochures, logos', areas: ['designer', 'marketing', 'documents'] },
  { key: 'contracts', label: 'Contracts & legal', hint: 'Reviews, drafting, amendments, signing', areas: ['legal', 'drafting', 'company_records', 'signing', 'documents'], approves: ['contract', 'legal'] },
  { key: 'agenda', label: 'Agenda, meetings & minutes', hint: 'Books meetings, prepares agendas, takes notes', areas: ['calendar', 'tasks', 'notes'] },
  { key: 'marketing', label: 'Marketing & sales material', hint: 'Campaigns, copy, presentations', areas: ['marketing', 'designer', 'presentations'], approves: ['marketing'] },
  { key: 'sales', label: 'Deals & clients', hint: 'Leads, negotiations, client contact', areas: ['crm', 'gmail', 'calendar'] },
  { key: 'projects', label: 'Project management', hint: 'Runs projects, assigns tasks', areas: ['projects', 'tasks', 'calendar', 'documents'] },
  { key: 'site', label: 'Site & operations', hint: 'Site visits, inspections, suppliers', areas: ['projects', 'tasks', 'calendar'] },
  { key: 'documents', label: 'Document control & filing', hint: 'Library, Google Drive, templates', areas: ['documents', 'drive', 'drafting'], approves: ['document'] },
  { key: 'correspondence', label: 'Email & correspondence', hint: 'Answers and sends company email', areas: ['gmail'], approves: ['email'] },
  { key: 'presentations', label: 'Presentations & research', hint: 'Decks, market research, reports', areas: ['presentations', 'research'] },
  { key: 'finance', label: 'Finance & accounts', hint: 'Invoices, budgets, investor figures', areas: ['documents', 'crm', 'executive'] },
  { key: 'hr', label: 'HR & weekly hours approval', hint: 'Approves time that needs checking; signs off weekly hours', areas: ['activity'], approves: ['hours'] },
  { key: 'it', label: 'IT & app admin', hint: 'Helps the team with the app and accounts', areas: [] },
];

const KEY = /^[a-z0-9_]{2,40}$/;
export function cleanDuty(x: any): Duty | null {
  const label = String(x?.label || '').trim().slice(0, 60); if (!label) return null;
  const key = String(x?.key || label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  if (!KEY.test(key)) return null;
  return { key, label, hint: x?.hint ? String(x.hint).slice(0, 120) : undefined, areas: Array.isArray(x?.areas) ? x.areas.filter((a: any) => typeof a === 'string').slice(0, 30) : [], approves: Array.isArray(x?.approves) ? x.approves.filter((a: any) => typeof a === 'string').slice(0, 10) : [], custom: true };
}

/** Built-in duties (with any renames) plus the business's own. */
export async function getDuties(): Promise<Duty[]> {
  const own = (await getSetting<Duty[]>('duty_catalog').catch(() => null)) || [];
  const list = Array.isArray(own) ? own : [];
  const hidden = new Set(list.filter((d: any) => d?.hidden).map((d: any) => d.key));
  const byKey = new Map(DEFAULT_DUTIES.filter(d => !hidden.has(d.key)).map(d => [d.key, d]));
  for (const d of list) if (d && !(d as any).hidden && KEY.test(d.key)) byKey.set(d.key, { ...byKey.get(d.key), ...d, custom: !DEFAULT_DUTIES.some(x => x.key === d.key) });
  return [...byKey.values()];
}

/** For the AI: who does what. */
export async function dutiesBlock(): Promise<string> {
  const [duties, { data: people }] = await Promise.all([getDuties(), getSupabaseAdmin().from('profiles').select('full_name,email,duties,active')]);
  if (!people) return '';
  const lines = duties.map(d => { const who = people.filter((p: any) => p.active !== false && Array.isArray(p.duties) && p.duties.includes(d.key)).map((p: any) => p.full_name || p.email); return who.length ? `- ${d.label}: ${who.join(', ')}` : null; }).filter(Boolean);
  return lines.length ? `WHO DOES WHAT (assign work and suggest people by these duties):\n${lines.join('\n')}` : '';
}
