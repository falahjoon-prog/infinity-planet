'use client';
import React, { useEffect, useRef, useState } from 'react';
import { MousePointer2, PenTool, Type, CalendarDays, Check, X, Highlighter, Eraser, Minus, Stamp, Trash2, ZoomIn, ZoomOut, Save, Send, Signature as SigIcon } from 'lucide-react';
import { PdfPages } from './pdf-pages';
import { SignaturePad } from './signature-pad';
import { useSignatures } from './my-signatures';
import { Modal, Button, Field, useToast, Notice } from './ui';
import { useApp } from './app-context';

export type Ann = { id: string; page: number; type: 'image' | 'text' | 'rect' | 'highlight' | 'check' | 'cross' | 'line' | 'field'; x: number; y: number; w: number; h: number; text?: string; size?: number; color?: string; image?: string; bold?: boolean; kind?: 'signature' | 'initials' | 'date' | 'name' | 'text'; label?: string; required?: boolean };
type Tool = 'select' | 'sign' | 'text' | 'date' | 'check' | 'cross' | 'highlight' | 'whiteout' | 'line' | 'f-signature' | 'f-initials' | 'f-date' | 'f-name' | 'f-text';
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
async function toDataUrl(url: string): Promise<string> { const b = await fetch(url).then(r => r.blob()); return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); }); }
const imgRatio = (src: string) => new Promise<number>(res => { const i = new Image(); i.onload = () => res(i.width / Math.max(1, i.height)); i.onerror = () => res(3); i.src = src; });

const FIELD_STYLE: Record<string, { label: string; color: string; w: number; h: number }> = {
  signature: { label: 'Signature', color: '#1f5fbf', w: 0.26, h: 0.055 }, initials: { label: 'Initials', color: '#6b4fb3', w: 0.09, h: 0.04 },
  date: { label: 'Date', color: '#2f8a57', w: 0.18, h: 0.03 }, name: { label: 'Full name', color: '#b7791f', w: 0.24, h: 0.03 }, text: { label: 'Text', color: '#555', w: 0.24, h: 0.03 },
};

/**
 * PDF editor. mode "edit": sign and annotate yourself (saved as a new signed copy).
 * mode "send": place boxes for a client to sign online.
 */
export function PdfEditor({ url, mode, onSave, saving }: { url: string; mode: 'edit' | 'send'; onSave: (anns: Ann[]) => void; saving?: boolean }) {
  const toast = useToast(); const { me } = useApp();
  const [anns, setAnns] = useState<Ann[]>([]); const [sel, setSel] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>(mode === 'send' ? 'f-signature' : 'select');
  const [width, setWidth] = useState(820); const [sigChoice, setSigChoice] = useState<string | null>(null); const [pad, setPad] = useState(false);
  const { list: sigs, reload } = useSignatures();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { const fit = () => { const w = wrap.current?.clientWidth || 900; setWidth(Math.max(420, Math.min(1000, w - 40))); }; fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !(e.target as HTMLElement).closest('textarea,input')) { setAnns(a => a.filter(x => x.id !== sel)); setSel(null); } if (e.key === 'Escape') { setSel(null); setTool('select'); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [sel]);
  const upd = (id: string, p: Partial<Ann>) => setAnns(a => a.map(x => x.id === id ? { ...x, ...p } : x));

  const place = async (page: number, x: number, y: number) => {
    if (tool === 'select') { setSel(null); return; }
    let a: Ann | null = null;
    const at = (w: number, h: number) => ({ x: Math.max(0, Math.min(1 - w, x - w / 2)), y: Math.max(0, Math.min(1 - h, y - h / 2)), w, h });
    if (tool === 'sign') {
      if (!sigChoice) { setPad(true); return; }
      const r = await imgRatio(sigChoice); const w = 0.24; const h = Math.min(0.2, w / r / 1.414);
      a = { id: uid(), page, type: 'image', image: sigChoice, ...at(w, Math.max(0.025, h)) };
    }
    else if (tool === 'text') a = { id: uid(), page, type: 'text', text: '', size: 11, color: '#111111', x: Math.min(0.7, x), y: Math.max(0, Math.min(0.97, y - 0.015)), w: 0.3, h: 0.03 };
    else if (tool === 'date') a = { id: uid(), page, type: 'text', text: today(), size: 11, color: '#111111', x: Math.min(0.8, x), y: Math.max(0, Math.min(0.975, y - 0.0125)), w: 0.2, h: 0.025 };
    else if (tool === 'check' || tool === 'cross') a = { id: uid(), page, type: tool, color: '#13294b', ...at(0.03, 0.022) };
    else if (tool === 'highlight') a = { id: uid(), page, type: 'highlight', color: '#ffe066', ...at(0.3, 0.022) };
    else if (tool === 'whiteout') a = { id: uid(), page, type: 'rect', color: '#ffffff', ...at(0.3, 0.025) };
    else if (tool === 'line') a = { id: uid(), page, type: 'line', color: '#111111', ...at(0.3, 0.008) };
    else if (tool.startsWith('f-')) { const kind = tool.slice(2) as Ann['kind']; const st = FIELD_STYLE[kind!]; a = { id: uid(), page, type: 'field', kind, label: st.label, required: true, ...at(st.w, st.h) }; }
    if (a) { setAnns(x => [...x, a!]); setSel(a.id); if (a.type === 'text' && tool === 'text') setTimeout(() => document.getElementById(`t-${a!.id}`)?.focus(), 30); }
  };

  const chooseSig = async (s: any) => { try { setSigChoice(await toDataUrl(s.url)); setTool('sign'); } catch { toast('Could not load the signature', 'error'); } };

  // drag / resize
  const drag = useRef<{ id: string; mode: 'move' | 'size'; sx: number; sy: number; a: Ann; w: number; h: number } | null>(null);
  const startDrag = (e: React.PointerEvent, a: Ann, m: 'move' | 'size', size: { w: number; h: number }) => { e.stopPropagation(); if ((e.target as HTMLElement).closest('textarea')) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { id: a.id, mode: m, sx: e.clientX, sy: e.clientY, a: { ...a }, w: size.w, h: size.h }; setSel(a.id); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; const dx = (e.clientX - d.sx) / d.w, dy = (e.clientY - d.sy) / d.h;
    if (d.mode === 'move') upd(d.id, { x: Math.max(0, Math.min(1 - d.a.w, d.a.x + dx)), y: Math.max(0, Math.min(1 - d.a.h, d.a.y + dy)) });
    else { const keep = d.a.type === 'image'; const w = Math.max(0.02, Math.min(1 - d.a.x, d.a.w + dx)); upd(d.id, { w, h: keep ? Math.max(0.01, d.a.h * (w / d.a.w)) : Math.max(0.008, Math.min(1 - d.a.y, d.a.h + dy)) }); } };
  const endDrag = () => { drag.current = null; };

  const render = (page: number, size: { w: number; h: number; pw: number; ph: number }) => anns.filter(a => a.page === page).map(a => {
    const st: React.CSSProperties = { position: 'absolute', left: a.x * size.w, top: a.y * size.h, width: a.w * size.w, height: a.h * size.h, cursor: 'move', outline: sel === a.id ? '1.5px dashed #1f5fbf' : 'none', touchAction: 'none' };
    const fs = (a.size || 11) * size.w / size.pw;
    let inner: React.ReactNode = null;
    if (a.type === 'image') inner = <img src={a.image} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />;
    else if (a.type === 'text') inner = sel === a.id ? <textarea id={`t-${a.id}`} value={a.text} onChange={e => upd(a.id, { text: e.target.value })} placeholder="Type here" style={{ width: '100%', height: '100%', resize: 'none', border: 0, background: 'rgba(255,255,255,.7)', font: `${a.bold ? 700 : 400} ${fs}px Helvetica, Arial, sans-serif`, color: a.color, padding: 0, lineHeight: 1.05, overflow: 'hidden' }} /> : <div style={{ font: `${a.bold ? 700 : 400} ${fs}px Helvetica, Arial, sans-serif`, color: a.color, whiteSpace: 'pre', lineHeight: 1.05 }}>{a.text || <span style={{ color: '#999' }}>Text</span>}</div>;
    else if (a.type === 'rect') inner = <div style={{ width: '100%', height: '100%', background: a.color, boxShadow: sel === a.id ? 'inset 0 0 0 1px #ccc' : 'none' }} />;
    else if (a.type === 'highlight') inner = <div style={{ width: '100%', height: '100%', background: a.color, opacity: 0.38 }} />;
    else if (a.type === 'line') inner = <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: Math.max(1, a.h * size.h * 0.3), background: a.color, transform: 'translateY(-50%)' }} />;
    else if (a.type === 'check' || a.type === 'cross') inner = <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: a.color }}>{a.type === 'check' ? <Check size={Math.min(st.width as number, st.height as number)} strokeWidth={3} /> : <X size={Math.min(st.width as number, st.height as number)} strokeWidth={3} />}</div>;
    else if (a.type === 'field') { const fsty = FIELD_STYLE[a.kind!]; inner = <div style={{ width: '100%', height: '100%', border: `1.5px solid ${fsty.color}`, background: `${fsty.color}1a`, color: fsty.color, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', padding: '0 6px', borderRadius: 3 }}>{a.kind === 'signature' ? '✍ ' : ''}{a.label}{a.required && a.kind === 'text' ? ' *' : ''}</div>; }
    return <div key={a.id} style={st} onPointerDown={e => startDrag(e, a, 'move', size)} onPointerMove={onMove} onPointerUp={endDrag} onClick={e => e.stopPropagation()}>
      {inner}
      {sel === a.id && <><span onPointerDown={e => startDrag(e, a, 'size', size)} onPointerMove={onMove} onPointerUp={endDrag} style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, background: '#1f5fbf', borderRadius: 3, cursor: 'nwse-resize' }} />
        <button onPointerDown={e => e.stopPropagation()} onClick={() => { setAnns(x => x.filter(y => y.id !== a.id)); setSel(null); }} title="Remove" style={{ position: 'absolute', right: -10, top: -22, background: '#c0392b', color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: 11 }}><Trash2 size={11} /></button></>}
    </div>;
  });

  const selected = anns.find(a => a.id === sel);
  const TB = (t: Tool, icon: React.ReactNode, l: string) => <button className={`btn xs ${tool === t ? 'primary' : ''}`} title={l} onClick={() => setTool(t)}>{icon}<span className="hide-sm"> {l}</span></button>;
  const mySigs = sigs.filter(s => s.owner === 'me'); const company = sigs.filter(s => s.owner === 'company');
  return <div className="stack" style={{ gap: 10 }}>
    <div className="card" style={{ padding: 8, position: 'sticky', top: 56, zIndex: 5 }}>
      <div className="row wrap" style={{ gap: 4, alignItems: 'center' }}>
        {TB('select', <MousePointer2 size={13} />, 'Select')}
        {mode === 'edit' ? <>
          <span className="row" style={{ gap: 2 }}>{TB('sign', <PenTool size={13} />, 'Sign')}
            <select className="select sm" style={{ width: 'auto' }} value="" onChange={e => { const v = e.target.value; if (v === '__new') setPad(true); else { const s = sigs.find(x => `${x.owner}:${x.kind}` === v); if (s) chooseSig(s); } }}>
              <option value="">{sigChoice ? 'Signature ✓ — change…' : 'Choose signature…'}</option>
              {mySigs.map(s => <option key={s.kind} value={`me:${s.kind}`}>My {s.kind === 'typed' ? 'typed signature' : s.kind}</option>)}
              {company.map(s => <option key={s.kind} value={`company:${s.kind}`}>Company {s.kind}</option>)}
              <option value="__new">Draw / type a new one…</option></select></span>
          {TB('text', <Type size={13} />, 'Text')}{TB('date', <CalendarDays size={13} />, 'Date')}{TB('check', <Check size={13} />, 'Tick')}{TB('cross', <X size={13} />, 'Cross')}
          {TB('highlight', <Highlighter size={13} />, 'Highlight')}{TB('whiteout', <Eraser size={13} />, 'White-out')}{TB('line', <Minus size={13} />, 'Line')}
        </> : <>
          {TB('f-signature', <SigIcon size={13} />, 'Signature box')}{TB('f-initials', <PenTool size={13} />, 'Initials')}{TB('f-date', <CalendarDays size={13} />, 'Date signed')}{TB('f-name', <Type size={13} />, 'Name')}{TB('f-text', <Type size={13} />, 'Text box')}
        </>}
        <span className="spacer" />
        <button className="btn ghost xs" onClick={() => setWidth(w => Math.max(420, w - 100))} title="Zoom out"><ZoomOut size={13} /></button><button className="btn ghost xs" onClick={() => setWidth(w => Math.min(1400, w + 100))} title="Zoom in"><ZoomIn size={13} /></button>
        <Button size="sm" variant="primary" icon={mode === 'edit' ? <Save size={13} /> : <Send size={13} />} loading={saving} disabled={!anns.length} onClick={() => onSave(anns)}>{mode === 'edit' ? 'Save signed copy' : 'Next: who signs'}</Button>
      </div>
      {selected && (selected.type === 'text' || selected.type === 'check' || selected.type === 'cross' || selected.type === 'line' || selected.type === 'highlight' || selected.type === 'rect' || selected.type === 'field') && <div className="row wrap mt8" style={{ gap: 8, alignItems: 'center' }}>
        {selected.type === 'text' && <><label className="tiny muted">Size</label><select className="select sm" style={{ width: 'auto' }} value={selected.size} onChange={e => upd(selected.id, { size: Number(e.target.value) })}>{[8, 9, 10, 11, 12, 14, 16, 18, 22, 28].map(n => <option key={n} value={n}>{n}</option>)}</select>
          <label className="check tiny"><input type="checkbox" checked={!!selected.bold} onChange={e => upd(selected.id, { bold: e.target.checked })} /> Bold</label></>}
        {selected.type !== 'field' && selected.type !== 'rect' && <><label className="tiny muted">Colour</label>{['#111111', '#13294b', '#1f5fbf', '#c0392b', '#2f8a57', ...(selected.type === 'highlight' ? ['#ffe066', '#a7f3d0'] : [])].map(c => <button key={c} onClick={() => upd(selected.id, { color: c })} style={{ width: 16, height: 16, borderRadius: 8, background: c, border: selected.color === c ? '2px solid var(--gold)' : '1px solid #ccc' }} />)}</>}
        {selected.type === 'field' && <><label className="tiny muted">Label</label><input className="input sm" style={{ width: 180 }} value={selected.label || ''} onChange={e => upd(selected.id, { label: e.target.value })} />{selected.kind === 'text' && <label className="check tiny"><input type="checkbox" checked={!!selected.required} onChange={e => upd(selected.id, { required: e.target.checked })} /> Required</label>}</>}
        <span className="tiny muted">Drag to move · corner to resize · Delete key removes</span>
      </div>}
      {mode === 'edit' && tool === 'sign' && !sigChoice && <div className="tiny mt8" style={{ color: 'var(--amber)' }}>Choose a signature above (or draw a new one), then click where it goes.</div>}
      {mode === 'send' && <div className="tiny muted mt8">Click on the page to place boxes for the signer. Date and name fill in automatically when they sign.</div>}
    </div>
    <div ref={wrap} style={{ background: '#e7ebf0', borderRadius: 12, padding: '20px 10px 30px', overflow: 'auto', cursor: tool === 'select' ? 'default' : 'crosshair' }}>
      <PdfPages url={url} width={width} overlay={render} onPageClick={(p, x, y) => place(p, x, y)} />
    </div>
    {pad && <Modal open onClose={() => setPad(false)} title="Your signature" size="wide"><SignaturePad defaultName={me.full_name || ''} onDone={async png => { setSigChoice(png); setTool('sign'); setPad(false); }} /><Notice>Save signatures permanently in Settings → My profile → My signatures.</Notice></Modal>}
  </div>;
}
