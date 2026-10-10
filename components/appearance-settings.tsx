'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Paintbrush, AlertTriangle, RotateCcw, User, Users } from 'lucide-react';
import { api, useApi, supabase } from '@/lib/client/api';
import { PRESETS, UiTheme, applyTheme, applyEffective, effectiveTheme, getMyTheme, contrast, readableOn, THEME_VERSION, MY_THEME_KEY } from '@/lib/client/theme';
import { Card, Button, Loading, useToast, InfoTip } from './ui';
import { useApp } from './app-context';
import { DisplaySize } from './display-size';

/** Which CSS variable shows the colour actually in use (for colours left on "automatic"). */
const LIVE: Partial<Record<keyof UiTheme, [string, string]>> = {
  page_title: ['--c-page-title', '#0f172a'], page_note: ['--c-page-note', '#64748b'], surface: ['--c-surface', '#ffffff'], card_title: ['--c-card-title', '#0f172a'],
  text: ['--c-text', '#0f172a'], faint: ['--c-faint', '#64748b'], topbar: ['--c-topbar', '#ffffff'], topbar_text: ['--c-topbar-text', '#0f172a'], button_text: ['--c-button-text', '#ffffff'],
};
type Row = { k: keyof UiTheme; l: string; on?: keyof UiTheme; tip?: string };
const GROUPS: { name: string; rows: Row[] }[] = [
  { name: 'Menu & top bar', rows: [{ k: 'sidebar', l: 'Menu' }, { k: 'sidebar_text', l: 'Menu text', on: 'sidebar' }, { k: 'topbar', l: 'Top bar' }, { k: 'topbar_text', l: 'Top bar text', on: 'topbar' }] },
  { name: 'Page', rows: [{ k: 'background', l: 'Page background' }, { k: 'page_title', l: 'Page titles', on: 'background', tip: 'Big headings such as "Theme & colours"' }, { k: 'page_note', l: 'Notes under titles', on: 'background', tip: 'The small line of text under a page title' }] },
  { name: 'Boxes & text', rows: [{ k: 'surface', l: 'Boxes / panels' }, { k: 'card_title', l: 'Box headings', on: 'surface' }, { k: 'text', l: 'Text', on: 'surface' }, { k: 'faint', l: 'Faint text & hints', on: 'surface' }] },
  { name: 'Buttons', rows: [{ k: 'primary', l: 'Buttons & highlights' }, { k: 'button_text', l: 'Button text', on: 'primary' }, { k: 'accent', l: 'Accent', tip: 'Active menu marker, badges, AI button ring' }] },
];
const isHex = (v: any) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Settings → Theme & colours. Everyone can change every colour for their own screens; admins also set the company default. */
export function AppearanceSettings() {
  const toast = useToast(); const { can } = useApp();
  const { data, loading } = useApi<any>('/api/settings');
  const [scope, setScope] = useState<'mine' | 'company'>('mine');
  const [t, setT] = useState<UiTheme | null>(null); const [busy, setBusy] = useState(false); const [tick, setTick] = useState(0);
  const company: UiTheme | null = data?.settings?.ui_theme || null;
  // load the colours for the chosen scope
  useEffect(() => {
    if (!data) return;
    const base = (company && (company.v || 0) >= THEME_VERSION) ? { preset: 'slateteal', ...PRESETS.slateteal.t, ...company } : { preset: 'slateteal', ...PRESETS.slateteal.t, v: THEME_VERSION };
    setT(scope === 'company' ? base : effectiveTheme(base, getMyTheme()));
  }, [data, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  // previewing someone else's colours stops when you leave this page
  useEffect(() => () => applyEffective(), []);
  useEffect(() => { if (t) { applyTheme(t); setTick(x => x + 1); } }, [t]);
  const live = useMemo(() => { const cs = typeof window === 'undefined' ? null : getComputedStyle(document.documentElement); const o: Record<string, string> = {};
    Object.entries(LIVE).forEach(([k, [v, d]]) => { const x = cs?.getPropertyValue(v).trim() || ''; o[k] = isHex(x) ? x : d; }); return o; }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading || !t) return <Loading />;
  const val = (k: keyof UiTheme) => isHex(t[k]) ? String(t[k]) : (live[k as string] || '#000000');
  const set = (k: keyof UiTheme, v: any) => setT({ ...t, [k]: v });
  const preset = (k: string) => { const n: UiTheme = { ...t, preset: k, ...PRESETS[k].t }; (['page_title', 'page_note', 'surface', 'card_title', 'text', 'faint', 'topbar', 'topbar_text', 'button_text'] as const).forEach(x => { delete n[x]; }); setT(n); };
  const save = async () => {
    setBusy(true);
    try {
      if (scope === 'company') { await api.patch('/api/settings', { ui_theme: { ...t, v: THEME_VERSION } }); applyEffective({ ...t, v: THEME_VERSION }); toast('Company colours saved — everyone who hasn\'t chosen their own sees these', 'success'); }
      else { const mine = { ...t, v: THEME_VERSION }; try { localStorage.setItem(MY_THEME_KEY, JSON.stringify(mine)); } catch {} applyEffective(); await supabase().auth.updateUser({ data: { my_theme: mine } }); toast('Your colours are saved — only your screens change', 'success'); }
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (scope === 'company') { preset('slateteal'); return; }
    try { localStorage.removeItem(MY_THEME_KEY); } catch {}
    supabase().auth.updateUser({ data: { my_theme: null } }).catch(() => {});
    const base = (company && (company.v || 0) >= THEME_VERSION) ? { preset: 'slateteal', ...PRESETS.slateteal.t, ...company } : { preset: 'slateteal', ...PRESETS.slateteal.t, v: THEME_VERSION };
    setT(base); applyEffective(); toast('Back to the company colours', 'success');
  };
  const swatch = (k: keyof UiTheme) => {
    const g = GROUPS.flatMap(x => x.rows).find(r => r.k === k)!;
    const on = g.on ? val(g.on) : null; const c = on ? contrast(val(k), on) : 21; const weak = c < 3;
    const auto = !!LIVE[k] && !isHex(t[k]);
    return <div key={k} className={`color-row${weak ? ' weak' : ''}`} title={g.tip}>
      <input type="color" className="swatch" value={val(k)} onChange={e => set(k, e.target.value)} aria-label={g.l} />
      <span className="nm">{g.l}{auto && <em> · auto</em>}</span>
      <input className="hex mono" value={isHex(t[k]) || !LIVE[k] ? String(t[k] || '') : ''} placeholder={auto ? val(k) : ''} onChange={e => { const v = e.target.value.trim(); if (!v && LIVE[k]) set(k, undefined); else if (/^#[0-9a-f]{0,6}$/i.test(v)) set(k, v); }} aria-label={`${g.l} colour code`} />
      {weak ? <button type="button" className="cwarn" title={`Hard to read on the ${GROUPS.flatMap(x => x.rows).find(r => r.k === g.on)?.l.toLowerCase()} — click to pick a readable colour`} onClick={() => set(k, readableOn(on!, k === 'page_note' || k === 'faint'))}><AlertTriangle size={14} /></button>
        : !auto && LIVE[k] ? <button type="button" className="cauto" title="Back to automatic (always readable)" onClick={() => set(k, undefined)}><RotateCcw size={12} /></button> : <span className="cgap" />}
    </div>;
  };
  return <div className="appearance">
    <Card title={<><Paintbrush size={15} /> Colours</>} actions={<div className="row" style={{ gap: 8, alignItems: 'center' }}>
      {can.admin && <div className="segmented sm" role="tablist"><button type="button" className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')} title="Only your own screens change"><User size={12} /> Only me</button><button type="button" className={scope === 'company' ? 'on' : ''} onClick={() => setScope('company')} title="The company default for everyone who hasn't chosen their own"><Users size={12} /> Company default</button></div>}
      <InfoTip title="Colours" align="right"><p>Change any colour and you see it straight away.</p><p><b>Only me</b> changes just your own screens on every device you sign in to — nobody else&apos;s.{can.admin && <> <b>Company default</b> is what everyone starts with until they pick their own.</>}</p><p>Colours marked <i>auto</i> are picked for you so they are always easy to read on their background. A ⚠ means the text would be hard to read — click it to fix.</p><p>Dark mode keeps its own colours.</p></InfoTip>
    </div>}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="theme-chips">{Object.entries(PRESETS).map(([k, p]) => <button key={k} type="button" className={t.preset === k ? 'on' : ''} onClick={() => preset(k)} title={`Start from ${p.label}`}>
          <span className="mini"><i style={{ background: p.t.sidebar }} /><i style={{ background: p.t.background }}><b style={{ background: p.t.primary }} /><b style={{ background: p.t.accent }} /></i></span>{p.label.replace(' (default)', '')}</button>)}</div>
        <div className="appearance-main">
          <div className="color-groups">{GROUPS.map(g => <div key={g.name} className="color-group"><div className="cg-name">{g.name}</div>{g.rows.map(r => swatch(r.k))}</div>)}
            <div className="color-group"><div className="cg-name">Corners</div><div className="color-row"><input type="range" min={4} max={18} value={t.radius || 12} onChange={e => set('radius', Number(e.target.value))} aria-label="Corner roundness" style={{ flex: 1 }} /><span className="nm" style={{ flex: 'none' }}>{t.radius || 12}px</span></div></div>
          </div>
          <div className="theme-preview" aria-hidden="true" style={{ ['--pv-side' as any]: val('sidebar'), ['--pv-side-ink' as any]: val('sidebar_text'), ['--pv-top' as any]: val('topbar'), ['--pv-top-ink' as any]: val('topbar_text'), ['--pv-bg' as any]: val('background'), ['--pv-title' as any]: val('page_title'), ['--pv-note' as any]: val('page_note'), ['--pv-box' as any]: val('surface'), ['--pv-box-h' as any]: val('card_title'), ['--pv-text' as any]: val('text'), ['--pv-faint' as any]: val('faint'), ['--pv-btn' as any]: val('primary'), ['--pv-btn-ink' as any]: val('button_text'), ['--pv-accent' as any]: val('accent') }}>
            <div className="pv-side"><span className="pv-logo" /><span className="pv-item on">Inbox</span><span className="pv-item">Work</span><span className="pv-item">Documents</span></div>
            <div className="pv-main"><div className="pv-top">Gmail · Team Chat</div><div className="pv-page"><div className="pv-title">Page title</div><div className="pv-note">A note under the title</div>
              <div className="pv-box"><div className="pv-box-h">Box heading</div><div className="pv-text">Normal text in a box.</div><div className="pv-faint">A faint hint</div><span className="pv-btn">Button</span></div></div></div>
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" loading={busy} onClick={save}>{scope === 'company' ? 'Save for everyone' : 'Save my colours'}</Button>
          <Button onClick={reset} title={scope === 'company' ? 'Back to the Slate & Teal look' : 'Forget my colours and use the company colours'}>{scope === 'company' ? 'Back to default' : 'Use company colours'}</Button>
        </div>
      </div>
    </Card>
    <Card title="My display (only me)"><DisplaySize /></Card>
  </div>;
}
