/**
 * The main admin ("owner") of this install, set in .env.local:
 *   RHC_OWNER_EMAIL=you@example.com   RHC_OWNER_NAME=Your Name
 * The owner always stays an active admin: other admins can't demote, deactivate or remove them.
 * Other admins (a second admin, etc.) are made from Settings → Team & access.
 */
import { getSupabaseAdmin } from './supabase';

export const ownerEmail = () => String(process.env.RHC_OWNER_EMAIL || '').trim().toLowerCase();
export const ownerName = () => String(process.env.RHC_OWNER_NAME || '').trim().slice(0, 120);
export const isOwnerEmail = (email?: string | null) => !!ownerEmail() && String(email || '').trim().toLowerCase() === ownerEmail();

const done = new Set<string>();
/** Called when the owner signs in: makes sure they are an active admin and their name isn't just their email. */
export async function ensureOwner(p: { id: string; email?: string | null; role?: string; full_name?: string | null; active?: boolean | null }) {
  if (!isOwnerEmail(p.email) || done.has(p.id)) return p;
  const patch: Record<string, any> = {};
  if (p.role !== 'admin') patch.role = 'admin';
  if (p.active === false) patch.active = true;
  const nm = ownerName();
  if (nm && (!p.full_name || p.full_name.includes('@') || !p.full_name.trim())) patch.full_name = nm;
  if (Object.keys(patch).length) {
    const db = getSupabaseAdmin();
    const { error } = await db.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) return p;
    if (patch.full_name) { const u = await db.auth.admin.getUserById(p.id); if (u.data?.user) await db.auth.admin.updateUserById(p.id, { user_metadata: { ...u.data.user.user_metadata, full_name: patch.full_name } }); }
  }
  done.add(p.id);
  return { ...p, ...patch };
}
