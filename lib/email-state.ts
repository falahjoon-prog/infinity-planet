/**
 * Clear status for an inbox email, worked out from the Gmail labels and the thread:
 *  unread       – not opened yet
 *  draft        – a reply is drafted in Infinity Planet (ready to send)
 *  replied      – someone on our side replied after this email, and nothing new came back
 *  waiting      – our side wrote last in the thread; waiting on them
 *  needs_reply  – read, a real person wrote it, nobody has replied yet
 *  fyi          – automated (newsletters, notifications, calendar invites/acceptances, no-reply senders)
 */
export type EmailState = 'unread' | 'draft' | 'replied' | 'waiting' | 'needs_reply' | 'fyi';
type T = { labels: string[]; from: string; internalDate: number };
const addr = (s: string) => (String(s || '').match(/<([^>]+)>/)?.[1] || String(s || '').trim()).toLowerCase();

export function isAutomated(from: string, subject: string, auto: boolean) {
  return auto || /no-?reply|do-?not-?reply|notifications?@|mailer-daemon|calendar-notification|@(.*\.)?(mailchimp|sendgrid|hubspot|linkedin|facebookmail|xero|myob|paypal)\./i.test(addr(from))
    || /^(invitation|updated invitation|accepted|declined|tentatively accepted|canceled event|cancelled event|new event)\s*:/i.test(subject.trim());
}

export function emailState(o: { labels: string[]; from: string; subject: string; mailbox: string; auto: boolean; internalDate: number; thread: T[]; draft: string | null }): { state: EmailState; label: string; at: string | null; by?: string } {
  // "Our side" = the connected mailbox or anyone at the same company domain (e.g. a colleague replying with you in Cc).
  const dom = o.mailbox.split('@')[1] || '';
  const generic = /^(gmail|outlook|hotmail|yahoo|icloud|live)\./i.test(dom);
  const ourAddr = (a: string) => !!o.mailbox && (a === o.mailbox || (!generic && !!dom && a.endsWith(`@${dom}`)));
  const ours = (t: T) => t.labels.includes('SENT') || ourAddr(addr(t.from));
  const fromUs = o.labels.includes('SENT') || ourAddr(addr(o.from));
  const sorted = [...o.thread].sort((a, b) => a.internalDate - b.internalDate);
  const last = sorted[sorted.length - 1];
  const laterOurs = sorted.filter(t => t.internalDate > o.internalDate && ours(t));
  const laterTheirs = sorted.filter(t => t.internalDate > o.internalDate && !ours(t));
  const iso = (n?: number) => n ? new Date(n).toISOString() : null;
  if (o.draft && ['draft', 'awaiting_approval', 'approved', 'changes_requested', 'failed'].includes(o.draft)) return { state: 'draft', label: o.draft === 'failed' ? 'Reply failed to send' : 'Reply drafted — ready to send', at: null };
  if (o.labels.includes('UNREAD')) return { state: 'unread', label: 'New', at: null };
  if (fromUs && !laterTheirs.length) return { state: 'waiting', label: 'Waiting on them', at: iso(o.internalDate), by: String(o.from || '').replace(/<.*>/, '').replace(/"/g, '').trim() };
  if (laterOurs.length) return laterTheirs.length && laterTheirs[laterTheirs.length - 1].internalDate > laterOurs[laterOurs.length - 1].internalDate
    ? { state: 'needs_reply', label: 'Needs reply', at: null }
    : { state: 'replied', label: 'Replied', at: iso(laterOurs[laterOurs.length - 1].internalDate), by: String(laterOurs[laterOurs.length - 1].from || '').replace(/<.*>/, '').replace(/"/g, '').trim() };
  if (isAutomated(o.from, o.subject, o.auto)) return { state: 'fyi', label: 'FYI', at: null };
  return { state: 'needs_reply', label: 'Needs reply', at: null };
}
