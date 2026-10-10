/**
 * Professional, branded outgoing email.
 * Every email sent from Infinity Planet goes out as HTML + plain text (multipart/alternative) with:
 *  - a header with the business logo (embedded inline, so it shows without "load images") or a name wordmark,
 *  - the message in clean, readable typography (paragraphs, lists, bold, links),
 *  - a signature block (name, title, business, phone, email, website) in the brand colours,
 *  - a footer with the legal entity, ABN, address and a confidentiality notice,
 *  - in replies, the earlier message quoted underneath.
 * Look and wording come from Settings → Business details (colours, logo, entity) and Settings → Business details → Email.
 */
import { getBrand, getBrandStyle } from './brand';
import { getLogo } from './brand-logo';
import { getSetting } from './settings';
import { encodeHeader } from './google';

export type EmailStyle = { layout: 'auto' | 'branded' | 'classic'; branded: boolean; header: 'logo' | 'band' | 'none'; disclaimer: string; show_footer: boolean; quote_original: boolean; quote_previous?: boolean; default_persona: string | null; default_tone: string };
export const DEFAULT_DISCLAIMER = 'This email and any attachments are confidential and may be legally privileged. If you are not the intended recipient, please notify the sender and delete this email. Any views expressed are those of the sender unless stated otherwise.';
export type Signature = { title?: string; phone?: string; mobile?: string; persona?: string | null; mode?: 'gmail' | 'custom' | 'generated' | 'none'; html?: string };
export type EmailLook = {
  businessName: string; legalName: string; abn?: string; acn?: string; address?: string; phone?: string; email?: string; website?: string; footerText?: string;
  primary: string; accent: string; font: string; logo: { bytes: Buffer; mime: string } | null; style: EmailStyle;
};

export async function getEmailStyle(): Promise<EmailStyle> {
  const s = (await getSetting<Partial<EmailStyle>>('email_style')) || {};
  return {
    layout: (['auto', 'branded', 'classic'] as const).includes(s.layout as any) ? s.layout as any : 'auto',
    branded: s.branded !== false, header: (['logo', 'band', 'none'] as const).includes(s.header as any) ? s.header as any : 'logo',
    disclaimer: typeof s.disclaimer === 'string' ? s.disclaimer : DEFAULT_DISCLAIMER, show_footer: s.show_footer !== false,
    quote_original: s.quote_previous === true, quote_previous: s.quote_previous === true, default_persona: s.default_persona || null, default_tone: s.default_tone || 'professional',
  };
}
export async function getSignature(userId: string): Promise<Signature> {
  const all = (await getSetting<Record<string, Signature>>('email_signatures')) || {};
  return all[userId] || {};
}

export async function getEmailLook(): Promise<EmailLook> {
  const [brand, st, entity, logo, style] = await Promise.all([getBrand(), getBrandStyle(), getSetting<any>('rhc_entity_details'), getLogo().catch(() => null), getEmailStyle()]);
  const e = entity || {};
  const font = st.font === 'serif' ? "Georgia, 'Times New Roman', serif" : st.font === 'modern' ? "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif" : 'Arial, Helvetica, sans-serif';
  // Email clients do not show SVG/WebP — only PNG, JPEG or GIF logos are embedded.
  const okLogo = logo && ['image/png', 'image/jpeg', 'image/gif'].includes(logo.mime) && logo.bytes.length < 1_500_000 ? logo : null;
  return {
    businessName: brand.business_name, legalName: e.name || brand.business_name, abn: e.abn, acn: e.acn, address: e.address, phone: e.phone, email: e.email,
    website: st.website || undefined, footerText: st.footer_text || undefined, primary: st.primary || '#13294b', accent: st.accent || '#c8a45c', font, logo: okLogo, style,
  };
}

// ------------------------------------------------------------------ rendering
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SIGNOFF_RE = /^(kind regards|best regards|warm regards|regards|many thanks|thanks|thank you|cheers|sincerely|yours sincerely|yours faithfully|best wishes|best)[,!.]?\s*$/i;

function inline(s: string, primary: string) {
  let h = esc(s);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, `<a href="$1" style="color:${primary};text-decoration:underline">$1</a>`);
  h = h.replace(/(^|[\s(])(www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<]*)?)/gi, `$1<a href="https://$2" style="color:${primary};text-decoration:underline">$2</a>`);
  h = h.replace(/(^|[\s(:])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, `$1<a href="mailto:$2" style="color:${primary};text-decoration:none">$2</a>`);
  h = h.replace(/\[([^\]]{1,60})\]/g, '<span style="background:#fff4d6;color:#8a5a00;padding:0 3px;border-radius:3px">[$1]</span>');
  return h;
}

/** Splits a body into message text, sign-off line and signer lines. */
export function splitSignature(body: string) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  let si = -1; for (let i = lines.length - 1; i >= 0 && i >= lines.length - 9; i--) if (SIGNOFF_RE.test(lines[i].trim())) { si = i; break; }
  if (si < 0) return { message: String(body || '').trim(), signoff: '', signer: [] as string[] };
  return { message: lines.slice(0, si).join('\n').trim(), signoff: lines[si].trim(), signer: lines.slice(si + 1).map(l => l.trim()).filter(Boolean) };
}

function bodyHtml(text: string, look: EmailLook) {
  const P = `margin:0 0 14px 0;font-family:${look.font};font-size:15px;line-height:1.6;color:#1f2933`;
  return String(text || '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    if (lines.every(l => /^\s*([-•*])\s+/.test(l))) return `<ul style="${P};padding-left:22px">${lines.map(l => `<li style="margin:0 0 6px 0">${inline(l.replace(/^\s*[-•*]\s+/, ''), look.primary)}</li>`).join('')}</ul>`;
    if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) return `<ol style="${P};padding-left:22px">${lines.map(l => `<li style="margin:0 0 6px 0">${inline(l.replace(/^\s*\d+[.)]\s+/, ''), look.primary)}</li>`).join('')}</ol>`;
    return `<p style="${P}">${lines.map(l => inline(l, look.primary)).join('<br>')}</p>`;
  }).join('\n');
}

export type RenderInput = { subject: string; body: string; sig?: Signature; sigHtml?: string | null; quoted?: { from?: string; date?: string; body?: string } | null; logoSrc?: string | null };

/** Classic (Gmail-style) layout is used when the person has a real signature, unless the admin forces the branded template. */
export const useClassic = (inp: RenderInput, look: EmailLook) => look.style.layout === 'classic' || (look.style.layout !== 'branded' && !!inp.sigHtml);

/** Contact line under the signer: phone · mobile · email · website. */
export function contactLine(look: EmailLook, sig?: Signature, senderEmail?: string | null) {
  return [sig?.phone ? `T ${sig.phone}` : look.phone ? `T ${look.phone}` : null, sig?.mobile ? `M ${sig.mobile}` : null, senderEmail || look.email ? `E ${senderEmail || look.email}` : null, look.website ? `W ${look.website.replace(/^https?:\/\//, '')}` : null].filter(Boolean) as string[];
}

function renderClassic(inp: RenderInput & { senderEmail?: string | null }, look: EmailLook) {
  const { message, signoff, signer } = splitSignature(inp.body);
  const F = 'Arial, Helvetica, sans-serif';
  const P = `margin:0 0 12px 0;font-family:${F};font-size:14px;line-height:1.55;color:#222222`;
  const body = String(message || '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    if (lines.every(l => /^\s*([-•*])\s+/.test(l))) return `<ul style="${P};padding-left:22px">${lines.map(l => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ''), '#1a73e8')}</li>`).join('')}</ul>`;
    if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) return `<ol style="${P};padding-left:22px">${lines.map(l => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''), '#1a73e8')}</li>`).join('')}</ol>`;
    return `<p style="${P}">${lines.map(l => inline(l, '#1a73e8')).join('<br>')}</p>`;
  }).join('\n');
  // With a real signature the signer lines are already in it; without one (mode "none") keep them as text.
  const close = signoff ? `<p style="${P}">${esc(signoff)}${!inp.sigHtml && signer.length ? `<br>${signer.map(esc).join('<br>')}` : ''}</p>` : (!inp.sigHtml && signer.length ? `<p style="${P}">${signer.map(esc).join('<br>')}</p>` : '');
  const sig = inp.sigHtml ? `<div style="font-family:${F};font-size:14px;color:#222">--</div><div class="gmail_signature" style="margin-top:4px">${inp.sigHtml}</div>` : '';
  const quoted = inp.quoted?.body && look.style.quote_original ? `<div class="gmail_quote" style="margin-top:18px"><div style="font-family:${F};font-size:13px;color:#555">On ${esc(inp.quoted.date || '')}, ${esc(inp.quoted.from || '')} wrote:</div><blockquote style="margin:6px 0 0 6px;border-left:1px solid #ccc;padding-left:10px;font-family:${F};font-size:13px;color:#555">${esc(String(inp.quoted.body).slice(0, 6000)).replace(/\n/g, '<br>')}</blockquote></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(inp.subject)}</title></head><body style="margin:0;padding:16px;background:#ffffff"><div dir="ltr" style="font-family:${F};font-size:14px;color:#222;max-width:820px">${body}${close}${sig}${quoted}</div></body></html>`;
}

export function renderEmailHtml(inp: RenderInput & { senderEmail?: string | null }, look: EmailLook): string {
  if (useClassic(inp, look)) return renderClassic(inp, look);
  const { message, signoff, signer } = splitSignature(inp.body);
  const st = look.style;
  const F = look.font;
  const contacts = contactLine(look, inp.sig, inp.senderEmail);
  const logo = inp.logoSrc && look.logo ? `<img src="${inp.logoSrc}" alt="${esc(look.businessName)}" height="44" style="display:block;height:44px;max-width:220px;border:0;outline:none">` : `<span style="font-family:${F};font-size:20px;font-weight:700;letter-spacing:.3px;color:${st.header === 'band' ? '#ffffff' : look.primary}">${esc(look.businessName)}</span>`;
  const header = st.header === 'none' ? '' : st.header === 'band'
    ? `<tr><td style="background:${look.primary};padding:18px 28px;border-bottom:4px solid ${look.accent}">${inp.logoSrc && look.logo ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;padding:6px 10px;border-radius:4px">${logo}</td></tr></table>` : logo}</td></tr>`
    : `<tr><td style="padding:22px 28px 16px 28px;border-bottom:3px solid ${look.accent}">${logo}</td></tr>`;
  const sigName = signer[0] || '';
  const sigRest = signer.slice(1);
  const signature = signoff || signer.length ? `<p style="margin:18px 0 4px 0;font-family:${F};font-size:15px;color:#1f2933">${esc(signoff)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr>
        <td style="border-left:3px solid ${look.accent};padding:2px 0 2px 12px">
          ${sigName ? `<div style="font-family:${F};font-size:15px;font-weight:700;color:${look.primary}">${esc(sigName)}</div>` : ''}
          ${sigRest.map((l, i) => `<div style="font-family:${F};font-size:13px;color:${i === 0 ? '#3e4c59' : '#616e7c'};${i === sigRest.length - 1 && l === look.legalName ? 'font-weight:600;' : ''}">${esc(l)}</div>`).join('')}
          ${contacts.length ? `<div style="font-family:${F};font-size:12px;color:#616e7c;margin-top:6px">${contacts.map(c => inline(c, look.primary)).join(' &nbsp;|&nbsp; ')}</div>` : ''}
        </td></tr></table>` : '';
  const quoted = inp.quoted?.body && st.quote_original ? `<tr><td style="padding:0 28px 22px 28px">
      <div style="font-family:${F};font-size:12px;color:#7b8794;margin:8px 0 6px 0">On ${esc(inp.quoted.date || '')}, ${esc(inp.quoted.from || '')} wrote:</div>
      <div style="border-left:2px solid #d9e2ec;padding-left:12px;font-family:${F};font-size:13px;line-height:1.5;color:#7b8794">${esc(String(inp.quoted.body).slice(0, 6000)).replace(/\n/g, '<br>')}</div></td></tr>` : '';
  const legal = [look.legalName, look.abn ? `ABN ${look.abn}` : '', look.acn ? `ACN ${look.acn}` : ''].filter(Boolean).join(' · ');
  const footer = st.show_footer ? `<tr><td style="background:#f5f7fa;padding:16px 28px;border-top:1px solid #e4e7eb">
      ${look.footerText ? `<div style="font-family:${F};font-size:12px;color:${look.primary};font-weight:600;margin-bottom:4px">${esc(look.footerText)}</div>` : ''}
      <div style="font-family:${F};font-size:11px;color:#616e7c;line-height:1.5">${esc(legal)}${look.address ? `<br>${esc(look.address)}` : ''}</div>
      ${st.disclaimer ? `<div style="font-family:${F};font-size:10px;color:#9aa5b1;line-height:1.45;margin-top:8px">${esc(st.disclaimer)}</div>` : ''}
    </td></tr>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(inp.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e4e7eb;border-radius:6px;border-collapse:separate;overflow:hidden">
    ${header}
    <tr><td style="padding:26px 28px 18px 28px">
      ${bodyHtml(message, look)}
      ${signature}
    </td></tr>
    ${quoted}
    ${footer}
  </table>
</td></tr></table>
</body></html>`;
}

/** Plain-text alternative (for clients that do not show HTML). */
export function renderEmailText(inp: RenderInput & { senderEmail?: string | null }, look: EmailLook) {
  if (useClassic(inp, look)) {
    const { message, signoff, signer } = splitSignature(inp.body);
    const sigText = inp.sigHtml ? String(inp.sigHtml).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim() : '';
    const parts = [[message, [signoff, ...(inp.sigHtml ? [] : signer)].filter(Boolean).join('\n')].filter(Boolean).join('\n\n')];
    if (sigText) parts.push(`--\n${sigText}`);
    if (inp.quoted?.body && look.style.quote_original) parts.push(`On ${inp.quoted.date || ''}, ${inp.quoted.from || ''} wrote:\n${String(inp.quoted.body).slice(0, 6000).split('\n').map(l => `> ${l}`).join('\n')}`);
    return parts.join('\n\n');
  }
  const contacts = contactLine(look, inp.sig, inp.senderEmail);
  const legal = [look.legalName, look.abn ? `ABN ${look.abn}` : '', look.acn ? `ACN ${look.acn}` : ''].filter(Boolean).join(' · ');
  const parts = [String(inp.body || '').trim()];
  if (contacts.length) parts.push(contacts.join(' | '));
  if (look.style.show_footer) parts.push(['--', legal, look.address, look.style.disclaimer].filter(Boolean).join('\n'));
  if (inp.quoted?.body && look.style.quote_original) parts.push(`On ${inp.quoted.date || ''}, ${inp.quoted.from || ''} wrote:\n${String(inp.quoted.body).slice(0, 6000).split('\n').map(l => `> ${l}`).join('\n')}`);
  return parts.join('\n\n');
}

// ------------------------------------------------------------------ MIME
const b64lines = (b: Buffer) => b.toString('base64').replace(/(.{76})/g, '$1\r\n');
export type MimeAttachment = { name: string; mime: string; bytes: Buffer };
export function buildMime(o: { from?: string; to: string; cc?: string | null; bcc?: string | null; subject: string; inReplyTo?: string | null; references?: string | null; text: string; html?: string | null; logo?: { bytes: Buffer; mime: string } | null; attachments?: MimeAttachment[] }) {
  const bnd = (n: string) => `=_ip_${n}_${Math.random().toString(36).slice(2, 12)}`;
  const head = [...(o.from ? [`From: ${o.from}`] : []), `To: ${o.to}`, ...(o.cc ? [`Cc: ${o.cc}`] : []), ...(o.bcc ? [`Bcc: ${o.bcc}`] : []), `Subject: ${encodeHeader(o.subject)}`, 'MIME-Version: 1.0',
    ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`, `References: ${o.references || o.inReplyTo}`] : [])];
  const textPart = `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(Buffer.from(o.text, 'utf8'))}`;
  let content: string;
  if (!o.html) content = textPart;
  else {
    const alt = bnd('alt');
    const altPart = `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n--${alt}\r\n${textPart}\r\n--${alt}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(Buffer.from(o.html, 'utf8'))}\r\n--${alt}--`;
    if (!o.logo || !o.html.includes('cid:brandlogo')) content = altPart;
    else {
      const rel = bnd('rel'); const ext = o.logo.mime.split('/')[1].replace('jpeg', 'jpg');
      content = `Content-Type: multipart/related; boundary="${rel}"\r\n\r\n--${rel}\r\n${altPart}\r\n--${rel}\r\nContent-Type: ${o.logo.mime}; name="logo.${ext}"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <brandlogo>\r\nContent-Disposition: inline; filename="logo.${ext}"\r\n\r\n${b64lines(o.logo.bytes)}\r\n--${rel}--`;
    }
  }
  if (!o.attachments?.length) return `${head.join('\r\n')}\r\n${content}`;
  const mix = bnd('mix');
  const fname = (n: string) => encodeHeader(n.replace(/["\r\n]/g, ''));
  const parts = o.attachments.map(a => `--${mix}\r\nContent-Type: ${a.mime || 'application/octet-stream'}; name="${fname(a.name)}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${fname(a.name)}"\r\n\r\n${b64lines(a.bytes)}`).join('\r\n');
  return `${head.join('\r\n')}\r\nContent-Type: multipart/mixed; boundary="${mix}"\r\n\r\n--${mix}\r\n${content}\r\n${parts}\r\n--${mix}--`;
}

/** Display name for the From header: "Jane Smith | RHC City" <mailbox>. */
export function fromHeader(name: string | null | undefined, business: string, mailbox: string | null | undefined) {
  if (!mailbox) return undefined;
  const display = [name, business].filter(Boolean).join(' | ').replace(/["\r\n]/g, '');
  return `${encodeHeader(display)} <${mailbox}>`.replace(/^([^=].*?) </, '"$1" <');
}
