// Create (or promote) an RHC City admin account.
// Usage:  node scripts/create-admin.mjs you@company.com "Strong-Temp-Password" "Your Name"
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const [email, password, name] = process.argv.slice(2);
if (!email) { console.error('Usage: node scripts/create-admin.mjs <email> [password] [full name]'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let user = null;
for (let page = 1; page < 50 && !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error.message); process.exit(1); }
  user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
  if (data.users.length < 200) break;
}
if (!user) {
  if (!password || password.length < 10) { console.error('New account: supply a password of at least 10 characters.'); process.exit(1); }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name || email } });
  if (error) { console.error(error.message); process.exit(1); }
  user = data.user; console.log(`Created ${email}`);
} else if (password) {
  const { error } = await db.auth.admin.updateUserById(user.id, { password }); if (error) { console.error(error.message); process.exit(1); }
  console.log(`Password updated for ${email}`);
}
const { error } = await db.from('profiles').upsert({ id: user.id, email, full_name: name || user.user_metadata?.full_name || email, role: 'admin' });
if (error) { console.error(`Profile update failed: ${error.message}. Did you run the SQL migrations?`); process.exit(1); }
console.log(`${email} is now an RHC City admin.`);
