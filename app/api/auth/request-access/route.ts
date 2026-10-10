import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';
import { writeAudit } from '@/lib/audit';
import { ROLES } from '@/lib/auth';

const hits = new Map<string, number[]>();
const bad = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Public: a team member with a company email requests an account. It is created switched off
 * (cannot sign in) until an admin approves it in Settings → Team & roles.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  const now = Date.now(); const recent = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  if (recent.length >= 10) return bad(429, 'Too many requests from this network — try again in an hour.');
  hits.set(ip, [...recent, now]);
  const s = await getSetting<any>('signup');
  if (!s?.enabled || !s?.domains?.length) return bad(403, 'Self-service access requests are turned off. Ask your administrator to create your account.');
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.full_name || '').trim().slice(0, 120);
  const password = String(b.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(400, 'Enter a valid email address.');
  const domain = email.split('@')[1];
  if (!s.domains.includes(domain)) return bad(403, `Only ${s.domains.map((d: string) => '@' + d).join(', ')} email addresses can request access.`);
  if (name.length < 2) return bad(400, 'Enter your full name.');
  if (password.length < 10) return bad(400, 'Use a password of at least 10 characters.');
  const db = getSupabaseAdmin();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name, access_request: 'pending' } });
  if (error) return bad(/already|registered|exists/i.test(error.message) ? 409 : 400, /already|registered|exists/i.test(error.message) ? 'An account with this email already exists — sign in, or ask your administrator to reset your password.' : error.message);
  const role = ROLES.includes(s.default_role) && !['admin', 'director'].includes(s.default_role) ? s.default_role : 'member';
  await db.from('profiles').upsert({ id: data.user!.id, full_name: name, email, role, active: false });
  await writeAudit({ actorId: null, action: 'team.access_requested', entityType: 'profile', entityId: data.user!.id, metadata: { email } });
  return NextResponse.json({ requested: true, message: 'Request sent. An administrator will approve your account — you can sign in after that.' }, { status: 201 });
}
