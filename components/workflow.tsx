'use client';
import React, { useState } from 'react';
import { ShieldCheck, Upload, FileText, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Modal, Button, Field, useToast, StatusBadge, Notice } from './ui';
import { MemberSelect, ProjectSelect } from './pickers';
import { useApp } from './app-context';
import { ago, bytes, label, personName } from '@/lib/client/format';

/** "Request approval" button + dialog for any approvable entity. */
const CATEGORY_OF: Record<string, string> = { contract_review: 'legal', legal_clause: 'legal', marketing_asset: 'marketing', email_draft: 'email', generated_document: 'document', document: 'document', template: 'template' };
const APPROVER_ROLES: Record<string, string[]> = { legal: ['admin', 'director', 'legal'], contract: ['admin', 'director', 'legal'], marketing: ['admin', 'director', 'marketing'], email: ['admin', 'director', 'manager'], document: ['admin', 'director', 'manager', 'legal'], template: ['admin', 'director', 'legal', 'marketing'], general: ['admin', 'director', 'manager'] };

/** Choose who approves: only the people ticked can approve (and change the item while it is under approval); everyone else can view and comment. */
export function ApproverPicker({ value, onChange, type, exclude }: { value: string[]; onChange: (v: string[]) => void; type: string; exclude?: string }) {
  const { members } = useApp();
  const usual = APPROVER_ROLES[CATEGORY_OF[type] || 'general'] || APPROVER_ROLES.general;
  const list = members.filter(m => m.role !== 'viewer').sort((a, b) => Number(usual.includes(b.role)) - Number(usual.includes(a.role)) || String(personName(a)).localeCompare(String(personName(b))));
  return <div className="card list" style={{ maxHeight: 240, overflowY: 'auto' }}>{list.map(m => <label key={m.id} className="list-item clickable" style={{ opacity: m.id === exclude ? 0.6 : 1 }}>
    <input type="checkbox" checked={value.includes(m.id)} onChange={e => onChange(e.target.checked ? [...value, m.id] : value.filter(x => x !== m.id))} />
    <div className="main-col"><div className="title small">{personName(m)}{m.id === exclude ? ' (you)' : ''}</div><div className="meta">{label(m.role)}{usual.includes(m.role) ? ' · usually approves this' : ''}</div></div></label>)}</div>;
}

export function RequestApproval({ type, id, status, onDone, label: btnLabel = 'Request approval', size, iconOnly }: { type: string; id: string; status?: string; onDone?: () => void; label?: string; size?: 'sm' | 'xs'; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast(); const { can, me } = useApp();
  if (!can.write) return null;
  const pending = status === 'awaiting_approval' || status === 'awaiting_review' || (status === 'under_review' && (type === 'template' || type === 'legal_clause'));
  if (pending) return iconOnly ? <span className="badge purple" title="Awaiting approval"><ShieldCheck size={12} /></span> : <span className="badge purple"><ShieldCheck size={12} /> Awaiting approval</span>;
  const submit = async () => {
    if (!approvers.length) return toast('Choose who will approve it', 'error');
    setBusy(true);
    try { await api.post('/api/approvals', { entity_type: type, entity_id: id, approvers, summary }); toast('Approval requested', 'success'); setOpen(false); setApprovers([]); onDone?.(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <>
    {iconOnly ? <button type="button" className="btn ghost xs" title={btnLabel} aria-label={btnLabel} onClick={() => setOpen(true)}><ShieldCheck size={13} /></button> : <Button size={size} variant="gold" icon={<ShieldCheck size={14} />} onClick={() => setOpen(true)}>{btnLabel}</Button>}
    <Modal open={open} onClose={() => setOpen(false)} title="Request approval" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!approvers.length} onClick={submit}>Send for approval</Button></>}>
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Who approves? (required)" hint="Only the people ticked can approve it or change it while it is under approval. Everyone else can see it and comment."><ApproverPicker value={approvers} onChange={setApprovers} type={type} exclude={me.id} /></Field>
        <Field label="Note to the approver"><textarea className="textarea" value={summary} onChange={e => setSummary(e.target.value)} placeholder="What should they focus on?" /></Field>
      </div>
    </Modal>
  </>;
}

export function ApprovalTrail({ approvals }: { approvals: any[] }) {
  if (!approvals?.length) return null;
  return <div className="stack" style={{ gap: 8 }}>{approvals.map(a => <div key={a.id} className="notice" style={{ alignItems: 'center' }}><ShieldCheck size={15} /><div style={{ flex: 1 }}><b>{({ pending: 'Approval pending', approved: 'Approved', rejected: 'Rejected', changes_requested: 'Changes requested', cancelled: 'Request cancelled' } as Record<string, string>)[a.status] || a.status}</b>{a.decider?.full_name ? ` by ${a.decider.full_name}` : ''} · {ago(a.decided_at || a.created_at)}{a.decision_note && <div className="small mt8">“{a.decision_note}”</div>}</div><StatusBadge value={a.status} /></div>)}</div>;
}

const AUTH_OPTIONS = [['draft', 'Draft (not approved)'], ['historical_precedent', 'Old or signed agreement — reference only'], ['fallback', 'Fallback position'], ['preferred', 'Preferred position'], ['approved', 'Approved wording']];
const UP_CATS: [string, string][] = [['', 'General'], ['agreement', 'Agreement'], ['mou', 'MOU'], ['contract', 'Contract'], ['correspondence', 'Letter / email'], ['financial', 'Financial'], ['planning', 'Planning'], ['marketing', 'Marketing'], ['due_diligence', 'Due diligence'], ['report', 'Report'], ['template', 'Template'], ['brand_book', '★ Brand book']];

export function UploadDialog({ open, onClose, projectId, dealId, onDone }: { open: boolean; onClose: () => void; projectId?: string | null; dealId?: string | null; onDone?: (results: any[]) => void }) {
  const toast = useToast(); const { me } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [project, setProject] = useState<string | null>(projectId || null);
  const [authority, setAuthority] = useState('draft');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  React.useEffect(() => { if (open) { setFiles([]); setResults(null); setProject(projectId || null); setAuthority('draft'); } }, [open, projectId]);
  const canClassify = ['admin', 'director', 'legal'].includes(me.role);
  const submit = async () => {
    if (!files.length) return;
    setBusy(true);
    const fd = new FormData(); files.forEach(f => fd.append('file', f));
    if (project) fd.append('project_id', project); if (dealId) fd.append('deal_id', dealId);
    fd.append('authority', authority); if (category) fd.append('category', category);
    try { const r = await api.post('/api/documents/upload', fd); setResults(r.results); onDone?.(r.results); toast(`${r.uploaded} uploaded${r.failed ? `, ${r.failed} failed` : ''}`, r.failed ? 'error' : 'success'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="Upload documents" size="wide" footer={results ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!files.length} onClick={submit}>Upload {files.length || ''}</Button></>}>
    {results ? <div className="list card">{results.map((r, i) => <div key={i} className="list-item"><div className="main-col"><div className="title">{r.name}</div><div className="meta">{r.error ? r.error : r.extraction.needsOcr ? 'Stored — scanned, needs OCR (open it to run OCR)' : r.extraction.status === 'indexed' ? `Indexed · ${r.extraction.chunks} passages${r.extraction.pages ? ` · ${r.extraction.pages} pages` : ''}` : `Stored · ${r.extraction.status}`}</div></div><StatusBadge value={r.error ? 'failed' : r.extraction.status} /></div>)}</div> :
    <div className="stack" style={{ gap: 16 }}>
      <label className={`dropzone2${over ? ' on' : ''}${files.length ? ' has' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); setFiles(f => [...f, ...Array.from(e.dataTransfer.files)]); }}>
        <span className="dz-icon"><Upload size={20} /></span>
        <span className="dz-text"><b>{files.length ? 'Add more files' : 'Choose files to upload'}</b><small>or drag them here · PDF, Word, Excel, text or photos · up to 50 MB each</small></span>
        <span className="btn primary sm dz-btn">Browse…</span>
        <input type="file" multiple hidden onChange={e => { setFiles(f => [...f, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
      </label>
      {files.length > 0 && <div className="up-files">{files.map((f, i) => <div key={i} className="up-file"><FileText size={15} /><span className="nm">{f.name}</span><span className="muted small">{bytes(f.size)}</span><button className="icon-btn" title="Remove" onClick={() => setFiles(x => x.filter((_, j) => j !== i))}><X size={14} /></button></div>)}</div>}
      <div className="field"><span>What is it?</span><div className="pick-chips">{UP_CATS.map(([v, l]) => <button key={v || 'gen'} type="button" className={category === v ? 'on' : ''} onClick={() => setCategory(v)}>{l}</button>)}</div></div>
      <div className="form-grid">
        <Field label="Project"><ProjectSelect value={project} onChange={setProject} /></Field>
        <Field label="Status"><select className="select" value={authority} onChange={e => setAuthority(e.target.value)}>{AUTH_OPTIONS.map(([v, l]) => <option key={v} value={v} disabled={!canClassify && !['draft', 'historical_precedent'].includes(v)}>{l}</option>)}</select></Field>
      </div>
      <div className="tiny muted">Files are stored privately and read so the AI and search can use them. Only legal staff and directors can mark wording as approved, preferred or fallback.</div>
    </div>}
  </Modal>;
}
