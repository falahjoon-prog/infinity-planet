'use client';
import React, { useState } from 'react';
import { ListChecks, Plus, Trash2, Pencil, Users, User, Check, X, Zap } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { Card, Button, Loading, ErrorNote, Segmented, useToast, useConfirm } from './ui';

const EXAMPLES = [
  'Remind me 15 minutes before meetings',
  'Always write my emails as project manager',
  'Never use exclamation marks in emails',
  'Always cc Ramin on Harbourline emails',
  'Whenever I say morning, show what needs my attention today',
  'Reply to me in Farsi',
];

/** Settings → AI rules: standing commands Infinity AI follows every time. */
export function AiRules() {
  const toast = useToast(); const confirm = useConfirm();
  const { data, error, loading, reload } = useApi<any>('/api/ai/rules');
  const [text, setText] = useState(''); const [scope, setScope] = useState<'me' | 'team'>('me'); const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const rules: any[] = data?.rules || []; const me = data?.me; const canTeam = !!data?.can_team; const isAdmin = !!data?.can_admin;
  const mayEdit = (r: any) => r.owner_id === me || isAdmin;
  const add = async (t = text) => {
    if (t.trim().length < 3) return;
    setBusy(true);
    try { const r = await api.post('/api/ai/rules', { text: t, scope }); toast(r.duplicate ? 'You already have this rule' : 'Saved — Infinity AI will follow it from now on', 'success'); setText(''); reload(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const save = async () => { if (!edit) return; try { await api.patch('/api/ai/rules', { id: edit.id, text: edit.text }); setEdit(null); reload(); toast('Rule updated', 'success'); } catch (e: any) { toast(e.message, 'error'); } };
  const flip = async (r: any) => { try { await api.patch('/api/ai/rules', { id: r.id, scope: r.scope === 'team' ? 'me' : 'team' }); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const del = async (r: any) => { if (!(await confirm({ title: 'Remove this rule?', body: r.text, confirm: 'Remove', danger: true }))) return; try { await api.del(`/api/ai/rules?id=${r.id}`); reload(); toast('Rule removed', 'success'); } catch (e: any) { toast(e.message, 'error'); } };
  const team = rules.filter(r => r.scope === 'team'); const mine = rules.filter(r => r.scope === 'me');
  const row = (r: any, n: number) => <div className="rule-row" key={r.id}>
    <span className="rule-n">{n}</span>
    {edit?.id === r.id
      ? <div className="rule-edit"><input className="input" autoFocus value={edit?.text || ""} onChange={e => setEdit({ id: r.id, text: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEdit(null); }} /><button className="icon-btn" title="Save" onClick={save}><Check size={15} /></button><button className="icon-btn" title="Cancel" onClick={() => setEdit(null)}><X size={15} /></button></div>
      : <div className="rule-text"><div>{r.text}</div><div className="tiny muted">{r.scope === 'team' ? <>Whole team{r.owner_name ? ` · set by ${r.owner_id === me ? 'you' : r.owner_name}` : ''}</> : 'Only for you'}{r.defaults ? <> · <span title="Works even without an AI key"><Zap size={11} style={{ verticalAlign: -1 }} /> works without an AI key</span></> : ''}</div></div>}
    {mayEdit(r) && edit?.id !== r.id && <div className="rule-acts">
      {canTeam && <button className="icon-btn" title={r.scope === 'team' ? 'Make it only for me' : 'Make it a rule for the whole team'} onClick={() => flip(r)}>{r.scope === 'team' ? <Users size={15} /> : <User size={15} />}</button>}
      <button className="icon-btn" title="Edit" onClick={() => setEdit({ id: r.id, text: r.text })}><Pencil size={15} /></button>
      <button className="icon-btn" title="Remove" onClick={() => del(r)}><Trash2 size={15} /></button>
    </div>}
  </div>;
  return <div className="stack">
    <Card title={<><ListChecks size={15} /> Add a rule</>}>
      <div className="rule-add">
        <input className="input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="e.g. Always remind me 15 minutes before meetings" maxLength={600} />
        {canTeam && <Segmented value={scope} onChange={setScope} options={[{ value: 'me', label: 'Just me' }, { value: 'team', label: 'Whole team' }]} />}
        <Button variant="primary" icon={<Plus size={14} />} loading={busy} onClick={() => add()}>Save rule</Button>
      </div>
      <div className="rule-examples"><span className="tiny muted">Examples:</span>{EXAMPLES.map(x => <button key={x} type="button" className="chip" onClick={() => setText(x)}>{x}</button>)}</div>
      <div className="tiny muted mt8">You can also just tell Infinity AI in chat: <b>“from now on…”</b>, <b>“always…”</b>, <b>“never…”</b>, <b>“whenever I say … , …”</b> or <b>“remember…”</b>. Say <b>“show my rules”</b> to list them and <b>“forget rule 2”</b> to remove one.</div>
    </Card>
    <Card title={`Rules Infinity AI follows for you (${rules.length})`} flush>
      {!rules.length ? <div className="small muted" style={{ padding: '14px 16px' }}>No rules yet. Add one above, or tell Infinity AI in chat.</div> : <div className="rule-list">
        {team.length > 0 && <div className="rule-group">Whole team</div>}
        {team.map(r => row(r, rules.indexOf(r) + 1))}
        {mine.length > 0 && <div className="rule-group">Only for you</div>}
        {mine.map(r => row(r, rules.indexOf(r) + 1))}
      </div>}
    </Card>
    <div className="tiny muted">With an AI key (Settings → AI) Infinity AI follows every rule. Without one, the built-in engine follows the rules marked <Zap size={11} style={{ verticalAlign: -1 }} /> (meeting length and reminders, task reminders and priority, who your emails are written as) and your “whenever I say …” shortcuts.</div>
  </div>;
}
