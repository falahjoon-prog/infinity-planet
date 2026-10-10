import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signFileLink } from '@/lib/file-links';
import { ingestDocument } from '@/lib/documents';
import { writeAudit } from '@/lib/audit';
import { getBrand } from '@/lib/brand';
import { applyAnnotations, Annot, sha256 } from '@/lib/pdf-stamp';
import { loadPdf, derivedName } from '@/lib/pdf-docs';
import { decodePng } from '@/lib/signatures';
import { hashToken, SignField } from '@/lib/sign-requests';
export const runtime = 'nodejs';

const hits = new Map<string, number[]>();
function limit(ip: string) { const now = Date.now(); const h = (hits.get(ip) || []).filter(t => now - t < 600_000); h.push(now); hits.set(ip, h); if (h.length > 60) throw new HttpError(429, 'Too many requests — try again in a few minutes'); }
const ipOf = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';

async function find(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(404, 'This signing link is not valid');
  const { data } = await getSupabaseAdmin().from('sign_requests').select('*').eq('token_hash', hashToken(token)).maybeSingle();
  if (!data) throw new HttpError(404, 'This signing link is not valid');
  if (data.status === 'cancelled') throw new HttpError(410, 'This signing request was cancelled by the sender');
  if (data.status !== 'signed' && new Date(data.expires_at) < new Date()) throw new HttpError(410, 'This signing link has expired — ask the sender for a new one');
  return data;
}

/**
 * Several people signing one document (e.g. a board meeting record): each signature is stamped onto the most recently
 * signed copy, so the final copy carries every signature (and every signing certificate). With no earlier signature
 * nothing changes: the original is used, exactly as before.
 */
async function priorSigned(documentId: string, requestId: string): Promise<{ signer_name: string; signed_document_id: string }[]> {
  const { data } = await getSupabaseAdmin().from('sign_requests').select('signer_name,signed_document_id,signed_at').eq('document_id', documentId).eq('status', 'signed').not('signed_document_id', 'is', null).neq('id', requestId).order('signed_at', { ascending: false }).limit(50);
  return (data || []) as any[];
}
/** The latest signed copy that still exists (newest first), or null. */
async function latestSignedCopy(documentId: string, requestId: string, withBytes: boolean) {
  const prior = await priorSigned(documentId, requestId);
  for (const p of prior) {
    if (withBytes) { try { const { doc, bytes } = await loadPdf(p.signed_document_id); return { doc, bytes: bytes as Uint8Array | null, prior }; } catch { continue; } }
    const { data } = await getSupabaseAdmin().from('documents').select('id,name,storage_path').eq('id', p.signed_document_id).maybeSingle();
    if (data?.storage_path) return { doc: data as any, bytes: null, prior };
  }
  return null;
}
/** One signing at a time per document, so two people signing at the same moment both end up on the final copy. */
const queues = new Map<string, Promise<void>>();
function oneAtATime<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) || Promise.resolve()).then(fn);
  const tail = run.then(() => {}, () => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}

/** Public: the document and the boxes to complete (no sign-in; the link is the credential). */
export const GET = route(async (req: NextRequest, { params }) => {
  limit(ipOf(req));
  const { token } = await params;
  const r = await find(token);
  const B = await getBrand();
  if (r.status === 'sent') await getSupabaseAdmin().from('sign_requests').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', r.id);
  const { doc: original } = await loadPdf(r.document_id);
  // Show the copy this person will sign: with the earlier signers' signatures when there are any.
  const doc = r.status === 'signed' ? original : (await latestSignedCopy(r.document_id, r.id, false).catch(() => null))?.doc || original;
  return ok({ title: r.title, message: r.message, signer_name: r.signer_name, signer_email: r.signer_email.replace(/^(.).*(@.*)$/, '$1•••$2'), fields: r.fields, status: r.status === 'sent' ? 'viewed' : r.status, business: { name: B.business_name, logo_url: B.logo_url }, expires_at: r.expires_at, pdf_url: r.status === 'signed' ? null : signFileLink({ k: 'storage', p: doc.storage_path, n: doc.name, m: 'application/pdf' }, 7200) });
});

/** Public: sign ({ name, signature, initials?, values?, agree: true }) or decline ({ decline: true, reason }). */
export const POST = route(async (req: NextRequest, { params }) => {
  const ip = ipOf(req); limit(ip);
  const { token } = await params;
  const first = await find(token);
  return oneAtATime(String(first.document_id || first.id), () => signOrDecline(req, token, ip));
});

async function signOrDecline(req: NextRequest, token: string, ip: string) {
  const r = await find(token); // read again in the queue: another signing of this document may have just finished
  if (r.status === 'signed') throw new HttpError(409, 'This document has already been signed');
  const b = await body(req);
  const db = getSupabaseAdmin();
  const now = new Date();
  if (b.decline === true) {
    await db.from('sign_requests').update({ status: 'declined', declined_reason: String(b.reason || '').slice(0, 1000) || null, updated_at: now.toISOString(), signer_ip: ip }).eq('id', r.id);
    if (r.created_by) await db.from('reminders').insert({ title: `${r.signer_name} declined to sign “${r.title}”${b.reason ? `: ${String(b.reason).slice(0, 120)}` : ''}`, remind_at: now.toISOString(), recipient_id: r.created_by, project_id: r.project_id }).then(() => {}, () => {});
    await writeAudit({ actorId: null, action: 'sign_request.declined', entityType: 'sign_request', entityId: r.id, metadata: { ip } });
    return ok({ declined: true });
  }
  if (b.agree !== true) throw new HttpError(400, 'Please confirm you agree to sign electronically');
  const name = String(b.name || '').trim().slice(0, 120);
  if (name.length < 2) throw new HttpError(400, 'Type your full name');
  decodePng(String(b.signature || ''));
  const fields: SignField[] = Array.isArray(r.fields) ? r.fields : [];
  const values: Record<string, string> = b.values && typeof b.values === 'object' ? b.values : {};
  const dateStr = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' });
  const annots: Annot[] = fields.map((f, i) => {
    const box = { page: f.page, x: f.x, y: f.y, w: f.w, h: f.h };
    if (f.kind === 'signature') return { ...box, type: 'image' as const, image: b.signature };
    if (f.kind === 'initials') return b.initials ? { ...box, type: 'image' as const, image: String(b.initials) } : { ...box, type: 'text' as const, text: name.split(/\s+/).map(w => w[0]?.toUpperCase()).join(''), size: 12, bold: true };
    if (f.kind === 'date') return { ...box, type: 'text' as const, text: dateStr, size: 10 };
    if (f.kind === 'name') return { ...box, type: 'text' as const, text: name, size: 10 };
    return { ...box, type: 'text' as const, text: String(values[String(i)] || '').slice(0, 300), size: 10 };
  });
  if (fields.some((f, i) => f.kind === 'text' && f.required && !String(values[String(i)] || '').trim())) throw new HttpError(400, 'Please complete all required boxes');
  const { doc, bytes: original } = await loadPdf(r.document_id);
  // Other people already signed this document: add this signature to the latest signed copy (keeps theirs).
  const base = await latestSignedCopy(r.document_id, r.id, true);
  const bytes = base?.bytes || original;
  const signers = [...(base ? base.prior.map(p => p.signer_name).reverse() : []), name];
  const B = await getBrand();
  const cert = [
    `Document: ${r.title}`, `Sent by: ${B.business_name}`, `Original document fingerprint (SHA-256): ${r.original_sha256 || sha256(original)}`, '',
    `Signed by: ${name} (${r.signer_email})`, `Signed at: ${now.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'full', timeStyle: 'long' })} (Brisbane time)`,
    `IP address: ${ip}`, `Device: ${(req.headers.get('user-agent') || '').slice(0, 160)}`,
    `Viewed: ${r.viewed_at ? new Date(r.viewed_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' }) : 'at signing'}`, '',
    'The signer agreed to sign this document electronically. Signed through the secure link emailed to the address above (Electronic Transactions Act 1999 (Cth)).',
    `Request reference: ${r.id}`,
  ];
  const out = await applyAnnotations(bytes, annots, { certificate: cert });
  const who = signers.length > 3 ? `${signers.slice(0, 2).join(', ')} +${signers.length - 2} more` : signers.join(', ');
  const ing = await ingestDocument({ bytes: out, name: derivedName(doc.name, `signed by ${who}`), mimeType: 'application/pdf', projectId: doc.project_id, dealId: doc.deal_id, source: 'upload', category: doc.category, actorId: r.created_by, extraMeta: { signed_from: doc.id, sign_request: r.id, signer: r.signer_email, ...(base ? { builds_on: base.doc.id, signed_by: signers } : {}) } });
  await db.from('sign_requests').update({ status: 'signed', signed_at: now.toISOString(), signed_document_id: ing.document.id, signer_ip: ip, signer_agent: (req.headers.get('user-agent') || '').slice(0, 300), signed_sha256: sha256(out), updated_at: now.toISOString() }).eq('id', r.id);
  if (r.created_by) await db.from('reminders').insert({ title: `✍ ${name} signed “${r.title}” — saved to Documents`, remind_at: now.toISOString(), recipient_id: r.created_by, project_id: r.project_id }).then(() => {}, () => {});
  await writeAudit({ actorId: null, action: 'sign_request.signed', entityType: 'document', entityId: ing.document.id, metadata: { request_id: r.id, signer: r.signer_email, ip } });
  return ok({ signed: true, download_url: signFileLink({ k: 'storage', p: ing.document.storage_path, n: ing.document.name, m: 'application/pdf', dl: 1 }, 86400) });
}
