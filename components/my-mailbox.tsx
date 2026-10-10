'use client';
import React, { useEffect, useState } from 'react';
import { Mail, Link2, Unlink, Inbox } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Button, Notice, useToast, useConfirm, InfoTip } from './ui';

export type MailboxState = { configured: boolean; own: { email: string | null; status: string } | null; shared: { email: string | null; connected: boolean } | null; can_shared: boolean; using: 'own' | 'shared' | null; mailbox: string | null };

/** The signed-in person's own mailbox (their own work address). Re-reads when 'ip-mailbox' fires. */
export function useMailbox() {
  const [m, setM] = useState<MailboxState | null>(null);
  const load = () => api.get<MailboxState>('/api/google/me').then(setM).catch(() => setM(null));
  useEffect(() => { load(); const h = () => load(); window.addEventListener('ip-mailbox', h); return () => window.removeEventListener('ip-mailbox', h); }, []);
  return { mailbox: m, reload: load };
}
export const connectMyMailbox = async () => { const r = await api.post('/api/google/me'); window.location.href = r.url; };

/** Card: connect / disconnect my own Google mailbox; admins and directors can also switch to the shared mailbox. */
export function MyMailboxCard({ compact }: { compact?: boolean }) {
  const toast = useToast(); const confirm = useConfirm();
  const { mailbox: m, reload } = useMailbox();
  const [busy, setBusy] = useState(false);
  if (!m) return null;
  const own = m.own?.status === 'connected' ? m.own : null;
  const connect = async () => { setBusy(true); try { await connectMyMailbox(); } catch (e: any) { toast(e.message, 'error'); setBusy(false); } };
  const disconnect = async () => { if (!(await confirm({ title: 'Disconnect your email?', body: 'Infinity Planet will stop reading and sending from your mailbox until you connect it again.', confirm: 'Disconnect', danger: true }))) return; try { await api.del('/api/google/me'); toast('Your email is disconnected', 'success'); reload(); window.dispatchEvent(new Event('ip-mailbox')); } catch (e: any) { toast(e.message, 'error'); } };
  const choose = async (choice: 'own' | 'shared') => { try { await api.patch('/api/google/me', { choice }); reload(); window.dispatchEvent(new Event('ip-mailbox')); } catch (e: any) { toast(e.message, 'error'); } };
  return <div className={compact ? '' : 'card card-body'}>
    {!compact && <div className="row" style={{ gap: 8, marginBottom: 8 }}><Mail size={16} /><b>My email</b></div>}
    {!m.configured ? <Notice tone="warn">Google sign-in isn&apos;t set up on the server yet (an admin adds the Google keys).</Notice>
      : own ? <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}><span className="badge green">Connected</span><b>{own.email}</b><span className="small muted">You read and send only from this mailbox. Nobody else can see it.</span><span className="spacer" /><Button size="sm" variant="ghost" icon={<Unlink size={13} />} onClick={disconnect}>Disconnect</Button></div>
      : <div className="stack" style={{ gap: 8 }}>
        {m.own?.status === 'expired' && <Notice tone="warn">Your connection to {m.own.email} has expired — connect it again.</Notice>}
        <div className="row" style={{ gap: 8, alignItems: 'center' }}><Button variant="primary" icon={<Link2 size={14} />} loading={busy} onClick={connect} title="Connect your own work email once — then you read and send from your own address">Connect my Google account</Button><ConnectHelp domain={domainOf(m)} /></div>
      </div>}
    {m.can_shared && m.shared?.connected && <div className="row wrap mt12" style={{ gap: 8, alignItems: 'center' }}><Inbox size={14} className="muted" /><span className="small">Mailbox shown in Gmail:</span>
      <div className="segmented"><button type="button" className={m.using === 'own' ? 'on' : ''} disabled={!own} onClick={() => choose('own')}>Mine{own ? ` (${own.email})` : ''}</button><button type="button" className={m.using === 'shared' ? 'on' : ''} onClick={() => choose('shared')}>Shared ({m.shared.email})</button></div></div>}
  </div>;
}

const domainOf = (m: MailboxState) => (m.shared?.email || 'company.com').split('@')[1] || 'company.com';
function ConnectHelp({ domain }: { domain: string }) {
  return <InfoTip title="Your own email" tip="Why connect my own email?">
    <p>Connect your own work email once. Then your inbox, sending and auto-reply use <b>your</b> address, and nobody else can see your mailbox.</p>
    <p>Sign in with your own address (e.g. yourname@{domain}). Infinity Planet only asks for email permissions.</p>
  </InfoTip>;
}

/** One slim line for the Gmail toolbar: which mailbox is showing (Mine / Shared), and "Connect mine" if not yet connected. */
export function MailboxSwitch() {
  const toast = useToast();
  const { mailbox: m, reload } = useMailbox();
  const [busy, setBusy] = useState(false);
  if (!m || !m.using) return null;
  const own = m.own?.status === 'connected' ? m.own : null;
  const choose = async (choice: 'own' | 'shared') => { try { await api.patch('/api/google/me', { choice }); reload(); window.dispatchEvent(new Event('ip-mailbox')); } catch (e: any) { toast(e.message, 'error'); } };
  const connect = async () => { setBusy(true); try { await connectMyMailbox(); } catch (e: any) { toast(e.message, 'error'); setBusy(false); } };
  const canSwitch = m.can_shared && m.shared?.connected;
  return <span className="mailbox-switch">
    {canSwitch ? <span className="segmented sm" role="group" aria-label="Mailbox shown">
      <button type="button" className={m.using === 'own' ? 'on' : ''} disabled={!own} title={own ? `Your own mailbox (${own.email})` : 'Connect your own email first'} onClick={() => choose('own')}>Mine</button>
      <button type="button" className={m.using === 'shared' ? 'on' : ''} title={`Shared company mailbox (${m.shared!.email})`} onClick={() => choose('shared')}>Shared</button>
    </span> : null}
    {!own && <button type="button" className="chip-btn" disabled={busy} onClick={connect} title="Connect your own work email so you read and send from your own address"><Link2 size={13} /> Connect mine</button>}
    {!own && <ConnectHelp domain={domainOf(m)} />}
  </span>;
}
