'use client';
/** Choose how a presentation looks: built-in templates, the business's own (imported from PowerPoint or learned from Google Drive). */
import React, { useRef, useState } from 'react';
import { Upload, HardDrive, Star, Trash2, Check, Sparkles } from 'lucide-react';
import { api, apiFetch } from '@/lib/client/api';
import { useApp } from './app-context';
import { Button, useToast, useConfirm } from './ui';
import { ThemePreview, useDeckThemes, ALL_BUILTIN } from './deck-view';
import { resolveTheme, DeckTheme } from '@/lib/deck-themes';
import { useBrand } from '@/lib/client/brand';

export function TemplateGallery({ value, onPick, compact }: { value: string | null | undefined; onPick: (id: string) => void; compact?: boolean }) {
  const { custom, house, reload } = useDeckThemes(); const b = useBrand(); const { me } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const canManage = ['admin', 'director', 'manager', 'marketing'].includes(me.role);
  const [busy, setBusy] = useState<string | null>(null); const [folder, setFolder] = useState(''); const [showFolder, setShowFolder] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const brand = { primary: b.primary, accent: b.accent, serif: b.serif };
  const all: DeckTheme[] = [...custom, ...ALL_BUILTIN].map(t => resolveTheme(t.id, custom, brand));
  const current = value || house?.theme_id || 'brand';
  const groups = [...new Set(all.map(t => t.category))].sort((a, c) => (a === 'Your templates' ? -2 : a === 'Business' ? -1 : 0) - (c === 'Your templates' ? -2 : c === 'Business' ? -1 : 0));
  const importPptx = async (f: File) => {
    setBusy('import');
    try { const fd = new FormData(); fd.append('file', f); const r = await apiFetch('/api/decks/themes', { method: 'POST', body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Import failed'); await reload(); onPick(j.theme.id); toast(`“${j.theme.name}” added — colours, fonts${j.read.cover ? ' and cover picture' : ''} from your PowerPoint`, 'success'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); if (file.current) file.current.value = ''; }
  };
  const learn = async () => {
    setBusy('learn');
    try { const r = await api.post('/api/decks/learn', { folder: folder.trim() || undefined }); await reload(); if (r.template) onPick(r.template.id); toast(`Learned from ${r.read.length} presentation${r.read.length === 1 ? '' : 's'}${r.house.structure.length ? ` — your usual order: ${r.house.structure.slice(0, 6).join(' → ')}` : ''}`, 'success'); setShowFolder(false); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const makeDefault = async (id: string) => { try { await api.patch('/api/decks/themes', { default: id }); await reload(); toast('New presentations will start with this template', 'success'); } catch (e: any) { toast(e.message, 'error'); } };
  const remove = async (t: DeckTheme) => { if (!(await confirm({ title: `Remove “${t.name}”?`, body: 'Presentations using it switch to “Our colours”.', confirm: 'Remove', danger: true }))) return; try { await api.del(`/api/decks/themes?id=${t.id}`); await reload(); if (current === t.id) onPick('brand'); } catch (e: any) { toast(e.message, 'error'); } };

  return <div className={`tpl-gallery${compact ? ' compact' : ''}`}>
    {canManage && <div className="tpl-actions">
      <input ref={file} type="file" accept=".pptx,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.template" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importPptx(f); }} />
      <Button size="sm" icon={<Upload size={14} />} loading={busy === 'import'} onClick={() => file.current?.click()}>Import a PowerPoint template</Button>
      <Button size="sm" icon={<HardDrive size={14} />} loading={busy === 'learn'} onClick={() => showFolder ? learn() : setShowFolder(true)}>{showFolder ? 'Learn now' : 'Learn from our Google Drive'}</Button>
      {showFolder && <input className="input sm" style={{ flex: '1 1 260px' }} value={folder} onChange={e => setFolder(e.target.value)} placeholder="Optional: paste a Drive folder link (else your newest decks)" />}
    </div>}
    {house && house.from.length > 0 && <div className="tpl-house"><Sparkles size={14} /><div><b>Learned from {house.from.length} of your presentations</b>{house.structure.length > 0 && <> — usual order: {house.structure.join(' → ')}</>}. New decks follow this.</div></div>}
    {groups.map(g => <section key={g}>
      <h4 className="tpl-group">{g}</h4>
      <div className="tpl-grid">{all.filter(t => t.category === g).map(t => <div key={t.id} className={`tpl-card${current === t.id ? ' on' : ''}`}>
        <button type="button" className="tpl-pick" onClick={() => onPick(t.id)} aria-pressed={current === t.id} aria-label={`Use ${t.name}`}>
          <div className="tpl-thumbs"><ThemePreview theme={t} /><ThemePreview theme={t} which="content" /></div>
          <div className="tpl-meta"><b>{t.name}{current === t.id && <Check size={14} />}</b>{!compact && t.description && <span>{t.description}</span>}</div>
        </button>
        {canManage && <div className="tpl-card-acts">
          <button className={`icon-btn${house?.theme_id === t.id ? ' on' : ''}`} title={house?.theme_id === t.id ? 'Default for new presentations' : 'Make this the default for new presentations'} onClick={() => makeDefault(t.id)}><Star size={14} fill={house?.theme_id === t.id ? 'currentColor' : 'none'} /></button>
          {t.category === 'Your templates' && <button className="icon-btn" title="Remove this template" onClick={() => remove(t)}><Trash2 size={14} /></button>}
        </div>}
      </div>)}</div>
    </section>)}
  </div>;
}

export function themeName(id: string | null | undefined, custom: DeckTheme[]) { return (custom.find(t => t.id === id) || ALL_BUILTIN.find(t => t.id === id) || ALL_BUILTIN[0]).name; }
