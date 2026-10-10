'use client';
/** Settings → AI: paste, test, change and remove AI keys. Keys go to the server encrypted and never come back to the browser. */
import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, ExternalLink, Trash2, PlugZap, Eye, EyeOff } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { Card, Button, Loading, ErrorNote, useToast } from '@/components/ui';

export function AiKeys() {
  const toast = useToast(); const { refreshStatus } = useApp();
  const { data, loading, error, reload } = useApi<any>('/api/ai-keys');
  const [edit, setEdit] = useState<string | null>(null); const [key, setKey] = useState(''); const [model, setModel] = useState('');
  const [busy, setBusy] = useState<string | null>(null); const [show, setShow] = useState(true); const [result, setResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const on = (e: Event) => { const id = (e as CustomEvent).detail; setEdit(id); setKey(''); setModel(''); box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; window.addEventListener('ip-add-key', on); return () => window.removeEventListener('ip-add-key', on); }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const keys: any[] = data?.keys || [];
  const done = () => { reload(); refreshStatus(); };
  const save = async (id: string) => {
    setBusy(id);
    try { await api.post('/api/ai-keys', { provider: id, key, model: model || null }); setEdit(null); setKey(''); setModel(''); done();
      const t = await api.post('/api/ai-keys', { provider: id, test: true }); setResult(r => ({ ...r, [id]: t })); toast(t.ok ? 'Key saved and working' : 'Key saved, but the test failed — see below', t.ok ? 'success' : 'error');
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const test = async (id: string) => { setBusy(id); try { const t = await api.post('/api/ai-keys', { provider: id, test: true }); setResult(r => ({ ...r, [id]: t })); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const remove = async (id: string, label: string) => { if (!window.confirm(`Remove the ${label} key?`)) return; setBusy(id); try { await api.del(`/api/ai-keys?provider=${id}`); toast('Key removed', 'success'); setResult(r => ({ ...r, [id]: undefined as any })); done(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  return <div ref={box}><Card title={<><KeyRound size={15} /> AI keys</>} sub="Paste a key to turn on written AI answers. One key is enough.">
    <div className="key-list">{keys.map(k => <div key={k.id} className="key-row">
      <div className="key-main">
        <div className="row" style={{ gap: 8 }}><b>{k.label}</b>{k.set ? <span className="badge green"><CheckCircle2 size={11} /> Connected</span> : <span className="badge">Not connected</span>}</div>
        <div className="tiny muted">{k.set ? <>Key ending <code>…{k.last4}</code>{k.model ? ` · model ${k.model}` : ''}{k.source === 'server' ? ' · from the server file' : ''}</> : <>Get a key at <a className="link" href={k.where} target="_blank" rel="noopener noreferrer">{k.where.replace(/^https:\/\//, '').split('/')[0]} <ExternalLink size={10} /></a></>}</div>
        {result[k.id] && <div className={`tiny ${result[k.id].ok ? 'text-green' : 'text-red'}`} style={{ marginTop: 4 }}>{result[k.id].message}</div>}
      </div>
      {edit !== k.id && <div className="row" style={{ gap: 6 }}>
        {k.set && <Button size="sm" icon={<PlugZap size={13} />} loading={busy === k.id} onClick={() => test(k.id)}>Test</Button>}
        <Button size="sm" variant={k.set ? undefined : 'primary'} onClick={() => { setEdit(k.id); setKey(''); setModel(k.source === 'app' ? k.model || '' : ''); }}>{k.set ? 'Change key' : 'Add key'}</Button>
        {k.source === 'app' && <button className="icon-btn" title="Remove key" onClick={() => remove(k.id, k.label)}><Trash2 size={15} /></button>}
      </div>}
      {edit === k.id && <div className="key-edit">
        <div className="key-field"><input className="input mono" type="text" name="ip-ai-key" autoFocus autoComplete="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other" style={show ? undefined : ({ WebkitTextSecurity: 'disc' } as any)} placeholder={`Paste the ${k.label} key (${k.hint.toLowerCase()})`} value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && key.trim()) save(k.id); }} /><button type="button" className="icon-btn" title={show ? 'Hide key' : 'Show key'} onClick={() => setShow(v => !v)}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>
        <input className="input" style={{ maxWidth: 200 }} placeholder="Model (optional)" value={model} onChange={e => setModel(e.target.value)} />
        <Button variant="primary" loading={busy === k.id} disabled={!key.trim()} onClick={() => save(k.id)}>Save</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
      </div>}
    </div>)}</div>
    <div className="tiny muted mt12">Keys are encrypted on the server and only the last 4 characters are ever shown. Only admins see this section. Leave the model empty to use the recommended one.</div>
  </Card></div>;
}
