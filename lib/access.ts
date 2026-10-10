/**
 * App areas and per-member access.
 * - Every member has a base role (admin, director, manager, legal, marketing, project, member, viewer) that sets
 *   what they can DO (write, approve…), plus an optional custom role name (e.g. "Site Supervisor") created by an admin.
 * - An admin can tick which AREAS each member may open. Unticked areas are hidden in the menu and refused by the server.
 *   Admins and directors always have every area.
 */
export const AREAS: { key: string; label: string; paths: string[]; api: string[] }[] = [
  { key: 'assistant', label: 'AI Assistant', paths: ['/assistant'], api: ['/api/ai'] },
  { key: 'projects', label: 'Projects', paths: ['/projects'], api: ['/api/projects'] },
  { key: 'crm', label: 'CRM / Deals & contacts', paths: ['/crm'], api: ['/api/deals', '/api/contacts', '/api/counterparties'] },
  { key: 'tasks', label: 'Tasks', paths: ['/tasks'], api: ['/api/tasks'] },
  { key: 'documents', label: 'Documents', paths: ['/documents', '/board-meetings'], api: ['/api/documents', '/api/knowledge', '/api/board-meetings'] },
  { key: 'drive', label: 'Google Drive', paths: [], api: ['/api/google/drive'] },
  { key: 'legal', label: 'Legal AI', paths: ['/legal'], api: ['/api/legal'] },
  { key: 'company_records', label: 'Company records', paths: [], api: ['/api/company-records'] },
  { key: 'signing', label: 'Send for signature', paths: [], api: ['/api/sign-requests'] },
  { key: 'drafting', label: 'Drafting & templates', paths: ['/drafting'], api: ['/api/generated', '/api/templates', '/api/generate'] },
  { key: 'notes', label: 'Notes', paths: ['/notes'], api: ['/api/notes'] },
  { key: 'marketing', label: 'Marketing', paths: ['/marketing'], api: ['/api/marketing'] },
  { key: 'designer', label: 'Designer', paths: ['/designer'], api: ['/api/designer'] },
  { key: 'presentations', label: 'Presentations', paths: ['/presentations'], api: ['/api/decks'] },
  { key: 'research', label: 'Research (web reports)', paths: [], api: ['/api/research'] },
  { key: 'gmail', label: 'Gmail', paths: ['/gmail'], api: ['/api/email', '/api/google/gmail'] },
  { key: 'calendar', label: 'Calendar', paths: ['/calendar'], api: ['/api/calendar'] },
  { key: 'chat', label: 'Team Chat', paths: ['/team'], api: ['/api/team/messages', '/api/team/channels'] },
  { key: 'approvals', label: 'Approvals', paths: ['/approvals'], api: ['/api/approvals'] },
  { key: 'executive', label: 'Executive dashboard', paths: ['/executive'], api: ['/api/executive'] },
  { key: 'activity', label: 'Activity & hours', paths: ['/activity'], api: ['/api/activity/hours'] },
  { key: 'finance', label: 'Finance & payroll', paths: ['/finance'], api: ['/api/finance'] },
];
/** Areas nobody gets by default: only admins and directors, plus members an admin ticks one by one. */
export const PRIVATE_AREAS = ['finance'];
export const AREA_KEYS = AREAS.map(a => a.key);
export const FULL_ACCESS_ROLES = ['admin', 'director'];

export function apiArea(pathname: string): string | null {
  for (const a of AREAS) if (a.api.some(p => pathname === p || pathname.startsWith(p + '/'))) return a.key;
  return null;
}
export function pageArea(pathname: string, search = ''): string | null {
  if (pathname.startsWith('/documents') && /tab=drive/.test(search)) return 'drive';
  if (pathname.startsWith('/presentations') && /tab=research/.test(search)) return 'research';
  for (const a of AREAS) if (a.paths.some(p => pathname === p || pathname.startsWith(p + '/'))) return a.key;
  return null;
}
/**
 * Each ticked area is stored as "key" (full access) or "key:view" (can open and read, cannot change anything).
 * areas = null/undefined means "everything".
 */
export type AreaLevel = 'full' | 'view' | null;
export function areaLevel(role: string, areas: string[] | null | undefined, key: string | null): AreaLevel {
  if (key && PRIVATE_AREAS.includes(key) && !FULL_ACCESS_ROLES.includes(role)) return Array.isArray(areas) ? (areas.includes(key) ? 'full' : areas.includes(`${key}:view`) ? 'view' : null) : null;
  if (!key || FULL_ACCESS_ROLES.includes(role) || !Array.isArray(areas)) return 'full';
  if (areas.includes(key)) return 'full';
  if (areas.includes(`${key}:view`)) return 'view';
  // Lists saved before 4.7 (no marker): new areas follow the area they were split from, and everyone can see their own hours.
  if (!areas.includes(AREAS_MARK) && LEGACY[key]) return LEGACY[key] === '*' ? 'full' : areaLevel(role, areas, LEGACY[key]);
  return null;
}
const AREAS_MARK = '@v47';
const LEGACY: Record<string, string> = { research: 'presentations', company_records: 'legal', signing: 'documents', activity: '*' };
export function hasArea(role: string, areas: string[] | null | undefined, key: string | null) {
  return areaLevel(role, areas, key) !== null;
}
/** Keeps only known areas ("key" or "key:view"); one entry per area. */
export function cleanAreas(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  const out = new Map<string, string>();
  for (const x of list) { if (typeof x !== 'string') continue; const [k, lvl] = x.split(':'); if (AREA_KEYS.includes(k) && (!lvl || lvl === 'view')) { if (!out.has(k) || !lvl) out.set(k, lvl ? `${k}:view` : k); } }
  return [...out.values(), AREAS_MARK];
}
/** Requests that only read, even though they are sent as POST (searching, previews, asking the AI). */
export const READ_POSTS = ['/api/knowledge/search', '/api/ai/chat', '/api/ai/translate', '/api/email/preview', '/api/templates/preview', '/api/letterhead/preview', '/api/decks/render'];

export type CustomRole = { key: string; label: string; base: string; areas: string[] | null; description?: string; duties?: string[]; approves?: string[] };
