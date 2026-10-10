'use client';
import React, { useEffect, useState } from 'react';
import { Paintbrush } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { PRESETS, UiTheme, applyTheme, THEME_VERSION } from '@/lib/client/theme';
import { Card, Button, Field, Loading, Notice, useToast } from './ui';
import { DisplaySize } from './display-size';

/** Admin panel: the app's look for everyone — theme preset, sidebar (bar) colours, accent, buttons, background, corners. */
export function AppearanceSettings() {
  const toast = useToast();
  const { data, loading } = useApi<any>('/api/settings');
  const [t, setT] = useState<UiTheme | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { const u = data.settings.ui_theme || {}; setT((u.v || 0) >= THEME_VERSION ? { preset: 'slateteal', ...PRESETS.slateteal.t, ...u } : { preset: 'slateteal', ...PRESETS.slateteal.t }); } }, [data]);
  if (loading || !t) return <Loading />;
  const set = (k: keyof UiTheme, v: any) => { const n = { ...t, [k]: v }; setT(n); applyTheme(n); };
  const preset = (k: string) => { const n = { ...t, preset: k, ...PRESETS[k].t }; setT(n); applyTheme(n); };
  const save = async () => { setBusy(true); try { await api.patch('/api/settings', { ui_theme: { ...t, v: THEME_VERSION } }); toast('Appearance saved for everyone', 'success'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const reset = () => preset('slateteal');
  const C = (k: keyof UiTheme, l: string, hint?: string) => <Field label={l} hint={hint}><div className="row" style={{ gap: 8 }}><input type="color" className="input" style={{ width: 54, padding: 2 }} value={String(t[k] || '#000000')} onChange={e => set(k, e.target.value)} /><input className="input mono" value={String(t[k] || '')} onChange={e => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && set(k, e.target.value)} /></div></Field>;
  return <div className="grid g2">
    <Card title={<><Paintbrush size={15} /> App appearance (everyone)</>}>
      <div className="stack" style={{ gap: 12 }}>
        <div><div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Theme</div>
          <div className="grid g3" style={{ gap: 8 }}>{Object.entries(PRESETS).map(([k, p]) => <button key={k} type="button" onClick={() => preset(k)} className="card" style={{ padding: 8, textAlign: 'left', borderColor: t.preset === k ? 'var(--gold)' : undefined, boxShadow: t.preset === k ? '0 0 0 2px var(--gold-soft)' : undefined }}>
            <div style={{ display: 'flex', height: 34, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)' }}><span style={{ width: '32%', background: p.t.sidebar }} /><span style={{ flex: 1, background: p.t.background, display: 'flex', alignItems: 'center', gap: 4, padding: 4 }}><span style={{ width: 18, height: 8, borderRadius: 3, background: p.t.primary }} /><span style={{ width: 8, height: 8, borderRadius: 4, background: p.t.accent }} /></span></div>
            <div className="tiny mt8">{p.label}</div></button>)}</div></div>
        <div className="form-grid">
          {C('sidebar', 'Side bar colour')}{C('sidebar_text', 'Side bar text')}
          {C('primary', 'Buttons & headings', 'Main buttons and highlights')}{C('accent', 'Accent', 'Active item marker, badges, AI button ring')}
          {C('background', 'Page background')}
          <Field label="Corner roundness"><input type="range" min={4} max={18} value={t.radius || 12} onChange={e => set('radius', Number(e.target.value))} /></Field>
        </div>
        <div className="row" style={{ gap: 8 }}><Button variant="primary" loading={busy} onClick={save}>Save for everyone</Button><Button onClick={reset}>Back to default</Button></div>
        <Notice>Changes preview live on your screen; “Save for everyone” applies them to the whole team. Each person still chooses their own screen size, text size and light/dark mode.</Notice>
      </div>
    </Card>
    <Card title="My display (only me)"><DisplaySize /></Card>
  </div>;
}
