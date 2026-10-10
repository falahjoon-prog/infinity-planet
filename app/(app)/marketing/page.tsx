'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useOpenWindow } from '@/lib/client/nav-history';
import { useRouter, useSearchParams } from 'next/navigation';
import { Megaphone, Wand2, Save, Copy, Pencil, Eye, Download } from 'lucide-react';
import { api, useApi, downloadBlob } from '@/lib/client/api';
import { WriteStudio } from '@/components/write-studio';
import { useApp } from '@/components/app-context';
import { RequestApproval, ApprovalTrail } from '@/components/workflow';
import { Loading, ErrorNote, Empty, StatusBadge, Button, Tabs, Drawer, Modal, useToast, Notice, Segmented } from '@/components/ui';
import { ago, label } from '@/lib/client/format';

export default function Page() { return <Suspense fallback={<Loading />}><Marketing /></Suspense>; }

function Marketing() {
  const sp = useSearchParams(); const router = useRouter();
  const [tab, setTab] = useState<'studio' | 'assets'>(sp.get('open') ? 'assets' : 'studio');
  const win = useOpenWindow(); const openAsset = win.value; // the open item lives in the address, so Back closes it
  const assets = useApi<any>('/api/marketing/assets?kind=copy');
  return <>
    {/* The top bar already says Campaigns — no big page heading, just a slim Write / Saved switch */}
    <Tabs value={tab} onChange={setTab} tabs={[{ value: 'studio', label: 'Write' }, { value: 'assets', label: 'Saved', count: assets.data?.assets?.length || 0 }]} />
    {tab === 'studio' && <WriteStudio initialProject={sp.get('project')} onSaved={assets.reload} />}
    {tab === 'assets' && <>{assets.error && <ErrorNote error={assets.error} onRetry={assets.reload} />}
      {assets.loading ? <Loading /> : !assets.data?.assets?.length ? <div className="card"><Empty icon={<Megaphone size={20} />} title="Nothing saved yet" /></div> :
        <div className="card"><div className="list">{assets.data.assets.map((a: any) => <button key={a.id} className="list-item" onClick={() => win.open(a.id)}><div className="main-col"><div className="title">{a.title}</div><div className="meta">{a.project?.name || 'No project'} · v{a.version} · {ago(a.updated_at)}{a.author?.full_name ? ` · ${a.author.full_name}` : ''}</div></div><StatusBadge value={a.status} /></button>)}</div></div>}</>}
    <AssetDrawer id={openAsset} onClose={() => win.close()} onChanged={assets.reload} />
  </>;
}

function AssetDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast(); const { can } = useApp();
  const { data, loading, reload } = useApi<any>(id ? `/api/marketing/assets/${id}` : null, [id]);
  const [edit, setEdit] = useState(false); const [content, setContent] = useState(''); const [title, setTitle] = useState('');
  useEffect(() => { if (data) { setContent(data.asset.content); setTitle(data.asset.title); setEdit(false); } }, [data]);
  const a = data?.asset;
  const save = async () => { try { await api.patch(`/api/marketing/assets/${id}`, { content, title }); toast('Saved', 'success'); reload(); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  const [pv, setPv] = useState<string | null>(null); const [dl, setDl] = useState<string | null>(null);
  const preview = async () => { setDl('pv'); try { const { blob } = await api.blob(`/api/marketing/assets/${id}/export?preview=1`); setPv(URL.createObjectURL(blob)); } catch (e: any) { toast(e.message, 'error'); } finally { setDl(null); } };
  const download = async (format: 'pdf' | 'docx') => { setDl(format); try { const { blob, name } = await api.blob(`/api/marketing/assets/${id}/export?format=${format}`); downloadBlob(blob, decodeURIComponent(name)); } catch (e: any) { toast(e.message, 'error'); } finally { setDl(null); } };
  return <Drawer open={!!id} onClose={onClose} title={a?.title || 'Asset'} actions={a && <StatusBadge value={a.status} />}
    footer={a && <><Button icon={<Eye size={14} />} loading={dl === 'pv'} onClick={preview}>Letterhead</Button>{a.status === 'approved' ? <><Button variant="success" icon={<Download size={14} />} loading={dl === 'pdf'} onClick={() => download('pdf')}>PDF</Button><Button variant="success" icon={<Download size={14} />} loading={dl === 'docx'} onClick={() => download('docx')}>Word</Button><Button icon={<Copy size={14} />} onClick={() => navigator.clipboard?.writeText(a.content).then(() => toast('Approved copy copied', 'success'))}>Copy text</Button></> : <RequestApproval type="marketing_asset" id={a.id} status={a.status} onDone={() => { reload(); onChanged(); }} />}
      {can.write && a.status !== 'awaiting_approval' && (edit ? <Button variant="primary" onClick={save}>Save</Button> : <Button icon={<Pencil size={14} />} onClick={() => setEdit(true)}>Edit</Button>)}</>}>
    {loading || !a ? <Loading /> : <div className="stack">
      <ApprovalTrail approvals={data.approvals} />
      {a.status !== 'approved' && <Notice tone="warn">Draft — not approved for external use.</Notice>}
      {edit ? <><input className="input" value={title} onChange={e => setTitle(e.target.value)} /><textarea className="doc-editor" style={{ fontFamily: 'var(--font)' }} value={content} onChange={e => setContent(e.target.value)} />{a.status === 'approved' && <Notice tone="warn">Saving changes sends this asset back to draft for re-approval.</Notice>}</> : <div className="doc-text" style={{ fontFamily: 'var(--font)' }}>{a.content}</div>}
    </div>}
    {pv && <Modal open onClose={() => { URL.revokeObjectURL(pv); setPv(null); }} title="On your letterhead" size="xl"><iframe src={pv} title="Preview" style={{ width: '100%', height: 'calc(74 * var(--vh, 1vh))', border: 0, borderRadius: 8 }} /></Modal>}
  </Drawer>;
}
