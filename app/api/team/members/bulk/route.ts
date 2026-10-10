import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireRole, ROLES, Role } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';

const pw = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'; return Array.from(crypto.randomBytes(14), x => c[x % c.length]).join(''); };
const nameFrom = (email: string) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Admin: create several team accounts at once. Returns one-time temporary passwords to share securely. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director']);
  const b = await body(req);
  const emails: string[] = [...new Set<string>((Array.isArray(b.emails) ? b.emails : String(b.emails || '').split(/[\s,;]+/)).map((e: string) => String(e).trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) throw new HttpError(400, 'Add at least one email address');
  if (emails.length > 50) throw new HttpError(400, 'Add up to 50 people at a time');
  const role = (ROLES.includes(b.role) ? b.role : 'member') as Role;
  if (role === 'admin' && actor.role !== 'admin') throw new HttpError(403, 'Only an admin can create another admin');
  const db = getSupabaseAdmin();
  const results: any[] = [];
  for (const email of emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { results.push({ email, ok: false, error: 'Not a valid email' }); continue; }
    const password = pw(); const full_name = nameFrom(email);
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
    if (error) { results.push({ email, ok: false, error: /already|registered|exists/i.test(error.message) ? 'Already has an account' : error.message }); continue; }
    await db.from('profiles').upsert({ id: data.user!.id, full_name, email, role, active: true });
    results.push({ email, ok: true, full_name, role, password });
  }
  await writeAudit({ actorId: actor.id, action: 'team.members_bulk_created', metadata: { created: results.filter(r => r.ok).map(r => r.email), role } });
  return ok({ results }, 201);
});
