'use client';
import React, { useEffect, useState } from 'react';
import { UserPlus, Copy, Check, X, KeyRound } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { Card, Button, Modal, Field, Notice, useToast } from './ui';
import { label, personName } from '@/lib/client/format';

const ROLES = ['admin', 'director', 'manager', 'legal', 'marketing', 'project', 'member', 'viewer'];

/** Admin: add several people at once; shows one-time temporary passwords. */
export function BulkAdd({ open, onClose, onDone, myRole }: { open: boolean; onClose: () => void; onDone: () => void; myRole: string }) {
  const toast = useToast();
  const [emails, setEmails] = useState(''); const [role, setRole] = useState('member'); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any[] | null>(null);
  useEffect(() => { if (open) { setRes(null); } }, [open]);
  const go = async () => { setBusy(true); try { const r = await api.post('/api/team/members/bulk', { emails, role }); setRes(r.results); onDone(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const text = (res || []).filter(r => r.ok).map(r => `${r.full_name} — ${r.email} — temporary password: ${r.password}`).join('\n');
  return <Modal open={open} onClose={onClose} title="Add team members" size="wide" footer={res ? <><Button icon={<Copy size={14} />} onClick={() => { navigator.clipboard?.writeText(`Sign in at ${location.origin}\n${text}\nPlease change your password in Settings → My profile.`); toast('Copied', 'success'); }}>Copy all</Button><Button variant="primary" onClick={onClose}>Done</Button></> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={<UserPlus size={14} />} loading={busy} disabled={!emails.trim()} onClick={go}>Create accounts</Button></>}>
    {!res ? <div className="stack" style={{ gap: 12 }}>
      <Field label="Email addresses" hint="One per line, or separated by commas or spaces. Names are taken from the email (e.g. ramin@ → Ramin) and can be edited later."><textarea className="textarea" style={{ minHeight: 140 }} value={emails} onChange={e => setEmails(e.target.value)} placeholder={'ramin@rhccity.com.au\nhassan@rhccity.com.au'} autoFocus /></Field>
      <Field label="Role for all of them"><select className="select" value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r} value={r} disabled={r === 'admin' && myRole !== 'admin'}>{label(r)}</option>)}</select></Field>
    </div> : <div className="stack" style={{ gap: 10 }}>
      <Notice tone="warn">These temporary passwords are shown <b>once</b>. Copy them now and send each person theirs privately (e.g. by text or in person). They can change it in Settings → My profile.</Notice>
      <div className="table-wrap"><table className="table"><thead><tr><th>Person</th><th>Result</th><th>Temporary password</th></tr></thead><tbody>{res.map(r => <tr key={r.email}><td><b>{personName(r)}</b><div className="tiny muted">{r.email}</div></td><td>{r.ok ? <span className="badge green">Created · {label(r.role)}</span> : <span className="badge red">{r.error}</span>}</td><td>{r.ok && <code className="mono">{r.password}</code>}</td></tr>)}</tbody></table></div>
    </div>}
  </Modal>;
}

/** Pending self-service requests + the sign-up setting. */
export function AccessRequests({ members, onChanged }: { members: any[]; onChanged: () => void }) {
  const toast = useToast();
  const pending = members.filter(m => m.pending);
  const { data, reload } = useApi<any>('/api/settings');
  const [s, setS] = useState<any>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});
  useEffect(() => { if (data) setS({ enabled: !!data.settings.signup?.enabled, domains: (data.settings.signup?.domains || []).join(', '), default_role: data.settings.signup?.default_role || 'member' }); }, [data]);
  const approve = async (m: any) => { try { await api.patch(`/api/team/members/${m.id}`, { approve: true, role: roles[m.id] || m.role }); toast(`${personName(m)} can now sign in`, 'success'); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  const decline = async (m: any) => { try { await api.del(`/api/team/members/${m.id}`); toast('Request declined', 'success'); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  const save = async () => { try { await api.patch('/api/settings', { signup: { enabled: s.enabled, domains: s.domains.split(/[\s,;]+/).map((d: string) => d.replace(/^@/, '').trim().toLowerCase()).filter(Boolean), default_role: s.default_role } }); toast('Saved', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  return <>
    {pending.length > 0 && <Card title={<><KeyRound size={15} /> Access requests ({pending.length})</>} flush><div className="list">{pending.map(m => <div key={m.id} className="list-item" style={{ flexWrap: 'wrap' }}><div className="main-col" style={{ flex: '1 1 100%' }}><div className="title">{personName(m)}</div><div className="meta">{m.email} · requested {new Date(m.created_at).toLocaleDateString('en-AU')}</div></div>
      <select className="select sm" style={{ width: 'auto' }} value={roles[m.id] || m.role} onChange={e => setRoles({ ...roles, [m.id]: e.target.value })}>{ROLES.filter(r => r !== 'admin').map(r => <option key={r} value={r}>{label(r)}</option>)}</select>
      <Button size="xs" variant="success" icon={<Check size={13} />} onClick={() => approve(m)}>Approve</Button><Button size="xs" icon={<X size={13} />} onClick={() => decline(m)}>Decline</Button></div>)}</div></Card>}
    {s && <Card title="Sign-up requests"><div className="stack" style={{ gap: 10 }}>
      <label className="check"><input type="checkbox" checked={s.enabled} onChange={e => setS({ ...s, enabled: e.target.checked })} /> Show “Request access” on the sign-in page</label>
      <Field label="Allowed email domains" hint="Only these addresses can request an account, e.g. rhccity.com.au"><input className="input" value={s.domains} onChange={e => setS({ ...s, domains: e.target.value })} placeholder="rhccity.com.au" /></Field>
      <Field label="Role for approved requests"><select className="select" value={s.default_role} onChange={e => setS({ ...s, default_role: e.target.value })}>{ROLES.filter(r => !['admin', 'director'].includes(r)).map(r => <option key={r} value={r}>{label(r)}</option>)}</select></Field>
      <Notice>Requests can't sign in until an admin approves them here (you also get a notification in the bell). Check each name before approving.</Notice>
      <div className="row"><span className="spacer" /><Button variant="primary" onClick={save}>Save</Button></div>
    </div></Card>}
  </>;
}
