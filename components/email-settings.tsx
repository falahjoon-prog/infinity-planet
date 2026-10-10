'use client';
import React, { useEffect, useState } from 'react';
import { Mail, PenLine } from 'lucide-react';
import { api, useApi } from '@/lib/client/api';
import { Card, Field, Button, Loading, Notice, useToast } from '@/components/ui';
import { EmailPreview } from '@/components/email-preview';

const DEFAULT_DISCLAIMER = 'This email and any attachments are confidential and may be legally privileged. If you are not the intended recipient, please notify the sender and delete this email. Any views expressed are those of the sender unless stated otherwise.';
const SAMPLE = { subject: 'Fortitude Valley — revised deposit', body: 'Dear Sarah,\n\nThank you for your email regarding the revised deposit.\n\nFurther to our previous correspondence on the MOU (2 Sept 2026), I can confirm:\n\n1. The meeting on Tuesday at 10am suits us.\n2. We will send the updated site plan by Wednesday.\n\nPlease let me know if you need anything further.\n\nKind regards,\nYour Name\nProject Manager — Fortitude Valley\nYour Business Pty Ltd', quoted: { from: 'Sarah Nguyen <sarah@example.com>', date: 'Thu, 8 Oct 2026', body: 'Could you confirm whether the deposit can be reduced to 5%?' } };

/** Settings → Business details → Email: how every outgoing email looks (admins). */
export function EmailLookSettings() {
  const toast = useToast();
  const { data, loading } = useApi<any>('/api/settings');
  const [st, setSt] = useState<any>(null); const [busy, setBusy] = useState(false); const [v, setV] = useState(0);
  useEffect(() => { if (data) setSt({ branded: true, header: 'logo', show_footer: true, quote_previous: false, default_persona: null, default_tone: 'professional', disclaimer: DEFAULT_DISCLAIMER, ...(data.settings.email_style || {}) }); }, [data]);
  if (loading || !st) return <Loading />;
  const set = (k: string, val: any) => setSt({ ...st, [k]: val });
  const save = async () => { setBusy(true); try { await api.patch('/api/settings', { email_style: st }); toast('Email look saved', 'success'); setV(x => x + 1); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  return <div className="grid g2 mt16">
    <Card title={<><Mail size={15} /> Professional email look</>}>
      <div className="form-grid">
        <label className="check full"><input type="checkbox" checked={st.branded !== false} onChange={e => set('branded', e.target.checked)} /> Send every email as a branded HTML email (logo, signature block, footer) with a plain-text copy</label>
        <Field label="Header"><select className="select" value={st.header} onChange={e => set('header', e.target.value)}><option value="logo">Logo on white with accent line</option><option value="band">Logo on a brand-colour band</option><option value="none">No header</option></select></Field>
        <Field label="Default tone"><select className="select" value={st.default_tone} onChange={e => set('default_tone', e.target.value)}><option value="professional">Professional</option><option value="warm">Warm</option><option value="formal">Formal</option><option value="brief">Brief</option></select></Field>
        <Field label="Default “reply as”" className="full" hint="Each person can choose their own in Settings → My profile, and change it per email."><select className="select" value={st.default_persona || ''} onChange={e => set('default_persona', e.target.value || null)}><option value="">The person writing (no role)</option><option value="admin">Admin</option><option value="coordinator">Project Coordinator</option><option value="manager">Project Manager</option><option value="ceo">CEO</option></select></Field>
        <label className="check"><input type="checkbox" checked={st.show_footer !== false} onChange={e => set('show_footer', e.target.checked)} /> Company footer (legal name, ABN, address)</label>
        <label className="check"><input type="checkbox" checked={st.quote_previous === true} onChange={e => set('quote_previous', e.target.checked)} /> Paste the previous email under replies (off: Gmail already keeps the conversation together)</label>
        <Field label="Confidentiality notice" className="full"><textarea className="textarea" style={{ minHeight: 80 }} value={st.disclaimer || ''} onChange={e => set('disclaimer', e.target.value)} /></Field>
      </div>
      <Notice>Logo, colours, legal name, ABN and address come from the Business settings above. Use a PNG or JPG logo — email apps do not show SVG.</Notice>
      <div className="row mt8"><span className="spacer" /><Button variant="primary" loading={busy} onClick={save}>Save email look</Button></div>
    </Card>
    <Card title="How your emails look"><EmailPreview key={v} draft={{ ...SAMPLE, dirty: true, v }} height={560} /></Card>
  </div>;
}

/** Settings → My profile: my email signature and default role. */
export function MySignature() {
  const toast = useToast();
  const [s, setS] = useState<any>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/api/email/signature').then(r => setS(r.signature || {})).catch(() => setS({})); }, []);
  if (!s) return <Loading />;
  const save = async () => { setBusy(true); try { await api.patch('/api/email/signature', s); toast('Signature saved', 'success'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  return <Card title={<><PenLine size={15} /> My email signature</>}><div className="form-grid">
    <Field label="Title" className="full" hint="Shown under your name, e.g. Development Manager"><input className="input" value={s.title || ''} onChange={e => setS({ ...s, title: e.target.value })} /></Field>
    <Field label="Phone"><input className="input" value={s.phone || ''} onChange={e => setS({ ...s, phone: e.target.value })} placeholder="07 3000 0000" /></Field>
    <Field label="Mobile"><input className="input" value={s.mobile || ''} onChange={e => setS({ ...s, mobile: e.target.value })} placeholder="04xx xxx xxx" /></Field>
    <Field label="I usually reply as" className="full"><select className="select" value={s.persona || ''} onChange={e => setS({ ...s, persona: e.target.value || null })}><option value="">Myself (title above)</option><option value="admin">Admin</option><option value="coordinator">Project Coordinator</option><option value="manager">Project Manager</option><option value="ceo">CEO</option></select></Field>
    <div className="full"><Button variant="primary" loading={busy} onClick={save}>Save signature</Button></div>
  </div></Card>;
}
