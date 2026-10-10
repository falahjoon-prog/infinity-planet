'use client';
/** Make an inked company stamp or seal (round or rectangle) and save it as a stamp for signing PDFs. */
import React, { useMemo, useState } from 'react';
import { stampSvg, stampPng, StampSpec } from '@/lib/client/stamp';
import { Button, Field, Segmented } from './ui';

const COLOURS = [['#C8102E', 'Red'], ['#1C3F94', 'Navy'], ['#0F5132', 'Green'], ['#111111', 'Black']];

export function StampMaker({ defaults, onDone, onCancel, onSaveTemplate }: { defaults: Partial<StampSpec>; onDone: (png: string) => void; onCancel: () => void; onSaveTemplate?: (t: Partial<StampSpec>) => void }) {
  const [s, setS] = useState<StampSpec>({ shape: 'round', company: '', caption: 'Official Seal', name: '', role: '', color: '#C8102E', texture: true, dome: true, tilt: -4, ...defaults });
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => { const { svg } = stampSvg(s); return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }, [s]);
  const save = async () => { setBusy(true); try { const blob = await stampPng(s, 1.4); const url = await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); }); onDone(url); } finally { setBusy(false); } };
  const f = (k: keyof StampSpec) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value });
  return <div className="stamp-maker">
    <div className="stamp-preview"><img src={preview} alt="Stamp preview" /></div>
    <div className="stack" style={{ gap: 10 }}>
      <Segmented value={s.shape} onChange={(v: any) => setS({ ...s, shape: v, tilt: v === 'rect' ? -2 : -4 })} options={[{ value: 'round', label: 'Round seal' }, { value: 'rect', label: 'Rectangle' }]} />
      <div className="form-grid">
        <Field label="Company (around the top)"><input className="input" value={s.company} onChange={f('company')} maxLength={40} /></Field>
        <Field label="Caption (around the bottom)"><input className="input" value={s.caption} onChange={f('caption')} maxLength={30} /></Field>
        <Field label="Name"><input className="input" value={s.name} onChange={f('name')} maxLength={40} /></Field>
        <Field label="Title"><input className="input" value={s.role} onChange={f('role')} maxLength={40} /></Field>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="small muted">Ink</span>{COLOURS.map(([c, l]) => <button key={c} type="button" className={`swatch${s.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setS({ ...s, color: c })} aria-label={l} title={l} />)}
        <label className="check small" style={{ marginLeft: 8 }}><input type="checkbox" checked={s.texture} onChange={e => setS({ ...s, texture: e.target.checked })} /> Inked look</label>
        <label className="check small"><input type="checkbox" checked={s.dome} onChange={e => setS({ ...s, dome: e.target.checked })} /> Dome emblem</label>
      </div>
      <div className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{onSaveTemplate && <Button variant="ghost" onClick={() => onSaveTemplate({ shape: s.shape, company: s.company, caption: s.caption, color: s.color, dome: s.dome, texture: s.texture })} title="Everyone's “Make my stamp” starts from this design">Use as the company template</Button>}<span className="spacer" /><Button onClick={onCancel}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={!s.company.trim() || !s.name.trim()}>Save stamp</Button></div>
    </div>
  </div>;
}
