import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError, publicBase } from '@/lib/http';
import { requireRole, ROLES, APPROVAL_CATEGORIES } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { cleanAreas } from '@/lib/access';
import { getDuties } from '@/lib/duties';
import { isOwnerEmail } from '@/lib/owner';

async function guardOwner(id: string, actorId: string, what: string) {
  if (id === actorId) return;
  const { data } = await getSupabaseAdmin().from('profiles').select('email').eq('id', id).maybeSingle();
  if (data && isOwnerEmail(data.email)) throw new HttpError(403, `The main admin can't be ${what}.`);
}

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const { id } = await params;
  const b = await body(req);
  const patch = pick(b, ['full_name', 'title', 'role', 'active']);
  // Access: custom role label and ticked areas (null = all areas of their role)
  if ('custom_role' in b) patch.custom_role = b.custom_role ? String(b.custom_role).slice(0, 60) : null;
  if ('areas' in b) patch.areas = cleanAreas(b.areas);
  // Who does what (design, contracts, agenda…) and approval rights beyond their role
  if ('duties' in b) { const known = new Set((await getDuties()).map(d => d.key)); patch.duties = (Array.isArray(b.duties) ? b.duties : []).filter((x: any) => known.has(x)).slice(0, 30); }
  if ('extra_approves' in b) patch.extra_approves = (Array.isArray(b.extra_approves) ? b.extra_approves : []).filter((x: any) => APPROVAL_CATEGORIES.includes(x));
  if (patch.role && !ROLES.includes(patch.role)) throw new HttpError(400, 'Invalid role');
  if (patch.role === 'admin' && actor.role !== 'admin') throw new HttpError(403, 'Only an admin can grant admin');
  if (id === actor.id && (patch.role && patch.role !== actor.role || patch.active === false)) throw new HttpError(400, 'You cannot change your own role or deactivate yourself');
  if (patch.role && patch.role !== 'admin') await guardOwner(id, actor.id, 'changed to another role');
  if (patch.active === false) await guardOwner(id, actor.id, 'deactivated');
  if (b.password || b.send_reset_email) await guardOwner(id, actor.id, 'have their password reset by someone else');
  const db = getSupabaseAdmin();
  if (typeof patch.full_name === 'string') { patch.full_name = patch.full_name.trim().slice(0, 120); if (!patch.full_name) throw new HttpError(400, 'Name cannot be empty'); }
  if (typeof patch.title === 'string') patch.title = patch.title.trim().slice(0, 120) || null;
  if (typeof b.email === 'string' && b.email.trim()) {
    const email = b.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Invalid email address');
    const cur = await db.auth.admin.getUserById(id);
    if (cur.data?.user && cur.data.user.email?.toLowerCase() !== email) {
      await guardOwner(id, actor.id, 'given a different email by someone else');
      const { data: taken } = await db.from('profiles').select('id').ilike('email', email).neq('id', id).maybeSingle();
      if (taken) throw new HttpError(409, 'Another account already uses that email');
      const r = await db.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (r.error) throw new HttpError(400, r.error.message);
      patch.email = email;
    }
  }
  if (b.full_name !== undefined) { const u = await db.auth.admin.getUserById(id); if (u.data?.user) await db.auth.admin.updateUserById(id, { user_metadata: { ...u.data.user.user_metadata, full_name: patch.full_name } }); }
  const { data, error } = await db.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw /duties|extra_approves/.test(error.message) ? new HttpError(409, 'Duties and extra approval rights need the 4.7 database update (supabase/migrations/007_activity_hours_4_7.sql).') : /areas|custom_role/.test(error.message) ? new HttpError(409, 'Access settings need the 4.3 database update (supabase/migrations/006_email_options_4_3.sql).') : error;
  if (b.approve === true || patch.active === true) {
    const u = await db.auth.admin.getUserById(id);
    if (u.data?.user?.user_metadata?.access_request === 'pending') await db.auth.admin.updateUserById(id, { user_metadata: { ...u.data.user.user_metadata, access_request: 'approved' } });
    if (b.approve === true) await db.from('profiles').update({ active: true }).eq('id', id);
  }
  if (b.password) {
    if (String(b.password).length < 10) throw new HttpError(400, 'Password must be at least 10 characters');
    const u = await db.auth.admin.getUserById(id);
    const r = await db.auth.admin.updateUserById(id, { password: b.password, user_metadata: { ...(u.data?.user?.user_metadata || {}), must_change_password: b.must_change !== false } }); if (r.error) throw new HttpError(400, r.error.message);
  }
  if (b.send_reset_email) {
    const u = await db.auth.admin.getUserById(id);
    const email = u.data?.user?.email; if (!email) throw new HttpError(400, 'This account has no email');
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const base = publicBase(req);
    const r = await anon.auth.resetPasswordForEmail(email, { redirectTo: `${base}/login?reset=1` });
    if (r.error) throw new HttpError(400, `Could not send the reset email: ${r.error.message}`);
  }
  await writeAudit({ actorId: actor.id, action: 'team.member_updated', entityType: 'profile', entityId: id, metadata: { fields: Object.keys(patch), password_reset: !!b.password, reset_email: !!b.send_reset_email } });
  return ok({ member: data });
});

/** Decline a pending access request (removes the requested account). Active accounts are deactivated instead, never deleted. */
export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const u = await db.auth.admin.getUserById(id);
  if (!u.data?.user) throw new HttpError(404, 'Member not found');
  if (u.data.user.user_metadata?.access_request === 'pending') {
    await db.from('profiles').delete().eq('id', id);
    const r = await db.auth.admin.deleteUser(id); if (r.error) throw new HttpError(400, r.error.message);
    await writeAudit({ actorId: actor.id, action: 'team.access_declined', entityType: 'profile', entityId: id, metadata: { email: u.data.user.email } });
    return ok({ declined: true });
  }
  // Remove a member: deleted if they have no work on record, otherwise deactivated (their history is kept).
  if (id === actor.id) throw new HttpError(400, 'You cannot remove yourself');
  await guardOwner(id, actor.id, 'removed');
  const { data: prof } = await db.from('profiles').select('role').eq('id', id).maybeSingle();
  if (prof?.role === 'admin' && actor.role !== 'admin') throw new HttpError(403, 'Only an admin can remove an admin');
  const del = await db.auth.admin.deleteUser(id);
  if (!del.error) { await writeAudit({ actorId: actor.id, action: 'team.member_removed', entityType: 'profile', entityId: id, metadata: { email: u.data.user.email } }); return ok({ removed: true }); }
  await db.from('profiles').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
  await writeAudit({ actorId: actor.id, action: 'team.member_deactivated', entityType: 'profile', entityId: id, metadata: { email: u.data.user.email, reason: 'has records' } });
  return ok({ deactivated: true, message: 'This member has work on record, so the account was deactivated instead of deleted (their history is kept).' });
});
