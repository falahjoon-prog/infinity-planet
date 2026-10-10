import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Minutes the signed-in person was actually using the app (the page was in front and they typed, clicked or scrolled
 * in the last two minutes). Sent in batches by the app; each minute is counted once however many windows are open.
 */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body<{ minutes?: { m: string; a?: string }[] }>(req);
  const now = Date.now();
  const seen = new Set<string>();
  const rows = (Array.isArray(b.minutes) ? b.minutes : []).slice(0, 300).map(x => {
    const t = new Date(x?.m).getTime(); if (!Number.isFinite(t) || t > now + 120_000 || t < now - 3 * 864e5) return null;
    const minute = new Date(Math.floor(t / 60_000) * 60_000).toISOString(); if (seen.has(minute)) return null; seen.add(minute);
    return { user_id: actor.id, minute, area: typeof x.a === 'string' ? x.a.replace(/[^a-z_]/g, '').slice(0, 30) || null : null };
  }).filter(Boolean) as any[];
  if (rows.length) { const { error } = await getSupabaseAdmin().from('activity_minutes').upsert(rows, { onConflict: 'user_id,minute', ignoreDuplicates: true }); if (error) throw error; }
  return ok({ saved: rows.length });
});
