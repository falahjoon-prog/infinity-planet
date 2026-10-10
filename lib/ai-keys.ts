/**
 * AI keys entered by an admin in Settings → AI.
 *  - Stored encrypted (AES-256-GCM) in app_settings under "secret_ai_keys"; never returned to browsers
 *    (only the last 4 characters are shown) and never included in /api/settings.
 *  - Loaded into the server's environment on start-up and the moment they are saved — no restart needed.
 *  - A key saved here takes priority over one in .env.local; removing it falls back to .env.local.
 */
import crypto from 'crypto';
import { getSupabaseAdmin } from './supabase';

export const AI_KEY_FIELDS = {
  anthropic: { key: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL', label: 'Anthropic Claude', prefix: /^sk-ant-/, hint: 'Starts with sk-ant-', where: 'https://console.anthropic.com/settings/keys' },
  openai: { key: 'OPENAI_API_KEY', model: 'OPENAI_MODEL', label: 'OpenAI (ChatGPT)', prefix: /^sk-/, hint: 'Starts with sk-', where: 'https://platform.openai.com/api-keys' },
  gemini: { key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL', label: 'Google Gemini', prefix: /^(AIza[\w-]{10,}|AQ\.[\w.-]{10,})$/, hint: 'Starts with AIza or AQ.', where: 'https://aistudio.google.com/app/apikey' },
} as const;
export type KeyProvider = keyof typeof AI_KEY_FIELDS;
export const isKeyProvider = (p: unknown): p is KeyProvider => typeof p === 'string' && p in AI_KEY_FIELDS;

type Stored = Partial<Record<KeyProvider, { enc: string; last4: string; model?: string | null; updated_at: string; updated_by?: string | null }>>;
const SETTING = 'secret_ai_keys';

// What .env.local had before any saved key was applied (so "Remove" can fall back to it)
const g = globalThis as any;
const ORIGINAL: Record<string, string | undefined> = g.__ipEnvOriginal || (g.__ipEnvOriginal = Object.fromEntries(Object.values(AI_KEY_FIELDS).flatMap(f => [[f.key, process.env[f.key]], [f.model, process.env[f.model]]])));

function secret() {
  const raw = process.env.GOOGLE_ENCRYPTION_KEY && process.env.GOOGLE_ENCRYPTION_KEY.length >= 32 ? process.env.GOOGLE_ENCRYPTION_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!raw) throw new Error('The server has no secret to encrypt keys with (SUPABASE_SERVICE_ROLE_KEY is missing).');
  return crypto.createHash('sha256').update('infinity-planet:ai-keys:' + raw).digest();
}
function enc(v: string) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', secret(), iv); const e = Buffer.concat([c.update(v, 'utf8'), c.final()]); return [iv, c.getAuthTag(), e].map(b => b.toString('base64url')).join('.'); }
function dec(v: string) { const [iv, tag, data] = v.split('.'); const d = crypto.createDecipheriv('aes-256-gcm', secret(), Buffer.from(iv, 'base64url')); d.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8'); }

async function readStored(): Promise<Stored> {
  const { data } = await getSupabaseAdmin().from('app_settings').select('value').eq('key', SETTING).maybeSingle();
  return (data?.value as Stored) || {};
}
async function writeStored(v: Stored, by?: string) {
  const { error } = await getSupabaseAdmin().from('app_settings').upsert({ key: SETTING, value: v, updated_by: by || null, updated_at: new Date().toISOString() });
  if (error) throw error;
}

function apply(stored: Stored) {
  for (const p of Object.keys(AI_KEY_FIELDS) as KeyProvider[]) {
    const f = AI_KEY_FIELDS[p]; const s = stored[p];
    let key: string | undefined; try { key = s ? dec(s.enc) : undefined; } catch { key = undefined; }
    if (key) process.env[f.key] = key; else if (ORIGINAL[f.key] !== undefined) process.env[f.key] = ORIGINAL[f.key]; else delete process.env[f.key];
    if (s?.model) process.env[f.model] = s.model; else if (ORIGINAL[f.model] !== undefined) process.env[f.model] = ORIGINAL[f.model]; else delete process.env[f.model];
  }
}

let loaded: Promise<void> | null = null; let loadedAt = 0;
/** Makes sure saved keys are in the environment (cheap after the first call; refreshes every 5 minutes). */
export function ensureAiKeys(): Promise<void> {
  if (!loaded || Date.now() - loadedAt > 5 * 60_000) { loadedAt = Date.now(); loaded = readStored().then(apply).catch(() => {}); }
  return loaded;
}

/** For the Settings screen: which keys are set and where from — never the key itself. */
export async function aiKeyStatus() {
  await ensureAiKeys();
  const stored = await readStored().catch(() => ({} as Stored));
  return (Object.keys(AI_KEY_FIELDS) as KeyProvider[]).map(p => {
    const f = AI_KEY_FIELDS[p]; const s = stored[p];
    const envKey = ORIGINAL[f.key];
    return { id: p, label: f.label, hint: f.hint, where: f.where, set: !!(s || envKey), source: s ? 'app' : envKey ? 'server' : null, last4: s?.last4 || (envKey ? envKey.slice(-4) : null), model: s?.model || ORIGINAL[f.model] || null, updated_at: s?.updated_at || null };
  });
}

export async function saveAiKey(p: KeyProvider, key: string, model: string | null | undefined, by: string) {
  const f = AI_KEY_FIELDS[p]; const k = String(key || '').trim().replace(/^["']|["']$/g, '');
  if (k.length < 20 || /\s/.test(k)) throw new Error(`That doesn't look like a ${f.label} key. ${f.hint}.`);
  if (!f.prefix.test(k)) throw new Error(`That doesn't look like a ${f.label} key — ${f.hint.toLowerCase()}.`);
  if (p === 'openai' && /^sk-ant-/.test(k)) throw new Error('That is an Anthropic (Claude) key — paste it under Anthropic Claude.');
  const stored = await readStored();
  stored[p] = { enc: enc(k), last4: k.slice(-4), model: (model || '').trim() || null, updated_at: new Date().toISOString(), updated_by: by };
  await writeStored(stored, by); apply(stored); loadedAt = Date.now(); loaded = Promise.resolve();
}
export async function setAiModel(p: KeyProvider, model: string | null, by: string) {
  const stored = await readStored(); const s = stored[p];
  if (!s) throw new Error('Save a key first.');
  s.model = (model || '').trim() || null; await writeStored(stored, by); apply(stored);
}
export async function removeAiKey(p: KeyProvider, by: string) {
  const stored = await readStored(); delete stored[p];
  await writeStored(stored, by); apply(stored); loadedAt = Date.now(); loaded = Promise.resolve();
}
