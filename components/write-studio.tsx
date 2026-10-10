'use client';
import { SplitHandle } from '@/components/split-handle';
/**
 * Write — a conversation on the left, the live document on the right.
 * Details (project, recipient, sender, layout, length, writer) sit in one slim bar and can be changed any time.
 * Finalise (admins/directors) saves, records the approval and gives the final PDF/Word with no DRAFT mark.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { personName } from '@/lib/client/format';
import Link from 'next/link';
import { Save, Copy, Download, CheckCircle2, Send, ChevronDown, X, FileText, RotateCcw } from 'lucide-react';
import { api, useApi, downloadBlob } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { ProjectSelect, ProviderSelect } from '@/components/pickers';
import { RecipientFields, SenderSelect, LetterheadPreview, Recipient } from '@/components/doc-studio';
import { WriteChat } from '@/components/write-chat';
import { Button, StatusBadge, useToast, useConfirm, Notice } from '@/components/ui';

const EXEC = ['admin', 'director'];

function ProjectInfo({ projectId }: { projectId: string | null }) {
  const { data } = useApi<any>(projectId ? `/api/projects/${projectId}` : null, [projectId]);
  if (!projectId || !data) return null;
  const p = data.project || {};
  const n = [p.description, p.location, p.deal_value, p.highlights, (data.documents || []).some((d: any) => d.status === 'indexed'), (data.deals || []).length + (data.contacts || []).length].filter(Boolean).length;
  const tone = n >= 4 ? 'good' : n >= 2 ? 'mid' : 'low';
  return <Link href={`/projects/${projectId}`} className={`info-dot ${tone}`} title={`${n} of 6 kinds of project information recorded (description, location, value, highlights, documents, deals/contacts). Click to add more.`}>{n}/6 info</Link>;
}

export function WriteStudio({ initialProject, onSaved }: { initialProject?: string | null; onSaved?: () => void }) {
  const { me } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const { data: mk } = useApi<any>('/api/templates?kind=marketing');
  const { data: dk } = useApi<any>('/api/templates?kind=document');
  const starts = useMemo(() => [
    ...(mk?.templates || []).map((t: any) => ({ ...t, group: 'Marketing' })),
    ...(dk?.templates || []).filter((t: any) => ['letter', 'correspondence', 'offer', 'proposal', 'report'].includes(t.category)).map((t: any) => ({ ...t, group: 'Letters, proposals & reports' })),
  ], [mk, dk]);
  const [tplId, setTplId] = useState<string>('');
  const [project, setProject] = useState<string | null>(initialProject || null);
  const [to, setTo] = useState<Recipient>({}); const [toOpen, setToOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(me.id);
  const [format, setFormat] = useState<'auto' | 'document' | 'letter'>('auto');
  const [length, setLength] = useState<'brief' | 'standard' | 'comprehensive'>('standard');
  const [provider, setProvider] = useState('auto');
  // The date printed on the document: today unless changed. Changing it updates the date already in the draft.
  const todayIso = () => new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10);
  const [docDate, setDocDate] = useState<string>(todayIso);
  const dateWords = (iso: string) => new Date(`${iso}T12:00:00+10:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' });
  const changeDate = (iso: string) => { if (!iso) return; const was = dateWords(docDate), now = dateWords(iso); setDocDate(iso); setDoc(d => d && was !== now ? d.split(was).join(now) : d); setPvKey(k => k + 1); };
  const [doc, setDoc] = useState(''); const [title, setTitle] = useState(''); const [kind, setKind] = useState<string | null>(null);
  const [view, setView] = useState<'page' | 'text'>('page'); const [pvKey, setPvKey] = useState(0);
  const [asset, setAsset] = useState<{ id: string; status: string; saved: string; savedTitle: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); const [warning, setWarning] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const toRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!toOpen) return; const h = (e: MouseEvent) => { if (toRef.current && !toRef.current.contains(e.target as Node)) setToOpen(false); }; setTimeout(() => document.addEventListener('mousedown', h)); return () => document.removeEventListener('mousedown', h); }, [toOpen]);

  const dirty = !!asset && (asset.saved !== doc || asset.savedTitle !== title);
  const status = !asset ? null : dirty ? 'draft' : asset.status;
  const isExec = EXEC.includes(me.role);
  const toLabel = [to.name, to.company].filter(Boolean).join(', ');

  const onDoc = (c: string) => { setDoc(c); setPvKey(k => k + 1); };
  const save = async (): Promise<string | null> => {
    if (!doc.trim()) return null;
    try {
      if (!asset) { const r = await api.post('/api/marketing/assets', { title: title || 'Untitled', content: doc, project_id: project, template_id: tplId || null, kind: 'copy', engine: 'writer' }); setAsset({ id: r.asset.id, status: r.asset.status, saved: doc, savedTitle: title }); onSaved?.(); return r.asset.id; }
      if (dirty) { const r = await api.patch(`/api/marketing/assets/${asset.id}`, { title: title || 'Untitled', content: doc }); setAsset({ id: asset.id, status: r.asset?.status || 'draft', saved: doc, savedTitle: title }); onSaved?.(); }
      return asset.id;
    } catch (e: any) { toast(e.message, 'error'); return null; }
  };
  const doSave = async () => { setBusy('save'); const id = await save(); setBusy(null); if (id) toast('Saved as a draft', 'success'); };
  const finalise = async () => {
    if (!(await confirm({ title: 'Finalise this document?', body: 'It will be saved, approved by you, and filed as a final PDF in Documents. The DRAFT mark disappears from the PDF and Word downloads.', confirm: 'Finalise' }))) return;
    setBusy('final');
    try {
      const id = await save(); if (!id) return;
      const r = await api.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: id, approvers: [me.id], summary: `Finalised by ${personName(me)}` });
      await api.patch(`/api/approvals/${r.approval.id}`, { status: 'approved', note: 'Finalised' });
      setAsset(a => a ? { ...a, status: 'approved', saved: doc, savedTitle: title } : a); setPvKey(k => k + 1); onSaved?.();
      toast('Final — download the PDF or Word file. A final copy is also in Documents.', 'success');
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const sendForApproval = async () => {
    setBusy('appr');
    try { const id = await save(); if (!id) return; await api.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: id, summary: title }); setAsset(a => a ? { ...a, status: 'awaiting_approval' } : a); toast('Sent for approval', 'success'); onSaved?.(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const download = async (fmt: 'pdf' | 'docx') => { if (!asset) return; setBusy(fmt); try { const { blob, name } = await api.blob(`/api/marketing/assets/${asset.id}/export?format=${fmt}`); downloadBlob(blob, decodeURIComponent(name)); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const startOver = async () => { if (doc.trim() && !(await confirm({ title: 'Start a new document?', body: asset ? 'The current one stays in Saved.' : 'The current draft has not been saved and will be lost.', confirm: 'Start new', danger: !asset }))) return; setDoc(''); setTitle(''); setAsset(null); setDocDate(todayIso()); setKind(null); setWarning(null); setChatKey(k => k + 1); };

  const settings = { template_id: tplId || null, project_id: project, recipient: to, sender_id: from, format, length, provider, doc_date: docDate, kind: doc.trim() ? kind : null, title: doc.trim() ? null : null };
  const chosen = starts.find(s => s.id === tplId);

  return <div className="ws">
    <div className="ws-bar">
      <label className="ws-f"><span>Start from</span><select className="select sm" value={tplId} onChange={e => setTplId(e.target.value)} disabled={!!doc.trim()}><option value="">Blank</option>{['Marketing', 'Letters, proposals & reports'].map(g => <optgroup key={g} label={g}>{starts.filter(s => s.group === g).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</select></label>
      <label className="ws-f"><span>Project</span><span className="ws-proj"><ProjectSelect value={project} onChange={setProject} noneLabel="No project" className="select sm" /><ProjectInfo projectId={project} /></span></label>
      <div className="ws-f ws-to" ref={toRef}><span>To</span><button className={`select sm ws-to-btn${toLabel ? ' set' : ''}`} onClick={() => setToOpen(o => !o)}>{toLabel || 'Anyone'}<ChevronDown size={14} /></button>
        {toOpen && <div className="ws-pop"><div className="ws-pop-h"><b>Who is it for?</b><button className="icon-btn" onClick={() => setToOpen(false)} aria-label="Close"><X size={16} /></button></div><RecipientFields value={to} onChange={setTo} projectId={project} /><div className="row mt8"><button className="link small" onClick={() => setTo({})}>Clear</button><span className="spacer" /><Button size="sm" variant="primary" onClick={() => setToOpen(false)}>Done</Button></div></div>}
      </div>
      <label className="ws-f"><span>From</span><SenderSelect value={from} onChange={setFrom} className="select sm" /></label>
      <label className="ws-f"><span>Layout</span><select className="select sm" value={format} onChange={e => setFormat(e.target.value as any)}><option value="auto">Auto</option><option value="document">Document</option><option value="letter">Letter</option></select></label>
      <label className="ws-f"><span>Length</span><select className="select sm" value={length} onChange={e => setLength(e.target.value as any)}><option value="brief">Brief</option><option value="standard">Standard</option><option value="comprehensive">Full</option></select></label>
      <label className="ws-f"><span>Date</span><input className="input sm" type="date" value={docDate} onChange={e => changeDate(e.target.value)} title="Printed on the document. Today unless you change it — changing it updates the date in the draft too." /></label>
    </div>
    <div className="ws-main">
      <SplitHandle id="write" min={300} max={820} minOther={440} fold foldLabel="AI conversation" />
      <section className="ws-chat">
        <div className="ws-chat-h"><b>Conversation</b><span className="spacer" /><span className="tiny muted">Writer</span><ProviderSelect value={provider} onChange={setProvider} auto builtin="Built-in writer (no AI)" compact className="select sm" /></div>
        <WriteChat key={chatKey} doc={doc} onDoc={onDoc} context="marketing" settings={settings}
          onDraft={r => { setTitle(r.title || ''); if (r.recipient && !toLabel) setTo(r.recipient); setKind(r.kind || null); setWarning(r.warning || null); }}
          starters={chosen ? [{ label: `Write the ${chosen.name.toLowerCase()}`, text: `Write the ${chosen.name.toLowerCase()}${project ? ' for this project' : ''}. Key points: [what it must say]` }] : [
            { label: 'Letter to someone', text: 'Write a letter to [name] at [company]. Tell them [main point] and ask them to [what you need].' },
            { label: 'Investor update', text: 'Write an investor update about [project]: progress so far, key numbers and the next milestones.' },
            { label: 'Invitation', text: 'Write an invitation to [name] for [event] on [date] at [place].' },
          ]}
          intro={<><b>What do you want to write?</b><p>Type it below in your own words — who it's for and what to say. It appears on the right on your letterhead; then tell me what to change.</p>{chosen && <p className="small">Starting from <b>{chosen.name}</b>.</p>}</>} />
      </section>
      <section className="ws-doc">
        {!doc.trim() ? <div className="ws-empty"><FileText size={30} /><b>Your document appears here</b><span>on your letterhead, as soon as you send your first message.</span></div> : <>
          <div className="ws-doc-h">
            <input className="input title-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
            <div className="seg-tabs sm">{([['page', 'Letterhead'], ['text', 'Edit text']] as const).map(([v, l]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => { setView(v); if (v === 'page') setPvKey(k => k + 1); }}>{l}</button>)}</div>
          </div>
          {warning && <div className="ws-warn"><Notice tone="warn">{warning}</Notice></div>}
          <div className="ws-paper">{view === 'page' ? <LetterheadPreview title={title} body={doc} auto={pvKey} /> : <textarea className="doc-editor" value={doc} onChange={e => setDoc(e.target.value)} spellCheck />}</div>
          <div className="ws-actions">
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={startOver}>New</Button>
            <Button size="sm" icon={<Copy size={14} />} onClick={() => navigator.clipboard?.writeText(doc).then(() => toast('Copied', 'success'))}>Copy</Button>
            {status && <StatusBadge value={status} />}
            <span className="spacer" />
            {status === 'approved' ? <><Button size="sm" variant="success" icon={<Download size={14} />} loading={busy === 'pdf'} onClick={() => download('pdf')}>PDF</Button><Button size="sm" variant="success" icon={<Download size={14} />} loading={busy === 'docx'} onClick={() => download('docx')}>Word</Button></>
              : <><Button size="sm" icon={<Save size={14} />} loading={busy === 'save'} disabled={!!asset && !dirty} onClick={doSave}>{asset && !dirty ? 'Saved' : 'Save draft'}</Button>
                {status !== 'awaiting_approval' && (isExec ? <Button size="sm" variant="primary" icon={<CheckCircle2 size={14} />} loading={busy === 'final'} onClick={finalise}>Finalise</Button>
                  : <Button size="sm" variant="primary" icon={<Send size={14} />} loading={busy === 'appr'} onClick={sendForApproval}>Send for approval</Button>)}</>}
          </div>
        </>}
      </section>
    </div>
  </div>;
}
