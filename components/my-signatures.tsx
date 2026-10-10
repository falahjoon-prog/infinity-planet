'use client';
import React, { useEffect, useState } from 'react';
import { PenTool, Trash2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useApp } from './app-context';
import { Card, Modal, Button, useToast } from './ui';
import { SignaturePad } from './signature-pad';
import { StampMaker } from './stamp-maker';
import { useBrand } from '@/lib/client/brand';

const KINDS = [{ k: 'signature', l: 'Handwritten signature', mode: 'draw' }, { k: 'typed', l: 'Typed (digital) signature', mode: 'type' }, { k: 'initials', l: 'Initials', mode: 'draw' }, { k: 'stamp', l: 'My stamp', mode: 'upload' }];

export function useSignatures() {
  const [list, setList] = useState<any[]>([]);
  const reload = () => api.get('/api/signatures').then(r => setList(r.signatures || [])).catch(() => {});
  useEffect(() => { reload(); }, []);
  return { list, reload, setList };
}

/** Settings → My profile: create and manage my signatures, initials and stamp (and, for admins, the company stamp). */
export function MySignatures() {
  const toast = useToast(); const { me, can } = useApp(); const brand = useBrand();
  const [making, setMaking] = useState<{ company?: boolean } | null>(null);
  const [tpl, setTpl] = useState<any>(null);
  useEffect(() => { api.get('/api/signatures/template').then(r => setTpl(r.template)).catch(() => {}); }, []);
  const saveTemplate = async (t: any) => { try { const r = await api.patch('/api/signatures/template', t); setTpl(r.template); toast('Saved as the company stamp template — everyone makes their stamp from it', 'success'); } catch (e: any) { toast(e.message, 'error'); } };
  const saveStamp = async (png: string) => { try { const r = await api.post('/api/signatures', { kind: 'stamp', image: png, company: !!making?.company }); setList(r.signatures); toast('Stamp saved', 'success'); setMaking(null); } catch (e: any) { toast(e.message, 'error'); } };
  const myName = me.full_name && !/@/.test(me.full_name) ? me.full_name : '';
  const { list, setList } = useSignatures();
  const [editing, setEditing] = useState<{ k: string; l: string; mode: any; company?: boolean } | null>(null);
  const save = async (png: string) => { try { const r = await api.post('/api/signatures', { kind: editing!.k, image: png, company: editing!.company }); setList(r.signatures); toast('Saved', 'success'); setEditing(null); } catch (e: any) { toast(e.message, 'error'); } };
  const del = async (k: string, company?: boolean) => { try { const r = await api.del(`/api/signatures?kind=${k}${company ? '&company=1' : ''}`); setList(r.signatures); } catch (e: any) { toast(e.message, 'error'); } };
  const item = (owner: 'me' | 'company', k: string) => list.find(s => s.owner === owner && s.kind === k);
  const Row = ({ k, l, mode, company }: any) => { const s = item(company ? 'company' : 'me', k); return <div className="list-item" style={{ gap: 12 }}>
    <div className="main-col"><div className="title small">{l}</div>{s ? <img src={s.url} alt={l} style={{ maxHeight: 54, maxWidth: 240, marginTop: 4 }} /> : <div className="tiny muted">Not set</div>}</div>
    {k === 'stamp' && <Button size="xs" variant="primary" onClick={() => setMaking({ company })}>Make a stamp</Button>}<Button size="xs" onClick={() => setEditing({ k, l, mode, company })}>{s ? (k === 'stamp' ? 'Upload' : 'Change') : k === 'stamp' ? 'Upload' : 'Create'}</Button>{s && <button className="btn ghost xs" onClick={() => del(k, company)}><Trash2 size={12} /></button>}</div>; };
  return <Card title={<><PenTool size={15} /> My signatures & stamp</>} flush>
    <div className="list">{KINDS.map(x => <Row key={x.k} {...x} />)}{can.admin && <Row k="stamp" l="Company stamp (everyone can use it)" mode="upload" company />}</div>
    <div className="card-body tiny muted">Use these to sign PDFs in Documents → “Sign / edit PDF”. They are private to you (the company stamp is shared).</div>
    {editing && <Modal open onClose={() => setEditing(null)} title={editing.l} size="wide"><SignaturePad kind={editing.k === 'typed' ? 'signature' : editing.k} initialMode={editing.mode} defaultName={editing.k === 'initials' ? (me.full_name || '').split(/\s+/).map(w => w[0]).join('').toUpperCase() : me.full_name || ''} onDone={save} /></Modal>}
    {making && <Modal open onClose={() => setMaking(null)} title={making.company ? 'Make the company stamp' : 'Make my stamp'} size="wide"><StampMaker defaults={{ ...(tpl || { company: brand.app_name || brand.business_name, caption: 'Official Seal' }), tilt: tpl?.shape === 'rect' ? -2 : -4, name: making.company ? brand.business_name : myName, role: making.company ? '' : ((me as any).title || '') }} onDone={saveStamp} onCancel={() => setMaking(null)} onSaveTemplate={can.admin ? saveTemplate : undefined} /></Modal>}
  </Card>;
}
