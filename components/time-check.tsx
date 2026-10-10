'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, CheckCircle2, AlertTriangle, Hourglass } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Modal, Button, Field, Notice, useToast } from './ui';

const KINDS: [string, string][] = [['task', 'Task'], ['meeting', 'Meeting (in person)'], ['online_meeting', 'Online meeting'], ['site_visit', 'Site visit'], ['agenda', 'Agenda / errand'], ['travel', 'Travel'], ['other', 'Other']];
const QUICK = [15, 30, 45, 60, 90, 120, 180, 240];
const fmt = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${r}` : ''}` : `${r} min`; };
const SNOOZE = 'ip-time-snooze';
const snoozed = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(SNOOZE) || '{}'); } catch { return {}; } };

export type TimeItem = { source_type?: 'task' | 'event'; source_id?: string; title?: string; kind?: string; location?: string | null };
type Step = { status: string; question?: string; message?: string; approver?: string; estimate?: { minutes: number; basis: string }; note?: string };

/**
 * Asks how long real-world work took. The app's own estimate is shown only after the person answers, so it doesn't steer them.
 * Reasonable → counted. Much longer → asks why (once more if the answer is vague) → counted, or sent to the time approver.
 */
export function TimeReport({ item, open, onClose, onDone }: { item: TimeItem | null; open: boolean; onClose: () => void; onDone?: (status: string) => void }) {
  const toast = useToast();
  const manual = !item?.source_id;
  const [title, setTitle] = useState(''); const [kind, setKind] = useState('task');
  const [h, setH] = useState(''); const [m, setM] = useState(''); const [date, setDate] = useState('');
  const [reason, setReason] = useState(''); const [attempt, setAttempt] = useState(1);
  const [step, setStep] = useState<Step | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(item?.title || ''); setKind(item?.kind || 'task'); setH(''); setM(''); setReason(''); setAttempt(1); setStep(null); const d = new Date(Date.now() + 10 * 3600_000); setDate(d.toISOString().slice(0, 10)); } }, [open, item]);
  const minutes = (Number(h) || 0) * 60 + (Number(m) || 0);
  const setQuick = (q: number) => { setH(String(Math.floor(q / 60) || '')); setM(String(q % 60 || '')); };
  const send = async (extra: Record<string, any> = {}) => {
    setBusy(true);
    try {
      const r = await api.post('/api/time/logs', { source_type: item?.source_type, source_id: item?.source_id, title, kind, occurred_on: manual ? date : undefined, reported_minutes: minutes, justification: reason || undefined, attempt, ...extra });
      if (r.status === 'need_reason' || r.status === 'need_more') { setStep(r); if (r.status === 'need_more') setAttempt(2); }
      else if (r.status === 'skipped') { onDone?.(r.status); onClose(); }
      else { setStep(r); onDone?.(r.status); }
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const finished = step && ['accepted', 'justified', 'pending_approval'].includes(step.status);
  const asking = step && ['need_reason', 'need_more'].includes(step.status);
  const isMeeting = ['meeting', 'site_visit'].includes(kind);
  const footer = finished ? <Button variant="primary" onClick={onClose}>Done</Button>
    : asking ? <><Button onClick={() => setStep(null)}>Change the time</Button><span className="spacer" /><Button variant="primary" loading={busy} disabled={reason.trim().length < 3} onClick={() => send()}>Send</Button></>
    : <>{!manual && <Button variant="ghost" onClick={() => send({ skip: true, reported_minutes: 0 })} disabled={busy}>I didn&apos;t spend time on this</Button>}<span className="spacer" />{!manual && <Button onClick={() => { try { localStorage.setItem(SNOOZE, JSON.stringify({ ...snoozed(), [`${item?.source_type}:${item?.source_id}`]: Date.now() + 3 * 3600_000 })); } catch {} onClose(); }}>Later</Button>}<Button variant="primary" loading={busy} disabled={minutes < 1 || !title.trim()} onClick={() => send()}>Save</Button></>;
  return <Modal open={open} onClose={onClose} title={<><Clock3 size={16} /> {manual ? 'Log time' : 'How long did it take?'}</>} footer={footer}>
    {finished ? <div className="stack" style={{ gap: 12 }}>
      {step!.status === 'pending_approval'
        ? <Notice tone="warn" icon={<Hourglass size={16} />}><b>Waiting for approval</b><div className="mt8">{step!.message}</div></Notice>
        : <Notice tone="success" icon={<CheckCircle2 size={16} />}><b>Counted</b><div className="mt8">{step!.message}</div></Notice>}
      {step!.estimate && <div className="small muted">The app expected about <b>{fmt(step!.estimate.minutes)}</b> ({step!.estimate.basis}).</div>}
    </div>
    : asking ? <div className="stack" style={{ gap: 12 }}>
      <Notice tone="warn" icon={<AlertTriangle size={16} />}>{step!.question}</Notice>
      <Field label={`Why did “${title}” take ${fmt(minutes)}?`} hint="English or Farsi. If the reason isn't clear enough the time is still recorded, but your approver checks it before it counts."><textarea className="textarea" style={{ minHeight: 110 }} value={reason} onChange={e => setReason(e.target.value)} autoFocus placeholder="e.g. The client arrived 40 minutes late, then we walked the whole site and measured three extra units." /></Field>
    </div>
    : <div className="stack" style={{ gap: 12 }}>
      {manual ? <div className="form-grid">
        <Field label="What did you do?" className="full"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Meeting with Harbourline at their office" autoFocus /></Field>
        <Field label="Type"><select className="select" value={kind} onChange={e => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Day"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div> : <div><div className="small muted">You finished</div><b>{title}</b>{item?.location && <div className="tiny muted">{item.location}</div>}
        {item?.source_type === 'event' && <div className="row mt8" style={{ gap: 6 }}>{KINDS.filter(([k]) => ['meeting', 'online_meeting', 'site_visit'].includes(k)).map(([k, l]) => <button key={k} type="button" className="chip" style={kind === k ? { borderColor: 'var(--ink-3)', color: 'var(--ink)', fontWeight: 600 } : undefined} onClick={() => setKind(k)}>{l}</button>)}</div>}</div>}
      <div><div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Time you spent{isMeeting ? ' (including travel there and back)' : ''}</div>
        <div className="chips">{QUICK.map(q => <button key={q} type="button" className="chip" style={minutes === q ? { borderColor: 'var(--ink-3)', color: 'var(--ink)', fontWeight: 600 } : undefined} onClick={() => setQuick(q)}>{fmt(q)}</button>)}</div>
        <div className="row mt8" style={{ gap: 8, alignItems: 'center' }}><input className="input" style={{ width: 80 }} inputMode="numeric" value={h} onChange={e => setH(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="0" /><span className="small muted">hours</span><input className="input" style={{ width: 80 }} inputMode="numeric" value={m} onChange={e => setM(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="0" /><span className="small muted">minutes</span></div>
      </div>
      <div className="tiny muted">This counts toward your weekly hours. The app compares it with the usual time for this kind of work.</div>
    </div>}
  </Modal>;
}

/** Runs in the app frame: after a task is completed or a meeting ends, asks the person how long it took. */
export function TimeCheck() {
  const [items, setItems] = useState<TimeItem[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(async (show = false) => {
    try {
      const d = await api.get('/api/time/pending');
      const s = snoozed(); const now = Date.now();
      const list = (d.items || []).filter((x: any) => !(s[`${x.source_type}:${x.source_id}`] > now));
      setItems(list); if (list.length && show) setOpen(true);
    } catch {}
  }, []);
  useEffect(() => {
    const first = setTimeout(() => load(true), 20_000);
    const t = setInterval(() => load(true), 10 * 60_000);
    const now = () => setTimeout(() => load(true), 600);
    window.addEventListener('ip-time-check', now);
    return () => { clearTimeout(first); clearInterval(t); window.removeEventListener('ip-time-check', now); };
  }, [load]);
  const cur = items[0] || null;
  return <TimeReport item={cur} open={open && !!cur} onClose={() => { setOpen(false); setItems(i => i.slice(1)); setTimeout(() => load(false), 500); }} onDone={() => window.dispatchEvent(new CustomEvent('ip-hours-changed'))} />;
}
