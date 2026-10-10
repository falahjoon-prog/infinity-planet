import { NextRequest } from 'next/server';
import { route, ok, body } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { renderDraft } from '@/lib/email-send';

/** The email exactly as the recipient will see it (branded template, or classic with the person's real signature). */
export const POST = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const b = await body(req);
  let d: any = { ...b, created_by: actor.id };
  if (b.draft_id) { const { data } = await getSupabaseAdmin().from('email_drafts').select('*').eq('id', b.draft_id).maybeSingle(); if (data) d = data; }
  const r = await renderDraft(d, { forSend: false, logoAsDataUrl: true, senderId: actor.id });
  return ok({ html: r.html, text: r.text, branded: !!r.html, classic: r.classic, signature_mode: r.signature_mode, logo_in_email: !!r.look.logo });
});
