'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { leave } from '@/lib/client/nav-history';
import Link from 'next/link';
import { SectionTitleContext, SectionGroupContext } from './section-context';
import { Maximize2, Minimize2, X, Inbox, AlertTriangle, Info, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { colorFor, initials, label } from '@/lib/client/format';

/* ---------------- toast ---------------- */
type Toast = { id: number; text: string; tone?: 'error' | 'success' | 'info' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems(x => [...x.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems(x => x.filter(t => t.id !== id)), tone === 'error' ? 7000 : 3800);
  }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts">{items.map(t => <div key={t.id} className={`toast ${t.tone || ''}`}>{t.tone === 'error' ? <XCircle size={16} /> : t.tone === 'success' ? <CheckCircle2 size={16} /> : <Info size={16} />}<span>{t.text}</span></div>)}</div></ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

/* ---------------- primitives ---------------- */
export function Button({ variant, size, loading, icon, block, children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'gold' | 'danger' | 'ghost' | 'success' | 'danger solid'; size?: 'sm' | 'xs'; loading?: boolean; icon?: React.ReactNode; block?: boolean }) {
  return <button className={`btn ${variant || ''} ${size || ''} ${block ? 'block' : ''} ${className}`} disabled={loading || rest.disabled} {...rest}>{loading ? <span className="spin" /> : icon}{children}</button>;
}

export function Card({ title, sub, actions, children, flush, className = '', style }: { title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; flush?: boolean; className?: string; style?: React.CSSProperties }) {
  return <section className={`card ${className}`} style={style}>
    {(title || actions) && <header className="card-head"><h3>{title}{sub && <span className="sub">{sub}</span>}</h3>{actions && <div className="row">{actions}</div>}</header>}
    <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
  </section>;
}

export type BackTo = { href: string; label: string };
/** Leaves a detail page: goes back to where you came from inside the app, otherwise to the list. */
function useLeave(back?: BackTo) {
  const router = useRouter();
  return () => { if (back) leave(router, back.href); };
}

export function PageHead({ eyebrow, title, sub, actions, back }: { eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: BackTo }) {
  // Plain section names are already in the menu — only breadcrumbs (links) are shown. Descriptive one-liners are left out: the page speaks for itself.
  const crumb = eyebrow && typeof eyebrow !== 'string' ? eyebrow : null;
  const section = useContext(SectionTitleContext);
  const leave = useLeave(back);
  const backBtn = back && <button type="button" className="back-btn" onClick={leave} title={`Back to ${back.label}`}><ArrowLeft size={16} /> {back.label}</button>;
  const closeBtn = back && <button type="button" className="icon-btn close-page" onClick={leave} aria-label={`Close and go back to ${back.label}`} title={`Close — back to ${back.label}`}><X size={20} /></button>;
  const group = useContext(SectionGroupContext); void section;
  // Option C header on every page: a small teal section label, the page title, and the page's buttons on the right
  const label = crumb || (group && !(typeof title === 'string' && title.trim().toLowerCase() === group.trim().toLowerCase()) ? group : null);
  return <div className={`page-head oc${back ? ' with-back' : ''}`}><div className="page-head-text">{(backBtn || label) && <div className="head-nav">{backBtn}{label && <div className="eyebrow">{label}</div>}</div>}<h1>{title}</h1>{sub && typeof sub !== 'string' && <p>{sub}</p>}</div>{(actions || closeBtn) && <div className="page-actions">{actions}{closeBtn}</div>}</div>;
}

export function Empty({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return <div className="empty"><div className="icon">{icon || <Inbox size={20} />}</div><b>{title}</b>{children && <div className="small">{children}</div>}{action && <div className="mt12">{action}</div>}</div>;
}

export function Loading({ text = 'Loading…' }: { text?: string }) { return <div className="loading-block"><span className="spin" /> {text}</div>; }
export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <div className="notice error"><AlertTriangle size={16} /><div style={{ flex: 1 }}>{error}</div>{onRetry && <button className="link small" onClick={onRetry}>Retry</button>}</div>;
}
export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode; icon?: React.ReactNode }) {
  return <div className={`notice ${tone}`}>{icon || (tone === 'warn' || tone === 'error' ? <AlertTriangle size={16} /> : tone === 'success' ? <CheckCircle2 size={16} /> : <Info size={16} />)}<div style={{ flex: 1, minWidth: 0 }}>{children}</div></div>;
}

const TONE: Record<string, string> = {
  // generic
  active: 'blue', completed: 'green', archived: '', draft: '', pending: 'amber', approved: 'green', rejected: 'red', changes_requested: 'amber', cancelled: '', sent: 'green', failed: 'red', exported: 'navy',
  awaiting_approval: 'purple', under_review: 'purple', awaiting_review: 'purple', reviewed: 'blue', unreviewed: '',
  // project status
  due_diligence: 'purple', negotiation: 'amber', marketing: 'gold',
  // risk
  low: 'green', medium: 'amber', high: 'red', critical: 'red', Low: 'green', Medium: 'amber', High: 'red', Critical: 'red',
  // deals
  lead: '', opportunity: 'blue', contract: 'navy', lost: 'red',
  // tasks
  todo: '', in_progress: 'blue', blocked: 'red', done: 'green', urgent: 'red', normal: '',
  // docs
  indexed: 'green', needs_ocr: 'amber', pending_extraction: 'amber', unsupported: '',
  // authority
  preferred: 'blue', fallback: 'amber', historical_precedent: 'purple',
};
export function StatusBadge({ value, upper }: { value?: string | null; upper?: boolean }) {
  if (!value) return null;
  return <span className={`badge ${TONE[value] || ''} ${upper ? 'upper' : ''}`}>{label(value)}</span>;
}
export const AUTHORITY_TEXT: Record<string, string> = { approved: 'APPROVED', preferred: 'PREFERRED', fallback: 'FALLBACK', historical_precedent: 'HISTORICAL PRECEDENT', draft: 'DRAFT' };
export function AuthorityBadge({ value }: { value?: string | null }) {
  const v = value || 'draft';
  return <span className={`badge upper ${v === 'approved' ? 'green' : v === 'preferred' ? 'blue' : v === 'fallback' ? 'amber' : v === 'historical_precedent' ? 'purple' : ''}`} title={v === 'historical_precedent' ? 'Reference only — not an approved position' : undefined}>{AUTHORITY_TEXT[v] || v}</span>;
}
export function RiskBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="badge">Unrated</span>;
  const v = String(value).toLowerCase();
  return <span className={`badge upper ${v === 'critical' ? 'red' : v === 'high' ? 'red' : v === 'medium' ? 'amber' : 'green'}`} style={v === 'critical' ? { background: '#8b1a10', color: '#fff' } : undefined}>{value}</span>;
}

export function Avatar({ name, size, presence }: { name?: string | null; size?: 'sm' | 'lg'; presence?: string | null }) {
  return <span className={`avatar ${size || ''}`} style={{ background: colorFor(name) }} title={name || ''}>{initials(name)}{presence && <i className={`pres ${presence}`} />}</span>;
}

/* ---------------- forms ---------------- */
export function Field({ label: l, hint, children, className = '' }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{l}</span>{children}{hint && <small>{hint}</small>}</label>;
}
/** A small switch. With `tabs`, it shows the choices as tab buttons (the same look as the page tabs). */
export function Segmented<T extends string>({ value, options, onChange, tabs }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; tabs?: boolean }) {
  return <div className={tabs ? 'btn-tabs' : 'segmented'}>{options.map(o => <button type="button" key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: React.ReactNode; count?: number }[]; onChange: (v: T) => void }) {
  return <div className="tabs">{tabs.map(t => <button key={t.value} className={t.value === value ? 'on' : ''} onClick={() => onChange(t.value)}>{t.label}{t.count !== undefined && t.count > 0 && <span className="n">{t.count}</span>}</button>)}</div>;
}

/* ---------------- overlays ---------------- */
export function Modal({ open, onClose, title, children, footer, size }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'wide' | 'xl' | 'compose' }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className={`modal ${size || ''}`} role="dialog" aria-modal="true">
    <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    <div className="modal-body">{children}</div>{footer && <div className="modal-foot">{footer}</div>}
  </div></div>;
}
export function Drawer({ open, onClose, title, children, footer, actions, className }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  // Resizable: drag the left edge, or expand to full width. The chosen width is remembered.
  const key = `ip-drawer-w:${className || 'default'}`;
  const [w, setW] = useState<number | null>(null); const [full, setFull] = useState(false);
  useEffect(() => { if (!open) return; try { const v = Number(localStorage.getItem(key)); if (v > 300) setW(v); setFull(localStorage.getItem(`${key}:full`) === '1'); } catch { /* ignore */ } }, [open, key]);
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault(); const startX = e.clientX; const el = (e.currentTarget.parentElement as HTMLElement); const startW = el.getBoundingClientRect().width; setFull(false);
    const move = (ev: PointerEvent) => { const nw = Math.max(360, Math.min(window.innerWidth - 40, startW + (startX - ev.clientX))); setW(nw); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.userSelect = ''; try { const cur = el.getBoundingClientRect().width; localStorage.setItem(key, String(Math.round(cur))); localStorage.setItem(`${key}:full`, '0'); } catch { /* ignore */ } };
    document.body.style.userSelect = 'none'; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const toggleFull = () => setFull(f => { try { localStorage.setItem(`${key}:full`, f ? '0' : '1'); } catch { /* ignore */ } return !f; });
  if (!open) return null;
  const style = full ? { width: 'min(100vw, calc(100vw - var(--sidebar)))' } : w ? { width: `min(${w}px, 100vw)` } : undefined;
  return <><div className="drawer-overlay" onClick={onClose} /><aside className={`drawer${className ? ` ${className}` : ''}${full ? ' full' : ''}`} role="dialog" style={style}>
    <div className="drawer-grip" onPointerDown={startDrag} onDoubleClick={toggleFull} title="Drag to resize · double-click to expand" />
    <div className="modal-head"><h3 className="ellipsis">{title}</h3><div className="row">{actions}<button className="icon-btn hide-sm" onClick={toggleFull} title={full ? 'Make smaller' : 'Expand'} aria-label={full ? 'Make smaller' : 'Expand'}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div></div>
    <div className="modal-body" style={{ flex: 1 }}>{children}</div>{footer && <div className="modal-foot">{footer}</div>}
  </aside></>;
}

type ConfirmOpts = { title: string; body?: React.ReactNode; confirm?: string; danger?: boolean; requireText?: string };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => { setTyped(''); setState({ ...o, resolve }); }), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  return <ConfirmCtx.Provider value={ask}>{children}
    <Modal open={!!state} onClose={() => done(false)} title={state?.title || ''} footer={<><Button onClick={() => done(false)}>Cancel</Button><Button variant={state?.danger ? 'danger solid' : 'primary'} disabled={!!state?.requireText && typed.trim().toUpperCase() !== state.requireText.toUpperCase()} onClick={() => done(true)}>{state?.confirm || 'Confirm'}</Button></>}>
      <div className="stack" style={{ gap: 12 }}>{state?.body && <div>{state.body}</div>}{state?.requireText && <Field label={<>Type <b>{state.requireText}</b> to confirm</>}><input className="input" value={typed} onChange={e => setTyped(e.target.value)} autoFocus /></Field>}</div>
    </Modal>
  </ConfirmCtx.Provider>;
}
export const useConfirm = () => useContext(ConfirmCtx);

/* ---------------- markdown (safe subset) ---------------- */
function inline(s: string, key: string, onCite?: (c: string) => void): React.ReactNode[] {
  const out: React.ReactNode[] = []; let i = 0;
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[(?:RHC|DOC|KB)-\d+\]|\[[^\]]+\]\(((?:https?:\/\/|\/)[^)\s]+)\)|\*[^*\s][^*]*\*)/g;
  let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${key}-${k++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${key}-${k++}`}>{t.slice(1, -1)}</code>);
    else if (/^\[(RHC|DOC|KB)-\d+\]$/.test(t)) out.push(<button key={`${key}-${k++}`} className="badge blue" style={{ height: 18, padding: '0 5px', fontSize: 10.5 }} onClick={() => onCite?.(t)}>{t.slice(1, -1)}</button>);
    else if (t.startsWith('[')) { const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!; out.push(mm[2].startsWith('/') ? <Link key={`${key}-${k++}`} href={mm[2]} className="link">{mm[1]}</Link> : <a key={`${key}-${k++}`} href={mm[2]} target="_blank" rel="noreferrer">{mm[1]}</a>); }
    else out.push(<em key={`${key}-${k++}`}>{t.slice(1, -1)}</em>);
    i = m.index + t.length;
  }
  if (i < s.length) out.push(s.slice(i));
  return out;
}
export function Markdown({ text, onCite }: { text: string; onCite?: (c: string) => void }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = []; let i = 0; let k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { const buf: string[] = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; blocks.push(<pre key={k++}>{buf.join('\n')}</pre>); continue; }
    if (/^#{1,4}\s/.test(l)) { blocks.push(<h4 key={k++}>{inline(l.replace(/^#+\s/, ''), `h${k}`, onCite)}</h4>); i++; continue; }
    if (/^\s*[-*•]\s+/.test(l)) { const items: string[] = []; while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, '')); blocks.push(<ul key={k++}>{items.map((x, j) => <li key={j}>{inline(x, `u${k}${j}`, onCite)}</li>)}</ul>); continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { const items: string[] = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, '')); blocks.push(<ol key={k++}>{items.map((x, j) => <li key={j}>{inline(x, `o${k}${j}`, onCite)}</li>)}</ol>); continue; }
    if (/^>\s?/.test(l)) { const buf: string[] = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); blocks.push(<blockquote key={k++}>{inline(buf.join(' '), `q${k}`, onCite)}</blockquote>); continue; }
    if (!l.trim()) { i++; continue; }
    const buf: string[] = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s+|\s*\d+[.)]\s+|>|```)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={k++}>{buf.flatMap((b, j) => j ? [<br key={`br${j}`} />, ...inline(b, `p${k}${j}`, onCite)] : inline(b, `p${k}${j}`, onCite))}</p>);
  }
  return <div className="md">{blocks}</div>;
}

/* ---------------- small helpers ---------------- */
export function useClickAway<T extends HTMLElement>(onAway: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onAway(); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [onAway]);
  return ref;
}

export function KV({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return <dl className="kv">{items.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>;
}
