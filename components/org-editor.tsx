'use client';
/** Settings → Team & access → Company structure: positions, who holds them and who they report to. Approvals follow it. */
import React, { useEffect, useState } from 'react';
import { GitBranch, Plus, Trash2, Save } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from './app-context';
import { Card, Button, Loading, Notice, Segmented, useToast } from './ui';
import { OrgView } from './company-records';

export function OrgEditor() {
  const { me, members } = useApp(); const toast = useToast();
  const { data, reload } = useApi<any>('/api/team/org');
  const [org, setOrg] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data?.org) setOrg(JSON.parse(JSON.stringify(data.org))); }, [data]);
  const canEdit = ['admin', 'director'].includes(me.role);
  if (!org) return <Loading />;
  const set = (i: number, patch: any) => { const ps = org.positions.slice(); ps[i] = { ...ps[i], ...patch }; setOrg({ ...org, positions: ps }); };
  const add = () => setOrg({ ...org, positions: [...org.positions, { id: `pos-${Math.random().toString(36).slice(2, 7)}`, title: 'New position', reports_to: 'gm', holders: [] }] });
  const remove = (i: number) => { const id = org.positions[i].id; setOrg({ ...org, positions: org.positions.filter((_: any, k: number) => k !== i).map((p: any) => p.reports_to === id ? { ...p, reports_to: org.positions[i].reports_to } : p) }); };
  const save = async () => { setBusy(true); try { await api.patch('/api/team/org', org); toast('Company structure saved — approvals follow it now', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const active = members.filter(m => m.role !== 'viewer');
  return <div className="stack">
    {!data.org.saved && <Notice tone="info">This is the RHC City organisation chart. Check who holds each position and click <b>Save</b> to switch on approval routing.</Notice>}
    <Card title={<><GitBranch size={15} /> Company structure</>} sub="who reports to whom" actions={canEdit ? <><Button size="sm" icon={<Plus size={14} />} onClick={add}>Add position</Button><Button size="sm" variant="primary" icon={<Save size={14} />} loading={busy} onClick={save}>Save</Button></> : undefined}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}><span className="small"><b>When someone asks a person higher up to approve:</b></span>
        <Segmented value={org.routing} onChange={(v: any) => canEdit && setOrg({ ...org, routing: v })} options={[{ value: 'through', label: 'It goes through their manager first' }, { value: 'copy', label: 'Their manager gets a copy' }]} /></div>
      <div className="table-wrap"><table className="table org-edit"><thead><tr><th>Position</th><th>Held by</th><th>Reports to</th>{canEdit && <th />}</tr></thead><tbody>
        {org.positions.map((p: any, i: number) => <tr key={p.id}>
          <td>{canEdit ? <input className="input sm" value={p.title} onChange={e => set(i, { title: e.target.value })} aria-label="Position" /> : <b>{p.title}</b>}</td>
          <td><select className="select sm" multiple={false} value={p.holders[0] || ''} disabled={!canEdit} onChange={e => set(i, { holders: e.target.value ? [e.target.value, ...p.holders.slice(1).filter((h: string) => h !== e.target.value)] : p.holders.slice(1) })} aria-label="Held by"><option value="">— Vacant —</option>{active.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select>
            {p.holders.length > 1 && <div className="tiny muted">+ {p.holders.slice(1).map((h: string) => members.find(m => m.id === h)?.full_name || 'member').join(', ')}</div>}
            {canEdit && p.holders.length > 0 && <select className="select sm" style={{ marginTop: 4 }} value="" onChange={e => e.target.value && set(i, { holders: [...p.holders, e.target.value] })} aria-label="Add another holder"><option value="">+ another person…</option>{active.filter(m => !p.holders.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select>}</td>
          <td><select className="select sm" value={p.reports_to || ''} disabled={!canEdit} onChange={e => set(i, { reports_to: e.target.value || null })} aria-label="Reports to"><option value="">— Top (no one) —</option>{org.positions.filter((q: any) => q.id !== p.id).map((q: any) => <option key={q.id} value={q.id}>{q.title}</option>)}</select></td>
          {canEdit && <td><button className="icon-btn" title="Remove position" onClick={() => remove(i)}><Trash2 size={14} /></button></td>}
        </tr>)}
      </tbody></table></div>
    </Card>
    <OrgView org={org} />
  </div>;
}
