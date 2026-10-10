'use client';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Clock3, MousePointerClick, MapPin, Hourglass, Trophy, Plus, Check, X, PenLine, ShieldCheck, Settings2, Trash2 } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { TimeReport } from '@/components/time-check';
import { PageHead, Card, Button, Loading, ErrorNote, Empty, Avatar, Tabs, Notice, Modal, Field, Drawer, useToast } from '@/components/ui';
import { personName, label } from '@/lib/client/format';
import { AREAS } from '@/lib/access';

export default function Page() { return <Suspense fallback={<Loading />}><Activity /></Suspense>; }

const fmt = (m: number) => { m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`; };
const KIND: Record<string, string> = { task: 'Task', meeting: 'Meeting', online_meeting: 'Online meeting', site_visit: 'Site visit', agenda: 'Agenda', travel: 'Travel', other: 'Other' };
const STATUS: Record<string, [string, string]> = { accepted: ['Counted', 'green'], justified: ['Counted · reason given', 'green'], approved: ['Approved', 'green'], adjusted: ['Adjusted', 'blue'], pending_approval: ['Waiting for approval', 'amber'], rejected: ['Not counted', 'red'], skipped: ['No time spent', ''] };
const areaName = (k: string) => AREAS.find(a => a.key === k)?.label || ({ today: 'Today', system: 'Settings', other: 'Other' } as any)[k] || label(k);
const shiftWeek = (w: string, n: number) => new Date(new Date(`${w}T00:00:00Z`).getTime() + n * 7 * 864e5).toISOString().slice(0, 10);
const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' });
const weekLabel = (w: string) => { const a = new Date(`${w}T00:00:00Z`), b = new Date(a.getTime() + 6 * 864e5); const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' }; return `${a.toLocaleDateString('en-AU', o)} – ${b.toLocaleDateString('en-AU', { ...o, year: 'numeric' })}`; };

function Activity() {
  const sp = useSearchParams(); const { me, can } = useApp(); const toast = useToast();
  const [week, setWeek] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'approve' | 'mine'>(sp.get('tab') === 'approve' ? 'approve' : 'overview');
  const [logOpen, setLogOpen] = useState(sp.get('log') === '1'); const [person, setPerson] = useState<any>(null); const [cfgOpen, setCfgOpen] = useState(false);
  const { data, error, loading, reload } = useApi<any>(`/api/activity/hours${week ? `?week=${week}` : ''}`, [week]);
  const approvals = useApi<any>('/api/time/logs?scope=approve');
  useEffect(() => { const r = () => { reload(); approvals.reload(); }; window.addEventListener('ip-hours-changed', r); return () => window.removeEventListener('ip-hours-changed', r); }); // eslint-disable-line react-hooks/exhaustive-deps
  const w = data?.week || week; const members: any[] = data?.members || [];
  const mine = members.find(m => m.id === me.id);
  const team = members.length > 1;
  const totals = useMemo(() => members.reduce((t, m) => ({ app: t.app + m.app_minutes, real: t.real + m.real_minutes, pending: t.pending + m.pending_minutes }), { app: 0, real: 0, pending: 0 }), [members]);
  const top = members[0]?.total_minutes > 0 ? members[0] : null;
  const thisWeek = data && !week;
  const pendingCount = approvals.data?.logs?.length || 0;

  return <>
    <PageHead eyebrow="Team" title="Activity & hours" sub="Real time using the app (only while someone is actually working in it) plus time spent on meetings, site visits and other work in the real world."
      actions={<>{can.admin && <Button icon={<Settings2 size={14} />} onClick={() => setCfgOpen(true)}>Who approves hours</Button>}<Button variant="primary" icon={<Plus size={15} />} onClick={() => setLogOpen(true)}>Log time</Button></>} />
    <div className="filters">
      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
        <Button size="sm" icon={<ChevronLeft size={14} />} onClick={() => w && setWeek(shiftWeek(w, -1))} aria-label="Previous week" />
        <b style={{ minWidth: 170, textAlign: 'center' }}>{w ? weekLabel(w) : '…'}</b>
        <Button size="sm" icon={<ChevronRight size={14} />} disabled={!!thisWeek} onClick={() => w && setWeek(shiftWeek(w, 1))} aria-label="Next week" />
        {week && <Button size="sm" variant="ghost" onClick={() => setWeek(null)}>This week</Button>}
      </div>
      <span className="spacer" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: team ? 'Team' : 'My week' }, { value: 'approve', label: 'Needs my approval', count: pendingCount }, { value: 'mine', label: 'My time logs' }]} />
    </div>
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading && !data ? <Loading /> : tab === 'overview' ? <>
      <div className="kpis k4">
        <div className="kpi"><div className="label"><MousePointerClick size={13} /> {team ? 'Team app time' : 'Using the app'}</div><div className="value">{fmt(team ? totals.app : mine?.app_minutes || 0)}</div><div className="hint">active minutes, not just signed in</div></div>
        <div className="kpi"><div className="label"><MapPin size={13} /> Real-world work</div><div className="value">{fmt(team ? totals.real : mine?.real_minutes || 0)}</div><div className="hint">meetings, site visits, tasks</div></div>
        <div className={`kpi ${(team ? totals.pending : mine?.pending_minutes) ? 'warn' : ''}`}><div className="label"><Hourglass size={13} /> Waiting for approval</div><div className="value">{fmt(team ? totals.pending : mine?.pending_minutes || 0)}</div><div className="hint">not counted until approved</div></div>
        <div className="kpi"><div className="label"><Trophy size={13} /> Most active</div><div className="value" style={{ fontSize: 20 }}>{top ? personName(top) : '—'}</div><div className="hint">{top ? `${fmt(top.total_minutes)} this week` : 'no activity yet'}</div></div>
      </div>
      {members.length === 0 ? <Empty title="No activity yet">Hours appear here as the team uses the app and reports time.</Empty> : <Card className="mt16" title={team ? 'Who has been working' : 'Your week'} sub={team ? 'Click a person for their days, where their time went and their time logs' : undefined} flush>
        <div className="table-wrap"><table className="table">
          <thead><tr>{team && <th style={{ width: 36 }}>#</th>}<th>Member</th><th>App time</th><th>Real-world</th><th className="hide-sm">Waiting</th><th>Total</th><th className="hide-sm" style={{ minWidth: 150 }}>Mon → Sun</th><th className="hide-sm">Week</th></tr></thead>
          <tbody>{members.map((m, i) => <tr key={m.id} className="clickable" onClick={() => setPerson(m)} style={{ cursor: 'pointer' }}>
            {team && <td className="muted">{i === 0 && m.total_minutes > 0 ? <Trophy size={14} style={{ color: 'var(--amber)' }} /> : i + 1}</td>}
            <td><div className="row"><Avatar name={personName(m)} size="sm" /><div><b>{personName(m)}</b>{m.id === me.id && <span className="muted"> (you)</span>}<div className="tiny muted">{m.title || ''}{m.active_days ? `${m.title ? ' · ' : ''}${m.active_days} active day${m.active_days > 1 ? 's' : ''}` : ''}</div></div></div></td>
            <td className="mono">{fmt(m.app_minutes)}</td><td className="mono">{fmt(m.real_minutes)}</td>
            <td className="hide-sm mono">{m.pending_minutes ? <span style={{ color: 'var(--amber)' }}>{fmt(m.pending_minutes)}</span> : <span className="muted">—</span>}</td>
            <td className="mono"><b>{fmt(m.total_minutes)}</b></td>
            <td className="hide-sm"><DayBars days={m.days} /></td>
            <td className="hide-sm">{m.signoff ? <span className="badge green" title={`Signed off by ${m.signoff.by_name || 'approver'}`}>Signed off</span> : <span className="tiny muted">Open</span>}</td>
          </tr>)}</tbody>
        </table></div>
      </Card>}
      <p className="tiny muted mt12">App time counts a minute only when the app is in front and the person typed, clicked or scrolled in the last 2 minutes. Real-world time is what members report when they finish a task or meeting; the app checks it against the usual time and asks for a reason when it is much longer.</p>
    </> : tab === 'approve' ? <ApproveList data={approvals.data} loading={approvals.loading} onChanged={() => { approvals.reload(); reload(); }} />
      : <MyLogs week={w} onChanged={reload} />}
    <TimeReport item={null} open={logOpen} onClose={() => setLogOpen(false)} onDone={() => { reload(); approvals.reload(); }} />
    <PersonDrawer person={person} week={w} onClose={() => setPerson(null)} onChanged={() => { reload(); approvals.reload(); }} />
    {cfgOpen && <ApproverSettings onClose={() => setCfgOpen(false)} onSaved={() => { reload(); toast('Saved', 'success'); }} />}
  </>;
}

function DayBars({ days }: { days: any[] }) {
  const max = Math.max(60, ...days.map(d => d.app + d.real));
  return <div className="hrs-bars" aria-label="Hours by day">{days.map(d => <div key={d.date} className="hrs-day" title={`${dayName(d.date)}: app ${fmt(d.app)}, real-world ${fmt(d.real)}`}>
    <div className="hrs-stack" style={{ height: `${Math.round(((d.app + d.real) / max) * 100)}%` }}><i className="real" style={{ flex: d.real }} /><i className="app" style={{ flex: d.app }} /></div>
  </div>)}</div>;
}

function LogRow({ l, canDecide, onChanged, showWho }: { l: any; canDecide?: boolean; onChanged: () => void; showWho?: string }) {
  const toast = useToast(); const { me } = useApp();
  const [mode, setMode] = useState<null | 'adjust' | 'reject'>(null); const [mins, setMins] = useState(String(l.estimated_minutes)); const [note, setNote] = useState('');
  const decide = async (action: string) => { try { await api.patch(`/api/time/logs/${l.id}`, { action, minutes: Number(mins), note: note || undefined }); toast(action === 'approve' ? 'Approved' : action === 'adjust' ? 'Adjusted' : 'Marked as not counted', 'success'); setMode(null); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  const del = async () => { if (!window.confirm('Remove this time log?')) return; try { await api.del(`/api/time/logs/${l.id}`); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  const [st, tone] = STATUS[l.status] || [label(l.status), ''];
  const over = l.reported_minutes > l.estimated_minutes;
  return <div className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
    <div className="main-col" style={{ minWidth: 220 }}>
      <div className="title" style={{ whiteSpace: 'normal' }}>{showWho && <span className="muted">{showWho} · </span>}{l.title}</div>
      <div className="meta">{KIND[l.kind] || l.kind} · {new Date(`${l.occurred_on}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} · reported <b>{fmt(l.reported_minutes)}</b> · usual {fmt(l.estimated_minutes)}{over && l.status !== 'skipped' ? ` (+${fmt(l.reported_minutes - l.estimated_minutes)})` : ''}{['approved', 'adjusted'].includes(l.status) ? ` · counted ${fmt(l.counted_minutes)}` : ''}</div>
      {l.justification && <div className="small mt8" style={{ whiteSpace: 'pre-wrap' }}>“{l.justification}”</div>}
      {l.check_note && l.status === 'pending_approval' && <div className="tiny muted mt8">App check: {l.check_note}</div>}
      {l.decision_note && <div className="tiny mt8"><b>Approver:</b> {l.decision_note}</div>}
      {mode && <div className="row wrap mt8" style={{ gap: 8, alignItems: 'center' }}>
        {mode === 'adjust' && <><input className="input sm" style={{ width: 90 }} inputMode="numeric" value={mins} onChange={e => setMins(e.target.value.replace(/\D/g, ''))} /><span className="small muted">minutes to count</span></>}
        <input className="input sm" style={{ flex: 1, minWidth: 180 }} placeholder={mode === 'reject' ? 'Why (required)' : 'Note (optional)'} value={note} onChange={e => setNote(e.target.value)} />
        <Button size="xs" variant="primary" onClick={() => decide(mode)}>{mode === 'adjust' ? 'Count this' : "Don't count"}</Button><Button size="xs" onClick={() => setMode(null)}>Cancel</Button></div>}
    </div>
    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
      <span className={`badge ${tone}`}>{st}</span>
      {canDecide && l.status === 'pending_approval' && !mode && <><Button size="xs" variant="success" icon={<Check size={12} />} onClick={() => decide('approve')}>Approve</Button><Button size="xs" icon={<PenLine size={12} />} onClick={() => setMode('adjust')}>Adjust</Button><Button size="xs" icon={<X size={12} />} onClick={() => setMode('reject')}>Reject</Button></>}
      {canDecide && ['approved', 'adjusted', 'rejected', 'justified', 'accepted'].includes(l.status) && !mode && <Button size="xs" variant="ghost" onClick={() => setMode('adjust')}>Change</Button>}
      {l.user_id === me.id && (l.status === 'pending_approval' || Date.now() - new Date(l.created_at).getTime() < 864e5) && <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} onClick={del} aria-label="Remove" />}
    </div>
  </div>;
}

function ApproveList({ data, loading, onChanged }: { data: any; loading: boolean; onChanged: () => void }) {
  const { members } = useApp();
  if (loading && !data) return <Loading />;
  const logs: any[] = data?.logs || [];
  if (!logs.length) return <Empty icon={<ShieldCheck size={22} />} title="Nothing to approve">When someone's time is much longer than usual and their reason isn't clear, it comes here for you to approve, adjust or reject.</Empty>;
  const who = (id: string) => personName(members.find(m => m.id === id) as any) || 'Team member';
  return <Card title="Time waiting for your approval" sub="It counts in their weekly hours only after you approve it" flush><div className="list">{logs.map(l => <LogRow key={l.id} l={l} canDecide onChanged={onChanged} showWho={who(l.user_id)} />)}</div></Card>;
}

function MyLogs({ week, onChanged }: { week: string | null; onChanged: () => void }) {
  const { data, loading, reload } = useApi<any>(week ? `/api/time/logs?week=${week}` : null, [week]);
  if (loading && !data) return <Loading />;
  const logs: any[] = data?.logs || [];
  return <Card title="My time logs this week" flush>{logs.length ? <div className="list">{logs.map(l => <LogRow key={l.id} l={l} onChanged={() => { reload(); onChanged(); }} />)}</div> : <Empty title="No time logged this week">When you finish a task or a meeting ends, the app asks how long it took. You can also use “Log time”.</Empty>}</Card>;
}

function PersonDrawer({ person, week, onClose, onChanged }: { person: any; week: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data, reload } = useApi<any>(person && week ? `/api/time/logs?user=${person.id}&week=${week}` : null, [person?.id, week]);
  if (!person) return null;
  const areas = Object.entries(person.areas || {}).sort((a: any, b: any) => b[1] - a[1]) as [string, number][];
  const kinds = Object.entries(person.kinds || {}).sort((a: any, b: any) => b[1] - a[1]) as [string, number][];
  const maxA = Math.max(1, ...areas.map(a => a[1]));
  const sign = async (action: 'approve' | 'reopen') => { try { await api.post('/api/time/week', { user_id: person.id, week, action, minutes: person.total_minutes }); toast(action === 'approve' ? 'Week signed off' : 'Week reopened', 'success'); onChanged(); onClose(); } catch (e: any) { toast(e.message, 'error'); } };
  return <Drawer open={!!person} onClose={onClose} title={`${personName(person)} — ${week ? weekLabel(week) : ''}`} className="hours-person">
    <div className="stack" style={{ gap: 16 }}>
      <div className="kpis k4" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="kpi"><div className="label">App time</div><div className="value">{fmt(person.app_minutes)}</div></div>
        <div className="kpi"><div className="label">Real-world</div><div className="value">{fmt(person.real_minutes)}</div></div>
        <div className="kpi"><div className="label">Total</div><div className="value">{fmt(person.total_minutes)}</div></div>
      </div>
      <Card title="By day"><div className="hrs-week">{person.days.map((d: any) => <div key={d.date} className="hrs-row"><span className="small" style={{ width: 38 }}>{dayName(d.date)}</span><div className="hrs-track"><i className="real" style={{ width: `${Math.min(100, (d.real / 600) * 100)}%` }} /><i className="app" style={{ width: `${Math.min(100, (d.app / 600) * 100)}%` }} /></div><span className="tiny mono" style={{ width: 120, textAlign: 'right' }}>{fmt(d.app)} app · {fmt(d.real)} real</span></div>)}</div>
        <div className="row tiny muted mt8" style={{ gap: 14 }}><span><i className="hrs-key app" /> Using the app</span><span><i className="hrs-key real" /> Real-world work</span>{person.first && <span>First {new Date(person.first).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · last {new Date(person.last).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>}</div></Card>
      {areas.length > 0 && <Card title="Where their app time went"><div className="stack" style={{ gap: 6 }}>{areas.map(([k, v]) => <div key={k} className="hrs-row"><span className="small ellipsis" style={{ width: 150 }}>{areaName(k)}</span><div className="hrs-track"><i className="app" style={{ width: `${(v / maxA) * 100}%` }} /></div><span className="tiny mono" style={{ width: 60, textAlign: 'right' }}>{fmt(v)}</span></div>)}</div></Card>}
      {kinds.length > 0 && <Card title="Real-world time by type"><div className="chips">{kinds.map(([k, v]) => <span key={k} className="chip">{KIND[k] || k}: <b>{fmt(v)}</b></span>)}</div></Card>}
      <Card title="Time logs" flush>{data?.logs?.length ? <div className="list">{data.logs.map((l: any) => <LogRow key={l.id} l={l} canDecide={data.can_decide} onChanged={() => { reload(); onChanged(); }} />)}</div> : <div className="empty small">No real-world time logged this week.</div>}</Card>
      <Card title="Weekly sign-off">
        {person.signoff ? <Notice tone="success">Signed off by <b>{person.signoff.by_name || 'the approver'}</b> on {new Date(person.signoff.at).toLocaleDateString('en-AU')} at {fmt(person.signoff.minutes)}.</Notice>
          : <div className="small muted">{person.approver?.name ? <>Hours are approved by <b>{person.approver.name}</b>.</> : 'No approver is set up yet (Settings → Team & access → Company structure, or “Who approves hours”).'}{person.pending_minutes > 0 && <> {fmt(person.pending_minutes)} is still waiting for approval.</>}</div>}
        {person.can_decide && <div className="row mt12">{person.signoff ? <Button size="sm" onClick={() => sign('reopen')}>Reopen week</Button> : <Button size="sm" variant="primary" icon={<Check size={13} />} disabled={person.pending_minutes > 0} title={person.pending_minutes > 0 ? 'Approve or reject the waiting time first' : undefined} onClick={() => sign('approve')}>Sign off {fmt(person.total_minutes)} for this week</Button>}</div>}
      </Card>
    </div>
  </Drawer>;
}

function ApproverSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const { members } = useApp();
  const { data } = useApi<any>('/api/time/settings');
  const [mode, setMode] = useState('manager'); const [person, setPerson] = useState('');
  useEffect(() => { if (data?.approval) { setMode(data.approval.mode); setPerson(data.approval.person_id || ''); } }, [data]);
  const save = async () => { try { await api.patch('/api/time/settings', { mode, person_id: person || null }); onSaved(); onClose(); } catch (e: any) { toast(e.message, 'error'); } };
  return <Modal open onClose={onClose} title="Who approves hours" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
    <div className="stack" style={{ gap: 12 }}>
      <p className="small muted">This person checks time that is much longer than usual (when the reason given isn't clear) and signs off each member's week.</p>
      <label className="check"><input type="radio" checked={mode === 'manager'} onChange={() => setMode('manager')} /> <span><b>Each member's manager</b><div className="tiny muted">The next person up in the company structure (Settings → Team &amp; access → Company structure). If nobody is above them, the HR person.</div></span></label>
      <label className="check"><input type="radio" checked={mode === 'hr'} onChange={() => setMode('hr')} /> <span><b>HR</b><div className="tiny muted">Whoever holds the Human Resources Manager position, or has the “HR &amp; weekly hours approval” duty.</div></span></label>
      <label className="check"><input type="radio" checked={mode === 'person'} onChange={() => setMode('person')} /> <span><b>One person for everyone</b><div className="tiny muted">Their own hours go to their manager.</div></span></label>
      {mode === 'person' && <Field label="Person"><select className="select" value={person} onChange={e => setPerson(e.target.value)}><option value="">Choose…</option>{members.map(m => <option key={m.id} value={m.id}>{personName(m as any)}</option>)}</select></Field>}
      <Notice>Admins and directors can always approve. Nobody can approve their own time.</Notice>
    </div>
  </Modal>;
}
