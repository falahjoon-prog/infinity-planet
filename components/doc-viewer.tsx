'use client';
import { Translate } from '@/components/translate';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink, Scale, RefreshCw, ScanText } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { Drawer, Loading, ErrorNote, AuthorityBadge, StatusBadge, KV, Button, useToast, Notice, RiskBadge } from './ui';
import { date, bytes, label } from '@/lib/client/format';
import { useApp } from './app-context';
import { PdfPages } from './pdf-pages';
import { useScreenItem } from '@/lib/client/screen';

export function DocViewer({ id, highlight, onClose, onChanged }: { id: string | null; highlight?: string; onClose: () => void; onChanged?: () => void }) {
  const { data, error, loading, reload } = useApi<any>(id ? `/api/documents/${id}` : null, [id]);
  const toast = useToast();
  const { can, status } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const d = data?.document;
  useScreenItem(id ? { kind: 'document', id, title: d?.name } : null);
  const open = async (download: boolean) => {
    try { const r = await api.get(`/api/documents/${id}/download${download ? '?download=1' : ''}`); window.open(r.url, '_blank', 'noopener'); } catch (e: any) { toast(e.message, 'error'); }
  };
  const act = async (kind: 'extract' | 'ocr') => {
    setBusy(kind);
    try { const r = await api.post(`/api/documents/${id}/${kind}`, {}); toast(kind === 'ocr' ? `OCR complete — ${r.ocr.characters.toLocaleString()} characters indexed` : `Re-indexed (${r.extraction.chunks} passages)`, 'success'); reload(); onChanged?.(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const text: string = d?.content_text || '';
  const marked = React.useMemo(() => {
    if (!highlight || !text) return text;
    const words = highlight.toLowerCase().split(/\W+/).filter(w => w.length > 3).slice(0, 8);
    if (!words.length) return text;
    const re = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.split(re).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part);
  }, [text, highlight]);
  const isPdf = /pdf/.test(d?.mime_type || '') || /\.pdf$/i.test(d?.name || '');
  const isImage = /^image\//.test(d?.mime_type || '');
  const canPreview = !!d?.storage_path && (isPdf || isImage);
  const needsOcr = d && (d.status === 'needs_ocr' || (!text && d.storage_path));
  const [tab, setTab] = useState<'preview' | 'text'>('text'); const [url, setUrl] = useState<string | null>(null); const [info, setInfo] = useState(false);
  useEffect(() => { setUrl(null); setInfo(false); }, [id]);
  useEffect(() => { if (!d) return; setTab(canPreview && !highlight ? 'preview' : 'text'); if (canPreview) api.get(`/api/documents/${d.id}/download`).then(r => setUrl(r.url)).catch(() => setUrl(null)); }, [d?.id]); // eslint-disable-line
  const unclear = d?.metadata?.ocr?.status === 'unclear';
  return <Drawer open={!!id} onClose={onClose} className="doc-drawer" title={d?.name || 'Document'} actions={d && <>
    {d.storage_path && <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => open(false)}>Open</Button>}
    {d.storage_path && <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => open(true)}>Download</Button>}
  </>}>
    {loading && <Loading />}
    {error && <ErrorNote error={error} onRetry={reload} />}
    {d && <div className="docv">
      <div className="docv-meta">
        <AuthorityBadge value={d.authority} />{d.review_status && d.review_status !== 'unreviewed' && <StatusBadge value={d.review_status} />}{d.source === 'google_drive' && <span className="badge green">Google Drive</span>}
        <span className="small muted">{d.project ? <Link className="link" href={`/projects/${d.project.id}`}>{d.project.name}</Link> : 'No project'} · {bytes(d.metadata?.size_bytes)} · {date(d.created_at)}</span>
        <button className="link-quiet small" onClick={() => setInfo(v => !v)}>{info ? 'Hide details' : 'Details'}</button>
      </div>
      {info && <div className="docv-info"><KV items={[
        ['Type', d.mime_type], ['Pages', d.metadata?.pages], ['Read with', d.metadata?.ocr?.method || d.metadata?.extraction], ['Search passages', data.chunk_count], ['Reading status', label(d.status)],
        ['Uploaded', `${date(d.created_at, true)}${d.uploader?.full_name ? ` by ${d.uploader.full_name}` : ''}`],
        ['Google Drive', d.web_url ? <a className="link" href={d.web_url} target="_blank" rel="noreferrer">Open in Google Drive</a> : null],
      ]} />{can.write && d.storage_path && <Button size="xs" icon={<RefreshCw size={12} />} loading={busy === 'extract'} onClick={() => act('extract')}>Read the file again</Button>}</div>}
      {d.authority === 'historical_precedent' && <Notice tone="warn">Old or signed agreement — reference only. Its terms are not approved positions.</Notice>}
      <div className="docv-actions">
        {(canPreview || text) && <div className="seg-text">{canPreview && <button className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>{isImage ? 'Picture' : 'Document'}</button>}<button className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}>Text</button></div>}
        <span className="spacer" />
        {can.write && isPdf && d.storage_path && <Link className="btn sm" href={`/pdf/${d.id}`}>Sign / edit</Link>}
        {can.write && isPdf && d.storage_path && <Link className="btn sm" href={`/pdf/${d.id}?mode=send`}>Send to sign</Link>}
        {text && <Link href={`/legal?new=1&doc=${d.id}`} className="btn sm primary"><Scale size={14} /> Legal review</Link>}
        {can.write && needsOcr && <Button size="sm" variant="primary" icon={<ScanText size={14} />} loading={busy === 'ocr'} onClick={() => act('ocr')}>Read text</Button>}
      </div>
      {needsOcr && <div className="docv-note">{unclear ? 'The built-in reader couldn’t read this clearly, so no text was kept.' : 'No text has been read from this file yet.'} {isPdf ? (status?.ocr.scanned_pdf ? 'Press “Read text” to read it with your AI.' : 'Scanned PDFs need an AI key (Settings → AI).') : status?.ocr.scanned_pdf ? 'Press “Read text” — your AI will read it.' : 'Add an AI key in Settings → AI for much better reading of photos and screenshots.'}</div>}
      {tab === 'preview' && canPreview ? <div className="docv-preview">{!url ? <Loading /> : isImage ? <img src={url} alt={d.name} /> : <div className="docv-pdf"><PdfPages url={url} width={Math.min(760, typeof window !== 'undefined' ? window.innerWidth - 80 : 760)} /></div>}</div>
        : text ? <div className="docv-textwrap"><div className="docv-tools"><Translate text={text.slice(0, 12000)} />{d.text_truncated && <span className="tiny muted">first 200,000 characters</span>}</div><div className="doc-text" dir="auto">{marked}</div></div>
        : !needsOcr && <div className="docv-note">No text in this file.</div>}
      {data.reviews?.length > 0 && <div className="docv-reviews"><b className="small">Legal reviews</b>{data.reviews.map((r: any) => <Link key={r.id} href={`/legal/${r.id}`} className="list-item" style={{ padding: '8px 0' }}><div className="main-col"><div className="title">{r.title}</div><div className="meta">{date(r.created_at)}</div></div><RiskBadge value={r.risk_rating} /></Link>)}</div>}
    </div>}
  </Drawer>;
}
