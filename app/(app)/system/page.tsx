'use client';
import { EmailLookSettings, MySignature } from '@/components/email-settings';
import { DisplaySize } from '@/components/display-size';
import { MySignatures } from '@/components/my-signatures';
import { AppearanceSettings } from '@/components/appearance-settings';
import { AiKeys } from '@/components/ai-keys';
import { AiRules } from '@/components/ai-rules';
import { OrgEditor } from '@/components/org-editor';
import { MigrationHelp } from '@/components/migration-help';
import { MyMailboxCard } from '@/components/my-mailbox';
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Plug, Users, Settings2, User, Activity, Monitor, Smartphone, RefreshCw, Plus, KeyRound, Copy, ShieldCheck, Pencil, Trash2, PenLine, Building2, Mail, Palette, Sparkles, HeartPulse, ScrollText, SlidersHorizontal, ListChecks } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { PageHead, Card, Loading, ErrorNote, Empty, Button, Tabs, Modal, Field, KV, Notice, Avatar, StatusBadge, useToast } from '@/components/ui';
import { ActivityList } from '@/components/lists';
import { BusinessSettings } from '@/components/business-settings';
import { BulkAdd, AccessRequests } from '@/components/team-access';
import { AreaLevels, DutyPicker, ApprovesPicker, WhoDoesWhat, withDutyAreas, areaCount, ROLE_APPROVES } from '@/components/access-editor';
import { useBrand } from '@/lib/client/brand';
import { label, ago, personName } from '@/lib/client/format';

type Tab = 'airules' | 'profile' | 'display' | 'signatures' | 'business' | 'email' | 'appearance' | 'rules' | 'ai' | 'google' | 'team' | 'status' | 'apps' | 'audit';
const OLD_TABS: Record<string, Tab> = { integrations: 'ai', settings: 'rules' };
export default function Page() { return <Suspense fallback={<Loading />}><System /></Suspense>; }

function System() {
  const sp = useSearchParams(); const { can, status } = useApp(); const toast = useToast();
  const want = sp.get('tab') || ''; const initial = (OLD_TABS[want] || want) as Tab;
  const [tab, setTabState] = useState<Tab>(initial || (sp.get('google') ? 'google' : 'profile'));
  useEffect(() => { const t = sp.get('tab'); if (t) setTabState((OLD_TABS[t] || t) as Tab); }, [sp]);
  const setTab = (t: Tab) => { setTabState(t); try { const u = new URL(window.location.href); u.searchParams.set('tab', t); u.searchParams.delete('google'); window.history.replaceState(null, '', u.toString()); } catch { /* ignore */ } };
  useEffect(() => { const g = sp.get('google'); if (g === 'connected') toast('Google Workspace connected', 'success'); if (g === 'error') toast(`Google: ${sp.get('message') || 'connection failed'}`, 'error'); }, []); // eslint-disable-line
  const groups: { name: string; items: { id: Tab; label: string; icon: React.ReactNode; admin?: boolean; sub?: string }[] }[] = [
    { name: 'You', items: [
      { id: 'profile', label: 'My profile', icon: <User size={15} />, sub: 'Your name, colour, language, display size and password.' },
      { id: 'display', label: 'Display & text size', icon: <Monitor size={15} />, sub: 'How big the screen and the writing look for you, and light or dark mode. Saved to your account.' },
      { id: 'signatures', label: 'My signatures', icon: <PenLine size={15} />, sub: 'Your email signature, and the signatures and stamps you use on PDFs.' }] },
    { name: 'Company', items: [
      { id: 'business', label: 'Business details', icon: <Building2 size={15} />, admin: true, sub: 'Name, logo, colours and contact details used on letters and emails.' },
      { id: 'email', label: 'Email look', icon: <Mail size={15} />, admin: true, sub: 'How outgoing emails look.' },
      { id: 'appearance', label: 'Theme & colours', icon: <Palette size={15} />, sub: 'Choose the colour of everything — only your own screens change.' },
      { id: 'rules', label: 'Legal & policies', icon: <SlidersHorizontal size={15} />, admin: true, sub: 'Legal identity, approval rules and instructions the AI follows.' }] },
    { name: 'Connections', items: [
      { id: 'ai', label: 'AI', icon: <Sparkles size={15} />, sub: 'Add an AI key and choose which AI the assistant uses.' },
      { id: 'airules', label: 'AI rules', icon: <ListChecks size={15} />, sub: 'Commands and rules Infinity AI follows every time — your own, and the ones for the whole team.' },
      { id: 'google', label: 'Google (Gmail, Drive, Calendar)', icon: <Plug size={15} />, sub: 'The Google account connected for the team.' }] },
    { name: 'Team', items: [{ id: 'team', label: 'Team & access', icon: <Users size={15} />, sub: 'Members, roles, what each person can open, and password resets.' }] },
    { name: 'System', items: [
      { id: 'status', label: 'Health check', icon: <HeartPulse size={15} />, sub: 'Whether everything is connected and working.' },
      { id: 'apps', label: 'Desktop & phone apps', icon: <Monitor size={15} />, sub: 'Install Infinity Planet on PCs and phones.' },
      { id: 'audit', label: 'Audit log', icon: <ScrollText size={15} />, sub: 'Who changed what, and when.' }] },
  ];
  const visible = groups.map(g => ({ ...g, items: g.items.filter(i => !i.admin || can.admin) })).filter(g => g.items.length);
  const all = visible.flatMap(g => g.items); const cur = all.find(i => i.id === tab) || all[0];
  return <div className="settings">
    <nav className="settings-nav" aria-label="Settings">
      {visible.map(g => <React.Fragment key={g.name}><div className="group">{g.name}</div>{g.items.map(i => <button key={i.id} className={cur.id === i.id ? 'on' : ''} onClick={() => setTab(i.id)}>{i.icon}{i.label}</button>)}</React.Fragment>)}
    </nav>
    <div className="settings-body">
      <h2>{cur.label}</h2>{cur.sub && <div className="small muted sub">{cur.sub}</div>}
      {status && !status.supabase.migration_v4 && <MigrationHelp error={status.supabase.migration_error} />}
      {cur.id === 'profile' && <Profile />}
      {cur.id === 'display' && <Card><DisplaySize /></Card>}
      {cur.id === 'signatures' && <><MySignature /><MySignatures /></>}
      {cur.id === 'business' && <BusinessSettings />}
      {cur.id === 'email' && <EmailLookSettings />}
      {cur.id === 'appearance' && <AppearanceSettings />}
      {cur.id === 'rules' && <SettingsTab />}
      {cur.id === 'ai' && <AiSection />}
      {cur.id === 'airules' && <AiRules />}
      {cur.id === 'google' && <GoogleSection />}
      {cur.id === 'team' && <><TeamAdmin /><div style={{ height: 16 }} /><OrgEditor /></>}
      {cur.id === 'status' && <Status />}
      {cur.id === 'apps' && <Apps />}
      {cur.id === 'audit' && <Audit />}
    </div>
  </div>;
}

function Ok({ ok }: { ok: boolean }) { return ok ? <CheckCircle2 size={18} color="var(--green)" /> : <XCircle size={18} color="var(--ink-4)" />; }

function Status() {
  const { status, refreshStatus } = useApp();
  if (!status) return <Loading />;
  return <div className="grid g2">
    <Card title="AI providers" actions={<Button size="sm" icon={<RefreshCw size={13} />} onClick={refreshStatus}>Re-check</Button>} flush>
      <div className="list">{status.providers.map(p => <div key={p.id} className="list-item"><Ok ok={p.configured} /><div className="main-col"><div className="title">{p.label}</div><div className="meta" style={{ whiteSpace: 'normal' }}>{p.detail}</div></div></div>)}</div>
    </Card>
    <Card title="Built-in engines (no key required)" flush><div className="list">
      <div className="list-item"><Ok ok /><div className="main-col"><div className="title">Legal AI rules engine</div><div className="meta">Contract analysis, risk rating, missing protections, clause-library comparison</div></div></div>
      <div className="list-item"><Ok ok /><div className="main-col"><div className="title">Designer & template engine</div><div className="meta">Layouts, themes, project-data fill, drafting templates</div></div></div>
      <div className="list-item"><Ok ok /><div className="main-col"><div className="title">Infinity Search & AI bot (built-in)</div><div className="meta">Full-text search with citations; the bot understands tasks, reminders, meetings, notes, documents and designs without a key</div></div></div>
      <div className="list-item"><Ok ok={status.ocr.images} /><div className="main-col"><div className="title">OCR — images</div><div className="meta">Built-in Tesseract, offline — photos are read automatically on upload</div></div></div>
      <div className="list-item"><Ok ok={status.ocr.scanned_pdf} /><div className="main-col"><div className="title">OCR — scanned PDFs</div><div className="meta">{status.ocr.scanned_pdf ? 'Uses your Gemini / Claude / OpenAI key' : 'Needs a Gemini, Claude or OpenAI key'}</div></div></div>
    </div></Card>
    <Card title="Database & storage" flush><div className="list">
      <div className="list-item"><Ok ok /><div className="main-col"><div className="title">Supabase connection</div><div className="meta">Authentication and database reachable</div></div></div>
      <div className="list-item"><Ok ok={status.supabase.migration_v4} /><div className="main-col"><div className="title">Database migrations (004, 005, 006)</div><div className="meta">{status.supabase.migration_v4 ? 'Applied' : `Not applied — run the files in supabase/migrations in order (${status.supabase.migration_error})`}</div></div></div>
      <div className="list-item"><Ok ok={status.supabase.storage_bucket} /><div className="main-col"><div className="title">Document storage bucket</div><div className="meta">{status.supabase.storage_bucket ? 'rhc-documents (private)' : 'Created automatically on first upload'}</div></div></div>
    </div></Card>
    <Card title="Google Workspace" flush><div className="list">
      <div className="list-item"><Ok ok={status.google.configured} /><div className="main-col"><div className="title">OAuth credentials</div><div className="meta">{status.google.configured ? 'GOOGLE_CLIENT_ID / SECRET set' : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local'}</div></div></div>
      <div className="list-item"><Ok ok={status.google.connected} /><div className="main-col"><div className="title">Connected account</div><div className="meta">{status.google.connected ? status.google.account || 'Connected' : label(status.google.status)}</div></div></div>
    </div></Card>
  </div>;
}

function GoogleSection() {
  const { status, can, refreshStatus } = useApp(); const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!status) return <Loading />;
  const connect = async () => { setBusy(true); try { const r = await api.post('/api/google/oauth'); window.location.href = r.url; } catch (e: any) { toast(e.message, 'error'); setBusy(false); } };
  const disconnect = async () => { setBusy(true); try { await api.post('/api/google/disconnect'); toast('Disconnected', 'success'); refreshStatus(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  return <>
    <Card title={<><Plug size={15} /> Google Workspace — Gmail, Calendar, Drive</>}>
      <div className="stack">
        <KV items={[['Status', <StatusBadge key="s" value={status.google.connected ? 'completed' : status.google.status === 'expired' ? 'failed' : 'draft'} />], ['Account', status.google.account], ['Scopes', 'Drive (read-only), Gmail (read, draft, send), Calendar (read/write)'], ['Redirect URI', status.google.redirect_uri ? <code className="small">{status.google.redirect_uri}</code> : null]]} />
        {!status.google.configured ? <Notice tone="warn">Google OAuth credentials are not set on the server. Create an OAuth client in Google Cloud Console (APIs: Gmail, Calendar, Drive), add the redirect URI above, then set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and <code>GOOGLE_ENCRYPTION_KEY</code> in <code>.env.local</code> and restart. See SETUP.md.</Notice>
          : can.admin ? <div className="row">{status.google.connected ? <><Button loading={busy} onClick={connect}>Reconnect</Button><Button variant="danger" loading={busy} onClick={disconnect}>Disconnect</Button></> : <Button variant="primary" loading={busy} onClick={connect}>Connect Google Workspace</Button>}</div>
          : <Notice>Only an admin or director can connect Google.</Notice>}
        <Notice>One Google account (e.g. the business&apos;s shared mailbox) is connected for the whole team. The refresh token is encrypted with AES-256-GCM on the server and is never sent to browsers.</Notice>
      </div>
    </Card>
  </>;
}

function AiSection() {
  const { status, can, refreshStatus } = useApp();
  return <>
    {can.admin ? <AiKeys /> : <Card><div className="small muted">An admin adds the AI keys for the team.</div></Card>}
    <Card title="Which AI the assistant uses">
      <div className="list" style={{ marginBottom: 6 }}>{(status?.providers || []).map(p => <div key={p.id} className="list-item" style={{ padding: '6px 0' }}><Ok ok={p.configured} /><div className="main-col"><div className="title">{p.label}</div><div className="meta" style={{ whiteSpace: 'normal' }}>{p.detail}</div></div></div>)}</div>
      <Button size="sm" icon={<RefreshCw size={13} />} onClick={refreshStatus}>Check again</Button>
      {can.admin && <BotProvider />}
      <div className="tiny muted mt12">Without a key, the built-in engine still searches your records, reads documents and creates tasks, reminders and notes.</div>
    </Card>
  </>;
}

/** Who can run the app: the main admin plus any second admins. */
function AdminsCard({ members, meId, onChanged }: { members: any[]; meId: string; onChanged: () => void }) {
  const toast = useToast(); const [pick, setPick] = useState('');
  const admins = members.filter(m => m.role === 'admin' && m.active !== false && !m.pending).sort((a, b) => (b.owner ? 1 : 0) - (a.owner ? 1 : 0));
  const others = members.filter(m => m.role !== 'admin' && m.active !== false && !m.pending);
  const set = async (m: any, role: string) => { try { await api.patch(`/api/team/members/${m.id}`, { role, custom_role: null }); toast(role === 'admin' ? `${personName(m)} is now an admin` : `${personName(m)} is no longer an admin`, 'success'); setPick(''); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  return <Card title={<><ShieldCheck size={15} /> Admins</>}><div className="stack small" style={{ gap: 8 }}>
    {admins.map(m => <div key={m.id} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
      <div className="row" style={{ gap: 8 }}><Avatar name={personName(m)} size="sm" /><div><b>{personName(m)}</b>{m.id === meId && <span className="muted"> (you)</span>}<div className="tiny muted">{m.owner ? 'Main admin · always stays admin' : 'Admin'}</div></div></div>
      {!m.owner && m.id !== meId && <Button size="xs" onClick={() => { if (window.confirm(`Take admin away from ${personName(m)}? They become a Manager.`)) set(m, 'manager'); }}>Remove admin</Button>}
    </div>)}
    <div className="row" style={{ gap: 6, marginTop: 4 }}>
      <select className="select sm" style={{ flex: 1 }} value={pick} onChange={e => setPick(e.target.value)} aria-label="Choose a team member to make admin"><option value="">Make someone an admin…</option>{others.map(m => <option key={m.id} value={m.id}>{personName(m)}{m.email ? ` — ${m.email}` : ''}</option>)}</select>
      <Button size="sm" variant="primary" disabled={!pick} onClick={() => { const m = others.find(x => x.id === pick); if (m && window.confirm(`Make ${personName(m)} an admin? Admins can see everything, add or remove people and change settings.`)) set(m, 'admin'); }}>Make admin</Button>
    </div>
    <div className="tiny muted">Admins can open every area, manage the team and change settings. Nobody can remove the main admin.</div>
  </div></Card>;
}

function TeamAdmin() {
  const { can, me, refreshMembers } = useApp(); const toast = useToast();
  const { data, error, loading, reload } = useApi<any>('/api/team/members');
  const [adding, setAdding] = useState(false); const [bulk, setBulk] = useState(false); const [f, setF] = useState<any>({ role: 'member' }); const [reset, setReset] = useState<any>(null); const [pw, setPw] = useState(''); const [edit, setEdit] = useState<any>(null);
  const { data: rolesData, reload: reloadRoles } = useApi<any>('/api/team/roles');
  const [manageRoles, setManageRoles] = useState(false); const [mustChange, setMustChange] = useState(true);
  const custom: any[] = rolesData?.custom || []; const areaList: any[] = rolesData?.areas || []; const duties: any[] = rolesData?.duties || [];
  /** value for the role picker: "custom:<key>" or the built-in role */
  const roleValue = (m: any) => m.custom_role && custom.some(c => c.key === m.custom_role) ? `custom:${m.custom_role}` : m.role;
  const rolePatch = (v: string) => { if (v.startsWith('custom:')) { const c = custom.find(x => x.key === v.slice(7)); return c ? { role: c.base, custom_role: c.key, areas: c.areas, ...(c.duties?.length ? { duties: c.duties } : {}), ...(c.approves?.length ? { extra_approves: c.approves } : {}) } : {}; } return { role: v, custom_role: null }; };
  const roleLabel = (m: any) => custom.find(c => c.key === m.custom_role)?.label || label(m.role);
  const RoleOptions = () => <>{roles.map(r => <option key={r} value={r} disabled={r === 'admin' && me.role !== 'admin'}>{label(r)}</option>)}{custom.length > 0 && <optgroup label="Your roles">{custom.map(c => <option key={c.key} value={`custom:${c.key}`}>{c.label}</option>)}</optgroup>}{can.admin && <option value="__manage">⚙ Manage roles…</option>}</>;
  const saveEdit = async () => { try { await api.patch(`/api/team/members/${edit.id}`, { full_name: edit.full_name, email: edit.email, title: edit.title || '', ...(edit.id !== me.id ? { ...rolePatch(edit.roleValue || edit.role), ...(edit.areasMode === 'custom' ? { areas: edit.areas || [] } : edit.areasMode === 'all' ? { areas: null } : {}), extra_approves: edit.extra_approves || [] } : {}), duties: edit.duties || [] }); toast('Member updated', 'success'); setEdit(null); reload(); refreshMembers(); } catch (e: any) { toast(e.message, 'error'); } };
  const remove = async (m: any) => { if (!window.confirm(`Remove ${personName(m)}? If they have work on record the account is deactivated instead.`)) return; try { const r = await api.del(`/api/team/members/${m.id}`); toast(r.message || 'Member removed', 'success'); setEdit(null); reload(); refreshMembers(); } catch (e: any) { toast(e.message, 'error'); } };
  const roles = ['admin', 'director', 'manager', 'legal', 'marketing', 'project', 'member', 'viewer'];
  const openEdit = (m: any) => setEdit({ ...m, roleValue: roleValue(m), areasMode: Array.isArray(m.areas) ? 'custom' : 'all', areas: m.areas || areaList.map((a: any) => a.key), duties: m.duties || [], extra_approves: m.extra_approves || [] });
  const baseOf = (e: any) => (e.roleValue || '').startsWith('custom:') ? custom.find(c => `custom:${c.key}` === e.roleValue)?.base : e.roleValue;
  const update = async (id: string, patch: any) => { try { await api.patch(`/api/team/members/${id}`, patch); toast('Updated', 'success'); reload(); refreshMembers(); } catch (e: any) { toast(e.message, 'error'); } };
  const create = async () => { try { await api.post('/api/team/members', f); toast('Account created — share the temporary password securely', 'success'); setAdding(false); setF({ role: 'member' }); reload(); refreshMembers(); } catch (e: any) { toast(e.message, 'error'); } };
  const genPw = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'; const a = new Uint32Array(14); crypto.getRandomValues(a); return Array.from(a, x => c[x % c.length]).join(''); };
  return <>
    <div className="grid g-main">
      <Card title={<><Users size={15} /> Team members</>} flush actions={can.admin && <div className="row" style={{ gap: 6 }}><Button size="sm" onClick={() => setBulk(true)}>Add several</Button><Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => { setF({ role: 'member', password: genPw() }); setAdding(true); }}>Add member</Button></div>}>
        {error && <ErrorNote error={error} />}{loading ? <Loading /> : <div className="table-wrap"><table className="table"><thead><tr><th>Member</th><th>Role</th><th className="hide-sm">Status</th>{can.admin && <th />}</tr></thead><tbody>{(data?.members || []).map((m: any) => <tr key={m.id}>
          <td><div className="row"><Avatar name={personName(m)} size="sm" presence={m.presence} /><div><b>{personName(m)}</b>{m.id === me.id && <span className="muted"> (you)</span>}{m.owner && <span className="badge teal" style={{ marginLeft: 6 }}>Main admin</span>}<div className="tiny muted">{m.email}{m.title ? ` · ${m.title}` : ''}</div></div></div></td>
          <td>{can.admin && m.id !== me.id && !m.owner ? <select className="select sm" style={{ minWidth: 118 }} value={roleValue(m)} onChange={e => e.target.value === '__manage' ? setManageRoles(true) : update(m.id, rolePatch(e.target.value))}><RoleOptions /></select> : <span className="badge">{roleLabel(m)}</span>}{Array.isArray(m.areas) && !['admin', 'director'].includes(m.role) && <div className="tiny muted">{areaCount(m.areas)} areas{m.areas.some((a: string) => a.endsWith(':view')) ? ' (some view only)' : ''}</div>}{(m.duties || []).length > 0 && <div className="tiny muted ellipsis" style={{ maxWidth: 220 }} title={(m.duties || []).map((k: string) => duties.find(d => d.key === k)?.label || k).join(', ')}>{(m.duties || []).map((k: string) => duties.find(d => d.key === k)?.label || k).join(' · ')}</div>}</td>
          <td className="hide-sm">{m.pending ? <span className="badge amber">Awaiting approval</span> : m.active === false ? <span className="badge red">Deactivated</span> : <span className="small muted">{label(m.presence)}{m.last_seen ? ` · ${ago(m.last_seen)}` : ''}</span>}</td>
          {can.admin && <td><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>{!m.pending && <Button size="xs" icon={<Pencil size={12} />} onClick={() => openEdit(m)}>Edit</Button>}{m.id !== me.id && !m.pending && !m.owner && <Button size="xs" onClick={() => update(m.id, { active: m.active === false })}>{m.active === false ? 'Reactivate' : 'Deactivate'}</Button>}<Button size="xs" icon={<KeyRound size={12} />} title="Reset password" aria-label={`Reset ${personName(m)}'s password`} onClick={() => { setReset(m); setPw(genPw()); }} /></div></td>}
        </tr>)}</tbody></table></div>}
      </Card>
      <div className="stack">{me.role === 'admin' && <AdminsCard members={data?.members || []} meId={me.id} onChanged={() => { reload(); refreshMembers(); }} />}{can.admin && <AccessRequests members={data?.members || []} onChanged={() => { reload(); refreshMembers(); }} />}
      <WhoDoesWhat duties={duties} members={data?.members || []} admin={can.admin} onChanged={() => { reloadRoles(); reload(); }} onEdit={openEdit} />
      <Card title={<><ShieldCheck size={15} /> Roles</>} actions={can.admin && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setManageRoles(true)}>Add or edit roles</Button>}><div className="stack small" style={{ gap: 8 }}>
        {custom.length > 0 && <div><b>Your roles</b><div className="chips" style={{ marginTop: 6 }}>{custom.map(c => <span key={c.key} className="chip">{c.label}</span>)}</div><div className="tiny muted" style={{ marginTop: 6 }}>Give a member one of these with the Role list, or Edit → Role.</div></div>}
        <div><b>Admin / Director</b> — everything, including team, settings, Google connection, all approvals.</div>
        <div><b>Manager</b> — all work; approves general, email and document items.</div>
        <div><b>Legal</b> — approves legal reviews, contracts, clause positions; classifies documents as APPROVED/PREFERRED/FALLBACK.</div>
        <div><b>Marketing</b> — approves marketing, designs and marketing templates.</div>
        <div><b>Project / Member</b> — create and edit work; request approvals.</div>
        <div><b>Viewer</b> — read-only (enforced on the server and in database row-level security).</div>
      </div></Card></div>
    </div>
    {manageRoles && <ManageRoles data={rolesData} members={data?.members || []} onClose={() => setManageRoles(false)} onChanged={() => { reloadRoles(); reload(); }} />}
    <BulkAdd open={bulk} onClose={() => setBulk(false)} onDone={() => { reload(); refreshMembers(); }} myRole={me.role} />
    <Modal open={adding} onClose={() => setAdding(false)} title="Add team member" footer={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" onClick={create}>Create account</Button></>}>
      <div className="form-grid"><Field label="Full name" className="full"><input className="input" value={f.full_name || ''} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field><Field label="Email" className="full"><input className="input" type="email" value={f.email || ''} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role"><select className="select" value={f.roleValue || f.role} onChange={e => { if (e.target.value === '__manage') { setManageRoles(true); return; } setF({ ...f, roleValue: e.target.value, ...rolePatch(e.target.value) }); }}><RoleOptions /></select></Field><Field label="Title"><input className="input" value={f.title || ''} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Temporary password" className="full" hint="Share it securely; they can change it in My profile."><div className="row"><input className="input mono" value={f.password || ''} onChange={e => setF({ ...f, password: e.target.value })} /><Button icon={<Copy size={13} />} onClick={() => navigator.clipboard?.writeText(f.password)} /></div></Field></div>
    </Modal>
    <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit member — ${personName(edit) || ''}`} footer={<>{edit && edit.id !== me.id && <Button variant="ghost" icon={<Trash2 size={13} />} onClick={() => remove(edit)}>Remove</Button>}<span className="spacer" /><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={saveEdit}>Save</Button></>}>
      {edit && <div className="form-grid">
        <Field label="Full name" className="full"><input className="input" value={edit.full_name || ''} onChange={e => setEdit({ ...edit, full_name: e.target.value })} /></Field>
        <Field label="Email (sign-in)" className="full" hint="Changing it changes the address they sign in with; the password stays the same."><input className="input" type="email" value={edit.email || ''} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
        <Field label="Title"><input className="input" value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field>
        <Field label="Role">{edit.id === me.id ? <input className="input" value={roleLabel(edit)} disabled /> : <select className="select" value={edit.roleValue} onChange={e => { if (e.target.value === '__manage') { setManageRoles(true); return; } const v = e.target.value; const c = v.startsWith('custom:') ? custom.find(x => x.key === v.slice(7)) : null; setEdit({ ...edit, roleValue: v, ...(c ? { areasMode: Array.isArray(c.areas) ? 'custom' : 'all', areas: c.areas || areaList.map((a: any) => a.key) } : {}) }); }}><RoleOptions /></select>}</Field>
        {edit.id !== me.id && <div className="full card" style={{ padding: 12 }}>
          <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}><b className="small">Access</b>
            {['admin', 'director'].includes((edit.roleValue || '').startsWith('custom:') ? custom.find(c => `custom:${c.key}` === edit.roleValue)?.base : edit.roleValue) ? <span className="tiny muted">Admins and directors can open every area.</span> : <>
            <label className="check tiny"><input type="radio" checked={edit.areasMode !== 'custom'} onChange={() => setEdit({ ...edit, areasMode: 'all' })} /> All areas</label>
            <label className="check tiny"><input type="radio" checked={edit.areasMode === 'custom'} onChange={() => setEdit({ ...edit, areasMode: 'custom' })} /> Only the ticked areas</label></>}</div>
          {edit.areasMode === 'custom' && !['admin', 'director'].includes(baseOf(edit)) && <div className="mt12"><AreaLevels areas={areaList} value={edit.areas || []} onChange={v => setEdit({ ...edit, areas: v })} /></div>}
          <div className="tiny muted mt8">Areas with no access are hidden from their menu and blocked on the server. Their role still decides what they can approve.</div>
        </div>}
        <div className="full card" style={{ padding: 12 }}>
          <b className="small">Duties — what this person does</b>
          <div className="tiny muted" style={{ margin: '2px 0 10px' }}>Ticking a duty also opens the parts of the app it needs{edit.id !== me.id ? ' and suggests the approvals that go with it' : ''}. Add your own duties under “Who does what”.</div>
          <DutyPicker duties={duties} value={edit.duties || []} onChange={v => setEdit((e: any) => ({ ...e, duties: v }))} onPick={d => setEdit((e: any) => ({ ...e, ...(e.areasMode === 'custom' ? { areas: withDutyAreas(e.areas || [], d) } : {}), ...(e.id !== me.id ? { extra_approves: [...new Set([...(e.extra_approves || []), ...(d.approves || [])])] } : {}) }))} />
        </div>
        {edit.id !== me.id && !['admin', 'director'].includes(baseOf(edit)) && <div className="full card" style={{ padding: 12 }}>
          <b className="small">Can also approve</b>
          <div className="tiny muted" style={{ margin: '2px 0 10px' }}>On top of what their role allows — e.g. a member who approves contracts, or the person who approves weekly hours.</div>
          <ApprovesPicker value={edit.extra_approves || []} onChange={v => setEdit({ ...edit, extra_approves: v })} fromRole={ROLE_APPROVES[baseOf(edit) || 'member'] || []} />
        </div>}
      </div>}
    </Modal>
    <Modal open={!!reset} onClose={() => setReset(null)} title={`Reset password — ${personName(reset)}`} footer={<><Button onClick={() => setReset(null)}>Cancel</Button><Button onClick={async () => { await update(reset.id, { send_reset_email: true }); setReset(null); }}>Email them a reset link</Button><Button variant="primary" onClick={async () => { await update(reset.id, { password: pw, must_change: mustChange }); setReset(null); }}>Set password</Button></>}>
      <div className="stack" style={{ gap: 10 }}>
        <Field label="New temporary password" hint="Share it with them securely (in person or by phone)."><div className="row"><input className="input mono" value={pw} onChange={e => setPw(e.target.value)} /><Button icon={<Copy size={13} />} onClick={() => navigator.clipboard?.writeText(pw)} /></div></Field>
        <label className="check small"><input type="checkbox" checked={mustChange} onChange={e => setMustChange(e.target.checked)} /> Ask them to choose their own password when they next sign in</label>
        <div className="tiny muted">Or send <b>{reset?.email}</b> a link to set a new password themselves (uses your Supabase email settings).</div>
      </div>
    </Modal>
  </>;
}

function BotProvider() {
  const toast = useToast(); const { status } = useApp(); const brand = useBrand();
  const { data, reload } = useApi<any>('/api/settings');
  const v = data?.settings?.bot_provider || 'auto';
  const set = async (val: string) => { const p = (status?.providers || []).find(x => x.id === val); if (p && !p.configured) { if (val === 'ollama') { toast('Ollama is not running on the server', 'error'); return; } window.dispatchEvent(new CustomEvent('ip-add-key', { detail: val })); toast(`Paste the ${p.label} key first`, 'info' as any); return; } try { await api.patch('/api/settings', { bot_provider: val }); toast('Saved', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  return <div className="mt16"><Field label={`${brand.ai_name} bot uses`} hint="Auto = the first connected provider (Claude, OpenAI, Gemini, then Ollama), falling back to the built-in engine if it is unavailable."><select className="select" value={v} onChange={e => set(e.target.value)}>
    <option value="auto">Auto</option><option value="rules">Built-in engine only (no AI key)</option>
    {(status?.providers || []).map(p => <option key={p.id} value={p.id}>{p.label}{p.configured ? '' : p.id === 'ollama' ? ' — not running' : ' — add a key'}</option>)}
  </select></Field></div>;
}

function SettingsTab() {
  const toast = useToast();
  const { data, loading, reload } = useApi<any>('/api/settings');
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (data) setS({ ...data.settings, rhc_entity_details: data.settings.rhc_entity_details || {}, names: (data.settings.rhc_entity_names || []).join(', ') }); }, [data]);
  if (loading || !s) return <Loading />;
  const save = async () => { try { await api.patch('/api/settings', { ai_system_instructions: s.ai_system_instructions, email_requires_approval: !!s.email_requires_approval, home_jurisdiction: s.home_jurisdiction, rhc_entity_names: s.names.split(',').map((x: string) => x.trim()).filter(Boolean), rhc_entity_details: s.rhc_entity_details }); toast('Settings saved', 'success'); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const ed = s.rhc_entity_details; const setEd = (k: string, v: string) => setS({ ...s, rhc_entity_details: { ...ed, [k]: v } });
  return <div className="grid g2">
    <Card title={<><Settings2 size={15} /> Legal identity</>} sub="name, logo and colours are in the Business tab"><div className="form-grid">
      <Field label="Legal entity name" className="full" hint="Used in drafting templates and marketing"><input className="input" value={ed.name || ''} onChange={e => setEd('name', e.target.value)} placeholder="e.g. RHC City Pty Ltd" /></Field>
      <Field label="ABN"><input className="input" value={ed.abn || ''} onChange={e => setEd('abn', e.target.value)} /></Field><Field label="Registered address"><input className="input" value={ed.address || ''} onChange={e => setEd('address', e.target.value)} /></Field>
      <Field label="Default signatory"><input className="input" value={ed.signatory_name || ''} onChange={e => setEd('signatory_name', e.target.value)} /></Field><Field label="Signatory title"><input className="input" value={ed.signatory_title || ''} onChange={e => setEd('signatory_title', e.target.value)} /></Field>
      <Field label="Contact email"><input className="input" value={ed.email || ''} onChange={e => setEd('email', e.target.value)} /></Field><Field label="Contact phone"><input className="input" value={ed.phone || ''} onChange={e => setEd('phone', e.target.value)} /></Field>
      <Field label="Names the business appears under in agreements" className="full" hint="Comma separated — the Legal AI uses these to find your business in agreements"><input className="input" value={s.names} onChange={e => setS({ ...s, names: e.target.value })} /></Field>
      <Field label="Home jurisdiction" className="full"><input className="input" value={s.home_jurisdiction || ''} onChange={e => setS({ ...s, home_jurisdiction: e.target.value })} /></Field>
    </div></Card>
    <div className="stack">
      <Card title="AI system instructions"><Field label="Instructions applied to every AI call" hint="Tone, priorities, what never to do. {{business}}, {{short}} and {{ai}} are replaced with your names."><textarea className="textarea" style={{ minHeight: 220 }} value={s.ai_system_instructions || ''} onChange={e => setS({ ...s, ai_system_instructions: e.target.value })} /></Field></Card>
      <div className="row"><span className="spacer" /><Button variant="primary" onClick={save}>Save settings</Button></div>
    </div>
  </div>;
}

function Profile() {
  const { me } = useApp(); const toast = useToast();
  const emailish = (v?: string | null) => !!v && /@/.test(v);
  const [name, setName] = useState(emailish(me.full_name) ? '' : me.full_name || ''); const [title, setTitle] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [color, setColor] = useState<string>(me.color || '#0F766E'); const [lang, setLang] = useState<string>(me.language || 'en'); const [busy, setBusy] = useState(false); const [pwOpen, setPwOpen] = useState(false);
  useEffect(() => { api.get('/api/me').then(r => { setTitle(r.user.title || ''); if (r.user.color) setColor(r.user.color); if (r.user.language) setLang(r.user.language); }).catch(() => {}); }, []);
  const save = async () => { if (!name.trim()) return toast('Type your full name', 'error'); setBusy(true); try { await api.patch('/api/me', { full_name: name.trim(), title, color, language: lang }); toast('Profile saved', 'success'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const changePw = async () => { if (pw.length < 10) return toast('Use at least 10 characters', 'error'); if (pw !== pw2) return toast('Passwords do not match', 'error'); const { supabase } = await import('@/lib/client/api'); const { error } = await supabase().auth.updateUser({ password: pw }); if (error) toast(error.message, 'error'); else { toast('Password changed', 'success'); setPw(''); setPw2(''); setPwOpen(false); } };
  const SWATCHES = ['#0F766E', '#F59E0B', '#4338CA', '#BE123C', '#2563EB', '#7C3AED', '#059669', '#475569'];
  const initials = (name || me.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return <div className="profile-c">
    <section className="pc-card">
      <div className="pc-band" style={{ background: color }} />
      <div className="pc-body">
        <div className="pc-who"><div className="pc-avatar" style={{ background: color }}>{initials}</div><div><div className="pc-name">{name || 'Your name'}</div><div className="pc-sub">{me.email} · {label(me.role)}{title ? ` · ${title}` : ''}</div></div></div>
        {emailish(me.full_name) && <Notice tone="warn">Your name is set to your email address. Type your full name below — it appears on emails, letters, stamps and approvals.</Notice>}
        <div className="pc-grid">
          <Field label="Full name"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Falah Al-Hamidi" /></Field>
          <Field label="Job title" hint="Shown under your name when you sign"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. General Manager" /></Field>
          <Field label="Language" hint="Infinity AI answers you in this language"><select className="select" value={lang} onChange={e => setLang(e.target.value)}><option value="en">English</option><option value="fa">فارسی (Farsi)</option></select></Field>
          <div className="field"><span>My colour</span><div className="pc-swatches">{SWATCHES.map(c => <button key={c} type="button" className={`pc-sw${color.toLowerCase() === c.toLowerCase() ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Colour ${c}`} />)}<label className="pc-sw custom" title="Pick any colour"><input type="color" value={color} onChange={e => setColor(e.target.value)} aria-label="Pick any colour" /></label></div><small>Marks your notes and tasks</small></div>
        </div>
        <div className="pc-actions"><Button variant="primary" loading={busy} onClick={save}>Save changes</Button></div>
      </div>
    </section>
    <aside className="pc-side">
      <section className="pc-card pad"><div className="pc-h">My email</div><MyMailboxCard compact /></section>
      <section className="pc-card pad"><div className="pc-h">Password</div><div className="small muted">Use at least 10 characters.</div>
        {!pwOpen ? <Button block onClick={() => setPwOpen(true)} style={{ marginTop: 12 }}>Change password</Button> : <div className="stack" style={{ gap: 10, marginTop: 12 }}><Field label="New password"><input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" /></Field><Field label="Type it again"><input className="input" type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" /></Field><div className="row" style={{ gap: 8 }}><Button variant="primary" onClick={changePw}>Update password</Button><Button variant="ghost" onClick={() => { setPwOpen(false); setPw(''); setPw2(''); }}>Cancel</Button></div></div>}
      </section>
      <section className="pc-card pad pc-tip"><div className="pc-h">Display & text size</div><div className="small">Make the screen or the writing bigger or smaller, or switch to dark mode.</div><a className="btn sm" href="/system?tab=display" style={{ marginTop: 10 }}>Open display settings</a></section>
    </aside>
  </div>;
}

function Apps() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const isDesktop = typeof window !== 'undefined' && !!window.rhcDesktop;
  return <div className="grid g2">
    <Card title={<><Monitor size={15} /> Infinity Planet for Windows (team PCs)</>}><div className="stack small" style={{ gap: 10 }}>
      {isDesktop ? <Notice tone="success">You are using the Infinity Planet desktop app {window.rhcDesktop?.version ? `v${window.rhcDesktop.version}` : ''}.</Notice> : null}
      <p>The desktop app is a secure window onto this server, with its own taskbar icon, desktop notifications for reminders, approvals and mentions, and automatic sign-in persistence. No keys are stored on team PCs.</p>
      <ol className="numbered"><li>Install <b>Infinity-Planet-Setup.exe</b> (built from the <code>desktop/</code> folder — see SETUP.md, “Desktop app”).</li><li>On first launch, enter the server address: <code>{origin}</code></li><li>Sign in with the account an admin created in Team &amp; roles.</li></ol>
      <Notice>Team members outside the office need the server reachable from the internet (hosted server or a secure tunnel such as Tailscale). See SETUP.md → “Making the app available to the team”.</Notice>
    </div></Card>
    <Card title={<><Smartphone size={15} /> Android & iPhone</>}><div className="stack small" style={{ gap: 10 }}>
      <p>Infinity Planet is an installable mobile web app (PWA) with a phone layout and bottom navigation.</p>
      <div><b>Android (Chrome):</b> open <code>{origin}</code> → menu ⋮ → <i>Install app</i> / <i>Add to Home screen</i>.</div>
      <div><b>iPhone / iPad (Safari):</b> open <code>{origin}</code> → Share → <i>Add to Home Screen</i>.</div>
      <Notice tone="warn">Phones must reach the server over <b>HTTPS</b> for installation and notifications (e.g. https://rhc.yourdomain.com). <code>localhost</code> only works on the server PC itself.</Notice>
    </div></Card>
  </div>;
}

function Audit() {
  const { data, loading, error } = useApi<any>('/api/activity?limit=200');
  if (loading) return <Loading />;
  return <Card title={<><Activity size={15} /> Audit log</>} sub="last 200 events" flush>{error ? <ErrorNote error={error} /> : !data?.events?.length ? <Empty title="No events" /> : <ActivityList events={data.events} />}</Card>;
}

const LEVELS: [string, string][] = [['viewer', 'Can only look (read-only)'], ['member', 'Can add and edit work'], ['marketing', 'Can add work and approve marketing'], ['legal', 'Can add work and approve legal items'], ['manager', 'Can add work and approve most items'], ['director', 'Full access and approves everything']];
const ROLE_PRESETS: { label: string; base: string; areas: string[] | null; duties?: string[]; approves?: string[] }[] = [
  { label: 'Designer', base: 'member', areas: ['designer', 'marketing', 'presentations', 'documents', 'tasks', 'notes', 'chat', 'calendar'], duties: ['design'] },
  { label: 'Contracts Officer', base: 'member', areas: ['legal', 'company_records', 'drafting', 'signing', 'documents', 'drive', 'tasks', 'notes', 'chat', 'approvals', 'gmail'], duties: ['contracts', 'documents'], approves: ['contract'] },
  { label: 'Executive Assistant', base: 'member', areas: ['calendar', 'tasks', 'notes', 'gmail', 'chat', 'documents', 'drafting', 'presentations', 'projects:view', 'crm:view'], duties: ['agenda', 'correspondence'] },
  { label: 'Project Manager', base: 'member', areas: ['projects', 'tasks', 'calendar', 'documents', 'drive', 'notes', 'chat', 'approvals', 'gmail', 'crm:view', 'legal:view'], duties: ['projects', 'site'] },
  { label: 'Marketing Coordinator', base: 'marketing', areas: ['marketing', 'designer', 'presentations', 'research', 'crm', 'gmail', 'documents', 'tasks', 'notes', 'chat', 'calendar', 'approvals'], duties: ['marketing', 'design'] },
  { label: 'HR Officer', base: 'member', areas: ['activity', 'tasks', 'calendar', 'documents', 'notes', 'chat', 'gmail'], duties: ['hr'], approves: ['hours'] },
  { label: 'Researcher', base: 'member', areas: ['research', 'presentations', 'documents', 'notes', 'chat', 'tasks', 'projects:view'], duties: ['presentations'] },
  { label: 'Cleaner', base: 'member', areas: ['tasks', 'notes', 'chat', 'calendar'] },
  { label: 'Security', base: 'member', areas: ['tasks', 'notes', 'chat', 'calendar'] },
  { label: 'Driver', base: 'member', areas: ['tasks', 'calendar', 'chat', 'notes'] },
  { label: 'Receptionist', base: 'member', areas: ['calendar', 'gmail', 'tasks', 'notes', 'chat', 'crm'] },
  { label: 'Site Supervisor', base: 'member', areas: ['projects', 'tasks', 'documents', 'notes', 'chat', 'calendar', 'approvals'] },
  { label: 'Accountant', base: 'member', areas: ['projects', 'crm', 'documents', 'tasks', 'notes', 'chat', 'approvals', 'gmail'] },
  { label: 'Sales Agent', base: 'member', areas: ['crm', 'projects', 'marketing', 'designer', 'gmail', 'calendar', 'tasks', 'notes', 'chat'] },
];
function ManageRoles({ data, members, onClose, onChanged }: { data: any; members: any[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast(); const { me } = useApp();
  const areas: any[] = data?.areas || [];
  const custom: any[] = data?.custom || [];
  const duties: any[] = data?.duties || [];
  const blank = () => ({ key: null as string | null, label: '', base: 'member', allAreas: true, areas: areas.map(a => a.key), people: [] as string[], duties: [] as string[], approves: [] as string[] });
  const [f, setF] = useState<any>(blank());
  const [busy, setBusy] = useState(false);
  const people = (members || []).filter((m: any) => !m.pending && m.active !== false && m.id !== me.id && !['admin', 'director'].includes(m.role));
  const holders = (key: string) => (members || []).filter((m: any) => m.custom_role === key);
  const usePreset = (p: typeof ROLE_PRESETS[number]) => { const ex = custom.find(c => c.label.toLowerCase() === p.label.toLowerCase()); if (ex) return edit(ex); setF({ ...blank(), label: p.label, base: p.base, allAreas: !p.areas, areas: p.areas || areas.map(a => a.key), duties: p.duties || [], approves: p.approves || [] }); };
  const edit = (r: any) => setF({ key: r.key, label: r.label, base: r.base, allAreas: !Array.isArray(r.areas), areas: r.areas || areas.map(a => a.key), people: holders(r.key).map((m: any) => m.id), duties: r.duties || [], approves: r.approves || [] });
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/team/roles', { key: f.key || undefined, label: f.label, base: f.base, areas: f.allAreas ? null : f.areas, duties: f.duties, approves: f.approves });
      const key = r.role.key; const had = holders(key).map((m: any) => m.id);
      const add = f.people.filter((id: string) => !had.includes(id)); const removed = had.filter((id: string) => !f.people.includes(id));
      await Promise.all([
        ...[...add, ...f.people.filter((id: string) => had.includes(id))].map((id: string) => { const m = members.find((x: any) => x.id === id) || {}; return api.patch(`/api/team/members/${id}`, { role: f.base, custom_role: key, areas: f.allAreas ? null : f.areas, duties: [...new Set([...(m.duties || []), ...f.duties])], extra_approves: [...new Set([...(m.extra_approves || []), ...f.approves])] }); }),
        ...removed.map((id: string) => api.patch(`/api/team/members/${id}`, { role: 'member', custom_role: null, areas: null })),
      ]);
      toast(`“${r.role.label}” saved${add.length ? ` and given to ${add.length} ${add.length === 1 ? 'person' : 'people'}` : ''}`, 'success'); setF(blank()); onChanged();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const del = async (k: string) => { if (!window.confirm('Delete this role?')) return; try { await api.del(`/api/team/roles?key=${encodeURIComponent(k)}`); if (f.key === k) setF(blank()); onChanged(); } catch (e: any) { toast(e.message, 'error'); } };
  return <Modal open onClose={onClose} title="Roles" size="wide" footer={<Button onClick={onClose}>Done</Button>}>
    <div className="roles-wrap">
      <div className="roles-list">
        <div className="small" style={{ fontWeight: 650, marginBottom: 6 }}>Your roles</div>
        {!custom.length && <div className="tiny muted" style={{ marginBottom: 8 }}>None yet — pick one on the right or type your own.</div>}
        {custom.map(r => <div key={r.key} className={`role-item${f.key === r.key ? ' on' : ''}`}>
          <button className="role-main" onClick={() => edit(r)}><b>{r.label}</b><span className="tiny muted">{holders(r.key).length ? holders(r.key).map((m: any) => (personName(m)).split(' ')[0]).join(', ') : 'Nobody yet'}</span></button>
          <button className="icon-btn" title="Delete role" onClick={() => del(r.key)}><Trash2 size={14} /></button>
        </div>)}
        <button className="btn sm mt8" onClick={() => setF(blank())}><Plus size={13} /> New role</button>
        <details className="tiny muted mt12"><summary>Built-in roles</summary><div className="stack mt8" style={{ gap: 4 }}>{(data?.built_in || []).map((r: any) => <div key={r.key}><b>{r.label}</b> — {r.description}</div>)}</div></details>
      </div>
      <div className="roles-form">
        {!f.key && <div className="role-presets"><span className="tiny muted">Quick pick:</span>{ROLE_PRESETS.map(p => <button key={p.label} type="button" className={f.label === p.label ? 'on' : ''} onClick={() => usePreset(p)}>{p.label}</button>)}</div>}
        <Field label="Role name"><input className="input" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Type any name — e.g. Cleaner, Security, Site Supervisor" autoFocus disabled={!!f.key} /></Field>
        <Field label="What can they do?"><select className="select" value={['project'].includes(f.base) ? 'member' : f.base} onChange={e => setF({ ...f, base: e.target.value })}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <div className="field"><span>Which parts of the app can they open?</span>
          <label className="check small"><input type="radio" checked={f.allAreas} onChange={() => setF({ ...f, allAreas: true })} /> Everything</label>
          <label className="check small"><input type="radio" checked={!f.allAreas} onChange={() => setF({ ...f, allAreas: false })} /> Only these:</label>
          {!f.allAreas && <div className="mt8"><AreaLevels areas={areas} value={f.areas} onChange={v => setF({ ...f, areas: v })} /></div>}
        </div>
        <div className="field"><span>Duties that come with this role</span><DutyPicker duties={duties} value={f.duties} onChange={v => setF((x: any) => ({ ...x, duties: v }))} onPick={d => setF((x: any) => ({ ...x, ...(x.allAreas ? {} : { areas: withDutyAreas(x.areas, d) }), approves: [...new Set([...x.approves, ...(d.approves || [])])] }))} /></div>
        {!['director'].includes(f.base) && <div className="field"><span>Can also approve</span><ApprovesPicker value={f.approves} onChange={v => setF({ ...f, approves: v })} fromRole={ROLE_APPROVES[f.base] || []} /></div>}
        <div className="field"><span>Who has this role?</span>
          {!people.length ? <div className="tiny muted">Add team members first (Add member).</div> : <div className="area-grid">{people.map((m: any) => <label key={m.id} className="check small"><input type="checkbox" checked={f.people.includes(m.id)} onChange={e => setF({ ...f, people: e.target.checked ? [...f.people, m.id] : f.people.filter((x: string) => x !== m.id) })} /> {personName(m)}{m.custom_role && m.custom_role !== f.key ? <span className="muted"> ({custom.find(c => c.key === m.custom_role)?.label || ''})</span> : null}</label>)}</div>}
        </div>
        <div className="row" style={{ gap: 8 }}><Button variant="primary" loading={busy} disabled={!f.label.trim()} onClick={save}>{f.key ? 'Save changes' : 'Create role'}</Button>{f.key && <Button variant="ghost" onClick={() => setF(blank())}>Cancel</Button>}</div>
      </div>
    </div>
  </Modal>;
}
