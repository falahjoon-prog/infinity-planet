'use client';
/**
 * Weekly Board Meeting Record: the form the note taker fills in, the signing status of a saved record,
 * and "Send for signatures" (one secure signing link per signer, placed on that signer's own signature block).
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Download, Minus, Plus, Send, Trash2, X, PenLine } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { Button, Card, Field, Modal, Notice, StatusBadge, useToast } from '@/components/ui';
import { ago, personName } from '@/lib/client/format';
import { BoardRecord, BoardSignField, LIMITS, hasUnprintable } from '@/lib/board-meeting';
import s from './board-meeting.module.css';

type SetRec = (fn: (r: BoardRecord) => BoardRecord) => void;

/** A textarea that grows with its text (up to about 20 lines, then it scrolls). */
function GrowText({ value, onChange, minRows = 2, placeholder, disabled, label }: { value: string; onChange: (v: string) => void; minRows?: number; placeholder?: string; disabled?: boolean; label?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight + 2, 480)}px`; }, []);
  useLayoutEffect(fit, [value, fit]);
  useEffect(() => { window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, [fit]);
  return <textarea ref={ref} className="textarea" aria-label={label} rows={minRows} style={{ minHeight: 0, overflowY: 'auto' }} value={value} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} />;
}

function Tools({ i, n, onMove, onRemove, disabled }: { i: number; n: number; onMove: (to: number) => void; onRemove: () => void; disabled?: boolean }) {
  return <div className={s.tools}>
    <button type="button" title="Move up" aria-label="Move up" disabled={disabled || i === 0} onClick={() => onMove(i - 1)}><ArrowUp size={15} /></button>
    <button type="button" title="Move down" aria-label="Move down" disabled={disabled || i === n - 1} onClick={() => onMove(i + 1)}><ArrowDown size={15} /></button>
    <button type="button" title="Remove" aria-label="Remove" disabled={disabled} onClick={onRemove}><Trash2 size={15} /></button>
  </div>;
}
const move = <T,>(list: T[], from: number, to: number) => { const a = list.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

/** Attendee names as chips: type a name and press Enter, or pick a team member. */
function Attendees({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const { members } = useApp();
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const names = raw.split(/[,;\n]/).map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
    const next = value.slice();
    for (const n of names) if (!next.some(v => v.toLowerCase() === n.toLowerCase()) && next.length < LIMITS.attendees) next.push(n.slice(0, 120));
    onChange(next); setDraft('');
  };
  const team = members.filter((m: any) => m.active !== false && !m.pending).map(m => personName(m)).filter(n => !value.some(v => v.toLowerCase() === n.toLowerCase()));
  return <div className="stack" style={{ gap: 6 }}>
    <div className={s.attendees}>
      {value.map((n, i) => <span key={`${n}-${i}`} className={s.person}>{n}{!disabled && <button type="button" aria-label={`Remove ${n}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><X size={13} /></button>}</span>)}
      {!disabled && <input value={draft} placeholder={value.length ? 'Add another name…' : 'Type a name and press Enter'} onChange={e => { const v = e.target.value; if (/[,;]/.test(v)) add(v); else setDraft(v); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(draft); } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)); }} onBlur={() => draft.trim() && add(draft)} />}
    </div>
    {!disabled && team.length > 0 && <select className="select sm" value="" onChange={e => e.target.value && add(e.target.value)} aria-label="Add a team member" style={{ maxWidth: 280 }}>
      <option value="">+ Add a team member…</option>{team.map(n => <option key={n} value={n}>{n}</option>)}
    </select>}
  </div>;
}

/** The whole form. `blocksAuto`: the number of signature blocks still follows the number of attendees. */
export function BoardRecordForm({ rec, set, disabled, isNew, blocksAuto, setBlocksAuto }: { rec: BoardRecord; set: SetRec; disabled?: boolean; isNew?: boolean; blocksAuto: boolean; setBlocksAuto: (v: boolean) => void }) {
  const { members } = useApp();
  const people = useMemo(() => Array.from(new Set(['Team', ...rec.attendees, ...members.filter((m: any) => m.active !== false).map(m => personName(m))])).filter(Boolean), [rec.attendees, members]);
  const field = <K extends keyof BoardRecord>(k: K) => (v: BoardRecord[K]) => set(r => ({ ...r, [k]: v }));
  const setAttendees = (a: string[]) => set(r => ({ ...r, attendees: a, signature_blocks: blocksAuto ? Math.max(1, Math.min(LIMITS.blocks, a.length || r.signature_blocks)) : r.signature_blocks }));
  const unprintable = useMemo(() => hasUnprintable(JSON.stringify(rec)), [rec]);
  return <div className="stack">
    <datalist id="bm-people">{people.map(p => <option key={p} value={p} />)}</datalist>
    {unprintable && <Notice tone="warn">Some text uses characters the PDF cannot print (for example Persian or Arabic script). They will show as “?” — please write the record in English.</Notice>}

    <Card title="Meeting information">
      <div className="form-grid">
        <Field label="Date"><input className="input" type="date" value={rec.date} disabled={disabled} onChange={e => field('date')(e.target.value)} /></Field>
        <Field label="No of meeting" hint={isNew && rec.meeting_no ? 'Suggested: the last record’s number + 1' : undefined}><input className="input" inputMode="numeric" value={rec.meeting_no} disabled={disabled} onChange={e => field('meeting_no')(e.target.value)} placeholder="e.g. 164" /></Field>
        <Field label="Time"><input className="input" type="time" value={/^\d{1,2}:\d{2}$/.test(rec.time) || !rec.time ? rec.time : ''} disabled={disabled} onChange={e => field('time')(e.target.value)} /></Field>
        <Field label="Called by"><input className="input" list="bm-people" value={rec.called_by} disabled={disabled} onChange={e => field('called_by')(e.target.value)} /></Field>
        <Field label="Location"><input className="input" value={rec.location} disabled={disabled} onChange={e => field('location')(e.target.value)} placeholder="e.g. Arana Hills Office" /></Field>
        <Field label="Note taker"><input className="input" list="bm-people" value={rec.note_taker} disabled={disabled} onChange={e => field('note_taker')(e.target.value)} /></Field>
        <div className="field full"><span>Attendees</span><Attendees value={rec.attendees} onChange={setAttendees} disabled={disabled} /></div>
        <Field label="Guests"><input className="input" value={rec.guests} disabled={disabled} onChange={e => field('guests')(e.target.value)} /></Field>
        <Field label="Absents"><input className="input" value={rec.absents} disabled={disabled} onChange={e => field('absents')(e.target.value)} /></Field>
      </div>
    </Card>

    <Card title="Agenda" sub={`${rec.agenda.length} item${rec.agenda.length === 1 ? '' : 's'}`}>
      <div className={s.items}>
        {rec.agenda.map((a, i) => <div key={i} className={s.item}>
          <span className={s.num}>{i + 1}</span>
          <div className={s.itemBody}>
            <GrowText label={`Agenda item ${i + 1}`} value={a.text} minRows={3} disabled={disabled} placeholder="What was discussed or agreed…" onChange={v => set(r => ({ ...r, agenda: r.agenda.map((x, k) => k === i ? { ...x, text: v } : x) }))} />
            <div className={s.itemMeta}>
              <label><span className={s.mini}>Presenter</span><input className="input" list="bm-people" value={a.presenter} disabled={disabled} onChange={e => set(r => ({ ...r, agenda: r.agenda.map((x, k) => k === i ? { ...x, presenter: e.target.value } : x) }))} /></label>
              <label><span className={s.mini}>Attachment</span><input className="input" value={a.attachment} disabled={disabled} placeholder="optional" onChange={e => set(r => ({ ...r, agenda: r.agenda.map((x, k) => k === i ? { ...x, attachment: e.target.value } : x) }))} /></label>
              <Tools i={i} n={rec.agenda.length} disabled={disabled} onMove={to => set(r => ({ ...r, agenda: move(r.agenda, i, to) }))} onRemove={() => set(r => ({ ...r, agenda: r.agenda.filter((_, k) => k !== i) }))} />
            </div>
          </div>
        </div>)}
      </div>
      {!disabled && <Button className="mt12" icon={<Plus size={15} />} disabled={rec.agenda.length >= LIMITS.agenda} onClick={() => set(r => ({ ...r, agenda: [...r.agenda, { text: '', presenter: '', attachment: '' }] }))}>Add agenda item</Button>}
    </Card>

    <Card title="Decisions">
      <div className={s.items}>
        {rec.decisions.map((d, i) => <div key={i} className={s.item}>
          <span className={s.num}>{i + 1}</span>
          <div className={s.itemBody}>
            <GrowText label={`Decision ${i + 1}`} value={d} disabled={disabled} onChange={v => set(r => ({ ...r, decisions: r.decisions.map((x, k) => k === i ? v : x) }))} />
            <Tools i={i} n={rec.decisions.length} disabled={disabled} onMove={to => set(r => ({ ...r, decisions: move(r.decisions, i, to) }))} onRemove={() => set(r => ({ ...r, decisions: r.decisions.filter((_, k) => k !== i) }))} />
          </div>
        </div>)}
      </div>
      {!rec.decisions.length && <p className="small muted" style={{ margin: 0 }}>No decisions yet. The PDF shows empty numbered rows.</p>}
      {!disabled && <Button className="mt12" icon={<Plus size={15} />} disabled={rec.decisions.length >= LIMITS.decisions} onClick={() => set(r => ({ ...r, decisions: [...r.decisions, ''] }))}>Add decision</Button>}
    </Card>

    <Card title="New action items">
      <div className={s.items}>
        {rec.actions.map((a, i) => <div key={i} className={s.item}>
          <span className={s.num}>{i + 1}</span>
          <div className={s.itemBody}>
            <GrowText label={`Action item ${i + 1}`} value={a.action} disabled={disabled} placeholder="What needs to be done" onChange={v => set(r => ({ ...r, actions: r.actions.map((x, k) => k === i ? { ...x, action: v } : x) }))} />
            <div className={s.actionMeta}>
              <label><span className={s.mini}>Responsible</span><input className="input" list="bm-people" value={a.responsible} disabled={disabled} onChange={e => set(r => ({ ...r, actions: r.actions.map((x, k) => k === i ? { ...x, responsible: e.target.value } : x) }))} /></label>
              <label><span className={s.mini}>Due date</span><input className="input" type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(a.due) || !a.due ? a.due : ''} disabled={disabled} onChange={e => set(r => ({ ...r, actions: r.actions.map((x, k) => k === i ? { ...x, due: e.target.value } : x) }))} /></label>
              <Tools i={i} n={rec.actions.length} disabled={disabled} onMove={to => set(r => ({ ...r, actions: move(r.actions, i, to) }))} onRemove={() => set(r => ({ ...r, actions: r.actions.filter((_, k) => k !== i) }))} />
            </div>
          </div>
        </div>)}
      </div>
      {!rec.actions.length && <p className="small muted" style={{ margin: 0 }}>No action items yet. The PDF shows empty numbered rows.</p>}
      {!disabled && <Button className="mt12" icon={<Plus size={15} />} disabled={rec.actions.length >= LIMITS.actions} onClick={() => set(r => ({ ...r, actions: [...r.actions, { action: '', responsible: '', due: '' }] }))}>Add action item</Button>}
    </Card>

    <Card title="Approval of previous minutes">
      <GrowText label="Approval of previous minutes" value={rec.previous_minutes} disabled={disabled} placeholder="e.g. Minutes of meeting No. 163 were read and approved." onChange={field('previous_minutes')} />
    </Card>
    <Card title="Other notes & information">
      <GrowText label="Other notes and information" value={rec.other_notes} minRows={3} disabled={disabled} onChange={field('other_notes')} />
    </Card>

    <Card title="Signatures">
      <div className="row wrap" style={{ gap: 14 }}>
        <div className={s.stepper} role="group" aria-label="Number of signature blocks">
          <button type="button" aria-label="Fewer" disabled={disabled || rec.signature_blocks <= 1} onClick={() => { setBlocksAuto(false); set(r => ({ ...r, signature_blocks: Math.max(1, r.signature_blocks - 1) })); }}><Minus size={15} /></button>
          <span>{rec.signature_blocks}</span>
          <button type="button" aria-label="More" disabled={disabled || rec.signature_blocks >= LIMITS.blocks} onClick={() => { setBlocksAuto(false); set(r => ({ ...r, signature_blocks: Math.min(LIMITS.blocks, r.signature_blocks + 1) })); }}><Plus size={15} /></button>
        </div>
        <div className="small muted" style={{ flex: '1 1 260px' }}>Signature blocks{blocksAuto ? ' — one per attendee' : ''}. Names are <b>not</b> printed: when a member signs electronically, their signature, name and the date are added to their block.
          {!blocksAuto && !disabled && rec.attendees.length > 0 && <> <button type="button" className="link" onClick={() => { setBlocksAuto(true); set(r => ({ ...r, signature_blocks: Math.max(1, r.attendees.length) })); }}>Match attendees ({rec.attendees.length})</button></>}</div>
      </div>
      <div className={s.sigPreview} aria-hidden>{Array.from({ length: Math.min(rec.signature_blocks, 8) }, (_, i) => <div key={i} className={s.sigCard}><b>Signatory {i + 1}</b><i /><span>Signature</span><u>Name:</u><u>Date:</u></div>)}{rec.signature_blocks > 8 && <div className={s.sigCard} style={{ display: 'grid', placeItems: 'center' }}>+{rec.signature_blocks - 8} more</div>}</div>
    </Card>
  </div>;
}

/* ------------------------------------------------------------------ status of a saved record */
const sigLabel = (r: any) => r.status === 'signed' ? `signed ${ago(r.signed_at)}` : r.status === 'viewed' ? `opened ${ago(r.viewed_at)}` : r.status === 'declined' ? `declined${r.declined_reason ? `: “${r.declined_reason}”` : ''}` : `sent ${ago(r.created_at)}`;
export function SigningStatus({ data, onSend, onChanged, dirty }: { data: any; onSend: () => void; onChanged: () => void; dirty: boolean }) {
  const toast = useToast(); const { can } = useApp();
  const reqs: any[] = (data.requests || []).filter((r: any) => r.status !== 'cancelled');
  const cancel = async (id: string) => { try { await api.del(`/api/sign-requests/${id}`); toast('Signing link cancelled', 'success'); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  const blocks = data.blocks?.length || 0; const signedN = reqs.filter(r => r.status === 'signed').length;
  return <Card title="PDF & signatures" sub={`Version ${data.version}${data.document?.updated_at ? ` · saved ${ago(data.document.updated_at)}` : ''}`}>
    <div className={s.status}>
      <div className={s.bar}>
        {data.pdf_url && <a className="btn sm" href={data.pdf_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open PDF</a>}
        {data.download_url && <a className="btn sm" href={data.download_url}><Download size={14} /> Download</a>}
        <Link className="btn sm ghost" href={`/documents?open=${data.document.id}`}>In Documents</Link>
        <span className="spacer" />
        {can.write && !data.superseded_by && <Button size="sm" variant="primary" icon={<Send size={14} />} disabled={dirty} title={dirty ? 'Save your changes first' : undefined} onClick={onSend}>Send for signatures</Button>}
      </div>
      {dirty && <div className="tiny muted" style={{ textAlign: 'right' }}>Save your changes before sending for signatures.</div>}
      {data.signed && <Notice tone="success"><b>Signed copy</b> — {data.signed.signatures} of {blocks} signature{blocks === 1 ? '' : 's'} so far. <a className="link" href={data.signed.url} target="_blank" rel="noreferrer">Open</a> · <a className="link" href={data.signed.download_url}>Download</a></Notice>}
      {reqs.length > 0 && <div>
        <b className="small">Signing links ({signedN}/{reqs.length} signed)</b>
        <div className="mt8">{reqs.sort((a, b) => (a.block - b.block) || String(a.created_at).localeCompare(String(b.created_at))).map(r => <div key={r.id} className={s.reqRow}>
          <span className="small muted">{r.block >= 0 ? `Signatory ${r.block + 1}` : 'Other boxes'}</span>
          <span style={{ minWidth: 0 }}><b>{r.signer_name}</b> <span className="muted small">&lt;{r.signer_email}&gt;</span><div className="tiny muted">{sigLabel(r)}</div></span>
          <span className="row" style={{ gap: 6 }}><StatusBadge value={r.status} />{can.write && ['sent', 'viewed'].includes(r.status) && <button className="link tiny" onClick={() => cancel(r.id)}>Cancel</button>}</span>
        </div>)}</div>
      </div>}
      {!reqs.length && <p className="small muted" style={{ margin: 0 }}>Not sent for signature yet. Each signer gets their own secure link; their signature, name and the date go into their own block, and all signatures collect on one signed copy.</p>}
    </div>
  </Card>;
}

/* ------------------------------------------------------------------ send for signatures */
type Choice = { who: string; name: string; email: string }; // who: '' (not now) | 'other' | member id
export function SendForSignatures({ data, onClose, onDone }: { data: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast(); const { members } = useApp();
  const team = members.filter((m: any) => m.email && m.active !== false && !m.pending);
  const active = (data.requests || []).filter((r: any) => ['sent', 'viewed', 'signed'].includes(r.status));
  const taken = (i: number) => active.find((r: any) => r.block === i);
  const rec = data.record;
  // Block n is suggested for attendee n: a team member with that name, otherwise "someone else" with the name filled in.
  const suggest = (): Choice[] => (data.blocks || []).map((_: any, i: number) => {
    if (taken(i)) return { who: '', name: '', email: '' };
    const n = rec.attendees?.[i]; if (!n) return { who: '', name: '', email: '' };
    const m = team.find(t => personName(t).toLowerCase() === n.toLowerCase() || (t.full_name || '').toLowerCase() === n.toLowerCase());
    return m ? { who: m.id, name: personName(m), email: m.email || '' } : { who: 'other', name: n, email: '' };
  });
  const [choices, setChoicesRaw] = useState<Choice[]>(suggest);
  const [touched, setTouched] = useState(false);
  const setChoices: typeof setChoicesRaw = v => { setTouched(true); setChoicesRaw(v); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!touched) setChoicesRaw(suggest()); }, [team.length]); // the team list arrived after opening
  const [message, setMessage] = useState(`Please sign the ${data.title}. Your name and the date are added to your signature block automatically when you sign.`);
  const [days, setDays] = useState(14); const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false); const [results, setResults] = useState<any[] | null>(null);
  const pick = (i: number, who: string) => setChoices(cs => cs.map((c, k) => { if (k !== i) return c; if (!who || who === 'other') return { who, name: who === 'other' ? c.name : '', email: who === 'other' ? (c.who === 'other' ? c.email : '') : '' }; const m = team.find(t => t.id === who)!; return { who, name: personName(m), email: m.email || '' }; }));
  const chosen = choices.map((c, i) => ({ ...c, i })).filter(c => c.who);
  const send = async () => {
    for (const c of chosen) {
      if (c.name.trim().length < 2) { toast(`Signatory ${c.i + 1}: type the signer's name`, 'error'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) { toast(`Signatory ${c.i + 1}: enter a valid email`, 'error'); return; }
    }
    const emails = chosen.map(c => c.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) { toast('The same person is chosen for two signature blocks', 'error'); return; }
    setBusy(true); const out: any[] = [];
    for (const c of chosen) {
      const fields: BoardSignField[] = data.blocks[c.i].fields;
      try { const r = await api.post('/api/sign-requests', { document_id: data.document.id, title: data.title, signer_name: c.name.trim(), signer_email: c.email.trim(), message, expires_days: days, email, fields }); out.push({ ...c, ok: true, link: r.link, draft: r.email_draft_id }); }
      catch (e: any) { out.push({ ...c, ok: false, error: e.message }); }
    }
    setBusy(false); setResults(out); onDone();
  };
  if (results) return <Modal open onClose={onClose} title="Signing links created" size="wide" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
    <div className="stack" style={{ gap: 10 }}>
      {results.map(r => <div key={r.i} className={s.signerRow}>
        <b className="small">Signatory {r.i + 1}</b>
        <div style={{ minWidth: 0 }}>
          <div className="small"><b>{r.name}</b> <span className="muted">&lt;{r.email}&gt;</span></div>
          {r.ok ? <div className="row mt8" style={{ gap: 6 }}><input className="input sm mono" readOnly value={r.link} aria-label={`Signing link for ${r.name}`} /><Button size="sm" icon={<Copy size={13} />} onClick={() => { navigator.clipboard?.writeText(r.link); toast('Link copied', 'success'); }} aria-label="Copy link" /></div>
            : <div className="small" style={{ color: 'var(--red)' }}>Not sent: {r.error}</div>}
        </div>
      </div>)}
      {results.some(r => r.ok && r.draft) && <Notice>An email with each person’s link is waiting in <Link className="link" href="/gmail?tab=drafts">Gmail → Drafts</Link>. Request approval, then send them.</Notice>}
      <div className="tiny muted">The links are shown only now — copy them if you will send them yourself. You get a notification as each person signs.</div>
    </div>
  </Modal>;
  return <Modal open onClose={onClose} title={<><PenLine size={15} /> Send for signatures</>} size="wide" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!chosen.length} onClick={send} icon={<Send size={14} />}>{chosen.length ? `Create ${chosen.length} signing link${chosen.length === 1 ? '' : 's'}` : 'Choose who signs'}</Button></>}>
    <div className="stack" style={{ gap: 12 }}>
      <p className="small muted" style={{ margin: 0 }}>Choose who signs each block. Each person signs only their own block; their name and the date are filled in when they sign, and every signature is collected on one signed copy.</p>
      <div>{choices.map((c, i) => { const t = taken(i); return <div key={i} className={s.signerRow}>
        <b className="small" style={{ paddingTop: 8 }}>Signatory {i + 1}</b>
        {t ? <div className="small" style={{ paddingTop: 8 }}><b>{t.signer_name}</b> <span className="muted">&lt;{t.signer_email}&gt;</span> <StatusBadge value={t.status} /></div>
          : <div style={{ minWidth: 0 }}>
            <select className="select" value={c.who} onChange={e => pick(i, e.target.value)} aria-label={`Signer for signatory ${i + 1}`}>
              <option value="">— Not now —</option>
              {team.map(m => <option key={m.id} value={m.id}>{personName(m)} — {m.email}</option>)}
              <option value="other">Someone else…</option>
            </select>
            {c.who === 'other' && <div className={s.signerFields}>
              <input className="input" placeholder="Full name" value={c.name} onChange={e => setChoices(cs => cs.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} aria-label="Signer name" />
              <input className="input" type="email" placeholder="Email" value={c.email} onChange={e => setChoices(cs => cs.map((x, k) => k === i ? { ...x, email: e.target.value } : x))} aria-label="Signer email" />
            </div>}
          </div>}
      </div>; })}</div>
      <div className="form-grid">
        <Field label="Message (optional)" className="full"><textarea className="textarea" value={message} onChange={e => setMessage(e.target.value)} /></Field>
        <Field label="Links expire after"><select className="select" value={days} onChange={e => setDays(Number(e.target.value))}>{[3, 7, 14, 30, 60].map(d => <option key={d} value={d}>{d} days</option>)}</select></Field>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> Prepare an email to each signer (Gmail → Drafts, sent after approval)</label>
      </div>
    </div>
  </Modal>;
}
