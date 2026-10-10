// Checks .env.local on the RHC server. Usage: npm run check-config
import { readFileSync, existsSync } from 'fs';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const has = k => !!(process.env[k] && process.env[k].trim());
const line = (ok, k, note) => console.log(`${ok ? '  OK      ' : '  MISSING '} ${k}${note ? `  — ${note}` : ''}`);
console.log('\nRHC City configuration check (.env.local)\n\nRequired');
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) line(has(k), k);
console.log('\nAI providers (optional — built-in Legal AI, Designer and Search need none)');
for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) console.log(`  ${has(k) ? 'set     ' : 'not set '} ${k}`);
console.log(`  ollama   ${process.env.OLLAMA_ENABLED === 'false' ? 'disabled' : (process.env.OLLAMA_BASE_URL || 'http://localhost:11434')} (model ${process.env.OLLAMA_MODEL || 'llama3.1'})`);
console.log('\nGoogle Workspace (optional)');
const g = has('GOOGLE_CLIENT_ID') && has('GOOGLE_CLIENT_SECRET');
console.log(`  ${g ? 'set     ' : 'not set '} GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET`);
if (g) line((process.env.GOOGLE_ENCRYPTION_KEY || '').length >= 32, 'GOOGLE_ENCRYPTION_KEY', 'must be 32+ random characters');
console.log(`  redirect ${process.env.GOOGLE_REDIRECT_URI || `${process.env.RHC_PUBLIC_URL || 'http://localhost:3300'}/api/google/callback`}`);
const bad = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !has(k));
if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === process.env.SUPABASE_SERVICE_ROLE_KEY) { console.log('\n  ERROR: the anon key and service-role key are the same. The service-role key must never be public.'); process.exit(1); }
console.log(bad.length ? `\n${bad.length} required setting(s) missing.\n` : '\nRequired settings present.\n');
process.exit(bad.length ? 1 : 0);
