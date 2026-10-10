/**
 * Email signatures.
 * Each person chooses (Settings → My profile → My email signature):
 *  - gmail:     the Gmail signature of the connected mailbox (read from Gmail settings), default when it exists
 *  - custom:    their own signature, pasted from Gmail/Outlook (HTML with logo, icons, banners)
 *  - generated: the Infinity Planet signature block (name, title, company, contact line)
 *  - none
 */
import { google } from 'googleapis';
import { mailClient, googleCall } from './google';
import { getSignature, Signature } from './email-html';

export type SignatureMode = 'gmail' | 'custom' | 'generated' | 'none';

/** Keeps formatting, links and images; removes scripts, event handlers, forms, iframes and javascript: URLs. */
export function sanitizeSignatureHtml(html: string): string {
  let h = String(html || '').slice(0, 100_000);
  h = h.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|button|textarea|select|svg|math|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base|svg|math|noscript|template)\b[^>]*>/gi, '')
    .replace(/<\/?(html|head|body)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"')
    .replace(/\s(srcdoc|formaction)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  return h.trim();
}
export function htmlToText(html: string) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

const caches = new Map<string, { at: number; html: string | null; email: string | null }>();
/** A person's own Gmail signature (primary send-as address of their own mailbox). Cached for 10 minutes. */
export async function gmailSignature(force = false, userId: string): Promise<{ html: string | null; email: string | null; error?: string }> {
  const cache = caches.get(userId);
  if (!force && cache && Date.now() - cache.at < 600_000) return cache;
  try {
    const { auth, mailbox: mb, provider } = await mailClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });
    const r = await googleCall(provider, () => gmail.users.settings.sendAs.list({ userId: 'me' }));
    const mailbox = String(mb || '').toLowerCase();
    const sa = (r.data.sendAs || []).find(s => s.sendAsEmail?.toLowerCase() === mailbox) || (r.data.sendAs || []).find(s => s.isPrimary) || null;
    const c = { at: Date.now(), html: sa?.signature ? sanitizeSignatureHtml(sa.signature) : null, email: sa?.sendAsEmail || null };
    caches.set(userId, c); return c;
  } catch (e: any) { return { html: null, email: null, error: e?.message || 'Could not read the Gmail signature' }; }
}

/** The signature HTML to use for a person (null = use the generated block or none). */
export async function signatureFor(userId: string): Promise<{ mode: SignatureMode; html: string | null; sig: Signature }> {
  const sig = await getSignature(userId) as Signature & { mode?: SignatureMode; html?: string };
  const mode: SignatureMode = (['gmail', 'custom', 'generated', 'none'] as const).includes(sig.mode as any) ? sig.mode as SignatureMode : 'gmail';
  if (mode === 'custom' && sig.html) return { mode, html: sanitizeSignatureHtml(sig.html), sig };
  if (mode === 'gmail') { const g = await gmailSignature(false, userId); if (g.html) return { mode, html: g.html, sig }; return { mode: 'generated', html: null, sig }; }
  return { mode: mode === 'custom' ? 'generated' : mode, html: null, sig };
}
