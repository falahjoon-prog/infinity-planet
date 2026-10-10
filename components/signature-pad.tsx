'use client';
import React, { useEffect, useRef, useState } from 'react';

/** Trims transparent space around a canvas drawing and returns a PNG data URL. */
function trimCanvas(c: HTMLCanvasElement, pad = 6): string | null {
  const ctx = c.getContext('2d')!; const { width: W, height: H } = c;
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d')!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o.toDataURL('image/png');
}

/** Image file → PNG data URL, optionally making near-white pixels transparent (for scanned signatures and stamps). */
export async function imageToPng(file: File, removeWhite: boolean, maxW = 900): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, maxW / img.width); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0, c.width, c.height);
    if (removeWhite) { const id = ctx.getImageData(0, 0, c.width, c.height); const d = id.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l > 225) d[i + 3] = 0; else if (l > 190) d[i + 3] = Math.round(d[i + 3] * (225 - l) / 35); } ctx.putImageData(id, 0, 0); }
    return trimCanvas(c, 2) || c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

const FONTS = [{ f: "'Dancing Script', cursive", l: 'Classic' }, { f: "'Great Vibes', cursive", l: 'Elegant' }, { f: "'Caveat', cursive", l: 'Handwritten' }];

/**
 * Create a signature: draw it (mouse, finger or pen), type it (script fonts) or upload an image (scan/photo/stamp).
 * Calls onDone with a transparent PNG data URL.
 */
export function SignaturePad({ onDone, initialMode = 'draw', defaultName = '', allowUpload = true, kind = 'signature', compact }: { onDone: (png: string, mode: string) => void; initialMode?: 'draw' | 'type' | 'upload'; defaultName?: string; allowUpload?: boolean; kind?: string; compact?: boolean }) {
  const [mode, setMode] = useState(initialMode); const [color, setColor] = useState('#13294b');
  const [name, setName] = useState(defaultName); const [font, setFont] = useState(FONTS[0].f);
  const [removeWhite, setRemoveWhite] = useState(true); const [upl, setUpl] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const last = useRef<{ x: number; y: number } | null>(null); const [empty, setEmpty] = useState(true);
  useEffect(() => { setName(defaultName); }, [defaultName]);
  useEffect(() => { const c = cv.current; if (!c) return; const r = window.devicePixelRatio || 1; const w = c.clientWidth, h = c.clientHeight; c.width = w * r * 2; c.height = h * r * 2; const ctx = c.getContext('2d')!; ctx.scale(r * 2, r * 2); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; setEmpty(true); }, [mode]);
  const pos = (e: React.PointerEvent) => { const b = cv.current!.getBoundingClientRect(); return { x: (e.clientX - b.left) * (cv.current!.clientWidth / b.width), y: (e.clientY - b.top) * (cv.current!.clientHeight / b.height) }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); (e.target as Element).setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e); const ctx = cv.current!.getContext('2d')!;
    const pr = e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5;
    ctx.strokeStyle = color; ctx.lineWidth = (kind === 'initials' ? 2.2 : 2.6) * (0.6 + pr);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.quadraticCurveTo(last.current.x, last.current.y, (last.current.x + p.x) / 2, (last.current.y + p.y) / 2); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; setEmpty(false);
  };
  const up = () => { drawing.current = false; last.current = null; };
  const clear = () => { const c = cv.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); };
  const typed = () => {
    const c = document.createElement('canvas'); const fs = kind === 'initials' ? 90 : 110; c.width = 1400; c.height = 260;
    const ctx = c.getContext('2d')!; ctx.font = `${fs}px ${font}`; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(name || ' ', 20, 130);
    return trimCanvas(c, 8);
  };
  const done = async () => {
    if (mode === 'draw') { const png = cv.current && trimCanvas(cv.current); if (png) onDone(png, 'draw'); return; }
    if (mode === 'type') { if (document.fonts?.load) await document.fonts.load(`80px ${font}`).catch(() => {}); const png = typed(); if (png) onDone(png, 'type'); return; }
    if (upl) onDone(upl, 'upload');
  };
  const T = (m: any, l: string) => <button type="button" className={`btn xs ${mode === m ? 'primary' : ''}`} onClick={() => setMode(m)}>{l}</button>;
  return <div className="stack" style={{ gap: 8 }}>
    <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>{T('draw', 'Draw')}{T('type', 'Type')}{allowUpload && T('upload', 'Upload image')}<span className="spacer" />
      {mode !== 'upload' && ['#13294b', '#111111', '#1f5fbf'].map(c => <button key={c} type="button" title="Ink colour" onClick={() => setColor(c)} style={{ width: 18, height: 18, borderRadius: 9, background: c, border: color === c ? '2px solid var(--gold)' : '2px solid transparent' }} />)}</div>
    {mode === 'draw' && <><canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} style={{ width: '100%', height: compact ? 130 : 170, border: '1px dashed #c9d3e0', borderRadius: 8, background: '#fff', touchAction: 'none', cursor: 'crosshair' }} />
      <div className="row" style={{ gap: 6 }}><span className="tiny muted">Sign with your mouse, finger or pen.</span><span className="spacer" /><button type="button" className="btn ghost xs" onClick={clear}>Clear</button></div></>}
    {mode === 'type' && <><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'initials' ? 'Your initials' : 'Your full name'} />
      <div className="row wrap" style={{ gap: 6 }}>{FONTS.map(f => <button key={f.f} type="button" onClick={() => setFont(f.f)} className="card" style={{ padding: '6px 12px', fontFamily: f.f, fontSize: 26, color, borderColor: font === f.f ? 'var(--gold)' : undefined, background: '#fff' }}>{name || 'Signature'}</button>)}</div></>}
    {mode === 'upload' && <><input type="file" accept="image/png,image/jpeg" onChange={async e => { const f = e.target.files?.[0]; if (f) setUpl(await imageToPng(f, removeWhite)); }} />
      <label className="check tiny"><input type="checkbox" checked={removeWhite} onChange={e => setRemoveWhite(e.target.checked)} /> Make the white background transparent (for a scanned signature or stamp)</label>
      {upl && <img src={upl} alt="" style={{ maxHeight: 120, maxWidth: '100%', background: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0/16px 16px', borderRadius: 6 }} />}</>}
    <div><button type="button" className="btn primary sm" disabled={(mode === 'draw' && empty) || (mode === 'type' && !name.trim()) || (mode === 'upload' && !upl)} onClick={done}>Use this {kind === 'stamp' ? 'stamp' : kind === 'initials' ? 'initials' : 'signature'}</button></div>
  </div>;
}
