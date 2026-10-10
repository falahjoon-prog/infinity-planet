// Move an admin login from one email to another and remove the old email from the app.
// Usage:  node scripts/change-admin-email.mjs old@email.com new@company.com.au
// - If the new email has no account yet: the existing account's email is changed (all history kept).
// - If the new email already has an account: it becomes admin, and the old account is switched off
//   and its email is erased (replaced with a removed-… placeholder), or deleted if nothing references it.
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const [oldEmail, newEmail] = process.argv.slice(2).map(s => String(s || '').trim().toLowerCase());
if (!oldEmail || !newEmail || !newEmail.includes('@')) { console.error('Usage: node scripts/change-admin-email.mjs <old email> <new email>'); process.exit(1); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const all = [];
for (let page = 1; page < 50; page++) { const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 }); if (error) { console.error(error.message); process.exit(1); } all.push(...data.users); if (data.users.length < 200) break; }
const oldU = all.find(u => u.email?.toLowerCase() === oldEmail);
const newU = all.find(u => u.email?.toLowerCase() === newEmail);
if (!oldU && !newU) { console.error(`No account found for ${oldEmail} or ${newEmail}.`); process.exit(1); }

if (oldU && !newU) {
  const { error } = await db.auth.admin.updateUserById(oldU.id, { email: newEmail, email_confirm: true });
  if (error) { console.error(error.message); process.exit(1); }
  await db.from('profiles').update({ email: newEmail, role: 'admin', active: true }).eq('id', oldU.id);
  console.log(`Done: the admin account now signs in as ${newEmail} (same password as before). ${oldEmail} is no longer in the app.`);
  process.exit(0);
}

await db.from('profiles').update({ role: 'admin', active: true }).eq('id', newU.id);
console.log(`${newEmail} is an admin.`);
if (oldU) {
  const del = await db.auth.admin.deleteUser(oldU.id);
  if (!del.error) { console.log(`${oldEmail} was deleted.`); process.exit(0); }
  // Old account owns records (projects, documents, audit history): keep the records, erase the email and switch it off.
  const placeholder = `removed-${oldU.id.slice(0, 8)}@invalid.local`;
  const up = await db.auth.admin.updateUserById(oldU.id, { email: placeholder, email_confirm: true, ban_duration: '876000h' });
  if (up.error) { console.error(up.error.message); process.exit(1); }
  await db.from('profiles').update({ email: placeholder, full_name: 'Former admin account', active: false, role: 'viewer' }).eq('id', oldU.id);
  console.log(`${oldEmail} was removed: the account is switched off and its email erased (its past records are kept).`);
}
