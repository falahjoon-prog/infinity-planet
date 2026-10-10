'use client';
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ExternalLink, Save } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { PageHead, Loading, ErrorNote, Button, Notice, useToast } from '@/components/ui';
import { BoardRecordForm, SigningStatus, SendForSignatures } from '@/components/board-meeting-form';
import { BoardRecord, boardRecordTitle, normaliseBoardRecord } from '@/lib/board-meeting';
import s from '@/components/board-meeting.module.css';

export default function Page() { return <Suspense fallback={<Loading />}><BoardRecordPage /></Suspense>; }

/** Fill in / edit one WEEKLY BOARD MEETING RECORD ("/board-meetings/new" starts a new one). */
function BoardRecordPage() {
  const { id } = useParams<{ id: string }>(); const isNew = id === 'new';
  const router = useRouter(); const toast = useToast(); const { can } = useApp();
  const list = useApi<any>(isNew ? '/api/board-meetings' : null, [isNew]);
  const one = useApi<any>(isNew ? null : `/api/board-meetings/${id}`, [id]);
  const [rec, setRec] = useState<BoardRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [blocksAuto, setBlocksAuto] = useState(true);
  const [saving, setSaving] = useState<false | 'save' | 'open'>(false);
  const [sending, setSending] = useState(false);

  // Load the record (or the new one pre-filled from the last meeting) once per page.
  useEffect(() => { setRec(null); setDirty(false); }, [id]);
  useEffect(() => {
    if (rec) return;
    const src = isNew ? list.data?.template : one.data?.document?.id === id ? one.data.record : null;
    if (!src) return;
    const r = normaliseBoardRecord(src);
    if (isNew && !r.agenda.length) r.agenda = [{ text: '', presenter: '', attachment: '' }]; // start with one item to type into
    setRec(r); setBlocksAuto(isNew || r.signature_blocks === Math.max(1, r.attendees.length));
  }, [id, isNew, list.data, one.data, rec]);
  const set = useCallback((fn: (r: BoardRecord) => BoardRecord) => { setRec(r => (r ? fn(r) : r)); setDirty(true); }, []);
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  const save = async (open = false) => {
    if (!rec) return;
    if (open && !isNew && !dirty && one.data?.pdf_url) { window.open(one.data.pdf_url, '_blank'); return; } // nothing changed: just open it
    const w = open ? window.open('', '_blank') : null; // opened now so pop-up blockers allow it
    setSaving(open ? 'open' : 'save');
    try {
      const r = isNew ? await api.post('/api/board-meetings', { record: rec }) : await api.patch(`/api/board-meetings/${id}`, { record: rec });
      setDirty(false);
      toast(r.new_version ? 'Saved as a new version — the earlier one was already sent for signature' : `Saved “${r.document.name}” to Documents`, 'success');
      if (w) { const d = await api.get(`/api/board-meetings/${r.document.id}`); if (d.pdf_url) w.location.href = new URL(d.pdf_url, window.location.origin).href; else w.close(); }
      if (isNew || r.new_version) { setRec(null); router.replace(`/board-meetings/${r.document.id}`); } else { setRec(normaliseBoardRecord(r.record)); one.reload(); }
    } catch (e: any) { w?.close(); toast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const err = isNew ? list.error : one.error;
  if (err) return <><PageHead back={{ href: '/board-meetings', label: 'Board meetings' }} title="Weekly board meeting record" /><ErrorNote error={err} onRetry={isNew ? list.reload : one.reload} /></>;
  if (!rec) return <Loading />;
  const data = one.data?.document?.id === id ? one.data : null;
  const readOnly = !can.write || !!data?.superseded_by;
  const title = isNew ? 'New board meeting record' : boardRecordTitle(rec).replace(/^Weekly Board Meeting Record — /, 'Board meeting ');
  const actions = !readOnly && <>
    <Button icon={<ExternalLink size={15} />} loading={saving === 'open'} disabled={!!saving} onClick={() => save(true)}>{isNew || dirty ? 'Save & view PDF' : 'View PDF'}</Button>
    <Button variant="primary" icon={<Save size={15} />} loading={saving === 'save'} disabled={!!saving || (!isNew && !dirty)} onClick={() => save(false)}>{isNew ? 'Save record' : dirty ? 'Save changes' : 'Saved'}</Button>
  </>;
  return <>
    <PageHead back={{ href: '/board-meetings', label: 'Board meetings' }} title={title} actions={actions} />
    <div className="stack">
      {data?.superseded_by && <Notice tone="warn">This version was sent for signature, so changes were saved as a newer version. <Link className="link" href={`/board-meetings/${data.superseded_by}`}>Open the latest version</Link></Notice>}
      {isNew && <Notice>Fill in the meeting as it happens — save any time and come back to finish it. Saving makes the branded <b>WEEKLY BOARD MEETING RECORD</b> PDF in Documents; then send it to the members to sign.</Notice>}
      {!isNew && data && <SigningStatus data={data} dirty={dirty} onSend={() => setSending(true)} onChanged={one.reload} />}
      {!isNew && data && (data.requests || []).some((r: any) => r.status !== 'cancelled') && !data.superseded_by && can.write && <Notice>This record has been sent for signature. Saving changes keeps the sent PDF as it is and makes a new version (to be sent again).</Notice>}
      <BoardRecordForm rec={rec} set={set} disabled={readOnly} isNew={isNew} blocksAuto={blocksAuto} setBlocksAuto={setBlocksAuto} />
      {!readOnly && <div className={s.saveBar}>{dirty && <span className="small muted">Unsaved changes</span>}{actions}</div>}
    </div>
    {sending && data && <SendForSignatures data={data} onClose={() => setSending(false)} onDone={one.reload} />}
  </>;
}
