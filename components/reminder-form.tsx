'use client';
import React, { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Modal, Button, Field, useToast } from './ui';
import { ProjectSelect } from './pickers';
import { useApp } from './app-context';
import { toLocalInput, fromLocalInput } from '@/lib/client/format';

/** Stand-alone reminder: for me, a team member, or everyone. */
export function ReminderForm({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved?: () => void; initial?: { title?: string; project_id?: string | null } }) {
  const { me, members, can } = useApp();
  const toast = useToast();
  const soon = () => { const d = new Date(Date.now() + 3600_000); d.setMinutes(0, 0, 0); return d; };
  const [f, setF] = useState({ title: '', when: toLocalInput(soon().toISOString()), who: me.id, project_id: null as string | null });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ title: initial?.title || '', when: toLocalInput(soon().toISOString()), who: me.id, project_id: initial?.project_id || null }); }, [open]); // eslint-disable-line
  const quick = (mins: number) => setF(x => ({ ...x, when: toLocalInput(new Date(Date.now() + mins * 60_000).toISOString()) }));
  const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); setF(x => ({ ...x, when: toLocalInput(d.toISOString()) })); };
  const submit = async () => {
    setBusy(true);
    try { await api.post('/api/reminders', { title: f.title, remind_at: fromLocalInput(f.when), recipient_id: f.who, project_id: f.project_id }); toast('Reminder set', 'success'); onSaved?.(); onClose(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="New reminder" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!f.title.trim() || !f.when || !can.write} onClick={submit}>Set reminder</Button></>}>
    <div className="form-grid">
      <Field label="Remind about" className="full"><input className="input" autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. Call the bank about the facility" /></Field>
      <Field label="When"><input type="datetime-local" className="input" value={f.when} onChange={e => setF({ ...f, when: e.target.value })} /></Field>
      <Field label="Who"><select className="select" value={f.who} onChange={e => setF({ ...f, who: e.target.value })}>
        <option value={me.id}>Me</option>
        <option value="everyone">Everyone</option>
        {members.filter(m => m.id !== me.id && m.role !== 'viewer').map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
      </select></Field>
      <div className="full chips"><button type="button" className="chip" onClick={() => quick(15)}>In 15 min</button><button type="button" className="chip" onClick={() => quick(60)}>In 1 hour</button><button type="button" className="chip" onClick={() => quick(180)}>In 3 hours</button><button type="button" className="chip" onClick={tomorrow9}>Tomorrow 9am</button></div>
      <Field label="Project (optional)" className="full"><ProjectSelect value={f.project_id} onChange={v => setF({ ...f, project_id: v })} /></Field>
    </div>
    <p className="tiny muted mt8">Tip: you can also tell the AI bot, e.g. “remind everyone at 4pm to submit timesheets”.</p>
  </Modal>;
}
