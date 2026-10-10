/**
 * Makes email text readable: removes the link tails mail apps add to plain text
 * ("Jane<mailto:jane@x.com>", "View all guest info<https://calendar.google.com/…>"),
 * drops Google Calendar / Outlook / Teams boilerplate, and reads calendar invites (.ics)
 * into a simple event summary. Pure functions — safe on the server and in the browser.
 */

const CAL_LINE = [
  /^view all guest info$/i, /^reply for\s.+$/i, /^(yes|no|maybe|more options)$/i, /^rsvp\b.*$/i,
  /^invitation from google calendar$/i, /^learn more$/i, /^view event in google calendar$/i,
  /^join with google meet$/i, /^google meet joining info$/i, /^more phone numbers$/i, /^join by phone$/i, /^\[image:.*\]$/i,
  /^going\s*\(.+\)\?$/i, /^invitation from (outlook|microsoft)\b.*$/i, /^accept|^decline|^tentative$/i,
  /^(_|-|=){8,}$/,
  /^microsoft teams (meeting|need help\?)$/i, /^join (on your computer|the meeting now)\b.*$/i, /^meeting options$/i, /^need help\?$/i,
];
const CAL_PARA = [
  /^you are receiving this (email|courtesy email)\b/i, /^forwarding this invitation could allow/i, /^to stop receiving future updates/i,
  /^invitation from google calendar\b/i, /^you are receiving this email because/i, /^learn more about meet\b/i,
  /^this event has been (changed|updated)\b.*\bgoogle calendar/i,
  /^caution:\s*this (e-?mail|message) (originated|came) from outside/i, /^external email\b/i,
];

/** Removes "<mailto:…>" / "<https://…>" tails, keeps the label. Shortens the remaining bare long links. */
export function stripLinkTails(s: string): string {
  return String(s || '')
    // "Label<mailto:x>" or "Label <https://…>" → "Label" (when there's a label before it)
    .replace(/([^\s<>][^<>\n]{0,120}?)\s*<(mailto:[^>\s]+|https?:\/\/[^>\s]+)>/gi, '$1')
    // A bare "<https://…>" / "<mailto:x>" on its own → the address / the link
    .replace(/<mailto:([^>\s]+)>/gi, '$1')
    .replace(/<(https?:\/\/[^>\s]+)>/gi, '$1')
    // "[https://…]" link markers some apps add after linked words
    .replace(/\s*\[(https?:\/\/[^\]\s]+)\]/gi, '')
    // "[image: mobilePhone]" — Gmail's stand-in for pictures in the plain-text copy (signature icons, logos)
    .replace(/^[ \t]*\[(image|cid):[^\]\n]{0,120}\][ \t]*/gim, '').replace(/[ \t]*\[(image|cid):[^\]\n]{0,120}\][ \t]*/gi, ' ');
}

/** Lines that are contact details (phone, email, web address) — never glued onto the line before. */
const CONTACT = /@|https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|au|io|co|gov|edu)\b|(\+?\d[\d\s()-]{6,}\d)/i;

/** Clean, simple text for reading. */
export function tidyEmailText(input: string): string {
  let t = stripLinkTails(String(input || '').replace(/\r/g, '').replace(/ /g, ' '));
  const lines = t.split('\n').map(l => l.replace(/[ \t]+$/g, ''));
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (CAL_LINE.some(re => re.test(l))) continue;
    if (/^https?:\/\/\S+$/.test(l) && /calendar\.google\.com|google\.com\/calendar|support\.google\.com|aka\.ms|teams\.microsoft\.com\/meetingOptions/i.test(l)) continue;
    out.push(raw);
  }
  // Re-join lines that a plain-text conversion broke in the middle of a sentence ("Manage API" / "keys")
  const joined: string[] = [];
  for (const line of out) {
    const prev = joined[joined.length - 1];
    if (prev !== undefined && prev.trim() && line.trim() && !/[.!?:;,)\]"”]$/.test(prev.trim()) && /^[a-z(]/.test(line.trim()) && prev.trim().length < 120 && !/^[-*•>]/.test(line.trim()) && !CONTACT.test(prev) && !CONTACT.test(line)) joined[joined.length - 1] = `${prev.trimEnd()} ${line.trim()}`;
    else joined.push(line);
  }
  // Drop boilerplate paragraphs
  t = joined.join('\n').split(/\n\s*\n/).filter(p => !CAL_PARA.some(re => re.test(p.trim()))).join('\n\n');
  return t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Short label for a long link: "meet.google.com/abc-defg-hij", "docs.google.com/…". */
export function shortUrl(u: string): string {
  try {
    const x = new URL(u); const host = x.hostname.replace(/^www\./, '');
    const path = x.pathname.replace(/\/+$/, '');
    const full = host + path;
    return full.length <= 42 ? full : `${host}${path ? '/…' : ''}`;
  } catch { return u.length > 42 ? u.slice(0, 40) + '…' : u; }
}

/** Splits text into plain parts and links (for rendering clickable short links). */
export function linkParts(text: string): { t: 'text' | 'link' | 'mail'; s: string; href?: string }[] {
  const out: { t: 'text' | 'link' | 'mail'; s: string; href?: string }[] = [];
  const re = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) });
    if (m[1]) out.push({ t: 'link', s: shortUrl(m[1]), href: m[1] });
    else out.push({ t: 'mail', s: m[2], href: `mailto:${m[2]}` });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 'text', s: text.slice(last) });
  return out;
}

// ------------------------------------------------------------------ calendar invites
export type CalEvent = { title: string; start?: string | null; end?: string | null; all_day?: boolean; location?: string | null; meet?: string | null; organizer?: string | null; guests: string[]; method?: string | null; status?: string | null; notes?: string | null };

function icsDate(v: string, params: string): { iso: string | null; allDay: boolean } {
  const s = v.trim();
  if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(s)) { const m = s.match(/^(\d{4})(\d{2})(\d{2})/); return { iso: m ? `${m[1]}-${m[2]}-${m[3]}` : null, allDay: true }; }
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return { iso: null, allDay: false };
  return { iso: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`, allDay: false };
}
const icsText = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
const cnOf = (params: string, value: string) => { const cn = params.match(/CN=("?)([^;:"]+)\1/i)?.[2]; return (cn && cn.trim()) || value.replace(/^mailto:/i, '').trim(); };

/** Reads the first VEVENT of an .ics file. */
export function parseIcs(ics: string): CalEvent | null {
  const raw = String(ics || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const ev = raw.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i)?.[1];
  if (!ev) return null;
  const method = raw.match(/^METHOD:(.+)$/im)?.[1]?.trim() || null;
  const e: CalEvent = { title: '', guests: [], method };
  let orgEmail = ''; const att: { name: string; email: string }[] = [];
  for (const line of ev.split(/\r?\n/)) {
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/); if (!m) continue;
    const [, key, params, value] = m;
    if (key === 'SUMMARY') e.title = icsText(value);
    else if (key === 'DTSTART') { const d = icsDate(value, params); e.start = d.iso; e.all_day = d.allDay; }
    else if (key === 'DTEND') e.end = icsDate(value, params).iso;
    else if (key === 'LOCATION') e.location = icsText(value) || null;
    else if (key === 'ORGANIZER') { e.organizer = cnOf(params, value); orgEmail = value.replace(/^mailto:/i, '').trim().toLowerCase(); }
    else if (key === 'ATTENDEE') att.push({ name: cnOf(params, value), email: value.replace(/^mailto:/i, '').trim().toLowerCase() });
    else if (key === 'STATUS') e.status = value.trim();
    else if (key === 'DESCRIPTION') e.notes = icsText(value);
    else if (key === 'X-GOOGLE-CONFERENCE' || (key === 'URL' && /meet\.google|zoom\.us|teams\.microsoft/i.test(value))) e.meet = value.trim();
  }
  for (const a of att) if (a.name && a.email !== orgEmail && !e.guests.includes(a.name)) e.guests.push(a.name);
  if (!e.meet) e.meet = (e.notes || e.location || '').match(/https?:\/\/(meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com)\/[^\s<>"]+/i)?.[0] || null;
  if (e.notes) {
    // Google puts the joining instructions and boilerplate in the description — keep only what a person wrote
    let n = e.notes.split(/\n-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-/)[0];
    n = n.replace(/-::~[:~]+::-[\s\S]*$/, '');
    n = tidyEmailText(n).split(/\n\s*\n/).filter(p => !/^(join with google meet|join by phone|join microsoft teams meeting|meeting id|passcode|dial-in|or dial)\b/i.test(p.trim())).join('\n\n').trim();
    e.notes = n || null;
  }
  if (!e.title && !e.start) return null;
  return e;
}

/** Fallback when there's no .ics: reads the Google Calendar plain-text invite. */
export function isCalendarInvite(subject: string, text: string): boolean {
  return /^(updated )?invitation:|^invitation:|^accepted:|^declined:|^tentatively accepted:|^canceled event|^cancelled event|^updated invitation/i.test(String(subject || '').trim())
    || /invitation from google calendar/i.test(text || '');
}

// ------------------------------------------------------------------ HTML (shown in a sandboxed frame, scripts never run)
/** Strips anything active from an email's HTML: scripts, frames, forms, event handlers, javascript: links. */
export function sanitizeEmailHtml(html: string): string {
  let h = String(html || '');
  if (!h.trim()) return '';
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'form', 'title', 'svg', 'math']) h = h.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
  h = h.replace(/<\/?(script|iframe|frame|frameset|object|embed|applet|form|input|button|select|textarea|meta|base|link)\b[^>]*>/gi, '');
  h = h.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  h = h.replace(/\s(href|src|action|formaction|background|poster)\s*=\s*("|')\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, ' $1="#"');
  h = h.replace(/expression\s*\(/gi, '(').replace(/url\(\s*['"]?\s*javascript:[^)]*\)/gi, 'none');
  return h.slice(0, 8_000_000);
}
