'use client';
import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from './app-context';

/** Splits "a@x.com, Name <b@y.com>; c@z.com" into separate addresses. */
export function splitAddresses(v: string | null | undefined): string[] {
  const out: string[] = []; let cur = ''; let angle = false; let quote = false;
  for (const ch of String(v || '')) {
    if (ch === '"') quote = !quote; if (ch === '<') angle = true; if (ch === '>') angle = false;
    if ((ch === ',' || ch === ';' || ch === '\n') && !angle && !quote) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const emailOf = (a: string) => (/<([^>]+)>/.exec(a)?.[1] || a).trim().toLowerCase();
const valid = (a: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(emailOf(a));

/**
 * Email address field like Gmail / Yahoo: each address becomes its own chip with an × to remove it.
 * Typing then Enter, comma, semicolon, Tab or leaving the field turns the text into a chip; Backspace in an empty field removes the last one.
 * The value stays a comma-separated string, so nothing else changes.
 */
export function AddressChips({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const { members } = useApp();
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = splitAddresses(value);
  const set = (l: string[]) => { const seen = new Set<string>(); onChange(l.filter(a => { const k = emailOf(a); if (seen.has(k)) return false; seen.add(k); return true; }).join(', ')); };
  const commit = (raw = text) => { const add = splitAddresses(raw); if (add.length) set([...list, ...add]); setText(''); };
  const remove = (i: number) => { set(list.filter((_, k) => k !== i)); input.current?.focus(); };
  const nameFor = (a: string) => { const m = (members || []).find((x: any) => String(x.email || '').toLowerCase() === emailOf(a)); if (m?.full_name) return m.full_name; const n = /^\s*"?([^"<]+?)"?\s*</.exec(a)?.[1]; return n || null; };
  return <div className="addr-chips" onClick={() => input.current?.focus()}>
    {list.map((a, i) => { const n = nameFor(a); const ok = valid(a); return <span key={`${a}-${i}`} className={`addr-chip${ok ? '' : ' bad'}`} title={ok ? emailOf(a) : `“${a}” doesn't look like an email address`}>
      <span className="ellipsis">{n || emailOf(a)}</span>
      <button type="button" aria-label={`Remove ${emailOf(a)}`} onClick={e => { e.stopPropagation(); remove(i); }}><X size={12} /></button>
    </span>; })}
    <input ref={input} value={text} autoFocus={autoFocus} placeholder={list.length ? '' : placeholder}
      onChange={e => { const v = e.target.value; if (/[,;]/.test(v)) commit(v); else setText(v); }}
      onKeyDown={e => {
        if ((e.key === 'Enter' || e.key === 'Tab') && text.trim()) { e.preventDefault(); commit(); }
        else if (e.key === 'Backspace' && !text && list.length) { e.preventDefault(); remove(list.length - 1); }
      }}
      onBlur={() => { if (text.trim()) commit(); }}
      onPaste={e => { const t = e.clipboardData.getData('text'); if (/[,;\n]/.test(t)) { e.preventDefault(); commit(text + t); } }} />
  </div>;
}
