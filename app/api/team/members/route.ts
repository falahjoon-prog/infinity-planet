import { NextRequest } from 'next/server';
import { displayName } from '@/lib/people';
import { route, ok, body, must, HttpError } from '@/lib/http';
import { getActor, requireRole, ROLES, Role } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { isOwnerEmail } from '@/lib/owner';

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const db = getSupabaseAdmin();
  const [{ data: people, error }, { data: presence }] = await Promise.all([
    db.from('profiles').select('id,full_name,email,title,role,active,avatar_url,created_at,color,language,custom_role,areas,duties,extra_approves').order('full_name').then(r => r.error ? db.from('profiles').select('id,full_name,email,title,role,active,avatar_url,created_at,color,language,custom_role,areas').order('full_name') : r).then(r => r.error ? db.from('profiles').select('id,full_name,email,title,role,active,avatar_url,created_at').order('full_name') : r),
    db.from('team_presence').select('user_id,status,last_seen'),
  ]);
  if (error) throw error;
  // Pending self-service access requests (accounts switched off until an admin approves).
  const inactive = (people || []).filter((p: any) => p.active === false).map((p: any) => p.id);
  const pending = new Set<string>();
  if (inactive.length) { const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 }); for (const u of list?.users || []) if (inactive.includes(u.id) && u.user_metadata?.access_request === 'pending') pending.add(u.id); }
  const now = Date.now();
  const pm = new Map((presence || []).map((p: any) => [p.user_id, p]));
  const members = (people || []).map((p: any) => {
    const pr: any = pm.get(p.id);
    const fresh = pr && now - new Date(pr.last_seen).getTime() < 3 * 60_000;
    return { ...p, owner: isOwnerEmail(p.email), pending: pending.has(p.id), presence: fresh ? pr.status : 'offline', last_seen: pr?.last_seen || null };
  });
  return ok({ members });
});

/** Admin creates a team member account (works without SMTP). */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const b = await body(req);
  const email = must<string>(b.email, 'email is required').trim().toLowerCase();
  const password = must<string>(b.password, 'A temporary password is required');
  if (password.length < 10) throw new HttpError(400, 'Temporary password must be at least 10 characters');
  const role = (ROLES.includes(b.role) ? b.role : 'member') as Role;
  if (role === 'admin' && actor.role !== 'admin') throw new HttpError(403, 'Only an admin can create another admin');
  const db = getSupabaseAdmin();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: b.full_name || email } });
  if (error) throw new HttpError(400, error.message);
  const id = data.user!.id;
  await db.from('profiles').upsert({ id, full_name: String(b.full_name || '').trim() || displayName({ email }), email, role, title: b.title || null });
  await writeAudit({ actorId: actor.id, action: 'team.member_created', entityType: 'profile', entityId: id, metadata: { email, role } });
  return ok({ member: { id, email, role } }, 201);
});
