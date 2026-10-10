'use client';
/**
 * Arrange a slide by hand: add photos, lines, arrows, boxes, circles and text on top of the template,
 * drag to move, pull the handles to resize, bring forward / send back, recolour, delete.
 * Items are stored on the slide (slide.extras, in inches) so the screen, PowerPoint and PDF all show them.
 */
import React, { useEffect, useRef } from 'react';
import { ImagePlus, Minus, MoveUpRight, Square, Circle, Type, ArrowUpToLine, ArrowDownToLine, ChevronUp, ChevronDown, Trash2, Layers, X } from 'lucide-react';
import type { Extra, Slide } from '@/lib/deck';
import { SW, SH } from '@/lib/deck-layout';

const COLORS = ['#00324A', '#00E4FD', '#0F766E', '#C00000', '#F59E0B', '#FFFFFF', '#111827'];
const nid = () => Math.random().toString(36).slice(2, 9);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Shrinks a picked photo so decks stay light (max 1600 px), keeping PNG transparency when there is any. */
async function readPhoto(file: File): Promise<{ src: string; aspect: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('That file is not a picture we can read')); img.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)); const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0, w, h);
    let png = file.type === 'image/png';
    if (png) { const d = ctx.getImageData(0, 0, w, h).data; let alpha = false; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) { alpha = true; break; } png = alpha; }
    return { src: png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.85), aspect: w / h };
  } finally { URL.revokeObjectURL(url); }
}

export function ArrangeToolbar({ slide, sel, setSel, onChange, onClose }: { slide: Slide; sel: string | null; setSel: (id: string | null) => void; onChange: (extras: Extra[]) => void; onClose: () => void }) {
  const items = slide.extras || []; const cur = items.find(e => e.id === sel) || null;
  const file = useRef<HTMLInputElement>(null);
  const add = (e: Omit<Extra, 'id' | 'layer'> & { layer?: Extra['layer'] }) => { const x: Extra = { id: nid(), layer: 'front', ...e } as Extra; onChange([...items, x]); setSel(x.id); };
  const patch = (p: Partial<Extra>) => cur && onChange(items.map(e => e.id === cur.id ? { ...e, ...p } : e));
  const move = (to: 'up' | 'down' | 'top' | 'bottom') => {
    if (!cur) return; const rest = items.filter(e => e.id !== cur.id); const i = items.findIndex(e => e.id === cur.id);
    if (to === 'top') return onChange([...rest, { ...cur, layer: 'front' }]);
    if (to === 'bottom') return onChange([{ ...cur, layer: 'back' }, ...rest]);
    const j = to === 'up' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1); const out = [...rest]; out.splice(j, 0, cur); onChange(out);
  };
  const pick = async (f?: File | null) => { if (!f) return; try { const { src, aspect } = await readPhoto(f); const w = Math.min(6, 4.2 * Math.max(0.6, Math.min(1.6, aspect))); const h = w / aspect; add({ kind: 'image', src, x: r3((SW - w) / 2), y: r3(Math.max(0.3, (SH - h) / 2)), w: r3(w), h: r3(Math.min(h, SH - 0.4)), fit: 'cover' }); } catch (e: any) { alert(e.message); } };
  const isLine = cur && (cur.kind === 'line' || cur.kind === 'arrow');
  return <div className="arr-bar" role="toolbar" aria-label="Arrange this slide">
    <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    <button onClick={() => file.current?.click()} title="Add a photo"><ImagePlus size={16} /><span>Photo</span></button>
    <button onClick={() => add({ kind: 'line', x: 3.5, y: 3.75, w: 4, h: 0, color: '#00324A', stroke: 3 })} title="Draw a line"><Minus size={16} /><span>Line</span></button>
    <button onClick={() => add({ kind: 'arrow', x: 3.5, y: 3.75, w: 4, h: -1, color: '#C00000', stroke: 3 })} title="Draw an arrow"><MoveUpRight size={16} /><span>Arrow</span></button>
    <button onClick={() => add({ kind: 'rect', x: 4.7, y: 2.6, w: 4, h: 2.2, color: '#00E4FD', stroke: 3 })} title="Add a box"><Square size={15} /><span>Box</span></button>
    <button onClick={() => add({ kind: 'ellipse', x: 5.2, y: 2.4, w: 2.8, h: 2.8, color: '#C00000', stroke: 3 })} title="Add a circle"><Circle size={15} /><span>Circle</span></button>
    <button onClick={() => add({ kind: 'text', x: 4.2, y: 3.2, w: 5, h: 0.9, text: 'New text', size: 22, bold: true })} title="Add text"><Type size={15} /><span>Text</span></button>
    {cur && <>
      <span className="arr-sep" />
      <button onClick={() => move('top')} title="Bring to front"><ArrowUpToLine size={15} /></button>
      <button onClick={() => move('up')} title="Bring forward"><ChevronUp size={16} /></button>
      <button onClick={() => move('down')} title="Send backward"><ChevronDown size={16} /></button>
      <button onClick={() => move('bottom')} title="Send to back (behind the template's text)"><ArrowDownToLine size={15} /></button>
      <button className={cur.layer === 'back' ? 'on' : ''} onClick={() => patch({ layer: cur.layer === 'back' ? 'front' : 'back' })} title={cur.layer === 'back' ? 'Behind the slide text — click to put it in front' : 'In front of the slide text — click to put it behind'}><Layers size={15} /><span>{cur.layer === 'back' ? 'Behind' : 'In front'}</span></button>
      {cur.kind !== 'image' && <><span className="arr-sep" />
        {COLORS.map(c => <button key={c} className={`arr-sw${(cur.kind === 'text' ? cur.color : cur.fill || cur.color) === c ? ' on' : ''}`} style={{ background: c }} title={c} aria-label={`Colour ${c}`} onClick={() => patch(cur.kind === 'rect' || cur.kind === 'ellipse' ? (cur.fill ? { fill: c } : { color: c }) : { color: c })} />)}
        {(cur.kind === 'rect' || cur.kind === 'ellipse') && <button className={cur.fill ? 'on' : ''} onClick={() => patch(cur.fill ? { fill: undefined, color: cur.fill } : { fill: cur.color || '#00324A', color: undefined })} title="Filled or outline"><span>{cur.fill ? 'Filled' : 'Outline'}</span></button>}
        {(isLine || cur.kind === 'rect' || cur.kind === 'ellipse') && !cur.fill && <select className="select sm" value={cur.stroke ?? 3} onChange={e => patch({ stroke: Number(e.target.value) })} title="Thickness">{[1, 2, 3, 5, 8].map(n => <option key={n} value={n}>{n} pt</option>)}</select>}
      </>}
      {cur.kind === 'text' && <><input className="input sm arr-text" value={cur.text || ''} onChange={e => patch({ text: e.target.value })} aria-label="Text" />
        <select className="select sm" value={cur.size || 22} onChange={e => patch({ size: Number(e.target.value) })} title="Size">{[12, 14, 16, 18, 22, 28, 36, 48, 60].map(n => <option key={n} value={n}>{n}</option>)}</select>
        <button className={cur.bold ? 'on' : ''} onClick={() => patch({ bold: !cur.bold })} title="Bold"><b>B</b></button></>}
      {cur.kind === 'image' && <select className="select sm" value={cur.alpha || 0} onChange={e => patch({ alpha: Number(e.target.value) || undefined })} title="See-through">{[0, 20, 40, 60, 80].map(n => <option key={n} value={n}>{n ? `${n}% see-through` : 'Solid'}</option>)}</select>}
      <span className="arr-sep" />
      <button className="danger" onClick={() => { onChange(items.filter(e => e.id !== cur.id)); setSel(null); }} title="Delete (Del)"><Trash2 size={15} /></button>
    </>}
    <span className="spacer" />
    <button onClick={onClose} title="Done arranging"><X size={15} /><span>Done</span></button>
  </div>;
}

/** Handles over the slide: click to select, drag to move, pull a handle to resize (photos keep their shape from the corners). */
export function ArrangeOverlay({ slide, sel, setSel, onChange }: { slide: Slide; sel: string | null; setSel: (id: string | null) => void; onChange: (extras: Extra[]) => void }) {
  const ref = useRef<HTMLDivElement>(null); const items = slide.extras || [];
  const shown = items;
  const latest = useRef(items); latest.current = items;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!sel || (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) return;
      const cur = latest.current.find(x => x.id === sel); if (!cur) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onChange(latest.current.filter(x => x.id !== sel)); setSel(null); return; }
      const d = e.shiftKey ? 0.5 : 0.05; const m: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
      if (m[e.key]) { e.preventDefault(); onChange(latest.current.map(x => x.id === sel ? { ...x, x: r3(x.x + m[e.key][0]), y: r3(x.y + m[e.key][1]) } : x)); }
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [sel, onChange, setSel]);
  const start = (e: React.PointerEvent, it: Extra, mode: string) => {
    e.preventDefault(); e.stopPropagation(); setSel(it.id);
    const box = ref.current!.getBoundingClientRect(); const k = SW / box.width; const x0 = e.clientX, y0 = e.clientY; const o = { ...it }; const aspect = o.w / (o.h || 1);
    let moved = false; let raf = 0; let pending: Extra[] | null = null;
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) * k, dy = (ev.clientY - y0) * k; if (!moved && Math.abs(dx) + Math.abs(dy) < 0.02) return; moved = true;
      let n: Extra = { ...o };
      if (mode === 'move') { n.x = o.x + dx; n.y = o.y + dy; }
      else if (mode === 'p1') { n.x = o.x + dx; n.y = o.y + dy; n.w = o.w - dx; n.h = o.h - dy; }
      else if (mode === 'p2') { n.w = o.w + dx; n.h = o.h + dy; }
      else {
        let { x, y, w, h } = o;
        if (mode.includes('e')) w = Math.max(0.2, o.w + dx); if (mode.includes('s')) h = Math.max(0.2, o.h + dy);
        if (mode.includes('w')) { w = Math.max(0.2, o.w - dx); x = o.x + o.w - w; } if (mode.includes('n')) { h = Math.max(0.2, o.h - dy); y = o.y + o.h - h; }
        if (o.kind === 'image' && mode.length === 2 && !ev.shiftKey) { // corners keep the photo's shape
          if (Math.abs(dx) > Math.abs(dy)) { const nh = w / aspect; if (mode.includes('n')) y = o.y + o.h - nh; h = nh; } else { const nw = h * aspect; if (mode.includes('w')) x = o.x + o.w - nw; w = nw; }
        }
        n = { ...n, x, y, w, h };
      }
      n = { ...n, x: r3(n.x), y: r3(n.y), w: r3(n.w), h: r3(n.h) };
      pending = latest.current.map(q => q.id === it.id ? n : q);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (pending) onChange(pending); });
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (raf) cancelAnimationFrame(raf); if (moved && pending) onChange(pending); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return <div ref={ref} className="arr-layer" onPointerDown={e => { if (e.target === ref.current) setSel(null); }}>
    {shown.map(it => {
      const line = it.kind === 'line' || it.kind === 'arrow'; const on = it.id === sel;
      if (line) {
        const x = Math.min(it.x, it.x + it.w), y = Math.min(it.y, it.y + it.h), w = Math.abs(it.w), h = Math.abs(it.h);
        return <React.Fragment key={it.id}>
          <svg className={`arr-hit${on ? ' on' : ''}`} style={{ left: pct(x - 0.15, SW), top: pct(y - 0.15, SH), width: pct(w + 0.3, SW), height: pct(h + 0.3, SH) }} viewBox={`${x - 0.15} ${y - 0.15} ${w + 0.3} ${h + 0.3}`} preserveAspectRatio="none">
            <line x1={it.x} y1={it.y} x2={it.x + it.w} y2={it.y + it.h} stroke="transparent" strokeWidth={0.22} style={{ cursor: 'move', pointerEvents: 'stroke' }} onPointerDown={e => start(e, it, 'move')} />
            {on && <line x1={it.x} y1={it.y} x2={it.x + it.w} y2={it.y + it.h} stroke="#14B8A6" strokeWidth={0.02} strokeDasharray="0.08 0.06" style={{ pointerEvents: 'none' }} />}
          </svg>
          {on && <><span className="arr-h end" style={{ left: pct(it.x, SW), top: pct(it.y, SH) }} onPointerDown={e => start(e, it, 'p1')} /><span className="arr-h end" style={{ left: pct(it.x + it.w, SW), top: pct(it.y + it.h, SH) }} onPointerDown={e => start(e, it, 'p2')} /></>}
        </React.Fragment>;
      }
      return <div key={it.id} className={`arr-box${on ? ' on' : ''}`} style={{ left: pct(it.x, SW), top: pct(it.y, SH), width: pct(it.w, SW), height: pct(it.h, SH) }} onPointerDown={e => start(e, it, 'move')} title={it.kind === 'image' ? 'Drag to move · corners resize (Shift to stretch)' : 'Drag to move · handles resize'}>
        {on && ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(m => <span key={m} className={`arr-h ${m}`} onPointerDown={e => start(e, it, m)} />)}
      </div>;
    })}
  </div>;
}
