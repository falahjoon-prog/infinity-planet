import { ensureOwner, isOwnerEmail } from './owner';
import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from './supabase';
import { HttpError } from './http';
import { apiArea, areaLevel, AREAS, READ_POSTS } from './access';

export type Role = 'admin' | 'director' | 'manager' | 'legal' | 'marketing' | 'project' | 'member' | 'viewer';
export type Actor = { id: string; role: Role; full_name: string | null; email: string | null; areas?: string[] | null; custom_role?: string | null; duties?: string[] | null; extra_approves?: string[] | null };

export const ROLES: Role[] = ['admin', 'director', 'manager', 'legal', 'marketing', 'project', 'member', 'viewer'];
export const EXECUTIVE: Role[] = ['admin', 'director'];

/** Who may decide approvals of each category. Executives can decide everything. */
export const APPROVER_ROLES: Record<string, Role[]> = {
  legal: ['admin', 'director', 'legal'],
  contract: ['admin', 'director', 'legal'],
  marketing: ['admin', 'director', 'marketing'],
  email: ['admin', 'director', 'manager'],
  document: ['admin', 'director', 'manager', 'legal'],
  template: ['admin', 'director', 'legal', 'marketing'],
  general: ['admin', 'director', 'manager'],
  hours: ['admin', 'director'],
};

/** The middleware verifies the Supabase JWT and sets x-rhc-actor-id. */
export function getRequestActor(req: NextRequest) {
  return req.headers.get('x-rhc-actor-id') || null;
}

export async function getActor(req: NextRequest): Promise<Actor> {
  const id = getRequestActor(req);
  if (!id) throw new HttpError(401, 'Authentication required');
  const db = getSupabaseAdmin();
  let { data, error } = await db.from('profiles').select('id,role,full_name,email,active,areas,custom_role,duties,extra_approves').eq('id', id).maybeSingle() as any;
  if (error && /duties|extra_approves/.test(error.message)) ({ data, error } = await db.from('profiles').select('id,role,full_name,email,active,areas,custom_role').eq('id', id).maybeSingle() as any);
  if (error && /areas|custom_role/.test(error.message)) ({ data, error } = await db.from('profiles').select('id,role,full_name,email,active').eq('id', id).maybeSingle() as any);
  if (error) throw new HttpError(500, error.message);
  if (!data) {
    // Profile trigger may not have run (e.g. user created before schema). Create it.
    const { data: u } = await db.auth.admin.getUserById(id);
    const email = u?.user?.email || null;
    const { data: created, error: e2 } = await db.from('profiles').upsert({ id, full_name: email, email }).select('id,role,full_name,email').single();
    if (e2) throw new HttpError(500, e2.message);
    return created as Actor;
  }
  if (isOwnerEmail(data.email)) data = await ensureOwner(data);
  if (data.active === false) {
    const { data: u } = await db.auth.admin.getUserById(id);
    if (u?.user?.user_metadata?.access_request === 'pending') throw new HttpError(403, 'Your access request is waiting for an administrator to approve it. You will be able to sign in once it is approved.');
    throw new HttpError(403, 'Your account has been deactivated');
  }
  // Area access chosen by an admin (Settings → Team & roles → Edit → Access)
  const area = apiArea(req.nextUrl.pathname);
  const level = areaLevel(data.role, data.areas, area);
  const areaName = AREAS.find(a => a.key === area)?.label || 'this area';
  if (!level) throw new HttpError(403, `You don't have access to ${areaName}. Ask an admin to give you access.`);
  if (level === 'view' && !['GET', 'HEAD'].includes(req.method) && !READ_POSTS.includes(req.nextUrl.pathname)) throw new HttpError(403, `You can view ${areaName} but not change it. Ask an admin for full access.`);
  return { id: data.id, role: data.role as Role, full_name: data.full_name, email: data.email, areas: data.areas ?? null, custom_role: data.custom_role ?? null, duties: data.duties ?? [], extra_approves: data.extra_approves ?? [] };
}

export async function requireRole(req: NextRequest, roles: Role[]): Promise<Actor> {
  const actor = await getActor(req);
  if (!roles.includes(actor.role)) throw new HttpError(403, `This action requires one of these roles: ${roles.join(', ')}`);
  return actor;
}

/** Any signed-in member except read-only viewers. */
export async function requireWriter(req: NextRequest): Promise<Actor> {
  const actor = await getActor(req);
  if (actor.role === 'viewer') throw new HttpError(403, 'Viewers have read-only access');
  return actor;
}

/** Approval categories a person can decide: from their role, plus any extra rights an admin gave them (Settings → Team & access). */
export const APPROVAL_CATEGORIES = ['legal', 'contract', 'marketing', 'email', 'document', 'template', 'general', 'hours'];
export function canApprove(actor: Actor, category: string) {
  return (APPROVER_ROLES[category] || APPROVER_ROLES.general).includes(actor.role) || (actor.extra_approves || []).includes(category);
}

/** Back-compat for V3 routes. Optional shared secret for server-to-server calls. */
export function assertWriteAccess(req: NextRequest) {
  const required = process.env.RHC_INTERNAL_API_KEY;
  const actorId = getRequestActor(req);
  if (actorId) return { ok: true as const, actorId };
  if (required && req.headers.get('x-rhc-api-key') === required) return { ok: true as const, actorId: null };
  return { ok: false as const, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }) };
}
