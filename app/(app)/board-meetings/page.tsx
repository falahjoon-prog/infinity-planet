'use client';
import React, { Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus } from 'lucide-react';
import { useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { PageHead, Loading, ErrorNote, Empty, Button } from '@/components/ui';
import { ago } from '@/lib/client/format';
import { formatMeetingDate, formatMeetingTime } from '@/lib/board-meeting';

export default function Page() { return <Suspense fallback={<Loading />}><BoardMeetings /></Suspense>; }

/** Weekly Board Meeting Records, newest first. */
function BoardMeetings() {
  const router = useRouter(); const { can } = useApp();
  const { data, error, loading, reload } = useApi<any>('/api/board-meetings');
  const records: any[] = data?.records || [];
  const signing = (r: any) => !r.signing.sent ? <span className="badge">Not sent</span>
    : <span className={`badge ${r.signing.signed >= r.signature_blocks ? 'green' : r.signing.signed ? 'blue' : 'amber'}`}>{r.signing.signed}/{r.signature_blocks} signed</span>;
  return <>
    <PageHead title="Weekly board meeting records" actions={can.write && <Link href="/board-meetings/new" className="btn primary"><Plus size={15} /> New record</Link>} />
    {error && <ErrorNote error={error} onRetry={reload} />}
    {loading ? <Loading /> : !records.length
      ? <div className="card"><Empty icon={<ClipboardList size={20} />} title="No board meeting records yet" action={can.write && <Button variant="primary" icon={<Plus size={15} />} onClick={() => router.push('/board-meetings/new')}>Start the first record</Button>}>
        The note taker fills in the meeting information, agenda, decisions and action items; the app makes the branded WEEKLY BOARD MEETING RECORD PDF and sends it to each member to sign.</Empty></div>
      : <div className="card table-wrap"><table className="table"><thead><tr><th>Meeting</th><th>Date</th><th className="hide-sm">Location</th><th className="hide-sm">Agenda</th><th>Signatures</th><th className="hide-sm">Saved</th></tr></thead>
        <tbody>{records.map(r => <tr key={r.id} className="clickable" onClick={() => router.push(`/board-meetings/${r.id}`)}>
          <td><b>{r.meeting_no ? `No. ${r.meeting_no}` : 'Board meeting'}</b><div className="tiny muted">{[r.note_taker && `Notes: ${r.note_taker}`, r.version > 1 && `v${r.version}`].filter(Boolean).join(' · ')}</div></td>
          <td className="small">{r.date ? formatMeetingDate(r.date, true) : '—'}{r.time && <div className="tiny muted">{formatMeetingTime(r.time)}</div>}</td>
          <td className="hide-sm small">{r.location || '—'}</td>
          <td className="hide-sm small">{r.agenda} item{r.agenda === 1 ? '' : 's'}</td>
          <td>{signing(r)}</td>
          <td className="hide-sm small muted">{ago(r.updated_at)}{r.author ? ` · ${r.author}` : ''}</td>
        </tr>)}</tbody></table></div>}
  </>;
}
