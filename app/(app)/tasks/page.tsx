'use client';
import { ExportExcel } from '@/components/export-button';
import { useOpenWindow } from '@/lib/client/nav-history';
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Columns3, List, Trash2 } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { TaskForm } from '@/components/forms';
import { TaskList } from '@/components/lists';
import { ProjectSelect, MemberSelect } from '@/components/pickers';
import { PageHead, Loading, ErrorNote, Empty, StatusBadge, Button, Segmented, useToast, useConfirm, Avatar } from '@/components/ui';
import { dueLabel } from '@/lib/client/format';

const COLS = [['todo', 'To do'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']] as const;
export default function Page() { return <Suspense fallback={<Loading />}><Tasks /></Suspense>; }

function Tasks() {
  const sp = useSearchParams(); const router = useRouter(); const win = useOpenWindow(); const { can, me } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [scope, setScope] = useState<string>(sp.get('view') === 'overdue' ? 'overdue' : sp.get('view') === 'mine' ? 'mine' : 'all');
  const [project, setProject] = useState<string | null>(null); const [assignee, setAssignee] = useState<string | null>(null); const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any>(sp.get('new') === '1' ? {} : null);
  const [drag, setDrag] = useState<string | null>(null); const [over, setOver] = useState<string | null>(null);
  const qs = new URLSearchParams({ ...(project ? { project_id: project } : {}), ...(scope === 'mine' ? { assigned: 'me' } : assignee ? { assigned_to: assignee } : {}), ...(scope === 'overdue' ? { overdue: '1' } : {}) }).toString();
  const { data, error, loading, reload, setData } = useApi<any>(`/api/tasks?${qs}`, [qs]);
  useEffect(() => { const id = win.value; if (!id) { setEditing((e: any) => (e?.id ? null : e)); return; } if (data?.tasks) { const t = data.tasks.find((x: any) => x.id === id); if (t) setEditing(t); } }, [data, win.value]);
  const openTask = (t: any) => { setEditing(t); if (t?.id) win.open(t.id); };
  const closeForm = () => { if (win.value) win.close(); else setEditing(null); };
  useEffect(() => { if (window.innerWidth < 700) setView('list'); }, []);
  const tasks = (data?.tasks || []).filter((t: any) => !q || `${t.title} ${t.description || ''}`.toLowerCase().includes(q.toLowerCase()));
  const move = async (id: string, status: string) => {
    setData({ tasks: data.tasks.map((t: any) => t.id === id ? { ...t, status } : t) });
    try { await api.patch(`/api/tasks/${id}`, { status }); } catch (e: any) { toast(e.message, 'error'); reload(); }
  };
  const toggle = (t: any) => move(t.id, t.status === 'done' ? 'todo' : 'done');
  const del = async (t: any) => { if (!(await confirm({ title: 'Delete task?', confirm: 'Delete', danger: true }))) return; try { await api.del(`/api/tasks/${t.id}`); closeForm(); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  return <>
    <PageHead eyebrow="Operate" title="Tasks" sub="Accountable work across the business — assignment, priority, due dates and reminders." actions={<><ExportExcel kind="tasks" query={qs} />{can.write && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing({ assigned_to: me.id })}>New task</Button>}</>} />
    <div className="filters">
      <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'overdue', label: 'Overdue' }]} />
      <div className="search-input"><Search size={15} /><input className="input" placeholder="Search tasks" value={q} onChange={e => setQ(e.target.value)} /></div>
      <ProjectSelect value={project} onChange={setProject} noneLabel="All projects" />
      {scope === 'all' && <MemberSelect value={assignee} onChange={setAssignee} noneLabel="Anyone" />}
      <span className="spacer" />
      <Segmented value={view} onChange={setView} options={[{ value: 'board', label: <Columns3 size={14} /> }, { value: 'list', label: <List size={14} /> }]} />
    </div>
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading && !data ? <Loading /> : view === 'board' ? <div className="kanban" style={{ gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))' }}>{COLS.map(([s, l]) => { const col = tasks.filter((t: any) => t.status === s); return <div key={s} className={`k-col ${over === s ? 'drop' : ''}`} onDragOver={e => { if (can.write) { e.preventDefault(); setOver(s); } }} onDragLeave={() => setOver(null)} onDrop={e => { e.preventDefault(); setOver(null); if (drag) move(drag, s); setDrag(null); }}>
      <div className="k-head"><b>{l}</b><small>{col.length}</small></div>
      {col.map((t: any) => { const due = t.status !== 'done' ? dueLabel(t.due_at) : null; return <div key={t.id} className="k-card" draggable={can.write} onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)} onClick={() => openTask(t)}>
        <div className="t" style={t.status === 'done' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{t.title}</div>{t.project?.name && <div className="m">{t.project.name}</div>}
        <div className="row mt8" style={{ gap: 6 }}>{t.assignee?.full_name ? <Avatar name={t.assignee.full_name} size="sm" /> : <span className="tiny muted">Unassigned</span>}<span className="spacer" />{['high', 'urgent'].includes(t.priority) && <StatusBadge value={t.priority} />}{due && <span className={`badge ${due.tone}`}>{due.text}</span>}</div>
      </div>; })}
    </div>; })}</div>
      : <div className="card">{tasks.length === 0 ? <Empty title="No tasks" /> : <TaskList tasks={tasks} onToggle={toggle} onOpen={openTask} />}</div>}
    <TaskForm open={!!editing} onClose={closeForm} initial={editing?.id ? editing : editing || undefined} onSaved={() => reload()} onDelete={can.write ? () => del(editing) : undefined} />
  </>;
}
