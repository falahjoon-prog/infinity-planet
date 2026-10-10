'use client';
import React, { useState } from 'react';
import { Plus, Trash2, Briefcase } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Card, Button, Modal, Field, useToast } from './ui';
import { personName } from '@/lib/client/format';

export type Duty = { key: string; label: string; hint?: string; areas: string[]; approves?: string[]; custom?: boolean };
export const APPROVE_LABEL: Record<string, string> = { legal: 'Legal reviews', contract: 'Contracts', marketing: 'Marketing & designs', email: 'Outgoing emails', document: 'Documents', template: 'Templates', general: 'General items', hours: 'Weekly hours & time' };

/** What each built-in role can already approve (mirrors APPROVER_ROLES in lib/auth.ts). */
export const ROLE_APPROVES: Record<string, string[]> = { admin: Object.keys(APPROVE_LABEL), director: Object.keys(APPROVE_LABEL), manager: ['email', 'document', 'general'], legal: ['legal', 'contract', 'document', 'template'], marketing: ['marketing', 'template'], project: [], member: [], viewer: [] };

/** Area access entries are "key" (full) or "key:view" (look only). Marker entries (e.g. "@v47") are kept. */
export const levelOf = (areas: string[], key: string) => areas.includes(key) ? 'full' : areas.includes(`${key}:view`) ? 'view' : 'none';
export const setLevel = (areas: string[], key: string, lvl: string) => { const rest = areas.filter(a => a !== key && a !== `${key}:view`); return lvl === 'full' ? [...rest, key] : lvl === 'view' ? [...rest, `${key}:view`] : rest; };
export const areaCount = (areas: string[]) => areas.filter(a => !a.startsWith('@')).length;
/** Add the areas a duty needs (full access) without lowering anything already set. */
export const withDutyAreas = (areas: string[], duty?: Duty) => (duty?.areas || []).reduce((acc, k) => levelOf(acc, k) === 'full' ? acc : setLevel(acc, k, 'full'), areas);

/** Each part of the app: No access / View only / Full access. */
export function AreaLevels({ areas, value, onChange }: { areas: { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = (lvl: string) => onChange(areas.reduce((acc, a) => setLevel(acc, a.key, lvl), value));
  return <div>
    <div className="row tiny" style={{ gap: 6, marginBottom: 8 }}><span className="muted">Set all:</span><button type="button" className="chip" onClick={() => all('full')}>Full access</button><button type="button" className="chip" onClick={() => all('view')}>View only</button><button type="button" className="chip" onClick={() => all('none')}>No access</button></div>
    <div className="grid g2" style={{ gap: '6px 18px' }}>{areas.map(a => { const lvl = levelOf(value, a.key); return <div key={a.key} className="area-level">
      <span className="small" style={{ color: lvl === 'none' ? 'var(--ink-4)' : undefined }}>{a.label}</span>
      <select className="select sm" value={lvl} onChange={e => onChange(setLevel(value, a.key, e.target.value))}><option value="full">Full access</option><option value="view">View only</option><option value="none">No access</option></select>
    </div>; })}</div>
    <div className="tiny muted mt8">View only = they can open and read it but can&apos;t add, change or delete anything there.</div>
  </div>;
}

/** Duties: who does what. Ticking one suggests the access and approval rights it needs. */
export function DutyPicker({ duties, value, onChange, onPick }: { duties: Duty[]; value: string[]; onChange: (v: string[]) => void; onPick?: (d: Duty) => void }) {
  return <div className="duty-grid">{duties.map(d => <label key={d.key} className="check small" title={d.hint}><input type="checkbox" checked={value.includes(d.key)} onChange={e => { if (e.target.checked) { onChange([...value, d.key]); onPick?.(d); } else onChange(value.filter(x => x !== d.key)); }} /> <span>{d.label}{d.hint && <div className="tiny muted">{d.hint}</div>}</span></label>)}</div>;
}

/** Approval rights on top of what the role already allows. */
export function ApprovesPicker({ value, onChange, fromRole }: { value: string[]; onChange: (v: string[]) => void; fromRole?: string[] }) {
  return <div className="duty-grid">{Object.entries(APPROVE_LABEL).map(([k, l]) => { const role = (fromRole || []).includes(k); return <label key={k} className="check small"><input type="checkbox" disabled={role} checked={role || value.includes(k)} onChange={e => onChange(e.target.checked ? [...value, k] : value.filter(x => x !== k))} /> {l}{role && <span className="tiny muted"> (from role)</span>}</label>; })}</div>;
}

/** Card: each duty and who does it, plus adding the business's own duties. */
export function WhoDoesWhat({ duties, members, admin, onChanged, onEdit }: { duties: Duty[]; members: any[]; admin: boolean; onChanged: () => void; onEdit: (m: any) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false); const [f, setF] = useState<{ label: string; hint: string }>({ label: '', hint: '' });
  const people = members.filter(m => !m.pending && m.active !== false);
  const add = async () => { try { await api.post('/api/team/duties', f); setF({ label: '', hint: '' }); toast('Duty added', 'success'); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  const del = async (d: Duty) => { if (!window.confirm(`Remove “${d.label}”? It is taken off anyone who has it.`)) return; try { await api.del(`/api/team/duties?key=${d.key}`); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  return <Card title={<><Briefcase size={15} /> Who does what</>} sub="Duties decide who gets which work; Infinity AI uses them when it assigns tasks" actions={admin && <Button size="sm" icon={<Plus size={13} />} onClick={() => setOpen(true)}>Duties</Button>}>
    <div className="stack" style={{ gap: 8 }}>{duties.map(d => { const who = people.filter(m => (m.duties || []).includes(d.key)); return <div key={d.key} className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
      <b className="small" style={{ minWidth: 190 }}>{d.label}</b>
      {who.length ? who.map(m => <button key={m.id} type="button" className="chip" onClick={() => admin && onEdit(m)}>{personName(m)}</button>) : <span className="tiny muted">Nobody yet{admin ? ' — Edit a member to give them this duty' : ''}</span>}
    </div>; })}</div>
    {open && <Modal open onClose={() => setOpen(false)} title="Duties" footer={<Button onClick={() => setOpen(false)}>Done</Button>}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="stack" style={{ gap: 4 }}>{duties.map(d => <div key={d.key} className="row" style={{ gap: 8 }}><span className="small" style={{ flex: 1 }}>{d.label}{d.custom ? '' : <span className="tiny muted"> · built in</span>}</span><button className="icon-btn" title="Remove" onClick={() => del(d)}><Trash2 size={14} /></button></div>)}</div>
        <div className="form-grid">
          <Field label="New duty"><input className="input" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="e.g. Tenant relations, Procurement, Social media" /></Field>
          <Field label="Short description"><input className="input" value={f.hint} onChange={e => setF({ ...f, hint: e.target.value })} placeholder="optional" /></Field>
        </div>
        <div className="row"><span className="spacer" /><Button variant="primary" disabled={!f.label.trim()} onClick={add}>Add duty</Button></div>
      </div>
    </Modal>}
  </Card>;
}
