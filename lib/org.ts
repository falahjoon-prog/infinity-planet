/**
 * Company structure (who reports to whom) and approval routing that follows it.
 * Nobody skips their manager: if someone asks a person higher up the line to approve, the request goes to
 * their manager(s) first, one level at a time ("through" mode), or their manager is copied ("copy" mode).
 * Stored in app_settings ('org_chart', 'approval_routes', 'approval_copies') — no database change needed.
 */
import { getSupabaseAdmin } from './supabase';
import { getSetting } from './settings';

export type Position = { id: string; title: string; reports_to: string | null; holders: string[] };
export type OrgChart = { positions: Position[]; routing: 'through' | 'copy'; saved?: boolean; updated_at?: string };

/** From the RHC City organisation chart (Board → CEO → General Manager and the managers under them). */
export const DEFAULT_POSITIONS: Omit<Position, 'holders'>[] = [
  { id: 'board', title: 'Board of Directors', reports_to: null },
  { id: 'ceo', title: 'CEO', reports_to: 'board' },
  { id: 'finance', title: 'Financial & Investment Manager', reports_to: 'ceo' },
  { id: 'regional', title: 'Regional Managers', reports_to: 'finance' },
  { id: 'legal', title: 'Legal Affairs Manager', reports_to: 'ceo' },
  { id: 'gm', title: 'General Manager', reports_to: 'ceo' },
  { id: 'marketing', title: 'Marketing and Sales Manager', reports_to: 'gm' },
  { id: 'operations', title: 'Operations and Services Manager', reports_to: 'gm' },
  { id: 'tech', title: 'Technical and Engineering Deputy', reports_to: 'gm' },
  { id: 'it', title: 'Information Technology Manager', reports_to: 'tech' },
  { id: 'sdo', title: 'Sustainable Development Office', reports_to: 'it' },
  { id: 'pmc', title: 'Project Management Consultant (PMC)', reports_to: 'sdo' },
  { id: 'admin', title: 'Account and Admin', reports_to: 'gm' },
  { id: 'hr', title: 'Human Resources Manager', reports_to: 'admin' },
  { id: 'urban', title: 'Urban Design & Planning Manager', reports_to: 'gm' },
];
/** Known office holders (from the company documents) — matched to team accounts by name. */
const KNOWN: [RegExp, string][] = [[/\bramin\b/i, 'ceo'], [/\bfalah\b/i, 'gm']];

const ID = /^[a-z0-9_-]{2,40}$/;
export function sanitizeOrg(x: any): OrgChart {
  const ps: Position[] = (Array.isArray(x?.positions) ? x.positions : []).filter((p: any) => p && ID.test(p.id) && typeof p.title === 'string').slice(0, 80)
    .map((p: any) => ({ id: p.id, title: String(p.title).slice(0, 80), reports_to: typeof p.reports_to === 'string' && ID.test(p.reports_to) ? p.reports_to : null, holders: (Array.isArray(p.holders) ? p.holders : []).filter((h: any) => typeof h === 'string' && /^[0-9a-f-]{36}$/i.test(h)).slice(0, 20) }));
  const ids = new Set(ps.map(p => p.id));
  for (const p of ps) { if (p.reports_to && (!ids.has(p.reports_to) || p.reports_to === p.id)) p.reports_to = null; }
  // break any loop
  for (const p of ps) { const seen = new Set<string>([p.id]); let cur = p.reports_to; while (cur) { if (seen.has(cur)) { p.reports_to = null; break; } seen.add(cur); cur = ps.find(q => q.id === cur)?.reports_to || null; } }
  return { positions: ps, routing: x?.routing === 'copy' ? 'copy' : 'through' };
}

export async function getOrg(): Promise<OrgChart> {
  const saved = await getSetting<any>('org_chart').catch(() => null);
  if (saved && Array.isArray(saved.positions) && saved.positions.length) return { ...sanitizeOrg(saved), saved: true, updated_at: saved.updated_at };
  // not set up yet: the company chart, with known office holders matched to accounts
  const { data: people } = await getSupabaseAdmin().from('profiles').select('id,full_name,email,active');
  const positions: Position[] = DEFAULT_POSITIONS.map(p => ({ ...p, holders: [] }));
  for (const [re, pos] of KNOWN) { const m = (people || []).filter((x: any) => x.active !== false && re.test(`${x.full_name || ''} ${x.email || ''}`)); if (m.length === 1) positions.find(p => p.id === pos)!.holders.push(m[0].id); }
  return { positions, routing: 'through', saved: false };
}
export async function saveOrg(org: OrgChart, actorId: string) {
  const clean = sanitizeOrg(org);
  const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: 'org_chart', value: { ...clean, updated_at: new Date().toISOString() }, updated_by: actorId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return clean;
}

export const positionsOf = (org: OrgChart, userId: string) => org.positions.filter(p => p.holders.includes(userId));
/** The reporting line above a person: their manager's position first, then up to the top. */
export function lineAbove(org: OrgChart, userId: string): Position[] {
  const mine = positionsOf(org, userId); if (!mine.length) return [];
  // a person in several positions: use the lowest one (the longest line)
  const depth = (p: Position) => { let d = 0, c = p.reports_to; while (c && d < 50) { d++; c = org.positions.find(x => x.id === c)?.reports_to || null; } return d; };
  const start = [...mine].sort((a, b) => depth(b) - depth(a))[0];
  const out: Position[] = []; let cur = start.reports_to; const seen = new Set<string>();
  while (cur && !seen.has(cur)) { seen.add(cur); const p = org.positions.find(x => x.id === cur); if (!p) break; out.push(p); cur = p.reports_to; }
  return out;
}

export type Route = { steps: string[][]; copies: string[]; explain: string | null };
/**
 * How a request from `requester` to `approvers` must travel.
 * - An approver further up the line than the requester's manager → the managers in between approve first (or are copied).
 * - An approver outside the requester's line (another department) → the requester's manager is copied.
 */
export function routeFor(org: OrgChart, requester: string, approvers: string[], names: Record<string, string> = {}): Route {
  const line = lineAbove(org, requester).filter(p => p.holders.some(h => h !== requester));
  if (!line.length || !approvers.length) return { steps: [], copies: [], explain: null };
  const nm = (ids: string[]) => ids.map(i => names[i] || 'a manager').join(' / ');
  let needUpTo = -1; const outside: string[] = [];
  for (const a of approvers) { const k = line.findIndex(p => p.holders.includes(a)); if (k > 0) needUpTo = Math.max(needUpTo, k); else if (k < 0) outside.push(a); }
  const direct = line[0].holders.filter(h => h !== requester && !approvers.includes(h));
  if (needUpTo > 0) {
    const between = line.slice(0, needUpTo).map(p => p.holders.filter(h => h !== requester && !approvers.includes(h))).filter(s => s.length);
    if (!between.length) return { steps: [], copies: outside.length ? direct : [], explain: null };
    if (org.routing === 'copy') { const copies = [...new Set(between.flat())]; return { steps: [], copies, explain: `${nm(copies)} copied — the company structure doesn't allow skipping the reporting line.` }; }
    return { steps: between, copies: [], explain: `Goes to ${between.map(nm).join(', then ')} first (reporting line), then to ${nm(approvers)}.` };
  }
  if (outside.length && direct.length) return { steps: [], copies: direct, explain: `${nm(direct)} (your manager) copied.` };
  return { steps: [], copies: [], explain: null };
}

// ------------------------------------------------------------------ stored routes and copies
type StoredRoute = { remaining: string[][]; final: string[]; step: number; total: number; requester: string; explain: string | null };
async function loadRoutes(): Promise<Record<string, StoredRoute>> { return (await getSetting<Record<string, StoredRoute>>('approval_routes').catch(() => null)) || {}; }
async function saveRoutes(r: Record<string, StoredRoute>) {
  const keys = Object.keys(r); if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete r[k];
  await getSupabaseAdmin().from('app_settings').upsert({ key: 'approval_routes', value: r, updated_at: new Date().toISOString() });
}
export async function storeRoute(approvalId: string, s: StoredRoute) { const r = await loadRoutes(); r[approvalId] = s; await saveRoutes(r); }
export async function getRoute(approvalId: string) { return (await loadRoutes())[approvalId] || null; }
export async function routesFor(ids: string[]) { const r = await loadRoutes(); return Object.fromEntries(ids.filter(i => r[i]).map(i => [i, r[i]])); }
export async function dropRoute(approvalId: string) { const r = await loadRoutes(); if (r[approvalId]) { delete r[approvalId]; await saveRoutes(r); } }
/** Moves a routed approval to its next step. Returns the next approvers, or null when this was the last step. */
export async function advanceRoute(approvalId: string): Promise<{ next: string[]; step: number; total: number } | null> {
  const r = await loadRoutes(); const s = r[approvalId]; if (!s) return null;
  const next = s.remaining.length ? s.remaining.shift()! : null;
  if (!next) { delete r[approvalId]; await saveRoutes(r); return null; }
  s.step++; await saveRoutes(r); return { next, step: s.step, total: s.total };
}

type Copy = { id: string; approval_id: string; user_id: string; title: string; at: string };
export async function addCopies(approvalId: string, users: string[], title: string) {
  if (!users.length) return;
  const list = ((await getSetting<Copy[]>('approval_copies').catch(() => null)) || []).slice(-300);
  for (const u of users) list.push({ id: Math.random().toString(36).slice(2, 10), approval_id: approvalId, user_id: u, title, at: new Date().toISOString() });
  await getSupabaseAdmin().from('app_settings').upsert({ key: 'approval_copies', value: list, updated_at: new Date().toISOString() });
}
export async function copiesFor(userId: string, days = 7): Promise<Copy[]> {
  const list = (await getSetting<Copy[]>('approval_copies').catch(() => null)) || [];
  const since = Date.now() - days * 864e5;
  return list.filter(c => c.user_id === userId && new Date(c.at).getTime() > since);
}

/** For the AI: the reporting lines, with names. */
export async function orgBlock(): Promise<string> {
  const org = await getOrg().catch(() => null); if (!org) return '';
  const { data: people } = await getSupabaseAdmin().from('profiles').select('id,full_name,email');
  const nm = (id: string) => { const p = (people || []).find((x: any) => x.id === id); return p ? (p.full_name || p.email) : null; };
  const lines = org.positions.map(p => `- ${p.title}${p.holders.length ? ` (${p.holders.map(nm).filter(Boolean).join(', ')})` : ' (vacant)'}${p.reports_to ? ` → reports to ${org.positions.find(x => x.id === p.reports_to)?.title}` : ''}`);
  return `COMPANY STRUCTURE (reporting lines — approvals and reports go up one level at a time; nobody skips their manager${org.routing === 'copy' ? '; a skipped manager is copied' : '; requests to someone higher go through the managers in between'}):\n${lines.join('\n')}`;
}
