'use client';
import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Clock3, Trash2, ExternalLink, BellRing, Check } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { EventForm } from '@/components/forms';
import { ReminderForm } from '@/components/reminder-form';
import { PageHead, Card, Loading, ErrorNote, Empty, Button, Segmented, Modal, KV, useToast, useConfirm, Notice } from '@/components/ui';
import { date, time, ago } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><Calendar /></Suspense>; }

function Calendar() {
  const sp = useSearchParams(); const { can, status } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [view, setView] = useState<'month' | 'agenda'>(typeof window !== 'undefined' && window.innerWidth < 700 ? 'agenda' : 'month');
  const [editing, setEditing] = useState<any>(sp.get('new') === '1' ? {} : null);
  const [viewing, setViewing] = useState<any>(null); const [newRem, setNewRem] = useState(false);
  const start = new Date(cursor); start.setDate(1 - ((start.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(start.getDate() + 42);
  const range = view === 'month' ? { from: start.toISOString(), to: end.toISOString() } : { from: new Date(Date.now() - 864e5).toISOString(), to: new Date(Date.now() + 90 * 864e5).toISOString() };
  const { data, error, loading, reload } = useApi<any>(`/api/calendar/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`, [range.from, range.to]);
  const tasks = useApi<any>('/api/tasks?open=1');
  const reminders = useApi<any>('/api/reminders');
  const events = data?.events || [];
  const taskItems = (tasks.data?.tasks || []).filter((t: any) => t.due_at);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; }), [start.getTime()]); // eslint-disable-line
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const remove = async (e: any) => { if (!(await confirm({ title: `Delete “${e.title}”?`, body: e.external_id ? 'It will also be removed from Google Calendar.' : undefined, confirm: 'Delete', danger: true }))) return; try { const r = await api.del(`/api/calendar/events/${e.id}`); if (r.google_error) toast(`Deleted here; Google: ${r.google_error}`, 'error'); setViewing(null); reload(); } catch (x: any) { toast(x.message, 'error'); } };
  const agenda = [...events.map((e: any) => ({ ...e, kind: 'event' })), ...taskItems.map((t: any) => ({ id: t.id, title: t.title, starts_at: t.due_at, kind: 'task', project: t.project }))].filter(x => new Date(x.starts_at) >= new Date(Date.now() - 864e5)).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const [sel, setSel] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const reminderList: any[] = reminders.data?.reminders || [];
  const onDay = (d: Date) => ({
    evs: events.filter((e: any) => sameDay(new Date(e.starts_at), d)).sort((a: any, b: any) => String(a.starts_at).localeCompare(String(b.starts_at))),
    ts: taskItems.filter((t: any) => sameDay(new Date(t.due_at), d)),
    rs: reminderList.filter((r: any) => sameDay(new Date(r.remind_at), d)),
  });
  const selDay = onDay(sel);
  const go = (n: number) => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + n); return d; });
  const goToday = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); const t = new Date(); t.setHours(0, 0, 0, 0); setSel(t); };
  const newOn = (d: Date) => { const s0 = new Date(d); s0.setHours(10, 0, 0, 0); setEditing({ starts_at: s0.toISOString(), ends_at: new Date(+s0 + 3600e3).toISOString() }); };
  const short = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '');
  const isToday = (d: Date) => sameDay(d, new Date());
  return <>
    {data?.google?.error && <div className="mb12"><Notice tone="warn">Google Calendar: {data.google.error}</Notice></div>}
    {error && <ErrorNote error={error} onRetry={reload} />}
    <div className="cal-bar">
      <h2>{view === 'month' ? <><b>{cursor.toLocaleDateString('en-AU', { month: 'long' })}</b> {cursor.getFullYear()}</> : <b>Agenda</b>}</h2>
      {view === 'month' && <div className="cal-nav"><button className="icon-btn" title="Previous month" onClick={() => go(-1)}><ChevronLeft size={17} /></button><button className="btn sm" onClick={goToday}>Today</button><button className="icon-btn" title="Next month" onClick={() => go(1)}><ChevronRight size={17} /></button></div>}
      <span className="spacer" />
      <div className="cal-legend"><span><i style={{ background: '#2f6fd0' }} />Meeting</span><span><i style={{ background: '#2f8a57' }} />Google</span><span><i style={{ background: '#b7791f' }} />Task</span></div>
      <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'agenda', label: 'Agenda' }]} />
      {can.write && <Button variant="primary" icon={<Plus size={15} />} onClick={() => newOn(sel)}>New meeting</Button>}
    </div>
    <div className="cal-layout">
      {view === 'month' ? <div className="cal2">
        <div className="cal2-dows">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d}>{d}</div>)}</div>
        {loading && !data ? <Loading /> : <div className="cal2-grid">{days.map((d, i) => { const { evs, ts } = onDay(d); const items = [...evs.map((e: any) => ({ k: 'e', e })), ...ts.map((t: any) => ({ k: 't', t }))]; return <div key={d.toISOString()} className={`cal2-day${d.getMonth() !== cursor.getMonth() ? ' other' : ''}${isToday(d) ? ' today' : ''}${sameDay(d, sel) ? ' sel' : ''}${i % 7 > 4 ? ' wkend' : ''}`} onClick={() => setSel(new Date(d))} onDoubleClick={() => can.write && newOn(d)}>
            <span className="cal2-n">{d.getDate()}</span>
            {items.slice(0, 3).map((x: any) => x.k === 'e'
              ? <button key={x.e.id} className={`cal2-ev${x.e.provider === 'google' && x.e.readonly ? ' g' : ''}`} title={`${x.e.all_day ? 'All day' : time(x.e.starts_at)} · ${x.e.title}`} onClick={ev => { ev.stopPropagation(); setViewing(x.e); }}>{!x.e.all_day && <em>{short(x.e.starts_at)}</em>}{x.e.title}</button>
              : <Link key={x.t.id} href={`/tasks?open=${x.t.id}`} className="cal2-ev t" title={`Task: ${x.t.title}`} onClick={ev => ev.stopPropagation()}>{x.t.title}</Link>)}
            {items.length > 3 && <span className="cal2-more">+{items.length - 3} more</span>}
          </div>; })}</div>}
      </div> : <div className="card cal-agenda">{agenda.length === 0 ? <Empty icon={<CalendarDays size={20} />} title="Nothing in the next 90 days" /> : agenda.map((x: any, i: number) => { const newDay = i === 0 || !sameDay(new Date(agenda[i - 1].starts_at), new Date(x.starts_at)); return <React.Fragment key={`${x.kind}-${x.id}`}>
          {newDay && <div className="cal-agenda-day">{isToday(new Date(x.starts_at)) ? 'Today' : new Date(x.starts_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>}
          {x.kind === 'task' ? <Link href={`/tasks?open=${x.id}`} className="cal-item"><span className="bar t" /><div className="when">Task</div><div className="main-col"><div className="title">{x.title}</div>{x.project?.name && <div className="meta">{x.project.name}</div>}</div></Link>
            : <button className="cal-item" onClick={() => setViewing(x)}><span className={`bar${x.readonly ? ' g' : ''}`} /><div className="when">{x.all_day ? 'All day' : time(x.starts_at)}</div><div className="main-col"><div className="title">{x.title}</div>{(x.location || x.project?.name) && <div className="meta">{[x.location, x.project?.name].filter(Boolean).join(' · ')}</div>}</div></button>}
        </React.Fragment>; })}</div>}

      <aside className="cal-side">
        <div className="card">
          <div className="cal-side-head"><div><div className="cal-side-dow">{isToday(sel) ? 'Today' : sel.toLocaleDateString('en-AU', { weekday: 'long' })}</div><div className="cal-side-date">{sel.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}</div></div>
            {can.write && <div className="row" style={{ gap: 4 }}><Button size="xs" icon={<Plus size={12} />} onClick={() => newOn(sel)}>Meeting</Button><Button size="xs" icon={<BellRing size={12} />} onClick={() => setNewRem(true)}>Reminder</Button></div>}</div>
          {!selDay.evs.length && !selDay.ts.length && !selDay.rs.length ? <div className="cal-side-empty">Nothing on this day.{can.write && <> <button className="link" onClick={() => newOn(sel)}>Add a meeting</button></>}</div> : <div>
            {selDay.evs.map((e: any) => <button key={e.id} className="cal-item" onClick={() => setViewing(e)}><span className={`bar${e.readonly ? ' g' : ''}`} /><div className="when">{e.all_day ? 'All day' : time(e.starts_at)}{e.ends_at && !e.all_day ? <small>{time(e.ends_at)}</small> : null}</div><div className="main-col"><div className="title">{e.title}</div>{(e.location || e.project?.name) && <div className="meta">{[e.location, e.project?.name].filter(Boolean).join(' · ')}</div>}</div></button>)}
            {selDay.ts.map((t: any) => <Link key={t.id} href={`/tasks?open=${t.id}`} className="cal-item"><span className="bar t" /><div className="when">Task</div><div className="main-col"><div className="title">{t.title}</div>{t.project?.name && <div className="meta">{t.project.name}</div>}</div></Link>)}
            {selDay.rs.map((r: any) => <div key={r.id} className="cal-item"><span className="bar r" /><div className="when">{time(r.remind_at)}</div><div className="main-col"><div className="title">{r.title}</div><div className="meta">Reminder</div></div></div>)}
          </div>}
        </div>
        <div className="card">
          <div className="cal-side-head"><b className="small">Reminders</b>{can.write && <Button size="xs" variant="ghost" icon={<Plus size={12} />} onClick={() => setNewRem(true)}>New</Button>}</div>
          {!reminderList.length ? <div className="cal-side-empty">No reminders waiting.</div> : reminderList.slice(0, 8).map((r: any) => <div key={r.id} className="cal-item"><span className="bar r" /><div className="main-col"><div className="title">{r.title}</div><div className="meta">{date(r.remind_at, true)}{r.recipient_id ? '' : ' · everyone'}</div></div><button className="tick" title="Done" onClick={async () => { await api.patch(`/api/reminders/${r.id}`, { status: 'done' }); reminders.reload(); }}><Check size={12} /></button></div>)}
        </div>
      </aside>
    </div>
    <ReminderForm open={newRem} onClose={() => setNewRem(false)} onSaved={() => reminders.reload()} />
    <EventForm open={!!editing} onClose={() => setEditing(null)} initial={editing?.id ? editing : editing || undefined} onSaved={() => { reload(); reminders.reload(); }} />
    <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title} footer={viewing && (viewing.readonly ? (viewing.html_link && <a className="btn" href={viewing.html_link} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open in Google</a>) : can.write && <><Button variant="danger" icon={<Trash2 size={14} />} onClick={() => remove(viewing)}>Delete</Button><Button variant="primary" onClick={() => { setEditing(viewing); setViewing(null); }}>Edit</Button></>)}>
      {viewing && <KV items={[['When', viewing.all_day ? date(viewing.starts_at) : `${date(viewing.starts_at, true)}${viewing.ends_at ? ` – ${time(viewing.ends_at)}` : ''}`], ['Where', viewing.location], ['Project', viewing.project?.name], ['Attendees', (viewing.attendees || []).join(', ')], ['Source', viewing.readonly ? 'Google Calendar' : viewing.external_id ? 'RHC + Google Calendar' : 'RHC'], ['Notes', viewing.description ? <span style={{ whiteSpace: 'pre-wrap' }}>{viewing.description}</span> : null], ['Last synced', viewing.synced_at ? ago(viewing.synced_at) : null]]} />}
    </Modal>
  </>;
}
