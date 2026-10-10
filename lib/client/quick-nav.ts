/**
 * Instant navigation for the assistant: "open tasks", "go to approvals", "show calendar" open the page right away
 * in the browser — no server or AI round trip.
 */
const PAGES: { re: RegExp; href: string; label: string }[] = [
  { re: /^approv(al|als)?$/, href: '/approvals', label: 'Approvals' },
  { re: /^(my )?(tasks?|to-?dos?)$/, href: '/tasks', label: 'Tasks' },
  { re: /^(gmail|e-?mails?|inbox|mail)$/, href: '/gmail', label: 'Inbox' },
  { re: /^(calendar|meetings?|schedule|diary)$/, href: '/calendar', label: 'Calendar' },
  { re: /^(google )?drive$/, href: '/documents?tab=drive', label: 'Google Drive' },
  { re: /^(documents?|files?|library)$/, href: '/documents', label: 'Documents' },
  { re: /^(legal( ai)?|contracts?|contract reviews?|reviews?)$/, href: '/legal', label: 'Legal AI' },
  { re: /^(drafting|drafts?|templates?)$/, href: '/drafting', label: 'Drafting' },
  { re: /^notes?$/, href: '/notes', label: 'Notes' },
  { re: /^(board meetings?|board minutes|minutes|meeting records?|board meeting records?)$/, href: '/board-meetings', label: 'Board meetings' },
  { re: /^projects?$/, href: '/projects', label: 'Projects' },
  { re: /^(crm|deals?|pipeline|contacts?)$/, href: '/crm', label: 'Deals' },
  { re: /^(marketing|campaigns?|write|writer)$/, href: '/marketing', label: 'Marketing' },
  { re: /^(designer|designs?|flyers?)$/, href: '/designer', label: 'Designer' },
  { re: /^(presentations?|decks?|slides|power ?points?)$/, href: '/presentations', label: 'Presentations' },
  { re: /^(research|web research)$/, href: '/presentations?tab=research', label: 'Research' },
  { re: /^(team chat|chat|channels?)$/, href: '/team', label: 'Team Chat' },
  { re: /^(settings|system|admin)$/, href: '/system', label: 'Settings' },
  { re: /^(business details|letterhead|logo)$/, href: '/system?tab=business', label: 'Business details' },
  { re: /^(home|today|dashboard)$/, href: '/', label: 'Today' },
];

export function quickNav(text: string): { href: string; label: string } | null {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/^(hey |hi |please |pls |can you |could you |infinity,? )+/, '');
  const m = t.match(/^(?:open|go to|goto|go|show(?: me)?|take me to|navigate to|bring up|switch to|jump to)\s+(?:the |my |our )?(.+?)(?:\s+(?:page|tab|section|screen|list|area))?(?:\s+(?:for me|please))?$/);
  if (!m) return null;
  const what = m[1].trim(); if (what.split(/\s+/).length > 3) return null;
  return PAGES.find(p => p.re.test(what)) || null;
}
