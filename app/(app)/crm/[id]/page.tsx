'use client';
import { useOpenWindow } from '@/lib/client/nav-history';
import { SplitHandle } from '@/components/split-handle';
import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, Upload, Mail, Phone, FileSignature } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { DocViewer } from '@/components/doc-viewer';
import { UploadDialog } from '@/components/workflow';
import { PageHead, Card, Loading, ErrorNote, Empty, StatusBadge, AuthorityBadge, Button, KV, useToast, useConfirm } from '@/components/ui';
import { DealForm, TaskForm, NoteForm, STAGES } from '@/components/forms';
import { TaskList, ActivityList } from '@/components/lists';
import { money, date, ago, label } from '@/lib/client/format';

export default function DealPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const { can, me } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const { data: d, error, loading, reload } = useApi<any>(`/api/deals/${id}`, [id]);
  const [modal, setModal] = useState<null | 'edit' | 'task' | 'note' | 'upload'>(null);
  const [editing, setEditing] = useState<any>(null);
  const win = useOpenWindow('doc'); const doc = win.value; // an open document lives in the address, so Back closes it
  if (loading && !d) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!d) return null;
  const deal = d.deal;
  const setStage = async (stage: string) => { try { await api.patch(`/api/deals/${id}`, { stage }); toast(`Moved to ${label(stage)}`, 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const remove = async () => { if (!(await confirm({ title: 'Delete this deal?', body: 'This cannot be undone. Linked tasks and notes are kept.', confirm: 'Delete', danger: true }))) return; try { await api.del(`/api/deals/${id}`); router.push('/crm'); } catch (e: any) { toast(e.message, 'error'); } };
  const toggleTask = async (t: any) => { try { await api.patch(`/api/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' }); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const idx = STAGES.indexOf(deal.stage);
  return <>
    <PageHead back={{ href: '/crm', label: 'Deals' }} eyebrow={<>{deal.project && <><Link className="link" href={`/projects/${deal.project.id}`}>{deal.project.name}</Link></>}</>} title={deal.title || deal.counterparty}
      sub={<span className="row wrap" style={{ gap: 8 }}><StatusBadge value={deal.stage} /><b>{money(deal.expected_value)}</b><span className="muted">{deal.probability}% probability</span></span>}
      actions={can.write && <><Button icon={<Pencil size={15} />} onClick={() => setModal('edit')}>Edit</Button>{['admin', 'director', 'manager'].includes(me.role) && <Button variant="ghost" icon={<Trash2 size={15} />} onClick={remove} title="Delete" />}</>} />
    <div className="card mb16" style={{ padding: 10, overflowX: 'auto' }}><div className="row" style={{ gap: 6, minWidth: 700 }}>{STAGES.map((s, i) => <button key={s} disabled={!can.write} onClick={() => setStage(s)} className="btn sm" style={{ flex: 1, background: s === deal.stage ? (s === 'lost' ? 'var(--red)' : 'var(--navy-800)') : i < idx && deal.stage !== 'lost' ? 'var(--blue-soft)' : undefined, color: s === deal.stage ? '#fff' : undefined, borderColor: s === deal.stage ? 'transparent' : undefined }}>{label(s)}</button>)}</div></div>
    <div className="grid g-main"><SplitHandle id="deal-side" edge="last" cssVar="--split-side" min={260} max={640} minOther={520} />
      <div className="stack">
        <Card title="Deal details"><KV items={[
          ['Counterparty', deal.counterparty], ['Value', money(deal.expected_value)], ['Weighted', money((Number(deal.expected_value) || 0) * (Number(deal.probability) || 0) / 100)],
          ['Owner', deal.owner?.full_name], ['Next action', deal.next_action ? <>{deal.next_action}{deal.next_action_at && <span className="muted"> · {date(deal.next_action_at, true)}</span>}</> : <span className="muted">Not set</span>],
          ['Contact', deal.contact_name ? <span className="row wrap" style={{ gap: 10 }}>{deal.contact_name}{deal.contact_email && <a className="link row" style={{ gap: 4 }} href={`mailto:${deal.contact_email}`}><Mail size={13} />{deal.contact_email}</a>}{deal.contact_phone && <a className="link row" style={{ gap: 4 }} href={`tel:${deal.contact_phone}`}><Phone size={13} />{deal.contact_phone}</a>}</span> : null],
          ['Reason lost', deal.lost_reason], ['Notes', deal.notes ? <span style={{ whiteSpace: 'pre-wrap' }}>{deal.notes}</span> : null], ['Created', date(deal.created_at)], ['Closed', deal.closed_at ? date(deal.closed_at) : null],
        ]} /></Card>
        <Card title="Tasks" flush actions={can.write && <Button size="sm" icon={<Plus size={13} />} onClick={() => { setEditing({ deal_id: id, project_id: deal.project_id }); setModal('task'); }}>Task</Button>}><TaskList tasks={d.tasks} onToggle={toggleTask} onOpen={t => { setEditing(t); setModal('task'); }} /></Card>
        <Card title="Documents" flush actions={can.write && <Button size="sm" icon={<Upload size={13} />} onClick={() => setModal('upload')}>Upload</Button>}>
          {d.documents.length === 0 ? <Empty title="No documents" /> : <div className="list">{d.documents.map((x: any) => <button key={x.id} className="list-item" onClick={() => win.open(x.id)}><div className="main-col"><div className="title">{x.name}</div><div className="meta">{x.deal_id === id ? 'Deal document' : 'Project document'} · {ago(x.updated_at)}</div></div><AuthorityBadge value={x.authority} /><StatusBadge value={x.status} /></button>)}</div>}
        </Card>
      </div>
      <div className="stack">
        <Card title="Actions"><div className="grid g2" style={{ gap: 8 }}>
          <Link className="btn" href={`/drafting?new=1&deal=${id}${deal.project_id ? `&project=${deal.project_id}` : ''}`}><FileSignature size={15} />Draft offer / MOU</Link>
          <Link className="btn" href={`/gmail?compose=1${deal.project_id ? `&project=${deal.project_id}` : ''}${deal.contact_email ? `&to=${encodeURIComponent(deal.contact_email)}` : ''}`}><Mail size={15} />Email contact</Link>
        </div></Card>
        <Card title="Notes" flush actions={can.write && <Button size="sm" icon={<Plus size={13} />} onClick={() => { setEditing({ deal_id: id, project_id: deal.project_id }); setModal('note'); }}>Note</Button>}>
          {d.notes.length === 0 ? <Empty title="No notes" /> : <div className="list">{d.notes.map((n: any) => <button key={n.id} className="list-item" onClick={() => { setEditing(n); setModal('note'); }}><div className="main-col"><div className="title">{n.title}</div><div className="meta">{n.body}</div></div></button>)}</div>}
        </Card>
        {d.contacts.length > 0 && <Card title="Counterparty contacts" flush><div className="list">{d.contacts.map((c: any) => <div key={c.id} className="list-item"><div className="main-col"><div className="title">{c.full_name}</div><div className="meta">{[c.position, c.email, c.phone].filter(Boolean).join(' · ')}</div></div></div>)}</div></Card>}
        <Card title="Activity" flush><ActivityList events={d.activity} /></Card>
      </div>
    </div>
    <DealForm open={modal === 'edit'} onClose={() => setModal(null)} initial={deal} onSaved={() => reload()} />
    <TaskForm open={modal === 'task'} onClose={() => setModal(null)} initial={editing} onSaved={() => reload()} />
    <NoteForm open={modal === 'note'} onClose={() => setModal(null)} initial={editing} onSaved={() => reload()} />
    <UploadDialog open={modal === 'upload'} onClose={() => setModal(null)} onDone={() => reload()} projectId={deal.project_id} dealId={id} />
    <DocViewer id={doc} onClose={() => win.close()} onChanged={reload} />
  </>;
}
