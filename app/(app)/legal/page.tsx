'use client';
import { CompanyRecords } from '@/components/company-records';
import { ExportExcel } from '@/components/export-button';
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Scale, Plus, Library, Search, ShieldCheck, Cpu, Sparkles, Pencil , Upload, Trash2 } from 'lucide-react';
import { api, useApi, apiFetch } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { ProjectSelect, ProviderSelect } from '@/components/pickers';
import { RequestApproval } from '@/components/workflow';
import { PageHead, Card, Loading, ErrorNote, Empty, StatusBadge, RiskBadge, AuthorityBadge, Button, Tabs, Modal, Field, useToast, Notice, Segmented, AUTHORITY_TEXT } from '@/components/ui';
import { ago, label } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><Legal /></Suspense>; }

function Legal() {
  const sp = useSearchParams(); const router = useRouter(); const { can, me } = useApp(); const toastDel = useToast();
  const canDelete = (r: any) => ['admin', 'director', 'legal'].includes(me.role) || r.created_by === me.id;
  const removeReview = async (r: any) => { if (!window.confirm(`Delete the review “${r.title}”? This can't be undone.`)) return; try { await api.del(`/api/legal/reviews/${r.id}`); toastDel('Review deleted', 'success'); reload(); } catch (e: any) { toastDel(e.message, 'error'); } };
  const [tab, setTab] = useState<'reviews' | 'clauses' | 'records'>(sp.get('tab') === 'clauses' ? 'clauses' : sp.get('tab') === 'records' ? 'records' : 'reviews');
  const [running, setRunning] = useState(sp.get('new') === '1');
  const [rating, setRating] = useState('');
  const { data, error, loading, reload } = useApi<any>(`/api/legal/reviews${rating ? `?risk_rating=${rating}` : ''}`, [rating]);
  return <>
    <PageHead eyebrow="Knowledge & Legal" title="Legal AI" sub="Built-in contract analysis from your business's perspective — works without any AI key. Add an AI provider for deeper review."
      actions={<><ExportExcel kind="legal" />{can.write && <Button variant="primary" icon={<Scale size={15} />} onClick={() => setRunning(true)}>Review an agreement</Button>}</>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ value: 'reviews', label: 'Reviews', count: data?.reviews?.length }, { value: 'clauses', label: 'Clause library' }, { value: 'records', label: 'Company records' }]} />
    {tab === 'reviews' && <>
      <div className="filters"><Segmented value={rating} onChange={setRating} options={[{ value: '', label: 'All' }, { value: 'Critical', label: 'Critical' }, { value: 'High', label: 'High' }, { value: 'Medium', label: 'Medium' }, { value: 'Low', label: 'Low' }]} /></div>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading ? <Loading /> : !data?.reviews?.length ? <div className="card"><Empty icon={<Scale size={20} />} title="No reviews yet" action={can.write && <Button variant="primary" onClick={() => setRunning(true)}>Review an agreement</Button>}>The built-in engine segments the agreement, checks ~40 legal topics and 30+ business-side risk rules, finds missing protections, and compares wording to your clause library.</Empty></div>
        : <div className="card table-wrap"><table className="table"><thead><tr><th>Agreement</th><th>Risk</th><th>Status</th><th className="hide-sm">Engine</th><th className="hide-sm">Project</th><th className="hide-sm">Reviewed</th><th style={{ width: 44 }} /></tr></thead><tbody>
          {data.reviews.map((r: any) => <tr key={r.id} className="clickable" onClick={() => router.push(`/legal/${r.id}`)}><td><b>{r.title}</b>{r.ai_error && <div className="tiny" style={{ color: 'var(--amber)' }}>AI step skipped: {r.ai_error.slice(0, 80)}</div>}</td><td><RiskBadge value={r.risk_rating} /> <span className="tiny muted">{r.risk_score}/100</span></td><td><StatusBadge value={r.status} /></td><td className="hide-sm small">{r.engine === 'rules+ai' ? <span className="row" style={{ gap: 4 }}><Sparkles size={12} />Rules + {r.provider}</span> : <span className="row" style={{ gap: 4 }}><Cpu size={12} />Built-in rules</span>}</td><td className="hide-sm small">{r.project?.name || '—'}</td><td className="hide-sm small muted">{ago(r.created_at)}{r.author?.full_name ? ` · ${r.author.full_name}` : ''}</td><td onClick={e => e.stopPropagation()}>{canDelete(r) && <button className="icon-btn" title="Delete this review" aria-label={`Delete ${r.title}`} onClick={() => removeReview(r)}><Trash2 size={15} /></button>}</td></tr>)}
        </tbody></table></div>}
    </>}
    {tab === 'clauses' && <Clauses />}
    {tab === 'records' && <CompanyRecords />}
    <RunReview open={running} onClose={() => setRunning(false)} initialDoc={sp.get('doc')} initialProject={sp.get('project')} onDone={id => router.push(`/legal/${id}`)} />
  </>;
}

function RunReview({ open, onClose, initialDoc, initialProject, onDone }: { open: boolean; onClose: () => void; initialDoc: string | null; initialProject: string | null; onDone: (id: string) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'upload' | 'document' | 'paste'>(initialDoc ? 'document' : 'upload');
  const [file, setFile] = useState<File | null>(null); const [drag, setDrag] = useState(false);
  const [project, setProject] = useState<string | null>(initialProject);
  const [docId, setDocId] = useState<string>(initialDoc || '');
  const [text, setText] = useState(''); const [title, setTitle] = useState('');
  const [role, setRole] = useState(''); const [provider, setProvider] = useState('none');
  const [busy, setBusy] = useState(false); const [q, setQ] = useState('');
  const { data } = useApi<any>(open ? `/api/documents?status=indexed&limit=400${project ? `&project_id=${project}` : ''}` : null, [open, project]);
  const docs = (data?.documents || []).filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { if (initialDoc) setDocId(initialDoc); }, [initialDoc]);
  const run = async () => {
    if (mode === 'upload' && !file) return toast('Choose the agreement file (PDF, Word or photo)', 'error');
    if (mode === 'document' && !docId) return toast('Choose a document', 'error');
    if (mode === 'paste' && text.trim().length < 80) return toast('Paste the agreement text', 'error');
    setBusy(true);
    try {
      let useDoc = mode === 'document' ? docId : null;
      if (mode === 'upload' && file) {
        const fd = new FormData(); fd.append('file', file); if (project) fd.append('project_id', project); fd.append('category', 'contract');
        const res = await apiFetch('/api/documents/upload', { method: 'POST', body: fd }); const j = await res.json();
        const r0 = j.results?.[0];
        if (!res.ok || !r0?.document) throw new Error(r0?.error || j.error || 'Upload failed');
        useDoc = r0.document.id;
      }
      const r = await api.post('/api/legal/reviews', { document_id: useDoc, text: mode === 'paste' ? text : null, title: title || null, project_id: project, rhc_role: role || null, provider: provider === 'none' ? null : provider });
      if (r.ai_error) toast(`Built-in review complete. AI step: ${r.ai_error}`, 'error'); else toast('Review complete', 'success');
      onClose(); onDone(r.review.id);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="Review an agreement" size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} icon={<Scale size={15} />} onClick={run}>{busy ? (provider === 'none' ? 'Analysing…' : 'Analysing with AI — can take a minute…') : 'Run review'}</Button></>}>
    <div className="stack" style={{ gap: 14 }}>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'upload', label: 'Upload a file' }, { value: 'document', label: 'Stored document' }, { value: 'paste', label: 'Paste text' }]} />
      <div className="form-grid">
        <Field label="Project"><ProjectSelect value={project} onChange={setProject} noneLabel="All projects / none" /></Field>
        <Field label="Our role in the document" hint='Defined term used for us, e.g. "Purchaser", "Developer". Optional — improves accuracy.'><input className="input" value={role} onChange={e => setRole(e.target.value)} placeholder="Auto-detect" /></Field>
      </div>
      {mode === 'upload' ? <label className={`dropzone${drag ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
          style={{ display: 'grid', placeItems: 'center', gap: 6, padding: 28, border: `2px dashed ${drag ? 'var(--gold)' : 'var(--line)'}`, borderRadius: 12, cursor: 'pointer', background: drag ? 'var(--gold-soft)' : 'var(--surface-2)', textAlign: 'center' }}>
          <input type="file" hidden accept=".pdf,.doc,.docx,.txt,.rtf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
          <Upload size={22} className="muted" />
          {file ? <><b>{file.name}</b><span className="tiny muted">{(file.size / 1024).toFixed(0)} KB · click to choose another file</span></> : <><b>Drop the agreement here or click to choose</b><span className="tiny muted">PDF, Word, text or a photo/scan (read automatically). It is also saved to Documents.</span></>}
        </label>
      : mode === 'document' ? <div><div className="row mb12"><div className="search-input" style={{ flex: 1 }}><Search size={15} /><input className="input" placeholder="Find an indexed document" value={q} onChange={e => setQ(e.target.value)} /></div></div>
        <div className="card list" style={{ maxHeight: 260, overflowY: 'auto' }}>{docs.length === 0 ? <Empty title="No indexed documents">Upload the agreement in Documents first (or paste its text).</Empty> : docs.map((d: any) => <label key={d.id} className="list-item clickable"><input type="radio" name="doc" checked={docId === d.id} onChange={() => setDocId(d.id)} /><div className="main-col"><div className="title">{d.name}</div><div className="meta">{d.project?.name || 'Unassigned'} · {ago(d.updated_at)}</div></div><AuthorityBadge value={d.authority} /></label>)}</div></div>
        : <><Field label="Title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Harbourline MOU draft v2" /></Field><Field label="Agreement text"><textarea className="textarea" style={{ minHeight: 220 }} value={text} onChange={e => setText(e.target.value)} /></Field></>}
      <Field label="Analysis engine" hint="The built-in rules engine always runs. Choosing a provider adds an AI pass that deepens and checks the analysis.">
        <ProviderSelect value={provider} onChange={setProvider} builtin="Built-in rules engine only (no AI key needed)" />
      </Field>
      <Notice>Analysis assists you and your solicitors — it is not legal advice. Old or signed agreements are treated as precedent, never as approved positions.</Notice>
    </div>
  </Modal>;
}

function Clauses() {
  const { can } = useApp();
  const [editing, setEditing] = useState<any>(null);
  const [cat, setCat] = useState('');
  const { data, error, loading, reload } = useApi<any>('/api/legal/clauses');
  const topics: { key: string; label: string }[] = data?.topics || [];
  const tl = (k: string) => topics.find(t => t.key === k)?.label || label(k);
  const list = (data?.clauses || []).filter((c: any) => !cat || c.category === cat);
  return <>
    <div className="filters"><select className="select" value={cat} onChange={e => setCat(e.target.value)}><option value="">All topics</option>{topics.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select><span className="spacer" />{can.write && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing({})}>New clause position</Button>}</div>
    <Notice icon={<Library size={16} />}>The clause library holds your positions per topic. A clause only counts as an <b>approved position</b> once it is approved through Approvals. PREFERRED and FALLBACK are negotiation positions; HISTORICAL PRECEDENT is reference only. Approved clauses are used by Legal AI comparisons and by Drafting templates.</Notice>
    <div className="mt16">{error && <ErrorNote error={error} onRetry={reload} />}
      {loading ? <Loading /> : list.length === 0 ? <div className="card"><Empty icon={<Library size={20} />} title="No clause positions yet" action={can.write && <Button onClick={() => setEditing({})}>Add your first position</Button>}>Start with governing law, limitation of liability, exclusivity and confidentiality.</Empty></div> :
        <div className="grid g2">{list.map((c: any) => <div key={c.id} className="card" style={{ padding: 16 }}>
          <div className="row between"><div><div className="eyebrow" style={{ marginBottom: 2 }}>{tl(c.category)}</div><b>{c.name}</b></div><div className="row"><AuthorityBadge value={c.authority} /><StatusBadge value={c.status} /></div></div>
          {(c.clause_text || c.preferred_position) && <div className="small mt12" style={{ whiteSpace: 'pre-wrap' }}><b className="tiny muted">PREFERRED</b><div>{c.clause_text || c.preferred_position}</div></div>}
          {c.fallback_position && <div className="small mt8"><b className="tiny muted">FALLBACK</b><div>{c.fallback_position}</div></div>}
          {c.prohibited_position && <div className="small mt8" style={{ color: 'var(--red)' }}><b className="tiny">PROHIBITED</b><div>{c.prohibited_position}</div></div>}
          <div className="row mt12">{c.approver?.full_name && <span className="tiny muted">Approved by {c.approver.full_name}</span>}<span className="spacer" />{can.write && <Button size="xs" icon={<Pencil size={12} />} onClick={() => setEditing(c)}>Edit</Button>}{c.status !== 'approved' && <RequestApproval type="legal_clause" id={c.id} status={c.status} size="xs" onDone={reload} />}</div>
        </div>)}</div>}</div>
    <ClauseForm clause={editing} topics={topics} onClose={() => setEditing(null)} onSaved={reload} />
  </>;
}

function ClauseForm({ clause, topics, onClose, onSaved }: { clause: any; topics: { key: string; label: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (clause) setF({ name: '', category: 'governing_law', authority: 'preferred', clause_text: '', preferred_position: '', fallback_position: '', prohibited_position: '', notes: '', ...clause, keywords: (clause.keywords || []).join(', ') }); }, [clause]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try { const body = { name: f.name, category: f.category, authority: f.authority, clause_text: f.clause_text, preferred_position: f.preferred_position, fallback_position: f.fallback_position, prohibited_position: f.prohibited_position, keywords: f.keywords, notes: f.notes };
      const r = clause.id ? await api.patch(`/api/legal/clauses/${clause.id}`, body) : await api.post('/api/legal/clauses', body);
      toast(r.approval_voided ? 'Saved — wording changed, so it needs approval again' : 'Saved', r.approval_voided ? 'error' : 'success'); onSaved(); onClose(); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  return <Modal open={!!clause} onClose={onClose} title={clause?.id ? 'Edit clause position' : 'New clause position'} size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
    <div className="form-grid">
      <Field label="Name" className="full"><input className="input" value={f.name || ''} onChange={set('name')} placeholder="e.g. Standard limitation of liability" /></Field>
      <Field label="Topic"><select className="select" value={f.category} onChange={set('category')}>{topics.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
      <Field label="Proposed authority" hint="Becomes effective only after approval"><select className="select" value={f.authority} onChange={set('authority')}>{Object.entries(AUTHORITY_TEXT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Clause wording (used in Drafting)" className="full"><textarea className="textarea" value={f.clause_text || ''} onChange={set('clause_text')} /></Field>
      <Field label="Preferred position (compared by Legal AI)" className="full"><textarea className="textarea" value={f.preferred_position || ''} onChange={set('preferred_position')} /></Field>
      <Field label="Fallback position" className="full"><textarea className="textarea" value={f.fallback_position || ''} onChange={set('fallback_position')} /></Field>
      <Field label="Prohibited position (flagged if found)" className="full"><textarea className="textarea" value={f.prohibited_position || ''} onChange={set('prohibited_position')} /></Field>
      <Field label="Keywords" hint="Comma separated"><input className="input" value={f.keywords || ''} onChange={set('keywords')} /></Field>
      <Field label="Notes"><input className="input" value={f.notes || ''} onChange={set('notes')} /></Field>
    </div>
  </Modal>;
}
