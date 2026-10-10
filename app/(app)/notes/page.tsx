'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useOpenWindow } from '@/lib/client/nav-history';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Star, StickyNote, Trash2 } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { NoteForm } from '@/components/forms';
import { ProjectSelect } from '@/components/pickers';
import { PageHead, Loading, ErrorNote, Empty, Button, useToast, useConfirm } from '@/components/ui';
import { ago, colorFor, initials, personName } from '@/lib/client/format';

/** A team member's colour: the one they chose in My profile, or a fixed colour from their name. */
const personColor = (m: any) => (m?.color && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : colorFor(personName(m) || ''));

export default function Page() { return <Suspense fallback={<Loading />}><Notes /></Suspense>; }

function Notes() {
  const sp = useSearchParams(); const router = useRouter(); const win = useOpenWindow(); const { can } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const { members, me } = useApp();
  const [who, setWho] = useState('');
  const [q, setQ] = useState(''); const [search, setSearch] = useState(''); const [project, setProject] = useState<string | null>(null); const [important, setImportant] = useState(false);
  const [editing, setEditing] = useState<any>(sp.get('new') === '1' ? {} : null);
  const qs = new URLSearchParams({ ...(search ? { q: search } : {}), ...(project ? { project_id: project } : {}), ...(important ? { important: '1' } : {}), ...(who ? { assigned: who } : {}) }).toString();
  const { data, error, loading, reload } = useApi<any>(`/api/notes?${qs}`, [qs]);
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { const id = win.value; if (!id) { setEditing((e: any) => (e?.id ? null : e)); return; } if (data?.notes) { const n = data.notes.find((x: any) => x.id === id); if (n) setEditing({ ...n, assigned_to: n.assigned_to || '' }); } }, [data, win.value]);
  const closeForm = () => { if (win.value) win.close(); else setEditing(null); };
  const toggleStar = async (n: any) => { try { await api.patch(`/api/notes/${n.id}`, { important: !n.important }); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const del = async (n: any) => { if (!(await confirm({ title: 'Delete note?', confirm: 'Delete', danger: true }))) return; try { await api.del(`/api/notes/${n.id}`); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  return <>
    <PageHead eyebrow="Knowledge" title="Notes" sub="Important project and business notes — searchable, and used by Infinity AI as context." actions={can.write && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing({})}>New note</Button>} />
    <div className="filters"><div className="search-input" style={{ flex: '1 1 260px' }}><Search size={15} /><input className="input" placeholder="Search notes" value={q} onChange={e => setQ(e.target.value)} /></div><ProjectSelect value={project} onChange={setProject} noneLabel="All projects" /><label className="check small"><input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} /> Important only</label></div>
    <div className="mail-filters">{[{ v: '', l: 'All notes' }, { v: 'me', l: 'Mine' }, { v: 'general', l: 'General' }].map(x => <button key={x.v} className={who === x.v ? 'on' : ''} onClick={() => setWho(x.v)}>{x.l}</button>)}
      {members.filter(m => m.role !== 'viewer' && m.id !== me.id).map(m => <button key={m.id} className={who === m.id ? 'on' : ''} onClick={() => setWho(m.id)} style={who === m.id ? undefined : { borderColor: personColor(m) }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: personColor(m), marginRight: 5 }} />{(personName(m) || '').split(' ')[0]}</button>)}</div>
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading ? <Loading /> : !data?.notes?.length ? <div className="card"><Empty icon={<StickyNote size={20} />} title="No notes found" /></div> :
      <div className="grid g3">{data.notes.map((n: any) => <div key={n.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', ...(n.assignee ? { borderTop: `4px solid ${personColor(n.assignee)}`, background: `${personColor(n.assignee)}0d` } : {}) }} onClick={() => { setEditing({ ...n, assigned_to: n.assigned_to || '' }); win.open(n.id); }}>
        {n.assignee && <div className="row" style={{ gap: 6 }}><span className="avatar sm" style={{ background: personColor(n.assignee) }}>{initials(n.assignee.full_name || n.assignee.email)}</span><span className="tiny" style={{ color: personColor(n.assignee), fontWeight: 700 }}>For {n.assignee.id === me.id ? 'you' : n.assignee.full_name || n.assignee.email}</span></div>}
        <div className="row"><b style={{ flex: 1 }}>{n.title}</b><button onClick={e => { e.stopPropagation(); toggleStar(n); }} disabled={!can.write} title="Important"><Star size={16} color={n.important ? 'var(--gold)' : 'var(--ink-4)'} fill={n.important ? 'var(--gold)' : 'none'} /></button></div>
        <div className="small" dir="auto" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)', maxHeight: 160, overflow: 'hidden' }}>{n.body}</div>
        <div className="row tiny muted" style={{ marginTop: 'auto' }}>{n.project ? <Link className="link" href={`/projects/${n.project.id}`} onClick={e => e.stopPropagation()}>{n.project.name}</Link> : 'General'} · {n.author?.full_name} · {ago(n.updated_at)}<span className="spacer" />{can.write && <button onClick={e => { e.stopPropagation(); del(n); }}><Trash2 size={13} /></button>}</div>
      </div>)}</div>}
    <NoteForm open={!!editing} onClose={closeForm} initial={editing?.id ? editing : editing || undefined} onSaved={() => reload()} />
  </>;
}
