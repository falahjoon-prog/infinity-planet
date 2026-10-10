'use client';
/** Choose the photo beside a slide's text: one of our library photos, your own picture, or none. */
import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { PHOTOS, photoSrc, photoThumb, libId } from '@/lib/deck-photos';

/** Cuts a picked picture to the slide's photo frame (5 × 4.2) so it is never stretched. */
async function cropToFrame(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('That file is not a picture we can read')); img.src = url; });
    const W = 1000, H = 840; const r = Math.max(W / img.naturalWidth, H / img.naturalHeight); const w = img.naturalWidth * r, h = img.naturalHeight * r;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d')!.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return cv.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export function PhotoPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(''); const file = useRef<HTMLInputElement>(null);
  const cur = libId(value); const own = value?.startsWith('data:') ? value : null;
  const list = PHOTOS.filter(p => !q.trim() || `${p.label} ${p.tags}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <div className="ph-pick">
    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {(cur || own) ? <img className="ph-cur" src={own || photoThumb(cur!)} alt="" /> : <span className="tiny muted">No photo on this slide.</span>}
      <span className="spacer" />
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { onChange(await cropToFrame(f)); } catch (err: any) { alert(err.message); } }} />
      <button type="button" className="btn xs" onClick={() => file.current?.click()}><Upload size={12} /> Your own</button>
      {(cur || own) && <button type="button" className="btn xs" onClick={() => onChange('none')}><X size={12} /> No photo</button>}
    </div>
    <input className="input sm" placeholder="Search our photos — hotel, coast, masterplan…" value={q} onChange={e => setQ(e.target.value)} />
    <div className="ph-grid">{list.map(p => <button type="button" key={p.id} className={cur === p.id ? 'on' : ''} title={p.label} onClick={() => onChange(photoSrc(p.id))}><img src={photoThumb(p.id)} alt={p.label} loading="lazy" /><span>{p.label}</span></button>)}{!list.length && <span className="tiny muted">No photo matches “{q}”.</span>}</div>
  </div>;
}
