'use client';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RefreshCw, AlertTriangle, CalendarDays, ShieldCheck, Clock3, FileText, Activity, BriefcaseBusiness, Sparkles, Scale, FolderKanban, Mail, Check, Bell, ArrowUp, PartyPopper } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { MigrationHelp } from '@/components/migration-help';
import { Card, Loading, ErrorNote, Empty, StatusBadge, RiskBadge, Button, useToast, useConfirm, Markdown } from '@/components/ui';
import { money, date, ago, dueLabel, label, firstName, personName } from '@/lib/client/format';
import { describe } from '@/lib/client/activity';

const STAGE_COLOR: Record<string, string> = { lead: '#a6b0bf', opportunity: '#7fa6e0', negotiation: '#d9a441', due_diligence: '#8a6fd1', contract: '#1c3a63', completed: '#2f8a57', lost: '#d36b5f' };
const nameOf = (s: string) => String(s || '').replace(/<[^>]*>/, '').replace(/"/g, '').trim() || String(s || '').replace(/.*<|>.*/g, '');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });

export default function TodayPage() { return <Suspense fallback={<Loading />}><Today /></Suspense>; }

function Today() {
  const { me, status } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const ask = useSearchParams().get('ask');
  const { data: d, error, loading, reload } = useApi<any>('/api/executive');
  const { data: t, reload: reloadToday } = useApi<any>('/api/today');
  const gmailOn = !!status?.google.connected;
  const { data: mail } = useApi<any>(gmailOn ? '/api/google/gmail?q=in%3Ainbox%20newer_than%3A14d&limit=20' : null, [gmailOn]);
  const [q, setQ] = useState(ask || ''); const [busy, setBusy] = useState<string | null>(null); const [done, setDone] = useState<string[]>([]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = firstName(me);
  const k = d?.kpis || {};
  const sendAsk = () => { if (!q.trim()) return; window.dispatchEvent(new CustomEvent('ip-ai-ask', { detail: q.trim() })); setQ(''); };
  const refresh = () => { reload(); reloadToday(); };
  const approve = async (a: any) => { if (!(await confirm({ title: `Approve “${a.title}”?`, body: 'Open it first if you want to read it before deciding.', confirm: 'Approve' }))) return; setBusy(a.id); try { await api.patch(`/api/approvals/${a.id}`, { status: 'approved' }); toast('Approved', 'success'); setDone(x => [...x, a.id]); reloadToday(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const finish = async (task: any) => { setBusy(task.id); try { await api.patch(`/api/tasks/${task.id}`, { status: 'done' }); toast('Done', 'success'); setDone(x => [...x, task.id]); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const approvals = (t?.approvals || []).filter((a: any) => !done.includes(a.id));
  const tasks = (t?.tasks || []).filter((x: any) => !done.includes(x.id));
  const emails = (mail?.messages || []).filter((m: any) => m.state === 'needs_reply' || (m.state === 'unread' && m.state !== 'fyi')).slice(0, 8);
  const meetings: any[] = t?.meetings || []; const reminders: any[] = t?.reminders || [];
  const nothing = t && !approvals.length && !tasks.length && !emails.length;
  return <>
    <div className="today-head">
      <div><h1>{greet}{first ? `, ${first}` : ''}</h1><div className="small muted">{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>{(!me.full_name || me.full_name.includes('@')) && <NameFix initial={personName(me)} />}</div>
      <button className="icon-btn" title="Refresh" onClick={refresh}><RefreshCw size={16} /></button>
    </div>
    <form className="ask-bar" onSubmit={e => { e.preventDefault(); sendAsk(); }}>
      <Sparkles size={17} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask Infinity AI or give it a task — e.g. “remind me Monday 9am to call the bank”, “show my approvals”" autoComplete="off" name="ip-ask" />
      <button className="ask-go" disabled={!q.trim()} aria-label="Ask"><ArrowUp size={16} /></button>
    </form>
    {status && !status.supabase.migration_v4 && <MigrationHelp error={status.supabase.migration_error} />}
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading && !d ? <Loading /> : d && <>
      <nav className="stat-strip" aria-label="At a glance">
        <Stat href="/projects" label="Projects" value={k.activeProjects} icon={<FolderKanban size={14} />} />
        <Stat href="/tasks?view=open" label="Open tasks" value={k.openTasks} note={k.overdueTasks ? `${k.overdueTasks} overdue` : ''} tone={k.overdueTasks ? 'alert' : ''} icon={<Clock3 size={14} />} />
        <Stat href="/approvals" label="Approvals" value={k.pendingApprovals} note={d.myApprovalCount ? `${d.myApprovalCount} for you` : ''} tone={d.myApprovalCount ? 'warn' : ''} icon={<ShieldCheck size={14} />} />
        <Stat href="/documents?review=1" label="Docs to review" value={k.documentsAwaitingReview} icon={<FileText size={14} />} />
        <Stat href="/calendar" label="Meetings (14 days)" value={k.upcomingMeetings} icon={<CalendarDays size={14} />} />
        <Stat href="/legal" label="Legal risks" value={k.legalRisks} tone={k.legalRisks ? 'alert' : ''} icon={<Scale size={14} />} />
        <Stat href="/crm" label="Pipeline" value={money(k.pipelineValue, true)} note={k.openDeals ? `${k.openDeals} deals` : ''} icon={<BriefcaseBusiness size={14} />} />
      </nav>
      <div className="today-grid">
        <div className="stack" style={{ gap: 14 }}>
          {nothing && <div className="card today-clear"><PartyPopper size={22} /><div><b>You’re all caught up.</b><div className="small muted">No approvals, emails or tasks need you right now.</div></div></div>}
          {approvals.length > 0 && <section className="card today-sec"><header><ShieldCheck size={16} /><h3>Waiting for your approval</h3><span className="n">{approvals.length}</span><span className="spacer" /><Link href="/approvals" className="link small">All approvals</Link></header>
            {approvals.map((a: any) => <div key={a.id} className="today-row"><div className="main-col"><Link href={`/approvals?open=${a.id}`} className="title">{a.title}</Link><div className="meta">{a.by ? `From ${a.by} · ` : ''}{ago(a.at)}{a.category ? ` · ${label(a.category)}` : ''}</div></div>
              <Link className="btn sm" href={`/approvals?open=${a.id}`}>Open</Link><Button size="sm" variant="primary" icon={<Check size={14} />} loading={busy === a.id} onClick={() => approve(a)}>Approve</Button></div>)}
          </section>}
          {emails.length > 0 && <section className="card today-sec"><header><Mail size={16} /><h3>Emails to answer</h3><span className="n">{emails.length}</span><span className="spacer" /><Link href="/gmail" className="link small">Inbox</Link></header>
            {emails.map((m: any) => <div key={m.id} className="today-row"><div className="main-col"><Link href={`/gmail?open=${m.id}`} className="title">{m.subject || '(no subject)'}</Link><div className="meta">{nameOf(m.from)} · {ago(m.internalDate || m.date)}{m.state === 'unread' ? ' · new' : ''}</div></div>
              <Link className="btn sm primary" href={`/gmail?open=${m.id}`}>Reply</Link></div>)}
          </section>}
          {tasks.length > 0 && <section className="card today-sec"><header><Clock3 size={16} /><h3>Your tasks due soon</h3><span className="n">{tasks.length}</span><span className="spacer" /><Link href="/tasks?view=mine" className="link small">All my tasks</Link></header>
            {tasks.map((x: any) => { const due = dueLabel(x.due_at); return <div key={x.id} className="today-row">
              <button className="tick" title="Mark done" disabled={busy === x.id} onClick={() => finish(x)}>{busy === x.id ? <span className="spin" /> : <Check size={13} />}</button>
              <div className="main-col"><Link href={`/tasks?open=${x.id}`} className="title">{x.title}</Link><div className="meta">{x.project || 'No project'}{x.priority && x.priority !== 'normal' ? ` · ${label(x.priority)}` : ''}</div></div>
              {due && <span className={`badge ${due.tone}`}>{due.text}</span>}</div>; })}
          </section>}
          {!t && <Loading />}
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <section className="card today-sec"><header><CalendarDays size={16} /><h3>Today &amp; tomorrow</h3><span className="spacer" /><Link href="/calendar" className="link small">Calendar</Link></header>
            {!meetings.length && !reminders.length ? <div className="today-empty">Nothing booked.</div> : <>
              {meetings.map((m: any) => <div key={m.id} className="today-row"><div className="time">{new Date(m.starts_at).toDateString() === new Date().toDateString() ? timeOf(m.starts_at) : `Tmrw ${timeOf(m.starts_at)}`}</div><div className="main-col"><div className="title">{m.title}</div>{m.location && <div className="meta">{m.location}</div>}</div></div>)}
              {reminders.map((r: any) => <div key={r.id} className="today-row"><div className="time"><Bell size={13} /> {timeOf(r.remind_at)}</div><div className="main-col"><div className="title">{r.title}</div></div></div>)}
            </>}
          </section>
          <ExecutiveSummary rules={d.summary?.text} />
          <section className="card today-sec"><header><Clock3 size={16} /><h3>Deadlines</h3><span className="tiny muted">next 14 days</span></header>
            {d.deadlines.length === 0 ? <div className="today-empty">No deadlines coming up.</div> : d.deadlines.slice(0, 6).map((x: any) => { const due = dueLabel(x.at); return <Link key={`${x.kind}-${x.id}`} href={x.kind === 'task' ? `/tasks?open=${x.id}` : x.kind === 'deal' ? `/crm/${x.id}` : `/projects/${x.id}`} className="today-row"><div className="main-col"><div className="title">{x.title}</div><div className="meta">{label(x.kind)}{x.project ? ` · ${x.project}` : ''}</div></div>{due && <span className={`badge ${due.tone}`}>{due.text}</span>}</Link>; })}
          </section>
        </div>
      </div>
      <h2 className="today-h2">Across the business</h2>
      <div className="grid g3">
        <Card title={<><BriefcaseBusiness size={15} /> Deal pipeline</>} actions={<Link className="link small" href="/crm">Deals</Link>}><Pipeline stages={d.pipeline} /></Card>
        <Card title={<><AlertTriangle size={15} /> Projects at risk</>} flush actions={<Link className="link small" href="/projects">Projects</Link>}>
          {d.highRiskProjects.length === 0 ? <Empty title="No high-risk projects" /> : <div className="list">{d.highRiskProjects.map((p: any) => <Link key={p.id} href={`/projects/${p.id}`} className="list-item"><div className="main-col"><div className="title">{p.name}</div><div className="meta">{p.next_action || 'No next action set'}</div></div><RiskBadge value={p.risk} /></Link>)}</div>}
        </Card>
        <Card title={<><Scale size={15} /> Legal risks</>} flush actions={<Link className="link small" href="/legal">Legal AI</Link>}>
          {d.legalRisks.length === 0 ? <Empty title="No unresolved high-risk reviews" /> : <div className="list">{d.legalRisks.map((r: any) => <Link key={r.id} href={`/legal/${r.id}`} className="list-item"><div className="main-col"><div className="title">{r.title}</div><div className="meta">{r.project || 'No project'} · {ago(r.created_at)}</div></div><RiskBadge value={r.risk_rating} /></Link>)}</div>}
        </Card>
        <Card title={<><FileText size={15} /> Recent documents</>} flush actions={<Link className="link small" href="/documents">Library</Link>}>
          {d.recentDocuments.length === 0 ? <Empty title="No documents yet" /> : <div className="list">{d.recentDocuments.slice(0, 6).map((x: any) => <Link key={x.id} href={`/documents?open=${x.id}`} className="list-item"><div className="main-col"><div className="title">{x.name}</div><div className="meta">{x.project?.name || 'Unassigned'} · {ago(x.updated_at)}</div></div></Link>)}</div>}
        </Card>
        <Card title={<><Activity size={15} /> Recent activity</>} flush>
          {d.activity.length === 0 ? <Empty title="No activity yet" /> : <div className="list">{d.activity.slice(0, 6).map((e: any) => <div key={e.id} className="list-item"><div className="main-col"><div className="title" style={{ fontWeight: 500 }}><b>{e.actor?.full_name || 'System'}</b> {describe(e)}</div><div className="meta">{ago(e.created_at)}</div></div></div>)}</div>}
        </Card>
        <Card title={<><CalendarDays size={15} /> Coming up</>} flush actions={<Link className="link small" href="/calendar">Calendar</Link>}>
          {d.meetings.length === 0 ? <Empty title="No meetings in the next 14 days" /> : <div className="list">{d.meetings.slice(0, 6).map((m: any) => <div key={m.id} className="list-item"><div className="main-col"><div className="title">{m.title}</div><div className="meta">{date(m.starts_at, true)}{m.location ? ` · ${m.location}` : ''}</div></div></div>)}</div>}
        </Card>
      </div>
    </>}
  </>;
}

function Stat({ label: l, value, note, icon, href, tone }: { label: string; value: any; note?: string; icon?: React.ReactNode; href: string; tone?: string }) {
  return <Link href={href} className={`stat ${tone || ''}`}><span className="stat-label">{icon}{l}</span><span className="stat-value">{value ?? 0}{note ? <small>{note}</small> : null}</span></Link>;
}

function Pipeline({ stages }: { stages: any[] }) {
  const open = stages.filter(s => !['completed', 'lost'].includes(s.stage));
  const total = open.reduce((n, s) => n + s.value, 0);
  if (!stages.some(s => s.count)) return <Empty title="No deals yet" action={<Link className="btn sm" href="/crm?new=1">Add a deal</Link>} />;
  return <div className="stack" style={{ gap: 12 }}>
    <div className="pipeline-bar">{open.map(s => <i key={s.stage} style={{ width: `${total ? (s.value / total) * 100 : 0}%`, background: STAGE_COLOR[s.stage] }} title={`${label(s.stage)} ${money(s.value)}`} />)}</div>
    <div className="list">{stages.map(s => <Link key={s.stage} href={`/crm?stage=${s.stage}`} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}><span className="row"><i className="dot-s" style={{ background: STAGE_COLOR[s.stage] }} />{label(s.stage)}</span><span className="muted small">{s.count} · <b style={{ color: 'var(--ink)' }}>{money(s.value, true)}</b></span></Link>)}</div>
  </div>;
}

function ExecutiveSummary({ rules }: { rules: string }) {
  const { status } = useApp();
  const toast = useToast();
  const configured = (status?.providers || []).filter(p => p.configured);
  const [provider, setProvider] = useState('');
  const [ai, setAi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const p = provider || configured[0]?.id; if (!p) return;
    setBusy(true); try { const r = await api.post('/api/ai/summary', { provider: p }); setAi(r.summary.text); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <section className="hero">
    <div className="eyebrow">Executive summary</div>
    {ai ? <div style={{ fontSize: 13.5 }}><Markdown text={ai} /></div> : <p>{rules}</p>}
    <div className="row wrap mt16" style={{ position: 'relative', zIndex: 1 }}>
      {configured.length > 0 ? <>
        <select className="select sm" style={{ width: 'auto' }} value={provider || configured[0].id} onChange={e => setProvider(e.target.value)}>{configured.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <Button size="sm" variant="primary" icon={<Sparkles size={14} />} loading={busy} onClick={run}>{ai ? 'Regenerate AI briefing' : 'AI briefing'}</Button>
        {ai && <button className="btn ghost sm" onClick={() => setAi(null)}>Show data summary</button>}
      </> : <span className="small muted">Generated from live business data. Connect an AI provider in Settings for an AI-written briefing.</span>}
    </div>
  </section>;
}

/** Shown once when the account has no proper name yet (only an email). */
function NameFix({ initial }: { initial: string }) {
  const toast = useToast(); const [v, setV] = useState(initial); const [busy, setBusy] = useState(false);
  const save = async () => { if (!v.trim() || v.includes('@')) return; setBusy(true); try { await api.patch('/api/me', { full_name: v.trim() }); toast('Name saved', 'success'); location.reload(); } catch (e: any) { toast(e.message, 'error'); setBusy(false); } };
  return <div className="name-fix"><span>Your name in the app, on letters and on approvals:</span><input className="input sm" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} aria-label="Your full name" placeholder="e.g. Falah Joon" /><button className="btn sm primary" disabled={busy || !v.trim() || v.includes('@')} onClick={save}>Save</button></div>;
}
