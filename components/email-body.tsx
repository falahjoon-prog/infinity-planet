'use client';
/** Clean email reading: short clickable links instead of long URLs, the original formatting in a safe frame, and calendar invites as a simple event card. */
import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, MapPin, Video, Users } from 'lucide-react';
import { linkParts, CalEvent } from '@/lib/email-clean';

/** Splits a plain-text email into the message, the sender's signature (sign-off, name, title, contact details) and anything after it (a forwarded or quoted email). */
export function splitSignature(text: string, sender?: string): { body: string; sig: string; rest: string } {
  const lines = String(text || '').replace(/\s+$/, '').split('\n');
  const isEnd = (t: string) => /^-{2,}\s*(forwarded message|original message)/i.test(t) || /^on .{6,} wrote:$/i.test(t) || /^from:\s/i.test(t) || /^begin forwarded message/i.test(t);
  const name = String(sender || '').replace(/<.*>/, '').replace(/"/g, '').trim().toLowerCase();
  const isSignOff = (t: string) => /^(--|—|__+)$/.test(t) || /^(kind regards|best regards|warm regards|regards|cheers|thanks( again)?|thank you|many thanks|yours (sincerely|faithfully|truly)|sincerely|best wishes|with thanks|ngā mihi)[,.!]?$/i.test(t);
  const isName = (t: string) => !!name && name.length > 3 && t.toLowerCase() === name;
  const contact = (t: string) => /(\+?\d[\d\s()-]{7,}\d)|@|www\.|\.com|\.au\b|address|mobile|phone|tel[:.]/i.test(t);
  let stop = lines.findIndex(l => isEnd(l.trim())); if (stop < 0) stop = lines.length;
  for (let i = Math.max(0, stop - 25); i < stop; i++) {
    const t = lines[i].trim();
    const byName = isName(t) && lines.slice(i + 1, Math.min(stop, i + 9)).some(l => contact(l));
    if (isSignOff(t) || byName) {
      const body = lines.slice(0, i).join('\n').trim(); const sig = lines.slice(i, stop).join('\n').trim();
      if ((body.length > 20 || byName) && sig.split('\n').length <= 20) return { body, sig, rest: lines.slice(stop).join('\n').trim() };
    }
  }
  return { body: String(text || '').trim(), sig: '', rest: '' };
}

/** A plain-text email laid out like a mail app: the message, then the signature set apart in smaller grey text, then any forwarded/quoted email. */
export function EmailText({ text, className, sender }: { text: string; className?: string; sender?: string }) {
  const { body, sig, rest } = splitSignature(text, sender);
  return <div className={`mail-text ${className || ''}`}>
    {body && <LinkedText className="mail-text-body" text={body} />}
    {sig && <LinkedText className="mail-sig" text={sig} />}
    {rest && <LinkedText className="mail-text-rest" text={rest} />}
  </div>;
}

export function LinkedText({ text, className }: { text: string; className?: string }) {
  return <div className={className} dir="auto">{linkParts(text).map((p, i) => p.t === 'text' ? <React.Fragment key={i}>{p.s}</React.Fragment> : <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="mail-link" title={p.href}>{p.s}</a>)}</div>;
}

const FRAME_CSS = (showQuoted: boolean) => `
  html,body{margin:0;padding:0;background:#fff;color:#000;font:14px/1.5 -apple-system,'Segoe UI',Roboto,Vazirmatn,Arial,sans-serif;overflow-wrap:anywhere}
  body{padding:6px 4px 10px}
  p{margin:0 0 .5em}
  br+br{display:none}
  p:empty,div:empty{display:none}
  table td,table th{font-size:12.5px!important;line-height:1.35!important;overflow-wrap:normal!important;word-break:normal!important;padding-top:2px!important;padding-bottom:2px!important}
  table td *{font-size:inherit!important;line-height:inherit!important;margin-top:0!important;margin-bottom:0!important}
  table td b,table td strong{font-size:14px!important}
  table img[src*="logo"]{max-width:90px!important}
  .gmail_signature,[data-smartmail="gmail_signature"],#Signature,div[id^="Signature"],#signature,.signature,div[class*="Signature"]{color:#5b6270!important;font-size:13px!important;line-height:1.5;border-top:1px solid #e6e8ec;margin-top:14px;padding-top:10px}
  .gmail_signature *,#Signature *,div[id^="Signature"] *{font-size:inherit}
  img{max-width:100%;height:auto}
  table{max-width:100%}
  a{color:#1f5fbf}
  ${showQuoted ? '' : '.gmail_quote,.gmail_quote_container,blockquote[type=cite],.yahoo_quoted,#appendonsend,#appendonsend~*,#divRplyFwdMsg,#divRplyFwdMsg~*,.moz-cite-prefix,.moz-cite-prefix~blockquote,div[id^="mail-editor-reference-message"],.OutlookMessageHeader{display:none!important}'}
`;

/** The email as the sender formatted it, in a sandboxed frame (no scripts) that grows to fit. */
export function EmailFrame({ html, showQuoted }: { html: string; showQuoted: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null); const [h, setH] = useState(160);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${FRAME_CSS(showQuoted)}</style></head><body>${html}</body></html>`;
  useEffect(() => {
    const f = ref.current; if (!f) return;
    let ro: ResizeObserver | null = null;
    const fit = () => { try { const b = f.contentDocument?.documentElement; if (b) setH(Math.min(Math.max(b.scrollHeight + 4, 60), 20000)); } catch { /* cross-origin */ } };
    const onLoad = () => { fit(); try { const b = f.contentDocument?.body; if (b && 'ResizeObserver' in window) { ro = new ResizeObserver(fit); ro.observe(b); } f.contentDocument?.querySelectorAll('img').forEach(i => i.addEventListener('load', fit)); } catch { /* ignore */ } };
    f.addEventListener('load', onLoad);
    return () => { f.removeEventListener('load', onLoad); ro?.disconnect(); };
  }, [doc]);
  return <iframe ref={ref} className="mail-frame" title="Email" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} style={{ height: h }} />;
}

function when(e: CalEvent) {
  if (!e.start) return '';
  const s = new Date(e.start); const en = e.end ? new Date(e.end) : null;
  if (e.all_day) return s.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' (all day)';
  const day = s.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${t(s)}${en ? ` – ${en.toDateString() === s.toDateString() ? t(en) : `${en.toLocaleDateString()} ${t(en)}`}` : ''}`;
}

/** A calendar invite, simply: what, when, where, who. */
export function EventCard({ e }: { e: CalEvent }) {
  const [all, setAll] = useState(false);
  const cancelled = /cancel/i.test(`${e.method} ${e.status}`);
  const guests = e.guests.filter(g => g !== e.organizer);
  const shown = all ? guests : guests.slice(0, 4);
  return <div className={`event-card${cancelled ? ' cancelled' : ''}`}>
    <div className="event-title">{cancelled && <span className="event-tag">Cancelled</span>}{e.title || 'Meeting'}</div>
    {e.start && <div className="event-line"><CalendarDays size={15} /><span>{when(e)}</span></div>}
    {e.location && !/^https?:\/\//.test(e.location) && <div className="event-line"><MapPin size={15} /><span>{e.location}</span></div>}
    {e.meet && <div className="event-line"><Video size={15} /><a href={e.meet} target="_blank" rel="noopener noreferrer" className="mail-link">Join the video call</a></div>}
    {(e.organizer || guests.length > 0) && <div className="event-line"><Users size={15} /><span>{e.organizer ? <>{e.organizer} <span className="muted">(organiser)</span>{guests.length ? ', ' : ''}</> : null}{shown.join(', ')}{guests.length > 4 && <button className="link-quiet" onClick={() => setAll(a => !a)}>{all ? ' show less' : ` +${guests.length - 4} more`}</button>}</span></div>}
    {e.notes && <LinkedText text={e.notes} className="event-notes" />}
  </div>;
}
