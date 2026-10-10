import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { providerStatus, probeOllama, models, PROVIDER_LABEL, ollamaBase } from '@/lib/providers';
import { googleIntegration, googleConfigured, redirectUri } from '@/lib/google';
import { APP_VERSION } from '@/lib/brand';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const db = getSupabaseAdmin();
  await (await import('@/lib/ai-keys')).ensureAiKeys();
  const st = providerStatus();
  const { driveStatus } = await import('@/lib/drive-live');
  const [ollama, google, migration, m5, m6, bucket, drive, m7] = await Promise.all([
    probeOllama(), googleIntegration(),
    db.from('app_settings').select('key').limit(1),
    db.from('drive_links').select('id').limit(1),
    db.from('email_drafts').select('scheduled_at').limit(1),
    db.storage.getBucket('rhc-documents'),
    driveStatus().catch(() => null),
    db.from('time_logs').select('id').limit(1),
  ]);
  const m = models();
  const providers = (['openai', 'gemini', 'anthropic', 'ollama'] as const).map(p => ({
    id: p, label: PROVIDER_LABEL[p], model: m[p],
    configured: p === 'ollama' ? ollama.ok : st[p],
    detail: p === 'ollama' ? (ollama.ok ? `Connected at ${ollamaBase()} · ${ollama.models.length} model(s): ${ollama.models.slice(0, 5).join(', ') || 'none pulled'}` + (ollama.models.length && !ollama.models.some(x => x.startsWith(m.ollama)) ? ` — configured model "${m.ollama}" not pulled` : '') : `${ollama.error}. Set OLLAMA_BASE_URL on the server.`)
      : st[p] ? `Key added · model ${m[p]}` : 'No key yet — add one in Settings → AI',
  }));
  const isAdmin = ['admin', 'director'].includes(actor.role);
  return ok({
    providers,
    builtin: { legal: true, designer: true, search: true },
    supabase: { ok: !migration.error || true, migration_v4: !migration.error && !m5.error && !m6.error && !m7.error, migration_error: migration.error ? `004: ${migration.error.message}` : m5.error ? `005_infinity_planet_4_1.sql not applied (${m5.error.message})` : m6.error ? `006_email_options_4_3.sql not applied (${m6.error.message})` : m7.error ? `007_activity_hours_4_7.sql not applied (${m7.error.message})` : null, storage_bucket: !!bucket.data },
    google: { configured: googleConfigured(), connected: google?.status === 'connected', status: google?.status || 'not_connected', account: google?.account_email || null, redirect_uri: isAdmin ? redirectUri() : undefined, updated_at: google?.updated_at || null, drive: drive ? { links: drive.links.length, indexed: drive.indexed, last_sync: drive.last_sync, auto_sync_minutes: 30 } : null },
    ocr: { images: true, scanned_pdf: st.gemini || st.anthropic || st.openai },
    server: { version: APP_VERSION, node: process.version },
  });
});
