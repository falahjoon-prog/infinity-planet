import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';
import { Signature } from '@/lib/email-html';

/** Each person's own email signature (title, phone, mobile) and default "reply as" role. */
export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const all = (await getSetting<Record<string, Signature>>('email_signatures')) || {};
  const { gmailSignature } = await import('@/lib/email-signature');
  const g = await gmailSignature(req.nextUrl.searchParams.get('refresh') === '1', actor.id).catch(() => ({ html: null, email: null } as any));
  return ok({ signature: all[actor.id] || {}, gmail: { html: g.html, email: g.email, error: g.error || null } });
});
export const PATCH = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  const clean = (v: any, n = 80) => typeof v === 'string' ? v.replace(/[\r\n<>]/g, ' ').trim().slice(0, n) : undefined;
  const { sanitizeSignatureHtml } = await import('@/lib/email-signature');
  const sig: Signature = { title: clean(b.title), phone: clean(b.phone, 40), mobile: clean(b.mobile, 40), persona: ['admin', 'coordinator', 'manager', 'ceo'].includes(b.persona) ? b.persona : null,
    mode: ['gmail', 'custom', 'generated', 'none'].includes(b.mode) ? b.mode : 'gmail', html: typeof b.html === 'string' ? sanitizeSignatureHtml(b.html) : undefined };
  const db = getSupabaseAdmin();
  const all = (await getSetting<Record<string, Signature>>('email_signatures')) || {};
  const next = { ...(typeof all === 'object' ? all : {}), [actor.id]: sig };
  const { error } = await db.from('app_settings').upsert({ key: 'email_signatures', value: next, updated_by: actor.id, updated_at: new Date().toISOString() });
  if (error) throw error;
  if (sig.title !== undefined) await db.from('profiles').update({ title: sig.title || null }).eq('id', actor.id);
  return ok({ signature: sig });
});
