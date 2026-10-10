'use client';
import { syncDisplayFromAccount } from '@/components/display-size';
import { applyEffective } from '@/lib/client/theme';
import { hasArea, pageArea } from '@/lib/access';
import { AiDock } from '@/components/ai-dock';
import { installNavHistory, useNavSteps } from '@/lib/client/nav-history';
import { SelectionAsk } from '@/components/selection-ask';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, BriefcaseBusiness, Files, Scale, FileSignature, StickyNote, Megaphone, Palette, Mail, CalendarDays,
  CheckSquare, MessagesSquare, ShieldCheck, Settings, Search, Bell, Menu, Plus, LogOut, User, X, Clock3, AlertTriangle, FileText, MoreHorizontal, Sparkles, HardDrive, BellPlus,
  Monitor, Presentation, PanelLeftClose, PanelLeftOpen, Repeat, UserPlus, ChevronLeft, ChevronRight, Timer, ArrowLeft, ArrowRight, Landmark,
} from 'lucide-react';
import { TimeCheck } from './time-check';
import { useUsageTracker } from '@/lib/client/usage';
import { useBrand, BusinessMark, InfinityMark } from '@/lib/client/brand';
import { ReminderForm } from './reminder-form';
import { api, supabase } from '@/lib/client/api';
import { savedAccounts, switchAccount, addAnotherAccount, signOutCurrent, rememberSession, SavedAccount } from '@/lib/client/accounts';
import { AppProvider, Me, useApp } from './app-context';
import { SectionTitleContext, SectionGroupContext } from './section-context';
import { Avatar, ToastProvider, ConfirmProvider, useClickAway, Loading, useToast } from './ui';
import { ago, label, personName } from '@/lib/client/format';

declare global { interface Window { rhcDesktop?: { notify: (title: string, body: string, href?: string) => void; setBadge?: (n: number) => void; platform?: string; version?: string; onNavigate?: (cb: (href: string) => void) => void } } }

type Tab = { href: string; label: string; key?: string; also?: RegExp };
type Section = { key: string; label: string; icon: any; badge?: string; tabs: Tab[] };
/** The menu: seven places, each with tabs for the pages inside it. */
export const SECTIONS: Section[] = [
  { key: 'today', label: 'Today', icon: LayoutDashboard, tabs: [{ href: '/', label: 'Today', also: /^\/(executive|assistant)(\/|$)/ }] },
  { key: 'inbox', label: 'Inbox', icon: Mail, tabs: [{ href: '/gmail', label: 'Gmail' }, { href: '/team', label: 'Team Chat' }] },
  { key: 'work', label: 'Work', icon: FolderKanban, badge: 'overdue', tabs: [{ href: '/projects', label: 'Projects' }, { href: '/crm', label: 'Deals' }, { href: '/tasks', label: 'Tasks', key: 'overdue' }, { href: '/calendar', label: 'Calendar' }] },
  { key: 'documents', label: 'Documents', icon: Files, tabs: [{ href: '/documents', label: 'Library', also: /^\/pdf\// }, { href: '/documents?tab=drive', label: 'Google Drive' }, { href: '/drafting', label: 'Drafting' }, { href: '/notes', label: 'Notes' }, { href: '/board-meetings', label: 'Board meetings' }] },
  { key: 'legal', label: 'Legal AI', icon: Scale, tabs: [{ href: '/legal', label: 'Legal AI' }] },
  { key: 'marketing', label: 'Marketing', icon: Megaphone, tabs: [{ href: '/marketing', label: 'Campaigns' }, { href: '/designer', label: 'Designer' }] },
  { key: 'presentations', label: 'Presentations', icon: Presentation, tabs: [{ href: '/presentations', label: 'Presentations' }, { href: '/presentations?tab=research', label: 'Research' }] },
  { key: 'approvals', label: 'Approvals', icon: ShieldCheck, badge: 'approvals', tabs: [{ href: '/approvals', label: 'Approvals' }] },
  { key: 'activity', label: 'Activity & hours', icon: Timer, badge: 'hours', tabs: [{ href: '/activity', label: 'Activity & hours', key: 'hours' }] },
  { key: 'finance', label: 'Finance', icon: Landmark, tabs: [{ href: '/finance/overview', label: 'Overview' }, { href: '/finance/income', label: 'Money in' }, { href: '/finance/expenses', label: 'Expenses' }, { href: '/finance/invoices', label: 'Invoices' }, { href: '/finance/payroll', label: 'Payroll' }] },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ me: Me; can: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const boot = async () => {
      try {
        const { data } = await supabase().auth.getSession();
        if (!data.session) { router.replace('/login'); return; }
        const r = await api.get('/api/me');
        rememberSession(data.session, { name: r.user.full_name, label: r.user.title || r.user.custom_role || r.user.role });
        if (alive) setState({ me: r.user, can: r.can });
      } catch (e: any) { if (alive) setError(e.message); }
    };
    boot();
    const out = () => { supabase().auth.signOut().finally(() => router.replace('/login')); };
    window.addEventListener('rhc:unauthorized', out);
    const { data: sub } = supabase().auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_OUT') router.replace('/login'); if (ev === 'TOKEN_REFRESHED' && session) rememberSession(session); });
    return () => { alive = false; window.removeEventListener('rhc:unauthorized', out); sub.subscription.unsubscribe(); };
  }, [router]);
  if (error) return <div style={{ padding: 40, maxWidth: 560, margin: '10vh auto' }}><div className="notice error"><AlertTriangle size={16} /><div><b>Infinity Planet could not start.</b><div className="mt8">{error}</div><button className="btn sm mt12" onClick={() => location.reload()}>Try again</button> <button className="btn sm mt12" onClick={() => supabase().auth.signOut().then(() => router.replace('/login'))}>Sign out</button></div></div></div>;
  if (!state) return <div style={{ minHeight: 'calc(100 * var(--vh, 1vh))', display: 'grid', placeItems: 'center' }}><div style={{ textAlign: 'center' }}><div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}><InfinityMark size={52} /></div><Loading text="Opening Infinity Planet…" /></div></div>;
  return <ToastProvider><ConfirmProvider><AppProvider me={state.me} can={state.can}><Frame>{children}</Frame></AppProvider></ConfirmProvider></ToastProvider>;
}

const SIDE_KEY = 'ip-sidebar';
const SIDE_MIN = 200, SIDE_MAX = 380, SIDE_MINI = 68;
/** Left menu: full or folded to icons, and a width the person drags. Remembered on this device. */
function useSidebar() {
  const [mini, setMini] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(SIDE_KEY) || '{}'); setMini(!!v.mini); if (typeof v.width === 'number') setWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, v.width))); } catch {} }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('side-mini', mini);
    if (width) root.style.setProperty('--side-w', `${width}px`); else root.style.removeProperty('--side-w');
    try { localStorage.setItem(SIDE_KEY, JSON.stringify({ mini, width })); } catch {}
  }, [mini, width]);
  useEffect(() => { document.documentElement.classList.toggle('side-dragging', dragging); }, [dragging]);
  const toggle = useCallback(() => setMini(m => !m), []);
  // pages can fold/open the menu too (Gmail's wide-reading button): dispatchEvent(new CustomEvent('ip-side-mini', { detail: true | false }))
  useEffect(() => { const h = (e: Event) => setMini(!!(e as CustomEvent).detail); window.addEventListener('ip-side-mini', h); return () => window.removeEventListener('ip-side-mini', h); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B' || e.key === '\\') && !e.shiftKey && !e.altKey) { const t = e.target as HTMLElement; if (e.key.toLowerCase() === 'b' && t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; e.preventDefault(); toggle(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [toggle]);
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return; e.preventDefault();
    // The person's display size can scale the page, so convert screen pixels to the menu's own pixels.
    const el = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const css = parseFloat(getComputedStyle(el).width) || 1; const scale = (el.getBoundingClientRect().width / css) || 1;
    const x0 = e.clientX; let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 5) return; // a click, not a drag (yet)
      if (!moved) { moved = true; setDragging(true); }
      const x = ev.clientX / scale;
      if (x < 140) { setMini(true); return; }
      setMini(false); setWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(x))));
    };
    const up = () => { setDragging(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved) toggle(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const reset = () => { setWidth(null); setMini(false); };
  return { mini, toggle, startDrag, reset };
}

/** Name label beside an icon when the left menu is folded (the menu scrolls, so a CSS tooltip would be clipped). */
function useSideTip(enabled: boolean) {
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null);
  useEffect(() => { if (!enabled) setTip(null); }, [enabled]);
  const bind = (text: string) => enabled ? {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { if (window.innerWidth <= 900) return; const r = e.currentTarget.getBoundingClientRect(); setTip({ text, top: (r.top + r.height / 2) / (Number(getComputedStyle(document.documentElement).zoom) || 1) }); },
    onMouseLeave: () => setTip(null), onFocus: (e: React.FocusEvent<HTMLElement>) => { if (window.innerWidth <= 900) return; const r = e.currentTarget.getBoundingClientRect(); setTip({ text, top: (r.top + r.height / 2) / (Number(getComputedStyle(document.documentElement).zoom) || 1) }); }, onBlur: () => setTip(null),
  } : {};
  const node = tip ? <div className="side-tip" style={{ top: tip.top }} role="tooltip">{tip.text}</div> : null;
  return { bind, node };
}

function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useEffect(() => { syncDisplayFromAccount(); api.get('/api/settings').then(r => applyEffective(r.settings.ui_theme || null)).catch(() => {}); const h = (e: any) => applyEffective(e.detail); window.addEventListener('ip-theme', h); return () => window.removeEventListener('ip-theme', h); }, []);
  const router = useRouter();
  const { me } = useApp();
  const [navOpen, setNavOpen] = useState(false);
  const side = useSidebar();
  const tip = useSideTip(side.mini && !navOpen);
  const [counts, setCounts] = useState<{ approvals: number; overdue: number; hours: number }>({ approvals: 0, overdue: 0, hours: 0 });
  useUsageTracker();
  const [notifs, setNotifs] = useState<any[]>([]);
  useEffect(() => setNavOpen(false), [pathname]);

  // presence heartbeat
  useEffect(() => {
    const beat = () => api.post('/api/team/presence', { status: document.visibilityState === 'visible' ? 'online' : 'away' }).catch(() => {});
    beat(); const t = setInterval(beat, 60_000);
    document.addEventListener('visibilitychange', beat);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat); };
  }, []);

  // notifications + desktop alerts
  const poll = useCallback(async () => {
    try {
      const d = await api.get('/api/notifications');
      setNotifs(d.items || []); setCounts({ approvals: d.counts?.approvals || 0, overdue: d.counts?.overdue || 0, hours: d.counts?.hours || 0 });
      window.rhcDesktop?.setBadge?.((d.items || []).length);
      let seen: string[] = []; try { seen = JSON.parse(localStorage.getItem('rhc-seen-notifs') || '[]'); } catch {}
      const fresh = (d.items || []).filter((x: any) => !seen.includes(x.id) && ['reminder', 'meeting', 'approval', 'mention', 'hours'].includes(x.type));
      for (const n of fresh.slice(0, 3)) {
        const title = n.type === 'hours' ? 'Hours to approve' : n.type === 'approval' ? 'Approval requested' : n.type === 'meeting' ? 'Upcoming meeting' : n.type === 'mention' ? 'You were mentioned' : 'Reminder';
        if (window.rhcDesktop) window.rhcDesktop.notify(title, n.title, n.href);
        else if ('Notification' in window && Notification.permission === 'granted') { try { const no = new Notification(title, { body: n.title, icon: '/icons/icon-192.png', tag: n.id }); no.onclick = () => { window.focus(); router.push(n.href); }; } catch {} }
      }
      try { localStorage.setItem('rhc-seen-notifs', JSON.stringify([...seen, ...fresh.map((x: any) => x.id)].slice(-300))); } catch {}
    } catch {}
  }, [router]);
  useEffect(() => { poll(); const t = setInterval(poll, 60_000); return () => clearInterval(t); }, [poll]);
  useEffect(() => { window.rhcDesktop?.onNavigate?.((href) => router.push(href)); }, [router]);

  const brand = useBrand();
  useEffect(() => { document.title = `${brand.business_name} · ${brand.app_name}`; }, [brand.business_name, brand.app_name, pathname]);
  const sp = useSearchParams(); const search = sp && sp.toString() ? `?${sp.toString()}` : '';
  useEffect(() => { installNavHistory(); }, []);
  // the page tabs stick just under the top bar while the page scrolls — keep their offset equal to the bar's height
  const topRef = useRef<HTMLElement>(null);
  useEffect(() => { const h = topRef.current; if (!h) return; const set = () => document.documentElement.style.setProperty('--topbar-h', `${h.offsetHeight}px`); set(); const ro = new ResizeObserver(set); ro.observe(h); return () => ro.disconnect(); }, []);
  const isActive = (href: string) => href === '/' ? pathname === '/' : href.includes('?') ? `${pathname}${search}`.startsWith(href) : (pathname === href || pathname.startsWith(href + '/')) && !(href === '/documents' && search.includes('tab=drive'));
  const tabOk = (t: Tab) => { const [pth, qs] = t.href.split('?'); return hasArea(me.role, me.areas, pageArea(pth, qs ? `?${qs}` : '')); };
  const tabActive = (t: Tab) => isActive(t.href) || !!t.also?.test(pathname);
  const sections = SECTIONS.map(sec => ({ ...sec, tabs: sec.tabs.filter(tabOk) })).filter(sec => sec.tabs.length);
  const current = sections.find(sec => sec.tabs.some(tabActive));
  const curTabs = current && current.tabs.length > 1 ? current.tabs : null;
  const activeTitle = current ? (curTabs ? curTabs.find(tabActive)?.label || null : current.label) : pathname.startsWith('/system') ? 'Settings' : null;
  const badge = (key?: string) => key === 'approvals' ? counts.approvals : key === 'overdue' ? counts.overdue : key === 'hours' ? counts.hours : 0;

  return <div className={`app ${navOpen ? 'nav-open' : ''}`} onClick={e => { if (navOpen && (e.target as HTMLElement).classList.contains('app')) setNavOpen(false); }}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-logo" {...tip.bind(brand.business_name)}><BusinessMark brand={brand} /></span><div className="side-text" style={{ minWidth: 0 }}><b className="biz ellipsis">{brand.business_name}</b><span className="by"><img src="/brand/infinity-planet.svg" alt="" />{brand.app_name}</span></div>
        <button className="icon-btn side-toggle" onClick={side.toggle} title={side.mini ? 'Open menu (Ctrl+B)' : 'Fold menu to icons (Ctrl+B)'} aria-label={side.mini ? 'Open menu' : 'Fold menu'} aria-expanded={!side.mini} {...tip.bind('Open menu')}>{side.mini ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}</button>
        <button className="icon-btn mobile-bar" style={{ marginLeft: 'auto', color: 'var(--side-ink, #c8d3e3)' }} onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <nav className="nav">{sections.map(sec => { const I = sec.icon; const n = badge(sec.badge); return <Link key={sec.key} href={sec.tabs[0].href} className={current?.key === sec.key ? 'active' : ''} onClick={() => setNavOpen(false)} aria-label={sec.label} {...tip.bind(n > 0 ? `${sec.label} (${n})` : sec.label)}><I size={18} /><span className="side-text">{sec.label}</span>{n > 0 && <span className="count">{n}</span>}</Link>; })}</nav>
      <div className="side-foot"><div className="side-me" style={{ flex: 1, minWidth: 0 }}><UserMenu place="side" /></div><Link href="/system" className={`icon-btn side-gear${pathname.startsWith('/system') ? ' on' : ''}`} title="Settings" aria-label="Settings" {...tip.bind('Settings')}><Settings size={17} /></Link></div>
      <div className="side-resize side-edge" onPointerDown={side.startDrag} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); side.toggle(); } }} tabIndex={0} title={side.mini ? 'Click to open the menu · drag to resize' : 'Click to fold the menu · drag to resize'} role="button" aria-expanded={!side.mini} aria-label={side.mini ? 'Open menu' : 'Fold menu'}><span className="edge-arrow">{side.mini ? <ChevronRight size={18} strokeWidth={2.6} /> : <ChevronLeft size={18} strokeWidth={2.6} />}</span></div>
    </aside>
    {tip.node}
    <div className="main">
      <header className="topbar" ref={topRef}>
        <button className="icon-btn mobile-bar" onClick={() => setNavOpen(true)} aria-label="Menu"><Menu size={20} /></button>
        <BackForward />
        {current && current.key !== 'today' && (curTabs
          ? <nav className="top-tabs" aria-label={current.label}>{curTabs.map(t => { const n = badge(t.key); return <Link key={t.href} href={t.href} className={tabActive(t) ? 'on' : ''}>{t.label}{n > 0 && <span className="count">{n}</span>}</Link>; })}</nav>
          : <b className="top-title">{current.label}</b>)}
        {!current && pathname.startsWith('/system') && <b className="top-title">Settings</b>}
        <CommandSearch />
        <div className="top-actions">
          <QuickCreate />
          <Notifications items={notifs} reload={poll} />
          <UserMenu place="top" />
        </div>
      </header>
      <main className="content"><SectionGroupContext.Provider value={current?.label || (pathname.startsWith('/system') ? 'Settings' : null)}><SectionTitleContext.Provider value={activeTitle}>{hasArea(me.role, me.areas, pageArea(pathname, search)) ? children : <div className="card" style={{ padding: 30, textAlign: 'center' }}><h2 style={{ marginBottom: 8 }}>No access</h2><p className="muted">You don&apos;t have access to this area. Ask an admin to tick it for you in Settings → Team &amp; roles.</p></div>}</SectionTitleContext.Provider></SectionGroupContext.Provider></main>
      <ForcePasswordChange />
      <TimeCheck />
      <AiDock />
      <SelectionAsk />
    </div>
    <nav className="mobile-nav">
      <Link href="/" className={current?.key === 'today' ? 'active' : ''}><LayoutDashboard size={20} />Today</Link>
      <Link href="/gmail" className={current?.key === 'inbox' ? 'active' : ''}><Mail size={20} />Inbox</Link>
      <Link href="/tasks" className={current?.key === 'work' ? 'active' : ''}><FolderKanban size={20} />Work{counts.overdue > 0 && <span className="count">{counts.overdue}</span>}</Link>
      <Link href="/approvals" className={current?.key === 'approvals' ? 'active' : ''}><ShieldCheck size={20} />Approve{counts.approvals > 0 && <span className="count">{counts.approvals}</span>}</Link>
      <button onClick={() => setNavOpen(true)}><MoreHorizontal size={20} />More</button>
    </nav>
  </div>;
}

/** The name of a place in the app, for the Back / Forward tooltips. */
function placeName(url: string | null, here: string): string {
  if (!url) return '';
  const [path, qs = ''] = url.split('?'); const q = new URLSearchParams(qs);
  if (path === here.split('?')[0] && !q.get('open') && new URLSearchParams(here.split('?')[1] || '').get('open')) return 'close this window';
  for (const sec of SECTIONS) for (const t of sec.tabs) {
    const [tp, tq] = t.href.split('?');
    const pathOk = tp === '/' ? path === '/' : path === tp || path.startsWith(tp + '/') || !!t.also?.test(path);
    if (!pathOk) continue;
    if (tq) { const [k, v] = tq.split('='); if (q.get(k) !== v) continue; } else if (sec.tabs.some(o => o !== t && o.href.startsWith(tp + '?') && (() => { const [k, v] = o.href.split('?')[1].split('='); return q.get(k) === v; })())) continue;
    return sec.tabs.length > 1 ? `${sec.label} › ${t.label}` : sec.label;
  }
  return path.startsWith('/system') ? 'Settings' : 'the previous page';
}

/** ← → in the top bar: go back / forward through the pages and windows you opened. */
function BackForward() {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  const steps = useNavSteps(); const here = pathname + (sp && sp.toString() ? `?${sp.toString()}` : '');
  const b = steps.back ? `Back — ${placeName(steps.back, here)} (Alt+←)` : 'Back';
  const f = steps.fwd ? `Forward — ${placeName(steps.fwd, here)} (Alt+→)` : 'Forward';
  return <div className="top-nav" role="group" aria-label="Back and forward">
    <button className="icon-btn" disabled={!steps.back} onClick={() => router.back()} title={b} aria-label={b}><ArrowLeft size={18} /></button>
    <button className="icon-btn" disabled={!steps.fwd} onClick={() => router.forward()} title={f} aria-label={f}><ArrowRight size={18} /></button>
  </div>;
}

/**
 * Account menu. It always opens at the top right, under the avatar. The name at the bottom of the left menu
 * (place="side") is just a button that opens it there.
 */
function UserMenu({ place }: { place: 'top' | 'side' }) {
  const { me } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (place !== 'top') return; const h = () => setOpen(o => !o); window.addEventListener('ip-usermenu', h); return () => window.removeEventListener('ip-usermenu', h); }, [place]);
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false));
  const router = useRouter();
  const out = async () => { await api.post('/api/team/presence', { status: 'offline' }).catch(() => {}); await signOutCurrent(); };
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  useEffect(() => { const f = () => setAccounts(savedAccounts()); f(); window.addEventListener('ip-accounts', f); return () => window.removeEventListener('ip-accounts', f); }, []);
  const others = accounts.filter(a => a.id !== me.id);
  const toast = useToast();
  const swap = async (a: SavedAccount) => { setOpen(false); if (!(await switchAccount(a.id))) { toast(`Please sign in to ${a.email} again`, 'info' as any); await addAnotherAccount(); } };
  if (place === 'side') return <button className="me" onMouseDown={e => e.stopPropagation()} onClick={() => window.dispatchEvent(new Event('ip-usermenu'))}><Avatar name={personName(me)} presence="online" /><div style={{ minWidth: 0 }}><b className="ellipsis">{personName(me)}</b><small>{label(me.role)}</small></div></button>;
  return <div ref={ref} style={{ position: 'relative' }}>
    <button className="icon-btn" style={{ padding: 0 }} onClick={() => setOpen(o => !o)} aria-label="Account menu" title={`${personName(me)} — switch account, profile, sign out`}><Avatar name={personName(me)} size="sm" /></button>
    {open && <div className="menu" style={{ top: 42, right: 0, left: 'auto', bottom: 'auto', minWidth: 260, color: 'var(--ink)' }}>
      <div className="menu-who"><b className="ellipsis">{personName(me)}</b><small className="ellipsis">{me.email}</small></div>
      {others.map(a => <button key={a.id} onClick={() => swap(a)} title={`Switch to ${a.email}`}><Repeat size={15} /> <span style={{ minWidth: 0 }}><span className="ellipsis" style={{ display: 'block' }}>Switch to {a.name || a.email}</span><small className="muted ellipsis" style={{ display: 'block' }}>{a.email}{a.label ? ` · ${label(a.label)}` : ''}</small></span></button>)}
      <button onClick={() => { setOpen(false); addAnotherAccount(); }}><UserPlus size={15} /> Add another account</button>
      <Link href="/system?tab=profile" onClick={() => setOpen(false)}><User size={15} /> My profile</Link>
      <Link href="/system?tab=display" onClick={() => setOpen(false)}><Monitor size={15} /> Display &amp; text size</Link>
      <Link href="/system" onClick={() => setOpen(false)}><Settings size={15} /> Settings</Link>
      {'Notification' in (typeof window !== 'undefined' ? window : {}) && !window.rhcDesktop && <button onClick={() => { Notification.requestPermission(); setOpen(false); }}><Bell size={15} /> Enable notifications</button>}
      <button onClick={out}><LogOut size={15} /> Sign out</button>
    </div>}
  </div>;
}

function CommandSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false));
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); setOpen(true); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  useEffect(() => { if (q.trim().length < 2) { setRes([]); return; } const t = setTimeout(() => api.get(`/api/search?q=${encodeURIComponent(q)}`).then(d => { setRes(d.results || []); setSel(0); }).catch(() => {}), 220); return () => clearTimeout(t); }, [q]);
  const actions = q.trim() ? [{ type: 'ask', title: `Ask Infinity AI: “${q.trim()}”`, href: `/assistant?ask=${encodeURIComponent(q.trim())}` }, { type: 'knowledge', title: `Search documents for “${q.trim()}”`, href: `/documents?search=${encodeURIComponent(q.trim())}` }] : [];
  const all = [...res, ...actions];
  const go = (href: string) => { setOpen(false); setQ(''); router.push(href); };
  return <div className="cmd" ref={ref}>
    <Search size={16} />
    <input ref={input} type="search" name="ip-command-search" autoComplete="off" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other" placeholder="Search projects, deals, documents, people — or ask Infinity AI" value={q} onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }}
      onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, all.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); } if (e.key === 'Enter' && all[sel]) go(all[sel].href); if (e.key === 'Escape') setOpen(false); }} />
    <kbd>Ctrl K</kbd>
    {open && all.length > 0 && <div className="cmd-results">{all.map((r, i) => <a key={`${r.type}-${r.id || i}`} href={r.href} className={i === sel ? 'sel' : ''} onClick={e => { e.preventDefault(); go(r.href); }}><FileText size={15} className="muted" /><span className="ellipsis">{r.title}</span><small>{label(r.type)}{r.sub ? ` · ${label(r.sub)}` : ''}</small></a>)}</div>}
  </div>;
}

function QuickCreate() {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false));
  const items = [['/projects?new=1', 'New project'], ['/crm?new=1', 'New deal'], ['/tasks?new=1', 'New task'], ['/documents?upload=1', 'Upload documents'], ['/legal?new=1', 'Review a contract'], ['/drafting?new=1', 'Draft a document'], ['/designer?new=1', 'New design'], ['/notes?new=1', 'New note'], ['/board-meetings/new', 'Board meeting record'], ['/calendar?new=1', 'New meeting'], ['/activity?log=1', 'Log time'], ['/assistant', 'Ask Infinity AI']];
  return <div ref={ref} style={{ position: 'relative' }}>
    <button className="btn primary sm" onClick={() => setOpen(o => !o)}><Plus size={15} /><span className="hide-sm">Create</span></button>
    {open && <div className="menu">{items.map(([href, l]) => <Link key={href} href={href} onClick={() => setOpen(false)}><Plus size={14} className="muted" />{l}</Link>)}</div>}
  </div>;
}

function Notifications({ items, reload }: { items: any[]; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [newRem, setNewRem] = useState(false);
  const ref = useClickAway<HTMLDivElement>(() => setOpen(false));
  const router = useRouter();
  const dismiss = async (n: any) => { if (n.type === 'reminder') { await api.patch(`/api/reminders/${n.ref}`, { status: 'done' }).catch(() => {}); reload(); } };
  const icon = (t: string) => t === 'hours' ? <Timer size={15} /> : t === 'approval' ? <ShieldCheck size={15} /> : t === 'meeting' ? <CalendarDays size={15} /> : t === 'overdue' ? <AlertTriangle size={15} /> : t === 'mention' ? <MessagesSquare size={15} /> : <Clock3 size={15} />;
  return <div ref={ref} style={{ position: 'relative' }}>
    <button className="icon-btn" onClick={() => setOpen(o => !o)} aria-label="Notifications"><Bell size={18} />{items.length > 0 && <span className="dot">{items.length > 9 ? '9+' : items.length}</span>}</button>
    {open && <div className="notif-panel"><div className="card-head"><h3>Needs your attention</h3><button className="btn xs" onClick={() => { setOpen(false); setNewRem(true); }}><BellPlus size={13} /> New reminder</button></div>
      <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
        {items.length === 0 && <div className="empty"><b>All clear</b>No reminders, approvals or overdue work.</div>}
        {items.map(n => <div key={n.id} className="list-item clickable" onClick={() => { setOpen(false); router.push(n.href); }}>
          <div className="tl-icon">{icon(n.type)}</div><div className="main-col"><div className="title" style={{ whiteSpace: 'normal' }}>{n.title}</div><div className="meta">{label(n.type)} · {ago(n.at)}</div></div>
          {n.type === 'reminder' && <button className="btn xs" onClick={e => { e.stopPropagation(); dismiss(n); }}>Done</button>}
        </div>)}
      </div></div>}
    <ReminderForm open={newRem} onClose={() => setNewRem(false)} onSaved={reload} />
  </div>;
}

/** After an admin sets a temporary password (or a reset link is used), ask the person to choose their own. */
function ForcePasswordChange() {
  const [need, setNeed] = useState(false); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { try { if (sessionStorage.getItem('ip-recovery') === '1') setNeed(true); } catch {} supabase().auth.getUser().then(({ data }) => { if (data.user?.user_metadata?.must_change_password) setNeed(true); }); const { data: sub } = supabase().auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') setNeed(true); }); return () => sub.subscription.unsubscribe(); }, []);
  if (!need) return null;
  const save = async () => { setErr(''); if (pw.length < 10) return setErr('Use at least 10 characters'); if (pw !== pw2) return setErr('The passwords do not match'); setBusy(true); const { error } = await supabase().auth.updateUser({ password: pw, data: { must_change_password: false } }); setBusy(false); if (error) setErr(error.message); else { try { sessionStorage.removeItem('ip-recovery'); } catch {} setNeed(false); } };
  return <div className="overlay" style={{ zIndex: 200 }}><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><h3>Choose your own password</h3></div><div className="modal-body"><div className="stack" style={{ gap: 10 }}>
    <p className="small muted">Your password was set by an administrator. Please choose a new one that only you know.</p>
    <label className="field"><span>New password</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
    <label className="field"><span>Repeat</span><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} /></label>
    {err && <div className="small" style={{ color: 'var(--red)' }}>{err}</div>}
    <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save password'}</button></div></div></div></div>;
}
