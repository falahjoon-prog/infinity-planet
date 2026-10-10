'use client';
import { useOpenWindow } from '@/lib/client/nav-history';
import { SplitHandle } from '@/components/split-handle';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Plus, Upload, Scale, FileSignature, Palette, Mail, CalendarDays, MessagesSquare, Archive, Star, MapPin, CheckCircle2, Activity, Users } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { AiChat } from '@/components/ai-chat';
import { DocViewer } from '@/components/doc-viewer';
import { UploadDialog } from '@/components/workflow';
import { PageHead, Card, Loading, ErrorNote, Empty, StatusBadge, RiskBadge, AuthorityBadge, Button, Tabs, KV, useToast, useConfirm, Markdown } from '@/components/ui';
import { ProjectForm, DealForm, TaskForm, NoteForm, EventForm, ContactForm, PROJECT_STATUSES } from '@/components/forms';
import { money, date, ago, dueLabel, label } from '@/lib/client/format';
import { TaskList, ActivityList } from '@/components/lists';

type Tab = 'overview' | 'deals' | 'documents' | 'tasks' | 'notes' | 'ai' | 'legal' | 'marketing' | 'emails' | 'calendar' | 'contacts' | 'approvals' | 'activity';

export default function Page() { return <Suspense fallback={<Loading />}><Workspace /></Suspense>; }

function Workspace() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams(); const router = useRouter();
  const { can, refreshProjects } = useApp();
  const toast = useToast(); const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'overview');
  const { data: d, error, loading, reload } = useApi<any>(`/api/projects/${id}`, [id]);
  const [modal, setModal] = useState<null | 'edit' | 'deal' | 'task' | 'note' | 'event' | 'upload' | 'contact'>(null);
  const [editing, setEditing] = useState<any>(null);
  const win = useOpenWindow('doc'); const doc = win.value; // an open document lives in the address, so Back closes it
  if (loading && !d) return <Loading />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!d) return null;
  const p = d.project;
  const openTasks = d.tasks.filter((t: any) => t.status !== 'done');
  const overdue = openTasks.filter((t: any) => t.due_at && new Date(t.due_at) < new Date());
  const setStage = async (status: string) => { try { await api.patch(`/api/projects/${id}`, { status }); toast(`Moved to ${label(status)}`, 'success'); reload(); refreshProjects(); } catch (e: any) { toast(e.message, 'error'); } };
  const archive = async () => { if (!(await confirm({ title: 'Archive project?', body: 'The project is hidden from active lists. Documents, history and the audit trail are kept.', confirm: 'Archive', danger: true }))) return; try { await api.del(`/api/projects/${id}`); refreshProjects(); router.push('/projects'); } catch (e: any) { toast(e.message, 'error'); } };
  const toggleTask = async (t: any) => { try { await api.patch(`/api/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' }); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const openChannel = async () => { try { const r = await api.post('/api/team/channels', { project_id: id }); router.push(`/team?channel=${r.channel.slug}`); } catch (e: any) { toast(e.message, 'error'); } };
  const pendingApprovals = d.approvals.filter((a: any) => a.status === 'pending').length;
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' }, { value: 'deals', label: 'Deals', count: d.deals.length }, { value: 'documents', label: 'Documents', count: d.documents.length },
    { value: 'tasks', label: 'Tasks', count: openTasks.length }, { value: 'notes', label: 'Notes', count: d.notes.length }, { value: 'ai', label: 'AI' }, { value: 'legal', label: 'Legal', count: d.reviews.length },
    { value: 'marketing', label: 'Marketing', count: d.marketing.length + d.generated.length }, { value: 'emails', label: 'Emails', count: d.emails.length + d.email_drafts.length },
    { value: 'calendar', label: 'Calendar', count: d.events.length }, { value: 'contacts', label: 'Contacts', count: d.contacts.length }, { value: 'approvals', label: 'Approvals', count: pendingApprovals }, { value: 'activity', label: 'Activity' },
  ];
  return <>
    <PageHead back={{ href: '/projects', label: 'Projects' }} eyebrow={<>{label(p.status)}</>} title={p.name}
      sub={<span className="row wrap" style={{ gap: 8 }}>{p.location && <span className="row" style={{ gap: 4 }}><MapPin size={13} />{p.location}</span>}{p.project_type && <span>· {p.project_type}</span>}<RiskBadge value={p.risk} /><StatusBadge value={p.status} /></span>}
      actions={can.write && <>
        <select className="select" style={{ width: 'auto' }} value={p.status} onChange={e => setStage(e.target.value)} title="Project stage">{PROJECT_STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
        <Button icon={<MessagesSquare size={15} />} onClick={openChannel}>Chat</Button>
        <Button icon={<Pencil size={15} />} onClick={() => setModal('edit')}>Edit</Button>
        {can.admin && <Button variant="ghost" icon={<Archive size={15} />} onClick={archive} title="Archive" />}
      </>} />
    <Tabs value={tab} onChange={v => { setTab(v); router.replace(`/projects/${id}?tab=${v}`, { scroll: false }); }} tabs={tabs} />

    {tab === 'overview' && <div className="grid g-main"><SplitHandle id="project-side" edge="last" cssVar="--split-side" min={260} max={640} minOther={520} />
      <div className="stack">
        <div className="kpis k4">
          <div className="kpi"><div className="label">Project value</div><div className="value">{money(p.deal_value, true)}</div></div>
          <div className="kpi"><div className="label">Pipeline</div><div className="value">{money(d.deals.filter((x: any) => !['completed', 'lost'].includes(x.stage)).reduce((n: number, x: any) => n + (Number(x.expected_value) || 0), 0), true)}</div><div className="hint">{d.deals.length} deal(s)</div></div>
          <div className={`kpi ${overdue.length ? 'alert' : ''}`}><div className="label">Open tasks</div><div className="value">{openTasks.length}</div><div className="hint">{overdue.length} overdue</div></div>
          <div className="kpi"><div className="label">Legal reviews</div><div className="value">{d.reviews.length}</div><div className="hint">{d.reviews[0] ? `Latest: ${d.reviews[0].risk_rating || 'unrated'}` : 'None yet'}</div></div>
        </div>
        <Card title="Overview" actions={can.write && <Button size="sm" icon={<Pencil size={13} />} onClick={() => setModal('edit')}>Edit</Button>}>
          {p.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p> : <p className="muted">No description yet.</p>}
          <div className="divider" />
          <KV items={[['Counterparty', p.counterparty], ['Owner', p.owner?.full_name], ['Next action', p.next_action ? <>{p.next_action}{p.next_action_at && <span className="muted"> · {date(p.next_action_at)}</span>}</> : <span className="muted">Not set</span>], ['Highlights', p.highlights ? <span style={{ whiteSpace: 'pre-wrap' }}>{p.highlights}</span> : null], ['Created', date(p.created_at)]]} />
        </Card>
        <Card title="Open work" flush actions={can.write && <Button size="sm" icon={<Plus size={13} />} onClick={() => { setEditing({ project_id: id }); setModal('task'); }}>Task</Button>}>
          <TaskList tasks={openTasks.slice(0, 8)} onToggle={toggleTask} onOpen={t => { setEditing(t); setModal('task'); }} />
        </Card>
      </div>
      <div className="stack">
        <Card title="Quick actions"><div className="grid g2" style={{ gap: 8 }}>
          <Button icon={<Upload size={15} />} onClick={() => setModal('upload')} disabled={!can.write}>Upload</Button>
          <Link className="btn" href={`/legal?new=1&project=${id}`}><Scale size={15} />Legal review</Link>
          <Link className="btn" href={`/drafting?new=1&project=${id}`}><FileSignature size={15} />Draft document</Link>
          <Link className="btn" href={`/designer?new=1&project=${id}`}><Palette size={15} />Design</Link>
          <Link className="btn" href={`/gmail?compose=1&project=${id}`}><Mail size={15} />Email</Link>
          <Button icon={<CalendarDays size={15} />} onClick={() => { setEditing({ project_id: id }); setModal('event'); }} disabled={!can.write}>Meeting</Button>
        </div></Card>
        <Card title="Important notes" flush actions={can.write && <Button size="sm" icon={<Plus size={13} />} onClick={() => { setEditing({ project_id: id }); setModal('note'); }}>Note</Button>}>
          {d.notes.length === 0 ? <Empty title="No notes yet" /> : <div className="list">{d.notes.slice(0, 5).map((n: any) => <button key={n.id} className="list-item" onClick={() => { setEditing(n); setModal('note'); }}>{n.important && <Star size={14} color="var(--gold)" fill="var(--gold)" />}<div className="main-col"><div className="title">{n.title}</div><div className="meta">{n.body}</div></div></button>)}</div>}
        </Card>
        <Card title="Recent activity" flush><ActivityList events={d.activity.slice(0, 8)} /></Card>
      </div>
    </div>}

    {tab === 'deals' && <Card title="Deals" flush actions={can.write && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => { setEditing({ project_id: id, counterparty: p.counterparty || '' }); setModal('deal'); }}>New deal</Button>}>
      {d.deals.length === 0 ? <Empty title="No deals on this project" /> : <div className="table-wrap"><table className="table"><thead><tr><th>Deal</th><th>Stage</th><th>Value</th><th>Prob.</th><th className="hide-sm">Next action</th></tr></thead><tbody>
        {d.deals.map((x: any) => <tr key={x.id} className="clickable" onClick={() => router.push(`/crm/${x.id}`)}><td><b>{x.title || x.counterparty}</b><div className="tiny muted">{x.counterparty}</div></td><td><StatusBadge value={x.stage} /></td><td>{money(x.expected_value, true)}</td><td>{x.probability}%</td><td className="hide-sm small">{x.next_action || '—'}</td></tr>)}
      </tbody></table></div>}
    </Card>}

    {tab === 'documents' && <Card title="Documents" flush actions={can.write && <Button size="sm" variant="primary" icon={<Upload size={13} />} onClick={() => setModal('upload')}>Upload</Button>}>
      {d.documents.length === 0 ? <Empty title="No documents yet" /> : <div className="list">{d.documents.map((x: any) => <button key={x.id} className="list-item" onClick={() => win.open(x.id)}><div className="main-col"><div className="title">{x.name}</div><div className="meta">{x.source === 'google_drive' ? 'Google Drive · ' : ''}{ago(x.updated_at)}</div></div><AuthorityBadge value={x.authority} /><StatusBadge value={x.review_status === 'unreviewed' ? null : x.review_status} /><StatusBadge value={x.status} /></button>)}</div>}
    </Card>}

    {tab === 'tasks' && <Card title="Tasks" flush actions={can.write && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => { setEditing({ project_id: id }); setModal('task'); }}>New task</Button>}>
      <TaskList tasks={d.tasks} onToggle={toggleTask} onOpen={t => { setEditing(t); setModal('task'); }} />
    </Card>}

    {tab === 'notes' && <Card title="Notes" flush actions={can.write && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => { setEditing({ project_id: id }); setModal('note'); }}>New note</Button>}>
      {d.notes.length === 0 ? <Empty title="No notes yet" /> : <div className="list">{d.notes.map((n: any) => <button key={n.id} className="list-item" style={{ alignItems: 'flex-start' }} onClick={() => { setEditing(n); setModal('note'); }}>{n.important ? <Star size={15} color="var(--gold)" fill="var(--gold)" /> : <span style={{ width: 15 }} />}<div className="main-col"><div className="title">{n.title}</div><div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.body.slice(0, 600)}</div><div className="meta">{n.author?.full_name} · {ago(n.updated_at)}</div></div></button>)}</div>}
    </Card>}

    {tab === 'ai' && <AiChat projectId={id} height={680} />}

    {tab === 'legal' && <Card title="Legal reviews" flush actions={<Link className="btn sm primary" href={`/legal?new=1&project=${id}`}><Scale size={13} />New review</Link>}>
      {d.reviews.length === 0 ? <Empty title="No legal reviews yet">Upload an agreement and run the built-in Legal AI.</Empty> : <div className="list">{d.reviews.map((r: any) => <Link key={r.id} href={`/legal/${r.id}`} className="list-item"><div className="main-col"><div className="title">{r.title}</div><div className="meta">{label(r.engine)}{r.provider ? ` · ${r.provider}` : ''} · {ago(r.created_at)}</div></div><StatusBadge value={r.status} /><RiskBadge value={r.risk_rating} /></Link>)}</div>}
    </Card>}

    {tab === 'marketing' && <div className="grid g2">
      <Card title="Marketing & designs" flush actions={<><Link className="btn sm" href={`/marketing?project=${id}`}>Copy</Link><Link className="btn sm primary" href={`/designer?new=1&project=${id}`}><Palette size={13} />Design</Link></>}>
        {d.marketing.length === 0 ? <Empty title="No marketing assets yet" /> : <div className="list">{d.marketing.map((m: any) => <Link key={m.id} href={m.kind === 'design' ? `/designer?id=${m.id}` : `/marketing?open=${m.id}`} className="list-item"><div className="main-col"><div className="title">{m.title}</div><div className="meta">{m.kind === 'design' ? 'Design' : 'Copy'} · {ago(m.updated_at)}</div></div><StatusBadge value={m.status} /></Link>)}</div>}
      </Card>
      <Card title="Generated documents" flush actions={<Link className="btn sm primary" href={`/drafting?new=1&project=${id}`}><FileSignature size={13} />Draft</Link>}>
        {d.generated.length === 0 ? <Empty title="No generated documents yet" /> : <div className="list">{d.generated.map((g: any) => <Link key={g.id} href={`/drafting/${g.id}`} className="list-item"><div className="main-col"><div className="title">{g.title}</div><div className="meta">{label(g.doc_type)} · {ago(g.updated_at)}</div></div><StatusBadge value={g.status} /></Link>)}</div>}
      </Card>
    </div>}

    {tab === 'emails' && <div className="grid g2">
      <Card title="Linked emails" flush actions={<Link className="btn sm" href="/gmail">Open Gmail</Link>}>
        {d.emails.length === 0 ? <Empty title="No linked emails">In Gmail, open a message and link it to this project.</Empty> : <div className="list">{d.emails.map((e: any) => <Link key={e.id} href={`/gmail?open=${e.gmail_message_id}`} className="list-item"><div className="main-col"><div className="title">{e.subject || '(no subject)'}</div><div className="meta">{e.from_address} · {date(e.sent_at)}</div></div></Link>)}</div>}
      </Card>
      <Card title="Drafts & sent" flush actions={<Link className="btn sm primary" href={`/gmail?compose=1&project=${id}`}><Mail size={13} />Compose</Link>}>
        {d.email_drafts.length === 0 ? <Empty title="No drafts" /> : <div className="list">{d.email_drafts.map((e: any) => <Link key={e.id} href={`/gmail?tab=drafts&draft=${e.id}`} className="list-item"><div className="main-col"><div className="title">{e.subject}</div><div className="meta">To {e.to_addresses} · {ago(e.sent_at || e.updated_at)}</div></div><StatusBadge value={e.status} /></Link>)}</div>}
      </Card>
    </div>}

    {tab === 'calendar' && <Card title="Meetings & events" flush actions={can.write && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => { setEditing({ project_id: id }); setModal('event'); }}>New meeting</Button>}>
      {d.events.length === 0 ? <Empty title="No meetings scheduled" /> : <div className="list">{d.events.map((e: any) => <button key={e.id} className="list-item" onClick={() => { setEditing(e); setModal('event'); }}><div className="tl-icon"><CalendarDays size={14} /></div><div className="main-col"><div className="title">{e.title}</div><div className="meta">{date(e.starts_at, true)}{e.location ? ` · ${e.location}` : ''}</div></div>{e.external_id && <span className="badge green">Google</span>}{new Date(e.starts_at) < new Date() && <span className="badge">Past</span>}</button>)}</div>}
    </Card>}

    {tab === 'contacts' && <Card title="Contacts & counterparties" flush actions={can.write && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => { setEditing({ project_id: id }); setModal('contact'); }}>New contact</Button>}>
      {d.contacts.length === 0 ? <Empty icon={<Users size={20} />} title="No contacts yet" /> : <div className="list">{d.contacts.map((c: any) => <button key={c.id} className="list-item" onClick={() => { setEditing(c); setModal('contact'); }}><div className="main-col"><div className="title">{c.full_name}</div><div className="meta">{[c.position, c.counterparty?.name, c.email, c.phone].filter(Boolean).join(' · ')}</div></div></button>)}</div>}
    </Card>}

    {tab === 'approvals' && <Card title="Approvals" flush>{d.approvals.length === 0 ? <Empty title="No approvals for this project" /> : <div className="list">{d.approvals.map((a: any) => <Link key={a.id} href={`/approvals?open=${a.id}`} className="list-item"><div className="main-col"><div className="title">{a.title}</div><div className="meta">{label(a.category)} · {ago(a.created_at)}{a.decision_note ? ` · “${a.decision_note}”` : ''}</div></div><StatusBadge value={a.status} /></Link>)}</div>}</Card>}

    {tab === 'activity' && <Card title="Activity history" flush><ActivityList events={d.activity} /></Card>}

    <ProjectForm open={modal === 'edit'} onClose={() => setModal(null)} initial={p} onSaved={() => reload()} />
    <DealForm open={modal === 'deal'} onClose={() => setModal(null)} initial={editing} onSaved={() => reload()} />
    <TaskForm open={modal === 'task'} onClose={() => setModal(null)} initial={editing} onSaved={() => reload()} />
    <NoteForm open={modal === 'note'} onClose={() => setModal(null)} initial={editing} onSaved={() => reload()} />
    <EventForm open={modal === 'event'} onClose={() => setModal(null)} initial={editing} onSaved={() => reload()} />
    <ContactForm open={modal === 'contact'} onClose={() => setModal(null)} initial={editing} onSaved={() => reload()} />
    <UploadDialog open={modal === 'upload'} onClose={() => setModal(null)} onDone={() => reload()} projectId={id} />
    <DocViewer id={doc} onClose={() => win.close()} onChanged={reload} />
  </>;
}

