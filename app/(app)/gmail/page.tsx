'use client';
import { SplitHandle } from '@/components/split-handle';
import { useOpenWindow } from '@/lib/client/nav-history';
import { useScreenItem } from '@/lib/client/screen';
import { Translate } from '@/components/translate';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Search, PenSquare, Reply, ReplyAll, Forward, Link2, Send, ShieldCheck, Wand2, Trash2, Paperclip, RefreshCw, Sparkles, Eye, Undo2, History, ChevronDown, ChevronRight, Star, Archive, MailOpen, Mail as MailClosed, Clock, X, Plus, FileText, BookmarkPlus, CalendarClock, Plane, SlidersHorizontal, Inbox as InboxIcon, Maximize2, Download, Maximize, Minimize, ChevronsRight } from 'lucide-react';
import { api, useApi, downloadBlob } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { ProjectSelect, ProviderSelect } from '@/components/pickers';
import { PageHead, Loading, ErrorNote, Empty, StatusBadge, Button, Tabs, Drawer, Modal, Field, useToast, useConfirm, Notice } from '@/components/ui';
import { ago, date, bytes, personName } from '@/lib/client/format';
import { EmailPreview } from '@/components/email-preview';
import { useMailbox, MyMailboxCard, MailboxSwitch } from '@/components/my-mailbox';
import { AddressChips } from '@/components/address-chips';
import { LinkedText, EmailText, EmailFrame, EventCard } from '@/components/email-body';

/** Wide reading: the left menu and the email list both shrink to icons so the email gets the whole window; again brings them back. */
const toggleWideReading = () => {
  const on = !!document.querySelector('.mail-split.split-rail-first') && document.documentElement.classList.contains('side-mini');
  window.dispatchEvent(new CustomEvent('ip-split-mail', { detail: on ? 'open' : 'fold' }));
  window.dispatchEvent(new CustomEvent('ip-side-mini', { detail: !on }));
};

export default function Page() { return <Suspense fallback={<Loading />}><Gmail /></Suspense>; }

const STATE: Record<string, { label: string; color: string; bg: string }> = {
  unread: { label: 'New', color: '#1f5fbf', bg: '#e8f0fd' },
  needs_reply: { label: 'Needs reply', color: '#b4361f', bg: '#fdecea' },
  draft: { label: 'Reply drafted', color: '#6b4fb3', bg: '#f0ebfb' },
  replied: { label: 'Replied', color: '#2f8a57', bg: '#e7f5ec' },
  waiting: { label: 'Waiting on them', color: '#a8650f', bg: '#fdf3e0' },
  fyi: { label: 'FYI', color: '#6b7789', bg: '#eef1f5' },
};
const fmtWhen = (d?: string | null) => { if (!d) return ''; const x = new Date(d); if (isNaN(x.getTime())) return d; return x.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'short', day: 'numeric', month: 'short', year: x.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: 'numeric', minute: '2-digit' }); };
const addr = (s: string) => ((String(s || '').match(/<([^>]+)>/) || [, String(s || '').trim()])[1] as string).toLowerCase();
const nameOf = (s: string) => String(s || '').replace(/<.*>/, '').replace(/"/g, '').trim() || addr(s);

function Gmail() {
  const sp = useSearchParams(); const router = useRouter(); const { status, can, me } = useApp();
  const [tab, setTab] = useState<'inbox' | 'drafts' | 'autoreply'>(sp.get('tab') === 'drafts' ? 'drafts' : sp.get('tab') === 'autoreply' ? 'autoreply' : 'inbox');
  const [compose, setCompose] = useState<any>(sp.get('compose') === '1' ? { project_id: sp.get('project'), to_addresses: sp.get('to') || '' } : null);
  const win = useOpenWindow(); const openMsg = win.value; // the open email lives in the address, so Back closes it
  useEffect(() => { if (!openMsg) document.documentElement.classList.remove('mail-full'); }, [openMsg]);
  useEffect(() => () => document.documentElement.classList.remove('mail-full'), []);
  const [ver, setVer] = useState(0); const [inboxVer, setInboxVer] = useState(0);
  const [sendNow, setSendNow] = useState<any>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => { const f = () => setWide(window.innerWidth / (Number(getComputedStyle(document.documentElement).zoom) || 1) >= 1050); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  // Each person's own mailbox (admins/directors may also open the shared one)
  const toastTop = useToast();
  const { mailbox } = useMailbox();
  const connected = !!mailbox?.using;
  useEffect(() => { if (sp.get('mailbox') === 'connected') toastTop('Your email is connected — this is your own inbox', 'success'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = () => { setInboxVer(v => v + 1); setVer(v => v + 1); }; window.addEventListener('ip-mailbox', h); return () => window.removeEventListener('ip-mailbox', h); }, []);
  const compose_ = (d: any) => { if (!wide && openMsg) win.set(null); setCompose(d); };
  return <div className="mail-page">
    <div className="mail-top">
      <div className="btn-tabs" role="tablist">{([['inbox', 'Inbox', <InboxIcon key="i" size={15} />, 'Your inbox'], ['drafts', 'Drafts', <FileText key="d" size={15} />, 'Drafts, scheduled and sent emails'], ['autoreply', 'Auto-reply', <Plane key="a" size={15} />, 'Away / auto-reply message']] as const).map(([v, l, ic, t]) => <button key={v} className={tab === v ? 'on' : ''} title={t} onClick={() => setTab(v)}>{ic}<span>{l}</span></button>)}</div>
      {connected && <span className="mail-account" title={mailbox?.using === 'shared' ? `Shared company mailbox: ${mailbox?.mailbox}` : `Your own mailbox: ${mailbox?.mailbox}`}><Mail size={13} /> <span>{mailbox?.mailbox}</span></span>}
      {connected && <MailboxSwitch />}
      <span className="spacer" />
      {can.write && <Button variant="primary" icon={<PenSquare size={15} />} onClick={() => setCompose({})} title="Write a new email">Compose</Button>}
    </div>
    {mailbox && !connected && <div className="mb12"><MyMailboxCard /></div>}
    {tab === 'inbox' && (connected ? <div className={`mail-split${openMsg && wide ? ' has-open' : ''}`}>
        <SplitHandle id="mail" min={300} max={760} minOther={420} fold rail={64} foldLabel="email list" />
        <Inbox key={inboxVer} onOpen={id => win.open(id)} selected={openMsg} />
        {wide && <div className="mail-pane">{openMsg ? <MessageView key={openMsg} id={openMsg} onClose={() => win.close()} onChanged={() => setInboxVer(v => v + 1)} onCompose={compose_} /> : <div className="mail-empty"><Mail size={28} /><b>Select an email to read it</b><span>Infinity AI summarises it and can draft the reply.</span></div>}</div>}
      </div>
      : <div className="card"><Empty icon={<Mail size={20} />} title="Connect your email to see your inbox">Each person connects their own work email once (above). You only ever see your own mailbox.</Empty></div>)}
    {tab === 'drafts' && <Drafts key={ver} onEdit={setCompose} />}
    {tab === 'autoreply' && <AutoReply canEdit={can.write} connected={!!connected} />}
    {!wide && <Drawer open={!!openMsg} onClose={() => win.close()} title="Email">{openMsg && <MessageView key={openMsg} id={openMsg} onClose={() => win.close()} onChanged={() => setInboxVer(v => v + 1)} onCompose={compose_} />}</Drawer>}
    <Compose draft={compose} onClose={() => setCompose(null)} onSaved={() => { setVer(v => v + 1); setTab('drafts'); }} onSend={d => setSendNow(d)} />
    <SendDialog draft={sendNow} onClose={() => setSendNow(null)} onDone={() => { setSendNow(null); setVer(v => v + 1); }} />
  </div>;
}

// ------------------------------------------------------------------ inbox
function Inbox({ onOpen, selected }: { onOpen: (id: string) => void; selected: string | null }) {
  const toast = useToast(); const { can } = useApp();
  const [q, setQ] = useState(''); const [query, setQuery] = useState('in:inbox'); const [page, setPage] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(''); const [local, setLocal] = useState<Record<string, any>>({});
  const { data, error, loading, reload } = useApi<any>(`/api/google/gmail?q=${encodeURIComponent(query)}`, [query, page]);
  // Endless scroll: older emails load by themselves as you reach the bottom of the list
  const [more, setMore] = useState<{ messages: any[]; next: string | null; busy: boolean; started?: boolean; failed?: boolean }>({ messages: [], next: null, busy: false });
  useEffect(() => { setMore({ messages: [], next: null, busy: false }); }, [query]); // a background refresh keeps what's already loaded (no jump to the top)
  const nextToken = more.started ? more.next : (data?.nextPageToken || null);
  const loadMore = async () => {
    if (more.busy || !nextToken) return; const token = nextToken;
    setMore(m => ({ ...m, busy: true, failed: false }));
    try { const r = await api.get<any>(`/api/google/gmail?q=${encodeURIComponent(query)}&pageToken=${encodeURIComponent(token)}`); setMore(m => (m.started ? m.next : token) !== token ? m : { messages: [...m.messages, ...(r.messages || [])], next: r.nextPageToken || null, busy: false, started: true }); }
    catch { setMore(m => ({ ...m, busy: false, failed: true })); }
  };
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current; if (!el || !nextToken || more.failed) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) loadMore(); }, { root: el.closest('.mail-scroll'), rootMargin: '0px 0px 600px 0px' });
    io.observe(el); return () => io.disconnect();
  }); // re-armed after each render so it keeps loading while the bottom is in view
  const seen = new Set<string>(); const all = [...(data?.messages || []), ...more.messages].filter((m: any) => !seen.has(m.id) && !!seen.add(m.id));
  const msgs: any[] = all.map((m: any) => ({ ...m, ...(local[m.id] || {}), ...(m.id === selected && m.unread ? { unread: false, state: m.state === 'unread' ? 'needs_reply' : m.state } : {}) })).filter((m: any) => !m.hidden);
  const counts = msgs.reduce((c: any, m: any) => { c[m.state] = (c[m.state] || 0) + 1; if (m.starred) c.starred = (c.starred || 0) + 1; return c; }, {});
  const shown = msgs.filter(m => !filter || (filter === 'starred' ? m.starred : m.state === filter));
  const act = async (m: any, action: string) => {
    const patch: any = action === 'read' ? { unread: false, state: m.state === 'unread' ? 'needs_reply' : m.state } : action === 'unread' ? { unread: true, state: 'unread' } : action === 'star' ? { starred: true } : action === 'unstar' ? { starred: false } : { hidden: true };
    setLocal(l => ({ ...l, [m.id]: { ...(l[m.id] || {}), ...patch } }));
    try { await api.post(`/api/google/gmail/${m.id}/modify`, { action }); if (action === 'archive' || action === 'trash') toast(action === 'trash' ? 'Moved to Gmail trash (recoverable for 30 days)' : 'Archived', 'success'); }
    catch (e: any) { toast(e.message, 'error'); setLocal(l => ({ ...l, [m.id]: {} })); }
  };
  const FC: Record<string, string> = { '': '#0f766e', starred: '#c08a00' };
  const F = (k: string, l: string, hint: string) => { const n = k ? counts[k] || 0 : msgs.length; const c = FC[k] || STATE[k]?.color || '#6b7789';
    if (k && !n && filter !== k) return null; // empty filters are hidden — less to look at
    return <button key={k || 'all'} type="button" className={`mf${filter === k ? ' on' : ''}${!n ? ' zero' : ''}`} style={{ ['--c' as any]: c }} onClick={() => setFilter(filter === k ? '' : k)} aria-pressed={filter === k} title={hint}>
      <b>{k === 'starred' ? <><Star size={13} fill="currentColor" /> {n}</> : n}</b><span>{l}</span></button>; };
  return <div className="mail-list">
    <div className="mail-rail-head">
      <button type="button" className="icon-btn" title="Open the email list" onClick={() => window.dispatchEvent(new CustomEvent('ip-split-mail', { detail: 'open' }))}><ChevronsRight size={17} /></button>
      <button type="button" className="icon-btn" title="Refresh" onClick={reload}><RefreshCw size={15} /></button>
    </div>
    <form className="mail-search" onSubmit={e => { e.preventDefault(); setPage(null); setQuery(q.trim() || 'in:inbox'); }}>
      <Search size={15} className="muted" /><input placeholder="Search mail" value={q} onChange={e => setQ(e.target.value)} title='Gmail search, e.g. from:x2mconnect.com "agreement" newer_than:30d' />
      {query !== 'in:inbox' && <button type="button" className="icon-btn" title="Clear search" onClick={() => { setQ(''); setQuery('in:inbox'); }}><X size={14} /></button>}
      <select value={['in:inbox', 'is:unread in:inbox', 'is:starred', 'in:sent', 'in:inbox has:attachment', 'in:trash'].includes(query) ? query : ''} onChange={e => { setPage(null); setQuery(e.target.value || 'in:inbox'); }} title="Folder"><option value="in:inbox">Inbox</option><option value="is:unread in:inbox">Unread</option><option value="is:starred">Starred</option><option value="in:sent">Sent</option><option value="in:inbox has:attachment">Attachments</option><option value="in:trash">Trash</option>{!['in:inbox', 'is:unread in:inbox', 'is:starred', 'in:sent', 'in:inbox has:attachment', 'in:trash'].includes(query) && <option value="">Search results</option>}</select>
      <button type="button" className="icon-btn" title="Refresh" onClick={reload}><RefreshCw size={14} /></button>
    </form>
    <div className="mail-filters" role="group" aria-label="Show only">{F('', 'All', 'Every email in this list')}{F('needs_reply', 'Needs reply', 'You haven\'t answered these yet')}{F('unread', 'New', 'Not opened yet')}{F('waiting', 'Waiting', 'You replied — waiting on them')}{F('draft', 'Drafted', 'A reply is drafted, not sent')}{F('replied', 'Replied', 'Answered')}{F('fyi', 'FYI', 'Just for information — no reply needed')}{F('starred', 'Starred', 'Starred in Gmail')}</div>
    {error && <div style={{ padding: 10 }}><ErrorNote error={error} onRetry={reload} /></div>}
    <div className="mail-scroll">{loading && !all.length ? <Loading /> : !shown.length ? <Empty title={filter ? 'Nothing in this view' : 'No messages'} /> : shown.map((m: any) => {
      const st = STATE[m.state] || STATE.fyi;
      return <div key={m.id} role="button" tabIndex={0} className={`mail-row${m.unread ? ' unread' : ''}${selected === m.id ? ' sel' : ''}`} onClick={() => onOpen(m.id)} onKeyDown={e => e.key === 'Enter' && onOpen(m.id)}>
        <span className="bar" style={{ background: m.unread ? STATE.unread.color : m.state === 'needs_reply' ? STATE.needs_reply.color : 'transparent' }} />
        <span className="mail-ava" title={`${nameOf(m.from)} — ${m.subject || '(no subject)'}\n${st.label} · ${ago(m.internalDate)}`} style={{ ['--c' as any]: m.unread ? STATE.unread.color : st.color }}>{(nameOf(m.from).match(/[A-Za-z\u0600-\u06FF0-9]/)?.[0] || '?').toUpperCase()}{(m.unread || m.state === 'needs_reply') && <i />}</span>
        <div style={{ minWidth: 0 }}>
          <div className="line1"><span className="from">{nameOf(m.from)}</span>{m.thread_count > 1 && <span className="tiny muted">{m.thread_count}</span>}{m.starred && <Star size={12} fill="#e3a008" color="#e3a008" />}<span className="spacer" /><span className="when" title={fmtWhen(m.internalDate)}>{ago(m.internalDate)}</span></div>
          <div className="subj">{m.subject || '(no subject)'}</div>
          <div className="line3"><span className="state-chip" style={{ color: st.color, background: st.bg }} title={m.state_by ? `${st.label} — ${m.state_by}` : st.label}>{m.state_label || st.label}{m.state === 'replied' && m.state_by ? ` · ${m.state_by.split(' ')[0]}` : ''}</span>{m.projects?.map((p: any) => <span key={p.id} className="proj-chip">{p.name}</span>)}<span className="snip">{decode(m.snippet)}</span></div>
          {m.files?.length > 0 && <div className="row-files">{m.files.slice(0, 3).map((f: any, i: number) => <span key={i} className="att-chip" title={f.filename}><Paperclip size={11} /><span className="nm">{f.filename}</span></span>)}{m.files.length > 3 && <span className="att-chip more">+{m.files.length - 3}</span>}</div>}
        </div>
        {can.write && <div className="mail-actions" onClick={e => e.stopPropagation()}>
          <button className="icon-btn" title={m.starred ? 'Unstar' : 'Star'} onClick={() => act(m, m.starred ? 'unstar' : 'star')}><Star size={13} /></button>
          <button className="icon-btn" title={m.unread ? 'Mark as read' : 'Mark as unread'} onClick={() => act(m, m.unread ? 'read' : 'unread')}>{m.unread ? <MailOpen size={13} /> : <MailClosed size={13} />}</button>
          <button className="icon-btn" title="Archive" onClick={() => act(m, 'archive')}><Archive size={13} /></button>
          <button className="icon-btn" title="Delete (Gmail trash)" onClick={() => act(m, 'trash')}><Trash2 size={13} /></button>
        </div>}
      </div>; })}
      {nextToken && <div ref={sentinel} className="mail-more">{more.failed ? <Button size="sm" onClick={loadMore}>Couldn&apos;t load older emails — try again</Button> : <><span className="spin-dot" /> Loading older emails…</>}</div>}
      {!nextToken && all.length > 20 && <div className="mail-more muted">That&apos;s everything in this view.</div>}</div>
  </div>;
}
const decode = (s: string) => (s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const PERSONA_OPTS = [{ v: '', l: 'Me (no role)' }, { v: 'admin', l: 'Admin' }, { v: 'coordinator', l: 'Project Coordinator' }, { v: 'manager', l: 'Project Manager' }, { v: 'ceo', l: 'CEO' }];
const TONE_OPTS = [{ v: 'professional', l: 'Professional' }, { v: 'warm', l: 'Warm' }, { v: 'formal', l: 'Formal' }, { v: 'brief', l: 'Brief' }];

// ------------------------------------------------------------------ message
function MessageView({ id, onClose, onCompose, onChanged }: { id: string; onClose: () => void; onCompose: (d: any) => void; onChanged: () => void }) {
  const toast = useToast(); const { can, refreshProjects } = useApp();
  useScreenItem({ kind: 'email', id });
  const { data, loading, error } = useApi<any>(`/api/google/gmail/${id}`, [id]);
  const m = data?.message;
  const { data: th } = useApi<any>(m?.threadId ? `/api/google/gmail/thread/${m.threadId}` : null, [m?.threadId]);
  const { data: lk, reload: reloadLinks } = useApi<any>(m?.threadId ? `/api/email/links?thread_id=${m.threadId}` : null, [m?.threadId]);
  const [read, setRead] = useState<any>(null); const [reading, setReading] = useState(false); const [aiOpen, setAiOpen] = useState(false);
  const [project, setProject] = useState<string | null>(null); const [linkOpen, setLinkOpen] = useState(false); const [newProj, setNewProj] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false); const [alsoFile, setAlsoFile] = useState(true); const [screenFull, setScreenFull] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('mail-full')); const [openIdx, setOpenIdx] = useState<number | null>(null); const [starred, setStarred] = useState(false); const [quoted, setQuoted] = useState(false); const [details, setDetails] = useState(false); const [original, setOriginal] = useState(false);
  // Designed emails (newsletters, notifications, anything with layout, images or links) show as the sender laid them out; plain personal emails show as clean text.
  // Emails show as the sender laid them out (pictures, links, signature), like Gmail and Outlook. "Simple view" gives clean text.
  useEffect(() => { setOriginal(!!m?.html && !m?.event); setQuoted(false); }, [id, m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRead(null); setStarred(!!m?.labels?.includes('STARRED')); if (!m?.threadId) return; setReading(true); api.post('/api/email/read', { thread_id: m.threadId }).then(r => { setRead(r); if (r.project?.id) setProject(p => p || r.project.id); }).catch(() => {}).finally(() => setReading(false)); }, [m?.threadId]);
  useEffect(() => { setShowEarlier(false); }, [id]);
  const toggleFull = () => { const on = document.documentElement.classList.toggle('mail-full'); setScreenFull(on); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && document.documentElement.classList.contains('mail-full')) { document.documentElement.classList.remove('mail-full'); setScreenFull(false); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  if (loading) return <Loading />;
  if (error) return <div style={{ padding: 16 }}><ErrorNote error={error} /></div>;
  if (!m) return null;
  const linked: any[] = lk?.links || [];
  const link = async (pid?: string) => { const p = pid || project; if (!p) return; try { await api.post('/api/email/links', { gmail_message_id: m.id, thread_id: m.threadId, project_id: p, subject: m.subject, from: m.from, snippet: m.body.slice(0, 200), date: m.date }); const files = realFiles(m.attachments);
      if (alsoFile && files.length) { try { const r = await api.post(`/api/google/gmail/${m.id}/file-attachments`, { action: 'save', items: files.map((a: any) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, project_id: p })) }); toast(`${(r.saved || []).length} attachment${(r.saved || []).length === 1 ? '' : 's'} filed to the project`, 'success'); } catch (e: any) { toast(e.message, 'error'); } }
      toast('Linked to the project', 'success'); setLinkOpen(false); reloadLinks(); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  const createAndLink = async () => { if (!newProj?.trim()) return; try { const r = await api.post('/api/projects', { name: newProj.trim() }); refreshProjects(); setNewProj(null); await link(r.project.id); } catch (e: any) { toast(e.message, 'error'); } };
  const act = async (action: string) => { try { await api.post(`/api/google/gmail/${m.id}/modify`, { action }); if (action === 'star' || action === 'unstar') setStarred(action === 'star'); else { toast(action === 'trash' ? 'Moved to Gmail trash' : action === 'archive' ? 'Archived' : 'Marked as unread', 'success'); onChanged(); onClose(); } } catch (e: any) { toast(e.message, 'error'); } };
  const msgs: any[] = th?.messages || [m];
  const self = msgs.find(x => x.id === m.id);
  const full: string = m.clean_text || m.body || '';
  const clean: string = self?.clean || full;
  const hasQuoted = clean.trim().length < full.trim().length - 20;
  const ev = m.event;
  const earlier = msgs.filter(x => x.id !== m.id);
  const earlierFiles = earlier.filter((x: any) => realFiles(x.attachments).length > 0);
  const myIdx = msgs.findIndex(x => x.id === m.id); const isLatest = myIdx === msgs.length - 1;
  const reply = (all: boolean, auto: boolean) => {
    const rt = read?.reply_to; const to = rt?.to || addr(m.from);
    const cc = all ? (rt?.cc || [m.to, m.cc].join(',').split(',').map((x: string) => x.trim()).filter((x: string) => x && addr(x) !== to).join(', ')) : '';
    onCompose({ to_addresses: to, cc_addresses: cc, subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`, in_reply_to: rt?.in_reply_to || m.messageId, gmail_thread_id: m.threadId, original: { from: m.from, subject: m.subject, body: m.body, date: m.date }, project_id: project || read?.project?.id || linked[0]?.project_id || null, related: read?.related || [], suggested_cc: read?.suggested_cc || [], auto });
  };
  const forward = () => onCompose({ to_addresses: '', subject: /^fwd?:/i.test(m.subject) ? m.subject : `Fwd: ${m.subject}`, body: `\n\n---------- Forwarded message ---------\nFrom: ${m.from}\nDate: ${fmtWhen(m.date)}\nSubject: ${m.subject}\nTo: ${m.to}\n\n${m.body}`, forward_of: m.id, forward_attachments: m.attachments || [], suggested_cc: read?.suggested_cc || [], project_id: project || linked[0]?.project_id || null });
  const headline = read?.reading ? (read.reading.requests?.[0] || read.reading.questions?.[0] || read.reading.summary?.[0] || '') : '';
  const recipients = [m.to, m.cc].filter(Boolean).join(', ').split(',').map((x: string) => nameOf(x.trim()).split(' ')[0]).filter(Boolean);
  return <div className="msg-view">
    <div className="msg-head">
      <h2 title={m.subject}>{m.subject || '(no subject)'}</h2>
      <div className="msg-tools">
        {can.write && <><button className="icon-btn" title={starred ? 'Unstar' : 'Star'} onClick={() => act(starred ? 'unstar' : 'star')}><Star size={16} fill={starred ? '#e3a008' : 'none'} color={starred ? '#e3a008' : 'currentColor'} /></button>
        <button className="icon-btn" title="Mark as unread" onClick={() => act('unread')}><MailClosed size={16} /></button>
        <button className="icon-btn" title="Archive" onClick={() => act('archive')}><Archive size={16} /></button>
        <button className="icon-btn" title="Delete" onClick={() => act('trash')}><Trash2 size={16} /></button></>}
        <button className="icon-btn" title={screenFull ? 'Leave full screen (Esc)' : 'Full screen: the whole window, email list stays on the left'} onClick={toggleFull}>{screenFull ? <Minimize size={16} /> : <Maximize size={16} />}</button>
        <button className="icon-btn mail-wide-btn" title="Wide reading: shrink the menu and the email list to icons (click again to bring them back)" onClick={toggleWideReading}><Maximize2 size={16} /></button>
        <button className="icon-btn" title="Close" onClick={onClose}><X size={17} /></button>
      </div>
    </div>
    <div className="msg-scroll">
      <div className="msg-from">
        <span className="avatar" style={{ background: '#2f6fd0' }}>{nameOf(m.from).slice(0, 1).toUpperCase()}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div><b>{nameOf(m.from)}</b> <span className="muted small">&lt;{addr(m.from)}&gt;</span></div>
          <button className="link-quiet small" onClick={() => setDetails(d => !d)}>to {recipients.slice(0, 3).join(', ')}{recipients.length > 3 ? ` +${recipients.length - 3}` : ''} {details ? '▴' : '▾'}</button>
          {details && <div className="tiny muted" style={{ marginTop: 4 }}><div>To: {m.to}</div>{m.cc && <div>Cc: {m.cc}</div>}</div>}
        </div>
        <span className="small muted nowrap">{earlier.length > 0 && <b style={{ color: isLatest ? 'var(--ok, #2f7d4f)' : 'inherit' }}>{isLatest ? 'Latest email' : `Email ${myIdx + 1} of ${msgs.length}`} · </b>}{fmtWhen(m.date)}</span>
      </div>
      <div className={`ai-strip${aiOpen ? ' open' : ''}`}>
        <button className="ai-strip-line" onClick={() => setAiOpen(o => !o)} aria-expanded={aiOpen}>
          <Sparkles size={14} /><span className="ai-strip-text">{reading ? 'Reading the email and earlier emails…' : headline ? headline : read ? 'No questions or requests found.' : 'Summary unavailable.'}</span>
          {read?.related?.length > 0 && <span className="ai-strip-meta"><History size={12} /> {read.related.length} earlier</span>}
          {aiOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {aiOpen && read && <div className="ai-strip-body">
          <ul>{read.insights.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
          {read.related?.length > 0 && <div className="stack" style={{ gap: 4, marginTop: 6 }}>{read.related.map((r: any) => <div key={r.id} className="tiny"><b>{r.subject}</b> <span className="muted">{r.date ? date(r.date) : ''}{r.project ? ` · ${r.project}` : ''}</span></div>)}</div>}
        </div>}
      </div>
      <div className="msg-meta-row">
        {linked.map((l: any) => <Link key={l.id} href={`/projects/${l.project_id}`} className="proj-chip"><Link2 size={11} /> {l.project?.name || 'Project'}</Link>)}
        {can.write && !linkOpen && <button className="chip-btn" onClick={() => setLinkOpen(true)}><Plus size={12} /> {linked.length ? 'Link another project' : 'Link to project'}</button>}
        {linkOpen && (newProj === null ? <span className="row" style={{ gap: 6 }}><select className="select sm" style={{ width: 220 }} value={project || ''} onChange={e => { if (e.target.value === '__new') { setNewProj(String(m.subject || '').replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').slice(0, 80)); return; } setProject(e.target.value || null); }}><option value="">Choose a project…</option><ProjectOptions /><option value="__new">＋ New project from this email…</option></select>{realFiles(m.attachments).length > 0 && <label className="check small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={alsoFile} onChange={e => setAlsoFile(e.target.checked)} /> Also file the {realFiles(m.attachments).length} attachment{realFiles(m.attachments).length === 1 ? '' : 's'} to this project</label>}<Button size="xs" variant="primary" disabled={!project} onClick={() => link()}>Link</Button><Button size="xs" variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button></span>
          : <span className="row" style={{ gap: 6 }}><input className="input sm" style={{ width: 240 }} autoFocus value={newProj} onChange={e => setNewProj(e.target.value)} placeholder="Project name" /><Button size="xs" variant="primary" onClick={createAndLink}>Create & link</Button><Button size="xs" variant="ghost" onClick={() => setNewProj(null)}>Cancel</Button></span>)}
        <span className="spacer" /><Translate text={clean} />
      </div>
      {m.attachments.length > 0 && <AttachmentSummary key={m.id} m={m} />}
      {ev && <EventCard e={ev} />}
      {original && m.html ? <EmailFrame html={m.html} showQuoted={quoted} />
        : (!ev || original) ? <EmailText className="msg-body" sender={nameOf(m.from)} text={(quoted ? full : clean) || '(no text body)'} /> : null}
      <div className="body-mode">
        {(original ? m.html : !ev) && hasQuoted && <button className="link-quiet small" onClick={() => setQuoted(q => !q)}>{quoted ? 'Hide earlier messages' : '··· Show earlier messages'}</button>}
        {(m.html || ev) && <button className="link-quiet small" onClick={() => setOriginal(o => !o)}>{original ? 'Simple view' : ev ? 'Show full invitation' : 'Show original formatting'}</button>}
      </div>
      {earlier.length > 0 && <div className="msg-earlier-wrap" style={{ marginTop: 14 }}><button className="link-quiet small" onClick={() => setShowEarlier(v => !v)}>{showEarlier ? '▴' : '▾'} {earlier.length} other email{earlier.length === 1 ? '' : 's'} in this conversation</button>{showEarlier && <>
{earlier.length > 0 && <div className="msg-earlier">{earlier.map((x: any, i: number) => <div key={x.id} className={`earlier-item${openIdx === i ? ' open' : ''}`}>
        <button onClick={() => setOpenIdx(openIdx === i ? null : i)}><b>{nameOf(x.from)}</b><span className="snip">{String(x.clean || x.body).replace(/\s+/g, ' ').slice(0, 140)}</span><span className="tiny muted nowrap">{fmtWhen(x.date)}</span></button>
        {openIdx === i && <EmailText className="msg-body" sender={nameOf(x.from)} text={x.clean || x.body} />}
      </div>)}</div>}
{earlierFiles.length > 0 && <div className="msg-earlier-files"><div className="tiny muted" style={{ margin: '10px 0 4px' }}>Files in earlier emails of this conversation</div>{earlierFiles.map((x: any) => <div key={x.id}><div className="tiny muted">{nameOf(x.from)} · {fmtWhen(x.date)}</div><AttachmentSummary m={{ id: x.id, attachments: x.attachments }} /></div>)}</div>}
</>}</div>}
    </div>
    {can.write && <div className="msg-actions">
      <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => reply(true, true)}>AI reply</Button>
      <Button icon={<Reply size={15} />} onClick={() => reply(false, false)}>Reply</Button>
      <Button icon={<ReplyAll size={15} />} onClick={() => reply(true, false)}>Reply all</Button>
      <Button icon={<Forward size={15} />} onClick={forward}>Forward</Button>
    </div>}
  </div>;
}

/** Outlook's signature pictures and Word leftovers (image001.png, ~WRD0002.jpg …) are not real files. */
const isJunkPic = (a: any) => /^(image\d+|~WRD\d+|outlook-\w+|spacer|clip_image\d+)\.(png|jpe?g|gif|bmp)$/i.test(String(a?.filename || ''));
const realFiles = (list: any[]) => { const seen = new Set<string>(); return (list || []).filter(a => { if (isJunkPic(a)) return false; const k = `${a.filename}:${a.size}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
const ATT_CATS: [string, string][] = [['', 'General'], ['agreement', 'Agreement'], ['mou', 'MOU'], ['contract', 'Contract'], ['correspondence', 'Correspondence'], ['financial', 'Financial'], ['planning', 'Planning'], ['marketing', 'Marketing'], ['design', 'Design'], ['due_diligence', 'Due diligence'], ['report', 'Report'], ['template', 'Template'], ['board_minutes', 'Board meeting record']];
/** Attachments of an email: download, a short AI summary of each, and one click to file them in Documents (read + searchable). */
function AttachmentSummary({ m }: { m: any }) {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null); const [busy, setBusy] = useState<string | null>(null); const [filed, setFiled] = useState<Set<string>>(new Set());
  const atts = realFiles(m.attachments);
  const items = atts.map((a: any) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size }));
  const url = `/api/google/gmail/${m.id}/file-attachments`;
  const summarise = async () => { setBusy('s'); try { const r = await api.post(url, { action: 'suggest', items }); setRows(r.items); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const edit = (id: string, patch: any) => setRows(rs => (rs || []).map(r => (r.id === id ? { ...r, ...patch } : r)));
  const save = async (list: any[]) => {
    const todo = list.filter(r => !r.saved); if (!todo.length) return;
    setBusy(todo.length === 1 ? todo[0].id : 'all');
    try {
      const r = await api.post(url, { action: 'save', items: todo.map(x => ({ id: x.id, filename: x.filename, mimeType: x.mimeType, summary: x.summary, category: x.category, project_id: x.project_id })) });
      const ok = new Set((r.saved || []).map((s: any) => s.id));
      setRows(rs => (rs || []).map(x => (ok.has(x.id) ? { ...x, saved: true } : x)));
      toast(`${ok.size} saved to Documents${r.skipped?.length ? ` · ${r.skipped.length} skipped` : ''}`, 'success');
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const assign = async (a: any, v: string) => {
    if (!v) return; setBusy(a.id);
    try { const r = await api.post(url, { action: 'save', items: [{ id: a.id, filename: a.filename, mimeType: a.mimeType, project_id: v === '__none' ? null : v }] }); if ((r.saved || []).length || (r.skipped || []).length) { setFiled(f => new Set(f).add(a.id)); toast(v === '__none' ? 'Saved to Documents' : 'Saved to Documents under the project', 'success'); } }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const download = async (a: any) => { try { const { blob } = await api.blob(`/api/google/gmail/${m.id}/attachments/${encodeURIComponent(a.id)}?name=${encodeURIComponent(a.filename)}&type=${encodeURIComponent(a.mimeType || '')}`); downloadBlob(blob, a.filename); } catch (e: any) { toast(e.message, 'error'); } };
  if (!atts.length) return null;
  return <div className="mail-atts">
    {!rows ? <div className="att-line">
      {atts.map((a: any, i: number) => <div key={a.id || i} className="att-card">
        <Paperclip size={14} /><span className="nm" title={a.filename}>{a.filename}</span><span className="tiny muted nowrap">{bytes(a.size)}</span>
        <button className="icon-btn" title="Download" onClick={() => download(a)}><Download size={14} /></button>
        {filed.has(a.id) ? <span className="tiny nowrap" style={{ color: 'var(--ok, #2f7d4f)' }}>✓ In Documents</span> : <select className="select sm" value="" disabled={busy === a.id} onChange={e => assign(a, e.target.value)} title="File this attachment in Documents under a project"><option value="">Assign ▾</option><option value="__none">File without a project</option><ProjectOptions /></select>}
      </div>)}
      <Button size="xs" variant="ghost" loading={busy === 's'} onClick={summarise}><Sparkles size={13} /> Summarise &amp; file</Button>
    </div>
    : <div className="row" style={{ justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
      <div className="tiny muted">{atts.length} attachment{atts.length === 1 ? '' : 's'}</div>
      {rows.some(r => !r.saved) && <Button size="sm" variant="primary" loading={busy === 'all'} onClick={() => save(rows)}>Save all to Documents</Button>}
    </div>}
    {rows && <div className="col" style={{ gap: 8 }}>{rows.map(r => <div key={r.id} className="card" style={{ padding: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><b className="ellipsis" style={{ minWidth: 0 }}><Paperclip size={13} /> {r.filename}</b><span className="tiny muted">{bytes(r.size)}</span></div>
      <div className="small" style={{ margin: '4px 0 8px' }}>{r.summary}</div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <select className="select sm" disabled={r.saved} value={r.category || ''} onChange={e => edit(r.id, { category: e.target.value })}>{ATT_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select className="select sm" disabled={r.saved} value={r.project_id || ''} onChange={e => edit(r.id, { project_id: e.target.value || null })}><option value="">No project</option><ProjectOptions /></select>
        <Button size="sm" variant="ghost" onClick={() => download(r)}>Download</Button>
        {r.saved ? <span className="tiny" style={{ color: 'var(--ok, #2f7d4f)' }}>✓ In Documents</span> : <Button size="sm" variant="primary" loading={busy === r.id} onClick={() => save([r])}>Save to Documents</Button>}
      </div>
    </div>)}</div>}
  </div>;
}

function ProjectOptions() { const { projects } = useApp(); return <>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</>; }

// ------------------------------------------------------------------ drafts / scheduled / sent
function Drafts({ onEdit }: { onEdit: (d: any) => void }) {
  const toast = useToast(); const confirm = useConfirm(); const { can } = useApp(); const { mailbox } = useMailbox(); const mailboxOk = !!mailbox?.using;
  const { data, error, loading, reload } = useApi<any>('/api/email/drafts');
  const [sending, setSending] = useState<any>(null); const [viewing, setViewing] = useState<any>(null);
  const del = async (d: any) => { if (!(await confirm({ title: 'Delete draft?', confirm: 'Delete', danger: true }))) return; try { await api.del(`/api/email/drafts/${d.id}`); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const unschedule = async (d: any) => { try { await api.del(`/api/email/drafts/${d.id}/schedule`); toast('Schedule cancelled', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  if (loading) return <Loading />;
  const drafts: any[] = data?.drafts || [];
  return <>{error && <ErrorNote error={error} onRetry={reload} />}
    <Notice icon={<Send size={16} />}>Your emails go straight out when you press Send — no approval needed. Sending asks you to confirm and reminds you to Cc anyone who should know.</Notice>
    <div className="card mt16">{!drafts.length ? <Empty title="No drafts" /> : <div className="list">{drafts.map((d: any) => <div key={d.id} className="list-item clickable" onClick={() => d.status !== 'sent' && onEdit(d)}>
      <div className="main-col"><div className="title">{d.subject}</div><div className="meta">To {d.to_addresses}{d.cc_addresses ? ` · Cc ${d.cc_addresses}` : ''}{d.project?.name ? ` · ${d.project.name}` : ''} · {d.sent_at ? `sent ${fmtWhen(d.sent_at)}` : ago(d.updated_at)}{d.attachments?.length ? ` · 📎 ${d.attachments.length}` : ''}{d.error ? ` · ${d.error}` : ''}</div>
        {d.scheduled_at && d.status !== 'sent' && <div className="tiny mt8" style={{ color: '#6b4fb3' }}><CalendarClock size={12} /> Scheduled to send {fmtWhen(d.scheduled_at)} <button className="link tiny" onClick={e => { e.stopPropagation(); unschedule(d); }}>Cancel schedule</button></div>}</div>
      <StatusBadge value={d.scheduled_at && d.status !== 'sent' ? 'scheduled' : d.status} />
      <div className="row" style={{ gap: 6 }} onClick={e => e.stopPropagation()}>
        {d.status !== 'sent' && can.write && <Button size="xs" variant="success" icon={<Send size={12} />} disabled={!mailboxOk} onClick={() => setSending(d)}>Send…</Button>}
        <button className="btn ghost xs" title="Preview as the recipient sees it" onClick={() => setViewing(d)}><Eye size={12} /></button>
        {d.status !== 'sent' && can.write && <button className="btn ghost xs" onClick={() => del(d)}><Trash2 size={12} /></button>}
      </div>
    </div>)}</div>}</div>
    <Modal open={!!viewing} size="wide" onClose={() => setViewing(null)} title={viewing?.subject || 'Preview'}>{viewing && <EmailPreview draft={viewing} />}</Modal>
    <SendDialog draft={sending} onClose={() => setSending(null)} onDone={() => { setSending(null); reload(); }} />
  </>;
}

const quick = () => {
  const now = new Date(); const at = (d: Date, h: number) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  const mon = new Date(now); mon.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  return [{ l: 'Tomorrow 8:00 am', d: at(tmr, 8) }, { l: 'Tomorrow 1:00 pm', d: at(tmr, 13) }, { l: 'Monday 9:00 am', d: at(mon, 9) }];
};
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function SendDialog({ draft, onClose, onDone }: { draft: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast(); const { members, me } = useApp(); const { mailbox } = useMailbox(); const fromBox = mailbox?.mailbox || null;
  const [when, setWhen] = useState(''); const [busy, setBusy] = useState<string | null>(null); const [cc, setCc] = useState('');
  useEffect(() => { setWhen(''); setCc(draft?.cc_addresses || ''); }, [draft?.id, draft?.cc_addresses]);
  const mail = (x: string) => (/<([^>]+)>/.exec(x)?.[1] || x).trim().toLowerCase();
  const ccList = cc.split(',').map(x => x.trim()).filter(Boolean);
  const taken = new Set([...String(draft?.to_addresses || '').split(','), ...ccList, ...String(draft?.bcc_addresses || '').split(',')].map(x => mail(x)).filter(Boolean));
  // Team members who could be copied (their choice): everyone active with an email, except the sender
  const people = (members || []).filter((m: any) => m.email && m.id !== me.id && (m as any).active !== false);
  const toggle = (m: any) => { const e = String(m.email).toLowerCase(); setCc(ccList.some(c => mail(c) === e) ? ccList.filter(c => mail(c) !== e).join(', ') : [...ccList, m.email].join(', ')); };
  /** Saves a changed Cc on the draft before it goes. */
  const syncCc = async () => { if ((draft.cc_addresses || '') !== cc) await api.patch(`/api/email/drafts/${draft.id}`, { cc_addresses: cc }); };
  const send = async () => { setBusy('send'); try { await syncCc(); await api.post(`/api/email/drafts/${draft.id}/send`, { confirm: true }); toast('Email sent', 'success'); onDone(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const schedule = async () => { if (!when) return toast('Choose when to send', 'error'); setBusy('sch'); try { await syncCc(); await api.post(`/api/email/drafts/${draft.id}/schedule`, { at: new Date(when).toISOString() }); toast(`Scheduled for ${fmtWhen(new Date(when).toISOString())}`, 'success'); onDone(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  return <Modal open={!!draft} size="wide" onClose={onClose} title="Send this email" footer={<><Button onClick={onClose}>Cancel</Button><span className="spacer" /><Button icon={<CalendarClock size={15} />} loading={busy === 'sch'} disabled={!when} onClick={schedule}>Schedule</Button><Button variant="success" icon={<Send size={15} />} loading={busy === 'send'} onClick={send}>Send now</Button></>}>
    {draft && <div className="stack" style={{ gap: 10 }}>
      <div className={`card cc-remind${ccList.length ? '' : ' empty'}`} style={{ padding: 10 }}>
        <div className="small"><b>{ccList.length ? 'Anyone else to copy?' : 'Reminder: nobody is copied on this email.'}</b> <span className="muted">Cc anyone in the team who should know — it&apos;s your choice, and you can send without.</span></div>
        <div className="cmp-row mt8" style={{ margin: 0 }}><label>Cc</label><AddressChips value={cc} onChange={setCc} placeholder="name@company.com" /></div>
        {people.length > 0 && <div className="cmp-sugs mt8" style={{ margin: 0 }}>{people.map((m: any) => { const on = ccList.some(c => mail(c) === String(m.email).toLowerCase()); const isTo = !on && taken.has(String(m.email).toLowerCase()); return isTo ? null : <button key={m.id} type="button" className={on ? 'on' : ''} title={m.email} onClick={() => toggle(m)}>{on ? '✓ ' : '+ '}{personName(m)}</button>; })}</div>}
      </div>
      <div className="small"><b>To:</b> {draft.to_addresses}{draft.bcc_addresses && <><br /><b>Bcc:</b> {draft.bcc_addresses}</>}<br /><b>Subject:</b> {draft.subject}{draft.attachments?.length ? <><br /><b>Attachments:</b> {draft.attachments.map((a: any) => a.name).join(', ')}</> : null}</div>
      <EmailPreview draft={draft} height={300} />
      <div className="card" style={{ padding: 10 }}><div className="row wrap" style={{ gap: 6, alignItems: 'center' }}><Clock size={14} className="muted" /><b className="small">Send later</b>{quick().map(q => <button key={q.l} className={`btn xs ${when === toLocalInput(q.d) ? 'primary' : ''}`} onClick={() => setWhen(toLocalInput(q.d))}>{q.l}</button>)}<input type="datetime-local" className="input sm" style={{ width: 'auto' }} value={when} min={toLocalInput(new Date())} onChange={e => setWhen(e.target.value)} /></div>
        <div className="tiny muted mt8">Scheduled emails are sent by the Infinity Planet server, so it must be running at that time.</div></div>
      <Notice tone="warn">This sends from your own mailbox{fromBox ? ` (${fromBox})` : ''} and cannot be undone.</Notice>
    </div>}
  </Modal>;
}

// ------------------------------------------------------------------ auto-reply
function AutoReply({ canEdit, connected }: { canEdit: boolean; connected: boolean }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any>(connected ? '/api/google/gmail/vacation' : null);
  const [f, setF] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data?.vacation) { const v = data.vacation; setF({ enabled: !!v.enableAutoReply, subject: v.responseSubject || 'Out of office', text: v.responseBodyPlainText || (v.responseBodyHtml || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''), start: v.startTime ? toLocalInput(new Date(Number(v.startTime))) : '', end: v.endTime ? toLocalInput(new Date(Number(v.endTime))) : '', contacts_only: !!v.restrictToContacts, domain_only: !!v.restrictToDomain }); } }, [data]);
  if (!connected) return <div className="card"><Empty icon={<Plane size={20} />} title="Connect Google to manage auto-reply" /></div>;
  if (error) return <div className="card card-body"><ErrorNote error={error} onRetry={reload} /><div className="mt8"><Link className="btn primary sm" href="/system?tab=google">Reconnect Google</Link></div></div>;
  if (loading || !f) return <Loading />;
  const save = async () => { setBusy(true); try { await api.patch('/api/google/gmail/vacation', { ...f, html: f.text.split('\n').map((l: string) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>'), start: f.start ? new Date(f.start).toISOString() : null, end: f.end ? new Date(f.end).toISOString() : null }); toast(f.enabled ? 'Auto-reply is on' : 'Auto-reply is off', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  return <div className="grid g2"><div className="card"><div className="card-head"><h3><Plane size={15} /> Auto-reply (out of office)</h3><label className="check"><input type="checkbox" disabled={!canEdit} checked={f.enabled} onChange={e => setF({ ...f, enabled: e.target.checked })} /> <b>{f.enabled ? 'On' : 'Off'}</b></label></div>
    <div className="card-body form-grid">
      <Field label="First day"><input type="datetime-local" className="input" disabled={!canEdit} value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></Field>
      <Field label="Last day (optional)"><input type="datetime-local" className="input" disabled={!canEdit} value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></Field>
      <Field label="Subject" className="full"><input className="input" disabled={!canEdit} value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></Field>
      <Field label="Message" className="full"><textarea className="textarea" style={{ minHeight: 180 }} disabled={!canEdit} value={f.text} onChange={e => setF({ ...f, text: e.target.value })} placeholder={'Thank you for your email. I am out of the office until Monday 19 October with limited access to email.\n\nFor urgent matters please contact info@rhccity.com.au.\n\nKind regards'} /></Field>
      <label className="check"><input type="checkbox" disabled={!canEdit} checked={f.contacts_only} onChange={e => setF({ ...f, contacts_only: e.target.checked })} /> Only reply to people in my contacts</label>
      <label className="check"><input type="checkbox" disabled={!canEdit} checked={f.domain_only} onChange={e => setF({ ...f, domain_only: e.target.checked })} /> Only reply to my company</label>
      {canEdit ? <div className="full"><Button variant="primary" loading={busy} onClick={save}>Save auto-reply</Button></div> : <div className="full tiny muted">Only admins, directors and managers can change the auto-reply.</div>}
    </div></div>
    <Notice>The auto-reply is set on your own Gmail mailbox, exactly like Gmail’s “Vacation responder”. Gmail sends it at most once every 4 days to each sender.</Notice></div>;
}

// ------------------------------------------------------------------ compose
function Compose({ draft, onClose, onSaved, onSend }: { draft: any; onClose: () => void; onSaved: () => void; onSend?: (d: any) => void }) {
  const toast = useToast(); const { members, me } = useApp();
  const [f, setF] = useState<any>({});
  const [provider, setProvider] = useState('auto'); const [intent, setIntent] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const [persona, setPersona] = useState(''); const [tone, setTone] = useState('professional'); const [history, setHistory] = useState(true);
  const [view, setView] = useState<'write' | 'preview'>('write'); const [undo, setUndo] = useState<string[]>([]); const [custom, setCustom] = useState('');
  const [info, setInfo] = useState<{ insights: string[]; note?: string; engine?: string } | null>(null);
  const [showBcc, setShowBcc] = useState(false); const [snips, setSnips] = useState<any[]>([]); const [docPick, setDocPick] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!draft) return;
    setF({ to_addresses: '', cc_addresses: '', bcc_addresses: '', subject: '', body: '', attachments: [], ...draft }); setIntent(''); setUndo([]); setView('write'); setInfo(null); setCustom(''); setShowBcc(!!draft.bcc_addresses);
    api.get('/api/email/signature').then(r => { if (r.signature?.persona) setPersona(r.signature.persona); }).catch(() => {});
    api.get('/api/settings').then(r => { const st = r.settings.email_style || {}; if (st.default_tone) setTone(st.default_tone); if (st.default_persona) setPersona(p => p || st.default_persona); }).catch(() => {});
    api.get('/api/email/snippets').then(r => setSnips(r.snippets || [])).catch(() => {});
    if (draft.auto) setTimeout(() => document.getElementById('ai-draft-btn')?.click(), 50);
  }, [draft]);
  // Cc suggestions: people on the conversation first, then the team
  const suggestions = useMemo(() => {
    const out = new Map<string, { email: string; name: string; source: string }>();
    for (const s of (f.suggested_cc || [])) out.set(s.email, s);
    for (const m of members) if (m.email && m.email !== me.email && !out.has(m.email.toLowerCase())) out.set(m.email.toLowerCase(), { email: m.email.toLowerCase(), name: m.full_name || '', source: 'team' });
    const to = String(f.to_addresses || '').toLowerCase();
    return [...out.values()].filter(s => !to.includes(s.email)).slice(0, 16);
  }, [f.suggested_cc, f.to_addresses, members, me.email]);
  const ccList = String(f.cc_addresses || '').split(',').map(s => s.trim()).filter(Boolean);
  const inCc = (e: string) => ccList.some(c => addr(c) === e);
  const toggleCc = (s: { email: string; name: string }) => setF((x: any) => { const cur = String(x.cc_addresses || '').split(',').map((v: string) => v.trim()).filter(Boolean); const has = cur.some((c: string) => addr(c) === s.email); return { ...x, cc_addresses: (has ? cur.filter((c: string) => addr(c) !== s.email) : [...cur, s.email]).join(', ') }; });
  const write = async () => {
    setBusy('ai');
    try {
      const r = await api.post('/api/email/draft-reply', { provider, intent, tone, persona: persona || null, use_history: history, project_id: f.project_id, original: f.original, thread_id: f.gmail_thread_id || undefined, related: f.related?.length ? f.related : undefined, subject: f.subject, to: f.to_addresses });
      if (f.body?.trim()) setUndo(u => [...u, f.body]);
      setF((x: any) => ({ ...x, subject: r.subject || x.subject, body: x.forward_of ? `${r.body}${x.body || ''}` : r.body, engine: r.engine, project_id: x.project_id || r.project?.id || null, in_reply_to: x.in_reply_to || r.reply_to?.in_reply_to, suggested_cc: r.suggested_cc?.length ? r.suggested_cc : x.suggested_cc, dirty: true }));
      setInfo({ insights: r.insights || [], note: r.note, engine: r.engine });
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const rewrite = async (mode: string, instruction?: string) => {
    if (!f.body?.trim()) return toast('Write or draft the message first', 'error');
    setBusy(instruction ? 'custom' : mode);
    try { const r = await api.post('/api/email/rewrite', { body: f.body, mode, instruction, provider, to: f.to_addresses }); if (r.body.trim() === f.body.trim()) toast('No changes needed — it already reads well. Connect an AI for deeper rewrites.', 'info'); else { setUndo(u => [...u, f.body]); setF((x: any) => ({ ...x, body: r.body, dirty: true })); setView('write'); toast(`${mode === 'polish' ? 'Polished' : mode === 'proofread' ? 'Proofread' : mode === 'shorten' ? 'Shortened' : mode === 'formal' ? 'Made more formal' : mode === 'friendly' ? 'Made friendlier' : 'Rewritten'}${r.engine === 'rules' ? ' (built-in editor)' : ` by ${r.engine}`}`, 'success'); } if (r.note && r.engine === 'rules') setInfo(i => ({ insights: i?.insights || [], note: r.note, engine: r.engine })); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const back = () => setUndo(u => { if (!u.length) return u; setF((x: any) => ({ ...x, body: u[u.length - 1], dirty: true })); return u.slice(0, -1); });
  const payload = () => ({ to_addresses: f.to_addresses, cc_addresses: f.cc_addresses, bcc_addresses: f.bcc_addresses || undefined, subject: f.subject, body: f.body, project_id: f.project_id || null, in_reply_to: f.in_reply_to, gmail_thread_id: f.gmail_thread_id, engine: f.engine, forward_of: f.forward_of });
  /** Saves (creating the draft if needed) and returns its id — used before attaching files. */
  const ensureSaved = async (): Promise<string | null> => {
    if (f.id) return f.id;
    if (!f.to_addresses?.trim()) { toast('Add a recipient first', 'error'); return null; }
    const r = await api.post('/api/email/drafts', { ...payload(), subject: f.subject || '(no subject)', allow_empty: true });
    setF((x: any) => ({ ...x, id: r.draft.id, attachments: r.draft.attachments || [] }));
    if (f.forward_attachments?.length && f.forward_of) { const a = await api.post(`/api/email/drafts/${r.draft.id}/attachments`, { gmail_message_id: f.forward_of }).catch(() => null); if (a) setF((x: any) => ({ ...x, attachments: a.attachments, forward_attachments: [] })); }
    return r.draft.id;
  };
  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return; setBusy('attach');
    try { const id = await ensureSaved(); if (!id) return; const fd = new FormData(); for (const file of Array.from(files)) fd.append('file', file); const r = await api.post(`/api/email/drafts/${id}/attachments`, fd); setF((x: any) => ({ ...x, attachments: r.attachments })); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const attachDocs = async (ids: string[]) => { setDocPick(false); if (!ids.length) return; setBusy('attach'); try { const id = await ensureSaved(); if (!id) return; const r = await api.post(`/api/email/drafts/${id}/attachments`, { document_ids: ids }); setF((x: any) => ({ ...x, attachments: r.attachments })); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const removeAtt = async (p: string) => { try { const r = await api.del(`/api/email/drafts/${f.id}/attachments?path=${encodeURIComponent(p)}`); setF((x: any) => ({ ...x, attachments: r.attachments })); } catch (e: any) { toast(e.message, 'error'); } };
  const insertSnip = (id: string) => { const s = snips.find(x => x.id === id); if (!s) return; setUndo(u => [...u, f.body || '']); setF((x: any) => { const b = String(x.body || ''); const m = b.match(/\n\s*(kind regards|best regards|warm regards|regards|yours sincerely|thanks|cheers)[,!]?\s*\n/i); return { ...x, body: m && m.index ? `${b.slice(0, m.index).trimEnd()}\n\n${s.body}\n${b.slice(m.index)}` : `${b ? `${b.trimEnd()}\n\n` : ''}${s.body}`, dirty: true }; }); };
  const saveSnip = async () => { const sel = typeof window !== 'undefined' ? window.getSelection()?.toString() : ''; const text = (sel && sel.length > 5 ? sel : f.body || '').trim(); if (!text) return toast('Write something first (or select the text to save)', 'error'); const name = window.prompt('Name this saved reply', String(f.subject || '').replace(/^re:\s*/i, '').slice(0, 60)); if (!name) return; try { const r = await api.post('/api/email/snippets', { name, body: text }); setSnips(s => [...s, r.snippet]); toast('Saved reply added', 'success'); } catch (e: any) { toast(e.message, 'error'); } };
  const save = async () => {
    setBusy('save');
    try { if (f.id) await api.patch(`/api/email/drafts/${f.id}`, payload()); else await api.post('/api/email/drafts', payload()); toast('Draft saved — send it from Drafts whenever you are ready', 'success'); onSaved(); onClose(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const saveAndSend = async () => {
    if (!f.to_addresses?.trim()) return toast('Add a recipient first', 'error');
    setBusy('sendprep');
    try { const r = f.id ? await api.patch(`/api/email/drafts/${f.id}`, payload()) : await api.post('/api/email/drafts', payload()); const d = r.draft || { ...f, ...payload() }; onSaved(); onClose(); onSend?.(d); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const R = (mode: string, label: string) => <button type="button" className="tb-btn" disabled={!!busy} onClick={() => rewrite(mode)}>{busy === mode ? <span className="spin" /> : null}{label}</button>;
  const [opts, setOpts] = useState(false); const [sugOpen, setSugOpen] = useState(false);
  const sugShown = sugOpen ? suggestions : suggestions.slice(0, 5);
  return <Modal open={!!draft} onClose={onClose} size="compose" title={f.id ? 'Edit draft' : f.forward_of ? 'Forward' : f.original ? 'Reply' : 'New email'}
    footer={<>
      <div className="cmp-project"><ProjectSelect value={f.project_id} onChange={v => setF({ ...f, project_id: v })} /></div>
      <span className="spacer" />
      <Button onClick={onClose}>Cancel</Button><Button loading={busy === 'save'} onClick={save}>Save draft</Button>{onSend && <Button variant="primary" icon={<Send size={14} />} loading={busy === 'sendprep'} onClick={saveAndSend}>Send…</Button>}</>}>
    <div className="cmp">
      <div className="cmp-fields">
        <div className="cmp-row cmp-pair">
          <div className="cmp-cell"><label>To</label><AddressChips value={f.to_addresses || ''} onChange={v => setF((x: any) => ({ ...x, to_addresses: v }))} placeholder="name@company.com" /></div>
          <div className="cmp-cell"><label>Cc</label><AddressChips value={f.cc_addresses || ''} onChange={v => setF((x: any) => ({ ...x, cc_addresses: v }))} placeholder="Add people (suggestions below)" />{!showBcc && <button type="button" className="link-quiet small" onClick={() => setShowBcc(true)}>Bcc</button>}</div>
        </div>
        {showBcc && <div className="cmp-row"><label>Bcc</label><AddressChips value={f.bcc_addresses || ''} onChange={v => setF((x: any) => ({ ...x, bcc_addresses: v }))} /></div>}
        {suggestions.length > 0 && <div className="cmp-sugs"><span className="tiny muted">Suggested:</span>{sugShown.map(s => <button key={s.email} type="button" className={inCc(s.email) ? 'on' : ''} title={`${s.email}${s.source === 'team' ? ' — team member' : ' — on this conversation'}`} onClick={() => toggleCc(s)}>{inCc(s.email) ? '✓ ' : '+ '}{s.name || s.email}</button>)}{suggestions.length > 5 && <button type="button" className="more" onClick={() => setSugOpen(o => !o)}>{sugOpen ? 'less' : `+${suggestions.length - 5} more`}</button>}</div>}
        <div className="cmp-row"><label>Subject</label><input value={f.subject || ''} onChange={e => setF({ ...f, subject: e.target.value, dirty: true })} /></div>
      </div>
      <div className="cmp-ai">
        <Sparkles size={15} />
        <input placeholder={f.original ? 'Tell Infinity AI what to say…' : 'Tell Infinity AI what to write…'} value={intent} onChange={e => setIntent(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); write(); } }} />
        <Button id="ai-draft-btn" size="sm" variant="primary" loading={busy === 'ai'} onClick={write}>{f.original ? 'Draft reply' : 'Draft it'}</Button>
        <button type="button" className={`icon-btn${opts ? ' on' : ''}`} title="AI options" aria-expanded={opts} onClick={() => setOpts(o => !o)}><SlidersHorizontal size={15} /></button>
      </div>
      {opts && <div className="cmp-opts">
        <label>Reply as <select className="select sm" value={persona} onChange={e => setPersona(e.target.value)}>{PERSONA_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>
        <label>Tone <select className="select sm" value={tone} onChange={e => setTone(e.target.value)}>{TONE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>
        <label>AI <ProviderSelect value={provider} onChange={setProvider} auto builtin="Built-in writer (no AI)" className="select sm" compact /></label>
        {f.original && <label className="check"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} /> Use earlier emails</label>}
      </div>}
      {info?.note && <div className="cmp-note">{info.note}</div>}
      {view === 'write'
        ? <textarea className="cmp-body" dir="auto" value={f.body || ''} onChange={e => setF({ ...f, body: e.target.value, dirty: true })} placeholder="Write your message…" />
        : <div className="cmp-preview"><EmailPreview draft={{ ...f, dirty: true, created_by: undefined }} /></div>}
      {(f.attachments?.length > 0 || f.forward_attachments?.length > 0) && <div className="cmp-atts">
        {(f.attachments || []).map((a: any) => <span key={a.path} className="chip"><Paperclip size={11} />{a.name} <span className="muted">{bytes(a.size)}</span><button className="btn ghost xs" onClick={() => removeAtt(a.path)} title="Remove"><X size={11} /></button></span>)}
        {f.forward_attachments?.length > 0 && <span className="tiny muted">The original {f.forward_attachments.length} attachment(s) are added when you save.</span>}
      </div>}
      <div className="cmp-tools">
        {R('polish', 'Polish')}{R('proofread', 'Proofread')}{R('shorten', 'Shorten')}{R('formal', 'Formal')}{R('friendly', 'Friendlier')}
        <button type="button" className="tb-btn" disabled={!undo.length} onClick={back} title="Undo"><Undo2 size={13} /></button>
        <span className="tb-sep" />
        <input ref={fileRef} type="file" multiple hidden onChange={e => attachFiles(e.target.files)} />
        <button type="button" className="tb-btn" onClick={() => fileRef.current?.click()} title="Attach files">{busy === 'attach' ? <span className="spin" /> : <Paperclip size={13} />}Attach</button>
        <button type="button" className="tb-btn" onClick={() => setDocPick(true)} title="Attach from Documents"><FileText size={13} />Documents</button>
        {snips.length > 0 && <select className="tb-select" value="" onChange={e => insertSnip(e.target.value)} title="Insert a saved reply"><option value="">Saved replies</option>{snips.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        <button type="button" className="tb-btn" onClick={saveSnip} title="Save the selected text (or the whole message) as a saved reply"><BookmarkPlus size={13} /></button>
        <span className="spacer" />
        <button type="button" className={`tb-btn${view === 'preview' ? ' on' : ''}`} onClick={() => setView(v => v === 'write' ? 'preview' : 'write')}><Eye size={13} />{view === 'preview' ? 'Back to writing' : 'Preview'}</button>
      </div>
      {f.original && <details className="cmp-original"><summary>Show the email you are replying to</summary><div className="doc-text" style={{ fontFamily: 'var(--font)', maxHeight: 180 }}>{f.original.body}</div></details>}
    </div>
    {docPick && <DocPicker onClose={() => setDocPick(false)} onPick={attachDocs} />}
  </Modal>;
}

function DocPicker({ onClose, onPick }: { onClose: () => void; onPick: (ids: string[]) => void }) {
  const [q, setQ] = useState(''); const [sel, setSel] = useState<string[]>([]);
  const { data, loading } = useApi<any>('/api/documents?limit=300');
  const docs = (data?.documents || []).filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  return <Modal open onClose={onClose} title="Attach from Documents" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!sel.length} onClick={() => onPick(sel)}>Attach {sel.length || ''}</Button></>}>
    <div className="search-input mb12"><Search size={15} /><input className="input" autoFocus placeholder="Find a document" value={q} onChange={e => setQ(e.target.value)} /></div>
    {loading ? <Loading /> : <div className="card list" style={{ maxHeight: 'calc(50 * var(--vh, 1vh))', overflowY: 'auto' }}>{docs.length ? docs.map((d: any) => <label key={d.id} className="list-item clickable"><input type="checkbox" checked={sel.includes(d.id)} onChange={() => setSel(s => s.includes(d.id) ? s.filter(x => x !== d.id) : [...s, d.id])} /><div className="main-col"><div className="title">{d.name}</div><div className="meta">{d.project?.name || 'Unassigned'} · {ago(d.updated_at)}</div></div></label>) : <Empty title="No documents" />}</div>}
  </Modal>;
}
