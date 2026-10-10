'use client';
import React from 'react';
import { CheckCircle2, Activity } from 'lucide-react';
import { Empty, StatusBadge } from './ui';
import { date, dueLabel } from '@/lib/client/format';
import { describe } from '@/lib/client/activity';

export function TaskList({ tasks, onToggle, onOpen }: { tasks: any[]; onToggle: (t: any) => void; onOpen: (t: any) => void }) {
  if (!tasks.length) return <Empty title="No tasks" />;
  return <div className="list">{tasks.map(t => { const due = t.status !== 'done' ? dueLabel(t.due_at) : null; return <div key={t.id} className="list-item clickable" onClick={() => onOpen(t)}>
    <button onClick={e => { e.stopPropagation(); onToggle(t); }} title={t.status === 'done' ? 'Reopen' : 'Mark done'} style={{ color: t.status === 'done' ? 'var(--green)' : 'var(--ink-4)' }}><CheckCircle2 size={19} /></button>
    <div className="main-col"><div className="title" style={t.status === 'done' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{t.title}</div><div className="meta">{t.assignee?.full_name || 'Unassigned'}{t.project?.name ? ` · ${t.project.name}` : ''}</div></div>
    {t.status !== 'todo' && t.status !== 'done' && <StatusBadge value={t.status} />}{['high', 'urgent'].includes(t.priority) && <StatusBadge value={t.priority} />}{due && <span className={`badge ${due.tone}`}>{due.text}</span>}
  </div>; })}</div>;
}

export function ActivityList({ events }: { events: any[] }) {
  if (!events.length) return <Empty icon={<Activity size={20} />} title="No activity yet" />;
  return <div className="list">{events.map(e => <div key={e.id} className="list-item"><div className="main-col"><div className="title" style={{ fontWeight: 500, whiteSpace: 'normal' }}><b>{e.actor?.full_name || 'System'}</b> {describe(e)}</div><div className="meta">{date(e.created_at, true)}</div></div></div>)}</div>;
}
