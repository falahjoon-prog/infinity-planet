'use client';
import React, { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Modal, Button, Field, useToast } from './ui';
import { ProjectSelect, MemberSelect } from './pickers';
import { useApp } from './app-context';
import { toLocalInput, fromLocalInput } from '@/lib/client/format';

type FormProps<T> = { open: boolean; onClose: () => void; initial?: Partial<T> & { id?: string }; onSaved?: (row: any) => void };

function useForm(open: boolean, initial: Record<string, any> | undefined, defaults: Record<string, any>) {
  const [f, setF] = useState<Record<string, any>>({ ...defaults, ...(initial || {}) });
  useEffect(() => { if (open) setF({ ...defaults, ...(initial || {}) }); }, [open]); // eslint-disable-line
  const set = (k: string) => (e: any) => setF(x => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  return { f, setF, set };
}

async function save(path: string, id: string | undefined, body: any) {
  return id ? api.patch(`${path}/${id}`, body) : api.post(path, body);
}

export const PROJECT_STATUSES = ['active', 'due_diligence', 'negotiation', 'marketing', 'completed', 'archived'];
export const RISKS = ['low', 'medium', 'high', 'critical'];
export const STAGES = ['lead', 'opportunity', 'negotiation', 'due_diligence', 'contract', 'completed', 'lost'];

export function ProjectForm({ open, onClose, initial, onSaved }: FormProps<any>) {
  const toast = useToast(); const { refreshProjects } = useApp();
  const { f, set } = useForm(open, initial ? { ...initial, next_action_at: toLocalInput(initial.next_action_at) } : undefined, { name: '', description: '', project_type: '', location: '', status: 'active', risk: 'medium', deal_value: '', counterparty: '', next_action: '', next_action_at: '', highlights: '', owner_id: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.name.trim()) return toast('Project name is required', 'error');
    setBusy(true);
    try { const r = await save('/api/projects', initial?.id, { ...f, deal_value: f.deal_value === '' ? null : Number(String(f.deal_value).replace(/[^\d.]/g, '')), next_action_at: fromLocalInput(f.next_action_at), owner_id: f.owner_id || null }); toast(initial?.id ? 'Project updated' : 'Project created', 'success'); refreshProjects(); onSaved?.(r.project); onClose(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit project' : 'New project'} size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{initial?.id ? 'Save' : 'Create project'}</Button></>}>
    <div className="form-grid">
      <Field label="Project name" className="full"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
      <Field label="Type"><input className="input" value={f.project_type} onChange={set('project_type')} placeholder="e.g. Residential, Mixed-use, Commercial" /></Field>
      <Field label="Location"><input className="input" value={f.location} onChange={set('location')} /></Field>
      <Field label="Status"><select className="select" value={f.status} onChange={set('status')}>{PROJECT_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
      <Field label="Risk"><select className="select" value={f.risk} onChange={set('risk')}>{RISKS.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Project value (AUD)"><input className="input" inputMode="decimal" value={f.deal_value ?? ''} onChange={set('deal_value')} /></Field>
      <Field label="Main counterparty"><input className="input" value={f.counterparty || ''} onChange={set('counterparty')} /></Field>
      <Field label="Owner"><MemberSelect value={f.owner_id} onChange={set('owner_id')} noneLabel="Me" /></Field>
      <Field label="Next action date"><input className="input" type="datetime-local" value={f.next_action_at} onChange={set('next_action_at')} /></Field>
      <Field label="Next action" className="full"><input className="input" value={f.next_action || ''} onChange={set('next_action')} /></Field>
      <Field label="Description" className="full"><textarea className="textarea" value={f.description || ''} onChange={set('description')} /></Field>
      <Field label="Highlights" hint="One per line — used by Marketing and the Designer. Only include verified facts." className="full"><textarea className="textarea" value={f.highlights || ''} onChange={set('highlights')} /></Field>
    </div>
  </Modal>;
}

export function DealForm({ open, onClose, initial, onSaved }: FormProps<any>) {
  const toast = useToast();
  const { f, set } = useForm(open, initial ? { ...initial, next_action_at: toLocalInput(initial.next_action_at) } : undefined, { title: '', project_id: '', stage: 'lead', probability: '', counterparty: '', contact_name: '', contact_email: '', contact_phone: '', expected_value: '', next_action: '', next_action_at: '', owner_id: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.title.trim() && !f.counterparty.trim()) return toast('Give the deal a title or counterparty', 'error');
    setBusy(true);
    try {
      const body = { ...f, project_id: f.project_id || null, owner_id: f.owner_id || null, expected_value: f.expected_value === '' || f.expected_value == null ? null : Number(String(f.expected_value).replace(/[^\d.]/g, '')), probability: f.probability === '' || f.probability == null ? undefined : Number(f.probability), next_action_at: fromLocalInput(f.next_action_at) };
      const r = await save('/api/deals', initial?.id, body); toast(initial?.id ? 'Deal updated' : 'Deal created', 'success'); onSaved?.(r.deal); onClose();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit deal' : 'New deal'} size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{initial?.id ? 'Save' : 'Create deal'}</Button></>}>
    <div className="form-grid">
      <Field label="Deal title" className="full"><input className="input" value={f.title || ''} onChange={set('title')} autoFocus placeholder="e.g. JV equity — Fortitude Valley site" /></Field>
      <Field label="Counterparty"><input className="input" value={f.counterparty || ''} onChange={set('counterparty')} /></Field>
      <Field label="Project"><ProjectSelect value={f.project_id} onChange={set('project_id')} /></Field>
      <Field label="Stage"><select className="select" value={f.stage} onChange={set('stage')}>{STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></Field>
      <Field label="Probability %" hint="Leave blank to use the stage default"><input className="input" type="number" min={0} max={100} value={f.probability ?? ''} onChange={set('probability')} /></Field>
      <Field label="Value (AUD)"><input className="input" inputMode="decimal" value={f.expected_value ?? ''} onChange={set('expected_value')} /></Field>
      <Field label="Owner"><MemberSelect value={f.owner_id} onChange={set('owner_id')} noneLabel="Me" /></Field>
      <Field label="Contact name"><input className="input" value={f.contact_name || ''} onChange={set('contact_name')} /></Field>
      <Field label="Contact email"><input className="input" type="email" value={f.contact_email || ''} onChange={set('contact_email')} /></Field>
      <Field label="Contact phone"><input className="input" value={f.contact_phone || ''} onChange={set('contact_phone')} /></Field>
      <Field label="Next action date"><input className="input" type="datetime-local" value={f.next_action_at} onChange={set('next_action_at')} /></Field>
      <Field label="Next action" className="full"><input className="input" value={f.next_action || ''} onChange={set('next_action')} /></Field>
      {f.stage === 'lost' && <Field label="Reason lost" className="full"><input className="input" value={f.lost_reason || ''} onChange={set('lost_reason')} /></Field>}
      <Field label="Notes" className="full"><textarea className="textarea" value={f.notes || ''} onChange={set('notes')} /></Field>
    </div>
  </Modal>;
}

export function TaskForm({ open, onClose, initial, onSaved, onDelete }: FormProps<any> & { onDelete?: () => void }) {
  const toast = useToast();
  const { f, set } = useForm(open, initial ? { ...initial, due_at: toLocalInput(initial.due_at) } : undefined, { title: '', description: '', project_id: '', deal_id: '', assigned_to: '', priority: 'normal', status: 'todo', due_at: '', remind: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.title.trim()) return toast('Task title is required', 'error');
    setBusy(true);
    try {
      const due = fromLocalInput(f.due_at);
      const remind_at = f.remind && due ? new Date(new Date(due).getTime() - Number(f.remind) * 60_000).toISOString() : undefined;
      const r = await save('/api/tasks', initial?.id, { title: f.title, description: f.description, project_id: f.project_id || null, deal_id: f.deal_id || null, assigned_to: f.assigned_to || null, priority: f.priority, status: f.status, due_at: due, remind_at });
      toast(initial?.id ? 'Task updated' : 'Task created', 'success'); onSaved?.(r.task); onClose();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit task' : 'New task'} footer={<>{initial?.id && onDelete && <Button variant="danger" onClick={onDelete} style={{ marginRight: 'auto' }}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>{initial?.id ? 'Save' : 'Create task'}</Button></>}>
    <div className="form-grid">
      <Field label="Task" className="full"><input className="input" value={f.title} onChange={set('title')} autoFocus /></Field>
      <Field label="Project"><ProjectSelect value={f.project_id} onChange={set('project_id')} /></Field>
      <Field label="Assigned to"><MemberSelect value={f.assigned_to} onChange={set('assigned_to')} /></Field>
      <Field label="Priority"><select className="select" value={f.priority} onChange={set('priority')}>{['low', 'normal', 'high', 'urgent'].map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Status"><select className="select" value={f.status} onChange={set('status')}>{[['todo', 'To do'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Due"><input className="input" type="datetime-local" value={f.due_at} onChange={set('due_at')} /></Field>
      <Field label="Reminder"><select className="select" value={f.remind} onChange={set('remind')} disabled={!f.due_at}><option value="">No reminder</option><option value="0">At due time</option><option value="60">1 hour before</option><option value="1440">1 day before</option><option value="4320">3 days before</option></select></Field>
      <Field label="Details" className="full"><textarea className="textarea" value={f.description || ''} onChange={set('description')} /></Field>
    </div>
  </Modal>;
}

export function NoteForm({ open, onClose, initial, onSaved }: FormProps<any>) {
  const toast = useToast();
  const { f, set } = useForm(open, initial, { title: '', body: '', important: false, project_id: '', assigned_to: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.title.trim() || !f.body.trim()) return toast('Title and note text are required', 'error');
    setBusy(true);
    try { const r = await save('/api/notes', initial?.id, { title: f.title, body: f.body, important: !!f.important, project_id: f.project_id || null, deal_id: f.deal_id || null, assigned_to: f.assigned_to || null }); toast('Note saved', 'success'); onSaved?.(r.note); onClose(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit note' : 'New note'} size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save note</Button></>}>
    <div className="form-grid">
      <Field label="Title" className="full"><input className="input" value={f.title} onChange={set('title')} autoFocus /></Field>
      <Field label="Project"><ProjectSelect value={f.project_id} onChange={set('project_id')} /></Field>
      <Field label="For" hint="Choose a team member if this note belongs to them — it shows in their colour and they get a notification."><MemberSelect value={f.assigned_to} onChange={set('assigned_to')} noneLabel="General (everyone)" /></Field>
      <Field label="&nbsp;" className="full"><label className="check"><input type="checkbox" checked={!!f.important} onChange={set('important')} /> Important (pinned & prioritised for AI)</label></Field>
      <Field label="Note" className="full"><textarea className="textarea" dir="auto" style={{ minHeight: 220 }} value={f.body} onChange={set('body')} /></Field>
    </div>
  </Modal>;
}

export function EventForm({ open, onClose, initial, onSaved }: FormProps<any>) {
  const toast = useToast(); const { status } = useApp();
  const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 1);
  const { f, set } = useForm(open, initial ? { ...initial, starts_at: toLocalInput(initial.starts_at), ends_at: toLocalInput(initial.ends_at), attendees: (initial.attendees || []).join(', ') } : undefined, { title: '', starts_at: toLocalInput(now), ends_at: toLocalInput(new Date(+now + 3600_000)), location: '', description: '', project_id: '', attendees: '', reminder_minutes: '30', sync_google: !!status?.google.connected, notify_attendees: false });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.title.trim()) return toast('Title is required', 'error');
    setBusy(true);
    try {
      const body = { title: f.title, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at), location: f.location, description: f.description, project_id: f.project_id || null, attendees: f.attendees, reminder_minutes: f.reminder_minutes === '' ? null : Number(f.reminder_minutes), sync_google: !!f.sync_google, notify_attendees: !!f.notify_attendees };
      const r = await save('/api/calendar/events', initial?.id, body);
      if (r.google_error) toast(`Saved, but Google: ${r.google_error}`, 'error'); else toast('Meeting saved', 'success');
      onSaved?.(r.event); onClose();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit meeting' : 'New meeting'} size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save</Button></>}>
    <div className="form-grid">
      <Field label="Title" className="full"><input className="input" value={f.title} onChange={set('title')} autoFocus /></Field>
      <Field label="Starts"><input className="input" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></Field>
      <Field label="Ends"><input className="input" type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /></Field>
      <Field label="Location"><input className="input" value={f.location || ''} onChange={set('location')} /></Field>
      <Field label="Project"><ProjectSelect value={f.project_id} onChange={set('project_id')} /></Field>
      <Field label="Attendees" hint="Email addresses, comma separated" className="full"><input className="input" value={f.attendees} onChange={set('attendees')} /></Field>
      <Field label="Reminder"><select className="select" value={f.reminder_minutes ?? ''} onChange={set('reminder_minutes')}><option value="">None</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></Field>
      {!initial?.id && <Field label="Google Calendar">{status?.google.connected ? <><label className="check"><input type="checkbox" checked={!!f.sync_google} onChange={set('sync_google')} /> Add to Google Calendar</label><label className="check"><input type="checkbox" checked={!!f.notify_attendees} onChange={set('notify_attendees')} disabled={!f.sync_google} /> Email invitations to attendees</label></> : <small className="muted">Not connected — saved in this app only</small>}</Field>}
      <Field label="Agenda / notes" className="full"><textarea className="textarea" value={f.description || ''} onChange={set('description')} /></Field>
    </div>
  </Modal>;
}

export function ContactForm({ open, onClose, initial, onSaved }: FormProps<any>) {
  const toast = useToast();
  const { f, set } = useForm(open, initial, { full_name: '', position: '', email: '', phone: '', counterparty_name: '', project_id: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.full_name.trim()) return toast('Name is required', 'error');
    setBusy(true);
    try { const r = await save('/api/contacts', initial?.id, { ...f, project_id: f.project_id || null }); toast('Contact saved', 'success'); onSaved?.(r.contact); onClose(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit contact' : 'New contact'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save</Button></>}>
    <div className="form-grid">
      <Field label="Full name" className="full"><input className="input" value={f.full_name} onChange={set('full_name')} autoFocus /></Field>
      <Field label="Organisation"><input className="input" value={f.counterparty_name || ''} onChange={set('counterparty_name')} placeholder={initial?.counterparty?.name || ''} /></Field>
      <Field label="Position"><input className="input" value={f.position || ''} onChange={set('position')} /></Field>
      <Field label="Email"><input className="input" type="email" value={f.email || ''} onChange={set('email')} /></Field>
      <Field label="Phone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
      <Field label="Project" className="full"><ProjectSelect value={f.project_id} onChange={set('project_id')} /></Field>
      <Field label="Notes" className="full"><textarea className="textarea" value={f.notes || ''} onChange={set('notes')} /></Field>
    </div>
  </Modal>;
}
