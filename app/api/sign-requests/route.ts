import { NextRequest } from 'next/server';
import { route, ok, body, must, HttpError, publicBase } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { cleanAddressList } from '@/lib/google';
import { getBrand } from '@/lib/brand';
import { loadPdf } from '@/lib/pdf-docs';
import { sha256 } from '@/lib/pdf-stamp';
import { hashToken, newToken, SignField } from '@/lib/sign-requests';

const need = (e: any) => /sign_requests/.test(String(e?.message || '')) ? new HttpError(409, 'Online signing needs the 4.3 database update (supabase/migrations/006_email_options_4_3.sql).') : e;

export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  let q = getSupabaseAdmin().from('sign_requests').select('id,document_id,title,signer_name,signer_email,status,expires_at,viewed_at,signed_at,signed_document_id,declined_reason,created_at, creator:profiles!sign_requests_created_by_fkey(full_name)').order('created_at', { ascending: false }).limit(200);
  if (sp.get('document_id')) q = q.eq('document_id', sp.get('document_id')!);
  const { data, error } = await q; if (error) throw need(error);
  return ok({ requests: data || [] });
});

/** Send a PDF for signature: creates a secure link and (optionally) an email draft to the signer, ready to send. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.document_id, 'Choose the PDF'); must(String(b.signer_name || '').trim(), 'Signer name is required'); must(String(b.signer_email || '').trim(), 'Signer email is required');
  const email = cleanAddressList(String(b.signer_email)).split(',')[0];
  const fields: SignField[] = (Array.isArray(b.fields) ? b.fields : []).filter((f: any) => ['signature', 'initials', 'date', 'name', 'text'].includes(f?.kind)).slice(0, 60);
  if (!fields.some(f => f.kind === 'signature')) throw new HttpError(400, 'Place at least one signature box for the signer');
  const { doc, bytes } = await loadPdf(b.document_id);
  const token = newToken();
  const days = Math.max(1, Math.min(90, Number(b.expires_days) || 30));
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('sign_requests').insert({ document_id: doc.id, project_id: doc.project_id, token_hash: hashToken(token), title: String(b.title || doc.name).slice(0, 200), message: b.message ? String(b.message).slice(0, 2000) : null, signer_name: String(b.signer_name).trim().slice(0, 120), signer_email: email, fields, expires_at: new Date(Date.now() + days * 86400_000).toISOString(), original_sha256: sha256(bytes), created_by: actor.id }).select().single();
  if (error) throw need(error);
  const base = publicBase(req);
  const link = `${base}/sign/${token}`;
  let draft: any = null;
  if (b.email !== false) {
    const B = await getBrand();
    const bodyText = `Dear ${String(b.signer_name).trim().split(' ')[0]},\n\n${b.message ? `${String(b.message).trim()}\n\n` : ''}Please review and sign “${data.title}” online using this secure link:\n${link}\n\nThe link is personal to you and expires on ${new Date(data.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}. You can sign with your mouse, finger or by typing your name.\n\nKind regards,\n${actor.full_name || B.business_name}\n${B.business_name}`;
    const r = await db.from('email_drafts').insert({ to_addresses: email, subject: `Please sign: ${data.title}`, body: bodyText, project_id: doc.project_id, status: 'draft', engine: 'esign', created_by: actor.id }).select('id').single();
    draft = r.data; if (draft) await db.from('sign_requests').update({ email_draft_id: draft.id }).eq('id', data.id);
  }
  await writeAudit({ actorId: actor.id, action: 'sign_request.created', entityType: 'document', entityId: doc.id, metadata: { request_id: data.id, signer: email } });
  return ok({ request: data, link, email_draft_id: draft?.id || null }, 201);
});
