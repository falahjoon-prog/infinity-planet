'use client';
import React from 'react';
import { personName } from '@/lib/client/format';
import { Sparkles } from 'lucide-react';
import { useApp } from './app-context';

export function ProjectSelect({ value, onChange, allowNone = true, noneLabel = 'No project', className = 'select', disabled }: { value: string | null | undefined; onChange: (v: string | null) => void; allowNone?: boolean; noneLabel?: string; className?: string; disabled?: boolean }) {
  const { projects } = useApp();
  return <select className={className} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value || null)}>
    {allowNone && <option value="">{noneLabel}</option>}
    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>;
}

export function MemberSelect({ value, onChange, noneLabel = 'Unassigned', className = 'select' }: { value: string | null | undefined; onChange: (v: string | null) => void; noneLabel?: string; className?: string }) {
  const { members, me } = useApp();
  return <select className={className} value={value || ''} onChange={e => onChange(e.target.value || null)}>
    <option value="">{noneLabel}</option>
    {members.filter(m => m.role !== 'viewer' || m.id === value).map(m => <option key={m.id} value={m.id}>{personName(m)}{m.id === me.id ? ' (me)' : ''}</option>)}
  </select>;
}

/**
 * Provider picker. `builtin` adds the no-key option (e.g. "Built-in rules engine", "Infinity Search").
 * Unconfigured providers are shown disabled with the reason.
 */
export function ProviderSelect({ value, onChange, builtin, className = 'select', compact, auto }: { value: string; onChange: (v: string) => void; builtin?: string | null; className?: string; compact?: boolean; auto?: boolean }) {
  const { status } = useApp();
  const ps = status?.providers || [];
  return <span className="provider-pick">
    {!compact && <Sparkles size={15} className="muted" />}
    <select className={className} value={value} onChange={e => onChange(e.target.value)} style={compact ? { width: 'auto' } : undefined}>
      {auto && <option value="auto">Auto — best AI available{ps.some(p => p.configured) ? '' : ' (none connected: built-in)'}</option>}
      {builtin && <option value="none">{builtin}</option>}
      {ps.map(p => <option key={p.id} value={p.id} disabled={!p.configured}>{p.label}{p.configured ? ` · ${p.model}` : ' — not connected'}</option>)}
    </select>
  </span>;
}

/** First configured provider id, or fallback. */
export function useDefaultProvider(fallback = 'none') {
  const { status } = useApp();
  return status?.providers.find(p => p.configured)?.id || fallback;
}
