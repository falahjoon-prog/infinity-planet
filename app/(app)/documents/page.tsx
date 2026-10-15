'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { DOC_CATEGORIES, categoryLabel } from '@/lib/doc-categories';
import { useOpenWindow } from '@/lib/client/nav-history';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, Search, Files, FolderOpen, Folder, FileText, ChevronRight, RefreshCw, DownloadCloud, Trash2, Pencil, Brain, HardDrive, Link2, Eye, ExternalLink, Plus, Palette, LayoutGrid, List, PenTool, Send, Sparkles, X, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { useBrand } from '@/lib/client/brand';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { PdfThumb } from '@/components/pdf-thumb';
import { DocViewer } from '@/components/doc-viewer';
import { UploadDialog, RequestApproval } from '@/components/workflow';
import { ProjectSelect } from '@/components/pickers';
import { PageHead, Card, Loading, ErrorNote, Empty, StatusBadge, AuthorityBadge, Button, Tabs, Modal, Field, useToast, useConfirm, Notice, AUTHORITY_TEXT } from '@/components/ui';
import { ago, date, label, bytes } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><Documents /></Suspense>; }

function Documents() {
  const sp = useSearchParams(); const router = useRouter(); const toast = useToast();
  const [tab, setTab] = useState<'library' | 'search' | 'drive'>(sp.get('search') ? 'search' : sp.get('tab') === 'drive' ? 'drive' : 'library');
  const [upload, setUpload] = useState(sp.get('upload') === '1');
  const win = useOpenWindow(); // the open document lives in the address, so Back closes it and stays here
  const [hl, setHl] = useState<{ id: string; q?: string } | null>(null);
  const [ver, setVer] = useState(0);
  const { can } = useApp(); const brand = useBrand();
  useEffect(() => { const t = sp.get('tab'); setTab(t === 'drive' || t === 'library' || t === 'search' ? t as any : sp.get('search') ? 'search' : 'library'); }, [sp]);
  return <>
    <PageHead title={tab === 'drive' ? 'Google Drive' : 'Library'}
      actions={can.write && tab !== 'drive' && <div className="row" style={{ gap: 8 }}><Button icon={<Brain size={15} />} onClick={async () => { try { const r = await api.post('/api/documents/classify', {}); toast(r.sorted ? `Sorted ${r.sorted} document${r.sorted === 1 ? '' : 's'}` : 'Nothing new to sort', 'success'); setVer(v => v + 1); } catch (e: any) { toast(e.message, 'error'); } }}>Auto-sort</Button><Button variant="primary" icon={<Upload size={15} />} onClick={() => setUpload(true)}>Upload</Button></div>} />
    {tab !== 'drive' && <Library key={ver} onOpen={(id, q) => { setHl({ id, q }); win.open(id); }} reviewOnly={sp.get('review') === '1'} initialSearch={sp.get('search') || ''} />}
    {tab === 'drive' && <Drive onImported={() => setVer(v => v + 1)} onOpen={id => win.open(id)} />}
    <UploadDialog open={upload} onClose={() => setUpload(false)} onDone={rs => { if (rs?.some((r: any) => !r.error)) setVer(v => v + 1); }} />
    <DocViewer id={win.value} highlight={hl && hl.id === win.value ? hl.q : undefined} onClose={() => win.close()} onChanged={() => setVer(v => v + 1)} />
  </>;
}

function Library({ onOpen, reviewOnly, initialSearch }: { onOpen: (id: string, q?: string) => void; reviewOnly: boolean; initialSearch?: string }) {
  const { can, me } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const [q, setQ] = useState(initialSearch || ''); const [project, setProject] = useState<string | null>(null);
  const [mode, setMode] = useState<'names' | 'inside'>(initialSearch ? 'inside' : 'names'); const [showFilters, setShowFilters] = useState(reviewOnly);
  const [hits, setHits] = useState<any[] | null>(null); const [searching, setSearching] = useState(false);
  const runInside = async () => { if (!q.trim()) return; setSearching(true); try { const r = await api.get(`/api/knowledge/search?q=${encodeURIComponent(q)}${project ? `&project_id=${project}` : ''}&limit=25`); setHits(r.results); } catch (e: any) { toast(e.message, 'error'); } finally { setSearching(false); } };
  useEffect(() => { if (initialSearch) runInside(); }, []); // eslint-disable-line
  const [authority, setAuthority] = useState(''); const [status, setStatus] = useState(''); const [review, setReview] = useState(reviewOnly ? 'unreviewed' : ''); const [source, setSource] = useState('');
  const [editing, setEditing] = useState<any>(null); const [category, setCategory] = useState(''); const [seenForms, setSeenForms] = useState<string[]>([]);
  const [view, setView] = useState<'list' | 'grid'>(() => { try { return (localStorage.getItem('ip-docs-view') as any) || 'list'; } catch { return 'list'; } });
  const [sort, setSort] = useState('updated'); const [kind, setKind] = useState('');
  useEffect(() => { try { localStorage.setItem('ip-docs-view', view); } catch {} }, [view]);
  const qs = new URLSearchParams({ ...(category ? { category } : {}), limit: '500', ...(project ? { project_id: project } : {}), ...(authority ? { authority } : {}), ...(status ? { status } : {}), ...(review ? { review_status: review } : {}), ...(source ? { source } : {}) }).toString();
  const { data, error, loading, reload } = useApi<any>(`/api/documents?${qs}`, [qs]);
  const KIND: Record<string, RegExp> = { image: /^image\//, pdf: /pdf/, doc: /word|document|text|rtf/, sheet: /sheet|excel|csv/ };
  const activeFilters = [project, authority, status, review, source, category, kind].filter(Boolean).length;
  const docs = (data?.documents || []).filter((d: any) => (mode === 'inside' || !q || d.name.toLowerCase().includes(q.toLowerCase())) && (!kind || KIND[kind]?.test(d.mime_type || '')))
    .sort((a: any, b: any) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'type' ? String(a.mime_type).localeCompare(String(b.mime_type)) || a.name.localeCompare(b.name) : sort === 'created' ? +new Date(b.created_at) - +new Date(a.created_at) : +new Date(b.updated_at) - +new Date(a.updated_at));
  useEffect(() => { const f = (data?.documents || []).map((d: any) => d.category).filter((c: any) => typeof c === 'string' && /^form_/.test(c)); if (f.some((x: string) => !seenForms.includes(x))) setSeenForms(s => [...new Set([...s, ...f])]); }, [data]); // eslint-disable-line
  const isPdf = (d: any) => /pdf/.test(d.mime_type || '') || /\.pdf$/i.test(d.name);
  const canDelete = ['admin', 'director', 'manager', 'legal'].includes(me.role);
  const del = async (d: any) => { if (!(await confirm({ title: `Delete “${d.name}”?`, body: 'The file, its extracted text and search index are removed permanently.', confirm: 'Delete', danger: true }))) return; try { await api.del(`/api/documents/${d.id}`); toast('Deleted', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  return <>
    <div className="lib-bar">
      <form className="lib-search" onSubmit={e => { e.preventDefault(); if (mode === 'inside') runInside(); }}>
        <Search size={15} /><input type="search" name="ip-doc-search" autoComplete="off" placeholder={mode === 'inside' ? 'Search inside every document — e.g. “exclusivity period”, “GST”' : 'Search by name'} value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) setHits(null); }} />
        <div className="seg-text"><button type="button" className={mode === 'names' ? 'on' : ''} onClick={() => { setMode('names'); setHits(null); }}>Names</button><button type="button" className={mode === 'inside' ? 'on' : ''} onClick={() => setMode('inside')}>Inside files</button></div>
        {mode === 'inside' && <Button size="sm" variant="primary" loading={searching} disabled={!q.trim()}>Search</Button>}
      </form>
      <button className={`btn${showFilters || activeFilters ? ' on-soft' : ''}`} onClick={() => setShowFilters(v => !v)}><SlidersHorizontal size={14} /> Filters{activeFilters ? ` (${activeFilters})` : ''}</button>
      <select className="select" style={{ width: 'auto' }} value={sort} onChange={e => setSort(e.target.value)} title="Sort"><option value="updated">Newest</option><option value="created">Recently added</option><option value="name">Name A–Z</option><option value="type">File type</option></select>
      <div className="seg-icons"><button className={view === 'grid' ? 'on' : ''} title="Thumbnails" onClick={() => setView('grid')}><LayoutGrid size={14} /></button><button className={view === 'list' ? 'on' : ''} title="List" onClick={() => setView('list')}><List size={14} /></button></div>
    </div>
    {showFilters && <div className="lib-filters">
      <ProjectSelect value={project} onChange={setProject} noneLabel="All projects" className="select sm" />
      <select className="select sm" value={category} onChange={e => setCategory(e.target.value)}><option value="">Any category</option>{[...DOC_CATEGORIES, ...[...new Set([...seenForms, ...(category.startsWith('form_') ? [category] : [])])].sort().map(v => [v, categoryLabel(v)] as [string, string])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select className="select sm" value={kind} onChange={e => setKind(e.target.value)}><option value="">Any file type</option><option value="pdf">PDF</option><option value="image">Photos</option><option value="doc">Word & text</option><option value="sheet">Spreadsheets</option></select>
      <select className="select sm" value={source} onChange={e => setSource(e.target.value)}><option value="">From anywhere</option><option value="upload">Uploaded</option><option value="google_drive">Google Drive</option><option value="manual">Made in the app</option></select>
      <select className="select sm" value={review} onChange={e => setReview(e.target.value)}><option value="">Any review</option>{['unreviewed', 'awaiting_review', 'reviewed', 'approved', 'rejected'].map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
      <select className="select sm" value={authority} onChange={e => setAuthority(e.target.value)}><option value="">Any authority</option>{Object.entries(AUTHORITY_TEXT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select className="select sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">Any reading status</option>{['indexed', 'needs_ocr', 'pending', 'failed', 'unsupported'].map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
      {activeFilters > 0 && <button className="link small" onClick={() => { setProject(null); setCategory(''); setKind(''); setSource(''); setReview(''); setAuthority(''); setStatus(''); }}>Clear filters</button>}
    </div>}
    {mode === 'inside' && hits && <div className="card mb16">{hits.length === 0 ? <Empty title="Nothing found inside your documents" /> : <div className="list">{hits.map(r => <button key={r.chunk_id} className="list-item" style={{ alignItems: 'flex-start' }} onClick={() => onOpen(r.document_id, q)}>
      <FileText size={16} className="muted" style={{ marginTop: 2 }} /><div className="main-col"><div className="row" style={{ gap: 8 }}><span className="title">{r.document_name}</span><AuthorityBadge value={r.authority} /></div>
        <div className="small mt8" style={{ color: 'var(--ink-2)', whiteSpace: 'normal' }}>{highlight(r.content.slice(0, 420), q)}{r.content.length > 420 ? '…' : ''}</div></div></button>)}</div>}</div>}
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading ? <Loading /> : docs.length === 0 ? <div className="card"><Empty icon={<Files size={20} />} title="No documents found">Upload PDFs, Word documents or text, or import from Google Drive.</Empty></div> : view === 'grid' ?
      <div className="card"><div className="file-grid">{docs.map((d: any) => <div key={d.id} className="file-tile" onClick={() => onOpen(d.id)}>
        <div className="thumb">{d.file_url && /^image\//.test(d.mime_type) ? <img src={d.file_url} alt="" loading="lazy" /> : d.file_url && isPdf(d) ? <PdfThumb url={d.file_url} /> : <FileText size={34} className="muted" />}</div>
        <div className="name" title={d.name}>{d.name}</div><div className="tiny muted">{d.project?.name || 'Unassigned'} · {ago(d.updated_at)}</div>{d.category && <div><span className="badge" style={{ fontSize: 11 }}>{categoryLabel(d.category)}</span></div>}
        {can.write && isPdf(d) && d.has_file && <div className="row" style={{ gap: 4 }} onClick={e => e.stopPropagation()}><Link className="btn xs" href={`/pdf/${d.id}`}><PenTool size={11} /> Sign</Link><Link className="btn xs" href={`/pdf/${d.id}?mode=send`}><Send size={11} /> Send to sign</Link></div>}
      </div>)}</div></div> :
      <div className="card table-wrap"><table className="table"><thead><tr><th>Document</th><th>Authority</th><th>Review</th><th className="hide-sm">Index</th><th className="hide-sm">Project</th><th className="hide-sm">Updated</th><th /></tr></thead><tbody>
        {docs.map((d: any) => <tr key={d.id} className="clickable" onClick={() => onOpen(d.id)}>
          <td style={{ maxWidth: 360 }}><div className="row" style={{ gap: 8 }}><FileText size={16} className="muted" /><div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: 'block' }}>{d.name}</b><div className="tiny muted">{d.source === 'google_drive' ? 'Google Drive' : d.uploader?.full_name || 'Upload'}{d.category ? ` · ${categoryLabel(d.category)}` : ''}</div></div></div></td>
          <td><AuthorityBadge value={d.authority} /></td><td><StatusBadge value={d.review_status} /></td><td className="hide-sm"><StatusBadge value={d.status} /></td>
          <td className="hide-sm small">{d.project ? <Link className="link" href={`/projects/${d.project.id}`} onClick={e => e.stopPropagation()}>{d.project.name}</Link> : <span className="muted">—</span>}</td>
          <td className="hide-sm small muted nowrap">{ago(d.updated_at)}</td>
          <td onClick={e => e.stopPropagation()} style={{ width: 1, whiteSpace: 'nowrap' }}><div className="row" style={{ gap: 2, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            {can.write && isPdf(d) && d.has_file && <Link className="btn ghost xs" href={`/pdf/${d.id}`} title="Sign or edit this PDF"><PenTool size={13} /></Link>}
            {can.write && isPdf(d) && d.has_file && <Link className="btn ghost xs" href={`/pdf/${d.id}?mode=send`} title="Send to a client to sign"><Send size={13} /></Link>}
            {can.write && <button className="btn ghost xs" onClick={() => setEditing(d)} title="Edit details"><Pencil size={13} /></button>}
            {can.write && d.review_status === 'unreviewed' && <RequestApproval type="document" id={d.id} status={d.review_status} label="Send for review" size="xs" iconOnly onDone={reload} />}
            {canDelete && <button className="btn ghost xs" onClick={() => del(d)} title="Delete"><Trash2 size={13} /></button>}
          </div></td>
        </tr>)}
      </tbody></table></div>}
    <EditDoc doc={editing} onClose={() => setEditing(null)} onSaved={reload} />
  </>;
}

function EditDoc({ doc, onClose, onSaved }: { doc: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const { me } = useApp();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (doc) setF({ name: doc.name, project_id: doc.project_id, authority: doc.authority, category: doc.category || '' }); }, [doc]);
  const canClassify = ['admin', 'director', 'legal'].includes(me.role);
  const save = async () => { try { await api.patch(`/api/documents/${doc.id}`, f); toast('Saved', 'success'); onSaved(); onClose(); } catch (e: any) { toast(e.message, 'error'); } };
  return <Modal open={!!doc} onClose={onClose} title="Edit document" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
    <div className="stack" style={{ gap: 12 }}>
      <Field label="Name"><input className="input" value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Project"><ProjectSelect value={f.project_id} onChange={v => setF({ ...f, project_id: v })} /></Field>
      <Field label="Category" hint="Brand book: the AI, marketing writer, Designer and letterhead follow it."><select className="select" value={f.category || ''} onChange={e => setF({ ...f, category: e.target.value })}><option value="">General</option>{DOC_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{f.category && !DOC_CATEGORIES.some(([v]) => v === f.category) && <option value={f.category}>{categoryLabel(f.category)}</option>}</select></Field>
      <Field label="Or a form number" hint="For example 2, 6 or 30c files it as Form 2, Form 6 or Form 30C."><input className="input" placeholder="e.g. 6" value={/^form_/.test(f.category || '') ? String(f.category).slice(5) : ''} onChange={e => { const n = e.target.value.replace(/[^0-9a-zA-Z]/g, '').toLowerCase().slice(0, 5); setF({ ...f, category: n ? `form_${n}` : '' }); }} /></Field>
      <Field label="Authority" hint="A previously signed agreement is HISTORICAL PRECEDENT — never automatically approved.">
        <select className="select" value={f.authority} onChange={e => setF({ ...f, authority: e.target.value })}>{Object.entries(AUTHORITY_TEXT).map(([v, l]) => <option key={v} value={v} disabled={!canClassify && !['draft', 'historical_precedent'].includes(v)}>{l}</option>)}</select>
      </Field>
    </div>
  </Modal>;
}

function highlight(text: string, q: string) {
  const words = q.toLowerCase().split(/\W+/).filter(w => w.length > 2); if (!words.length) return text;
  const re = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((p, i) => i % 2 ? <mark key={i}>{p}</mark> : p);
}


function Drive({ onImported, onOpen }: { onImported: () => void; onOpen: (id: string) => void }) {
  const { status, can } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const [path, setPath] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'My Drive' }]);
  const [q, setQ] = useState(''); const [searching, setSearching] = useState('');
  const [sel, setSel] = useState<string[]>([]); const [project, setProject] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<any | null>(null); const [preview, setPreview] = useState<any>(null);
  const [adding, setAdding] = useState(false); const [linkForm, setLinkForm] = useState({ url: '', project_id: null as string | null, recursive: true, purpose: 'knowledge' });
  const [view, setView] = useState<'list' | 'grid'>(() => { try { return (localStorage.getItem('ip-drive-view') as any) || 'grid'; } catch { return 'grid'; } });
  const [sort, setSort] = useState('name'); const [kind, setKind] = useState('');
  useEffect(() => { try { localStorage.setItem('ip-drive-view', view); } catch {} }, [view]);
  const cur = path[path.length - 1];
  const url = status?.google.connected ? (searching ? `/api/google/drive?q=${encodeURIComponent(searching)}&sort=${sort}` : `/api/google/drive?folder=${cur.id}&sort=${sort}`) : null;
  const { data, error, loading, reload } = useApi<any>(url, [url]);
  const { data: lk, reload: reloadLinks } = useApi<any>(status?.google.connected ? '/api/google/drive/links' : null);
  if (!status) return <Loading />;
  if (!status.google.connected) return <div className="card"><Empty icon={<HardDrive size={20} />} title="Google Drive is not connected" action={<Link className="btn primary" href="/system?tab=google">Connect Google</Link>}>An admin connects Google once in Settings → Google. Then you can browse your Drive here and choose which folders the AI reads.</Empty></div>;
  const links: any[] = lk?.links || [];
  const linkHere = links.find(l => l.file_id === cur.id);
  const KIND: Record<string, RegExp> = { image: /^image\//, pdf: /pdf/, doc: /word|document|text|rtf|google-apps\.document/, sheet: /sheet|excel|csv|spreadsheet/, video: /^video\//, slides: /presentation|powerpoint/ };
  const files = (data?.files || []).filter((f: any) => !kind || f.isFolder || KIND[kind]?.test(f.mimeType));
  const toggle = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const typeLabel = (m: string) => m.replace('application/vnd.google-apps.', 'Google ').replace('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Word').replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel').replace('application/', '').replace('octet-stream', 'file');
  const summary = (o: any) => Object.entries(o || {}).map(([k, v]) => `${v} ${k}`).join(', ');
  const open = (f: { id: string; name: string }) => { setPath(p => [...p, f]); setSel([]); setSearching(''); setQ(''); };
  const importSel = async () => { setBusy('import'); try { const r = await api.post('/api/google/drive/import', { file_ids: sel, project_id: project }); setResults({ results: r.results }); toast(`Added ${sel.length} file${sel.length > 1 ? 's' : ''} to Documents`, 'success'); setSel([]); reload(); onImported(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const readFolder = async () => { setBusy('link'); try { const r = await api.post('/api/google/drive/links', { url: `https://drive.google.com/drive/folders/${cur.id}`, project_id: project, recursive: true, purpose: 'knowledge' }); toast(r.sync_error ? `Saved, but reading failed: ${r.sync_error}` : `The AI now reads “${cur.name}”${r.sync?.summary ? ` — ${summary(r.sync.summary)}` : ''}. It stays up to date automatically.`, r.sync_error ? 'error' : 'success'); reloadLinks(); reload(); onImported(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const syncLink = async (id: string) => { setBusy(id); try { const r = await api.post(`/api/google/drive/links/${id}`); toast(id === 'all' ? `Updated ${r.links.length} folder${r.links.length === 1 ? '' : 's'}` : `Updated${r.summary ? ` — ${summary(r.summary)}` : ''}`, 'success'); reloadLinks(); reload(); onImported(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const unlink = async (l: any) => { if (!(await confirm({ title: `Stop the AI reading “${l.name}”?`, body: 'Files already brought in stay in Documents. Nothing in Google Drive changes.', confirm: 'Stop reading', danger: true }))) return; await api.del(`/api/google/drive/links/${l.id}`).catch(e => toast(e.message, 'error')); reloadLinks(); };
  const addLink = async () => { setBusy('add'); try { const r = await api.post('/api/google/drive/links', linkForm); toast(r.sync_error ? `Saved, but reading failed: ${r.sync_error}` : `The AI now reads “${r.link.name}”`, r.sync_error ? 'error' : 'success'); setAdding(false); setLinkForm({ url: '', project_id: null, recursive: true, purpose: 'knowledge' }); reloadLinks(); onImported(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  return <div className="drive">
    <div className="drive-ai">
      <div className="drive-ai-title"><Sparkles size={15} /><b>The AI reads</b></div>
      <div className="drive-ai-chips">
        {links.length === 0 && <span className="small muted">No folders yet — open a folder below and click <b>Let the AI read this folder</b>.</span>}
        {links.map(l => <span key={l.id} className={`drive-chip${l.last_status === 'failed' ? ' bad' : ''}`} title={`${l.last_synced_at ? `Updated ${ago(l.last_synced_at)}` : 'Not read yet'}${l.last_result?.summary ? ` · ${summary(l.last_result.summary)}` : ''}${l.last_status === 'failed' ? ` · ${l.last_result?.error || 'failed'}` : ''}${l.project?.name ? ` · ${l.project.name}` : ''}`}>
          {l.purpose === 'brand_book' ? <Palette size={13} /> : l.kind === 'folder' ? <Folder size={13} /> : <FileText size={13} />}
          <button className="drive-chip-name" onClick={() => l.kind === 'folder' && (setPath([{ id: 'root', name: 'My Drive' }, { id: l.file_id, name: l.name || 'Folder' }]), setSel([]), setSearching(''))}>{l.name || 'Drive item'}</button>
          <span className="tiny muted">{l.last_synced_at ? ago(l.last_synced_at) : 'waiting'}</span>
          {can.write && <button className="chip-x" title="Update now" onClick={() => syncLink(l.id)}>{busy === l.id ? <span className="spin" /> : <RefreshCw size={12} />}</button>}
          {can.write && <button className="chip-x" title="Stop reading" onClick={() => unlink(l)}><X size={12} /></button>}
        </span>)}
      </div>
      {can.write && <div className="row" style={{ gap: 6 }}>{links.length > 1 && <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} loading={busy === 'all'} onClick={() => syncLink('all')}>Update all</Button>}<Button size="sm" variant="ghost" icon={<Link2 size={13} />} onClick={() => setAdding(true)}>Paste a link</Button></div>}
    </div>

    <div className="card drive-browser">
      <div className="drive-bar">
        <div className="drive-crumbs">{searching ? <><b>Results for “{searching}”</b><button className="link small" onClick={() => { setSearching(''); setQ(''); }}>Back to folders</button></> : path.map((p, i) => <React.Fragment key={p.id}>{i > 0 && <ChevronRight size={14} className="muted" />}<button className={i === path.length - 1 ? 'here' : ''} onClick={() => { setPath(path.slice(0, i + 1)); setSel([]); }}>{p.name}</button></React.Fragment>)}</div>
        <form className="drive-search" onSubmit={e => { e.preventDefault(); setSearching(q.trim()); }}><Search size={14} /><input type="search" name="ip-drive-search" autoComplete="off" placeholder="Search your Drive" value={q} onChange={e => setQ(e.target.value)} /></form>
        <select className="select sm" style={{ width: 'auto' }} value={kind} onChange={e => setKind(e.target.value)} title="File type"><option value="">All types</option><option value="image">Photos</option><option value="pdf">PDF</option><option value="doc">Documents</option><option value="sheet">Spreadsheets</option><option value="slides">Presentations</option><option value="video">Videos</option></select>
        <select className="select sm" style={{ width: 'auto' }} value={sort} onChange={e => setSort(e.target.value)} title="Sort"><option value="name">Name</option><option value="modified">Newest</option><option value="size">Largest</option></select>
        <div className="seg-icons"><button className={view === 'grid' ? 'on' : ''} title="Thumbnails" onClick={() => setView('grid')}><LayoutGrid size={14} /></button><button className={view === 'list' ? 'on' : ''} title="List" onClick={() => setView('list')}><List size={14} /></button></div>
      </div>
      {!searching && cur.id !== 'root' && can.write && <div className={`drive-folder-action${linkHere ? ' on' : ''}`}>
        {linkHere ? <><CheckCircle2 size={16} /><span>The AI reads <b>{cur.name}</b>{linkHere.recursive ? ' and its sub-folders' : ''} and keeps it up to date{linkHere.last_synced_at ? ` (updated ${ago(linkHere.last_synced_at)})` : ''}.</span><span className="spacer" /><Button size="sm" icon={<RefreshCw size={13} />} loading={busy === linkHere.id} onClick={() => syncLink(linkHere.id)}>Update now</Button></>
          : <><Sparkles size={16} /><span>Want the AI to know what’s in <b>{cur.name}</b>? It reads every file here (and in sub-folders) and keeps up with changes.</span><span className="spacer" /><Button size="sm" variant="primary" loading={busy === 'link'} onClick={readFolder}>Let the AI read this folder</Button></>}
      </div>}
      {error && <div className="card-body"><ErrorNote error={error} onRetry={reload} /></div>}
      <div className="drive-files">
      {loading ? <Loading /> : files.length === 0 ? <Empty title={searching ? 'Nothing found' : kind ? 'No files of this type here' : 'This folder is empty'} /> : view === 'grid' ? <div className="file-grid">{files.map((f: any) => f.isFolder
        ? <button key={f.id} className="file-tile folder" onClick={() => open({ id: f.id, name: f.name })}><div className="thumb"><Folder size={38} color="#d9a441" />{links.some(l => l.file_id === f.id) && <span className="tile-ai" title="The AI reads this folder"><Sparkles size={11} /></span>}</div><div className="name">{f.name}</div><div className="tiny muted">Folder</div></button>
        : <div key={f.id} className={`file-tile${sel.includes(f.id) ? ' selected' : ''}`} onClick={() => f.preview_url ? setPreview(f) : f.webViewLink && window.open(f.webViewLink, '_blank')}>
            <div className="thumb">{f.thumb_url ? <img src={f.thumb_url} alt="" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <FileText size={34} className="muted" />}
              {/^video\//.test(f.mimeType) && <span className="tile-badge">▶ video</span>}</div>
            {can.write && <input type="checkbox" className="tile-check" checked={sel.includes(f.id)} onClick={e => e.stopPropagation()} onChange={() => toggle(f.id)} title="Tick to add to Documents" />}
            {f.imported && <span className="badge green tile-imported" title="Open in Documents" onClick={e => { e.stopPropagation(); onOpen(f.document_id); }}>{f.stale ? 'Changed' : 'In Documents'}</span>}
            <div className="name" title={f.name}>{f.name}</div><div className="tiny muted">{typeLabel(f.mimeType)} · {date(f.modifiedTime)}</div>
          </div>)}</div>
      : <div className="list">{files.map((f: any) => f.isFolder
        ? <button key={f.id} className="list-item" onClick={() => open({ id: f.id, name: f.name })}><Folder size={17} color="#d9a441" /><div className="main-col"><div className="title">{f.name}</div></div>{links.some(l => l.file_id === f.id) && <span className="badge gold"><Sparkles size={11} /> AI reads</span>}<ChevronRight size={15} className="muted" /></button>
        : <label key={f.id} className="list-item clickable"><input type="checkbox" disabled={!can.write} checked={sel.includes(f.id)} onChange={() => toggle(f.id)} />{f.thumb_url ? <img src={f.thumb_url} alt="" loading="lazy" className="list-thumb" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <FileText size={16} className="muted" />}<div className="main-col"><div className="title">{f.name}</div><div className="meta">{typeLabel(f.mimeType)} · {date(f.modifiedTime)}{f.size ? ` · ${bytes(Number(f.size))}` : ''}</div></div>
          {f.imported && <button className="badge green" onClick={e => { e.preventDefault(); onOpen(f.document_id); }}>{f.stale ? 'Changed in Drive' : 'In Documents'}</button>}
          {f.preview_url && <button className="btn ghost xs" title="Preview" onClick={e => { e.preventDefault(); setPreview(f); }}><Eye size={14} /></button>}
          {f.webViewLink && <a className="btn ghost xs" title="Open in Google Drive" href={f.webViewLink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}><ExternalLink size={14} /></a>}</label>)}</div>}
      </div>
      {sel.length > 0 && <div className="drive-selbar">
        <b>{sel.length} selected</b>
        <span className="small muted">Add to project</span><div style={{ width: 230 }}><ProjectSelect value={project} onChange={setProject} className="select sm" /></div>
        <span className="spacer" />
        <Button size="sm" variant="ghost" onClick={() => setSel([])}>Clear</Button>
        <Button size="sm" variant="primary" icon={<DownloadCloud size={14} />} loading={busy === 'import'} onClick={importSel}>Add to Documents</Button>
      </div>}
    </div>
    {results && <div className="drive-result"><span className="small"><b>Last import:</b> {results.results.filter((r: any) => ['imported', 'updated'].includes(r.status)).length} added{results.results.some((r: any) => r.status === 'failed') ? `, ${results.results.filter((r: any) => r.status === 'failed').length} failed (${results.results.filter((r: any) => r.status === 'failed').map((r: any) => r.name).slice(0, 3).join(', ')})` : ''}</span><button className="icon-btn" onClick={() => setResults(null)} title="Dismiss"><X size={14} /></button></div>}
    <div className="tiny muted" style={{ marginTop: 8 }}>Infinity Planet only reads your Drive. Nothing in Google Drive is ever changed or deleted. Google Docs come in as Word, Sheets as spreadsheets and Slides as PDF.</div>

    {preview && <Modal open onClose={() => setPreview(null)} title={preview.name} size="wide" footer={<>{can.write && !preview.imported && <Button variant="primary" icon={<DownloadCloud size={14} />} onClick={() => { setSel(s => s.includes(preview.id) ? s : [...s, preview.id]); setPreview(null); }}>Select to add</Button>}<a className="btn" href={preview.download_url}><DownloadCloud size={14} /> Download</a>{preview.webViewLink && <a className="btn" href={preview.webViewLink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open in Drive</a>}<Button onClick={() => setPreview(null)}>Close</Button></>}>
      {/^image\//.test(preview.mimeType) ? <img src={preview.preview_url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: 'calc(70 * var(--vh, 1vh))', display: 'block', margin: '0 auto' }} />
        : /pdf|google-apps\.(document|spreadsheet|presentation)|text\/plain/.test(preview.mimeType) ? <iframe src={preview.preview_url} title={preview.name} style={{ width: '100%', height: 'calc(70 * var(--vh, 1vh))', border: 0, borderRadius: 8, background: '#fff' }} />
        : <Empty title="No preview for this file type">Download it, or open it in Google Drive.</Empty>}
    </Modal>}
    <Modal open={adding} onClose={() => setAdding(false)} title="Paste a Google Drive link" footer={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" loading={busy === 'add'} disabled={!linkForm.url.trim()} onClick={addLink}>Let the AI read it</Button></>}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="small muted">Use this for a folder or file you can’t find above — for example one someone shared with you. In Google Drive: right-click → Share → Copy link.</div>
        <Field label="Drive link"><input className="input" autoFocus value={linkForm.url} onChange={e => setLinkForm({ ...linkForm, url: e.target.value })} placeholder="https://drive.google.com/drive/folders/…" /></Field>
        <Field label="What is it?"><select className="select" value={linkForm.purpose} onChange={e => setLinkForm({ ...linkForm, purpose: e.target.value })}><option value="knowledge">Files for the AI to read</option><option value="brand_book">Our brand book (logo, colours, tone)</option></select></Field>
        <Field label="Project (optional)"><ProjectSelect value={linkForm.project_id} onChange={v => setLinkForm({ ...linkForm, project_id: v })} /></Field>
        <label className="check small"><input type="checkbox" checked={linkForm.recursive} onChange={e => setLinkForm({ ...linkForm, recursive: e.target.checked })} /> Include sub-folders</label>
      </div>
    </Modal>
  </div>;
}
