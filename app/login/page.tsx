'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldCheck, Scale, Sparkles, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/client/api';
import { savedAccounts, switchAccount, rememberSession, SavedAccount } from '@/lib/client/accounts';
import { useBrand, BusinessMark, InfinityMark } from '@/lib/client/brand';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'info' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'signin' | 'reset' | 'request'>('signin');
  // Accounts already signed in on this device: continue as one of them without a password
  const [saved, setSaved] = useState<SavedAccount[]>([]);
  const [adding, setAdding] = useState(false);
  useEffect(() => { setSaved(savedAccounts()); try { setAdding(new URLSearchParams(window.location.search).get('add') === '1'); } catch {} }, []);
  const [name, setName] = useState(''); const [password2, setPassword2] = useState('');
  const [signup, setSignup] = useState<{ enabled: boolean; domains: string[] }>({ enabled: false, domains: [] });
  useEffect(() => { try { if (/type=recovery/.test(window.location.hash) || new URLSearchParams(window.location.search).get('reset') === '1') sessionStorage.setItem('ip-recovery', '1'); } catch {} }, []);
  useEffect(() => { fetch('/api/auth/signup-config').then(r => r.json()).then(setSignup).catch(() => {}); }, []);
  const brand = useBrand();
  useEffect(() => { document.title = `Sign in · ${brand.business_name} · ${brand.app_name}`; }, [brand]);

  useEffect(() => {
    try { supabase().auth.getSession().then(({ data }) => { if (data.session) router.replace('/'); }); }
    catch (e: any) { setMsg({ text: e.message, tone: 'error' }); }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (mode === 'request') {
        if (password !== password2) { setMsg({ text: 'The passwords do not match.', tone: 'error' }); return; }
        const r = await fetch('/api/auth/request-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, full_name: name }) });
        const j = await r.json().catch(() => ({}));
        setMsg(r.ok ? { text: j.message, tone: 'info' } : { text: j.error || 'Request failed', tone: 'error' });
        if (r.ok) { setPassword(''); setPassword2(''); }
      } else if (mode === 'reset') {
        const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` });
        setMsg(error ? { text: error.message, tone: 'error' } : { text: 'If that account exists, a reset link has been sent (requires email to be configured in Supabase). Otherwise ask your administrator to reset your password in Settings → Team.', tone: 'info' });
      } else {
        const { data: sess, error } = await supabase().auth.signInWithPassword({ email, password });
        if (error) setMsg({ text: error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message, tone: 'error' });
        else {
          const me = await fetch('/api/me', { headers: { Authorization: `Bearer ${sess.session?.access_token}` } });
          if (me.status === 403) { const j = await me.json().catch(() => ({})); await supabase().auth.signOut(); setMsg({ text: j.error || 'Your account is not active.', tone: 'error' }); }
          else { rememberSession(sess.session); router.replace('/'); }
        }
      }
    } catch (e: any) { setMsg({ text: e.message, tone: 'error' }); }
    finally { setBusy(false); }
  }

  return <div className="login-wrap">
    <section className="login-art">
      <div className="row"><InfinityMark size={40} /><div><b style={{ letterSpacing: '.22em', fontSize: 13, textTransform: 'uppercase' }}>{brand.app_name}</b><div style={{ color: '#8ea0bb', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase' }}>{brand.tagline}</div></div></div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1>Every project, deal and decision — in one private place.</h1>
        <p>Projects, CRM, documents, Legal AI, drafting, marketing, Gmail, calendar, tasks, team chat and approvals for the {brand.business_name} team — with an AI bot that can take action for you.</p>
        <div className="stack mt24" style={{ gap: 12, color: '#c8d3e3', fontSize: 13 }}>
          <span className="row"><Scale size={16} color="#c8a45c" /> Built-in Legal AI reviews agreements from your side</span>
          <span className="row"><Sparkles size={16} color="#c8a45c" /> {brand.ai_name} works without a key — or add ChatGPT, Gemini, Claude or Ollama</span>
          <span className="row"><ShieldCheck size={16} color="#c8a45c" /> Role-based access, approvals and a full audit trail</span>
        </div>
      </div>
      <small style={{ color: '#6f82a0' }}>Private workspace · authorised {brand.business_name} personnel only</small>
    </section>
    <section className="login-form">
      <form onSubmit={submit}>
        <div className="row mb16" style={{ gap: 12 }}><BusinessMark brand={brand} size={48} /><div className="eyebrow" style={{ margin: 0 }}>{mode === 'reset' ? 'Password reset' : mode === 'request' ? 'New team member' : 'Welcome back'}</div></div>
        <h2 style={{ fontSize: 26, marginBottom: 6 }}>{mode === 'reset' ? 'Reset password' : mode === 'request' ? 'Request access' : `Sign in to ${brand.business_name}`}</h2>
        {mode === 'signin' && adding && <div className="notice info mb12" style={{ fontSize: 13 }}>Sign in with your other account. The account you were using stays signed in — switch between them from your name at the bottom of the menu.</div>}
        {mode === 'signin' && saved.length > 0 && <div className="stack mb16" style={{ gap: 6 }}><div className="small muted">Already signed in on this computer:</div>{saved.map(a => <button key={a.id} type="button" className="btn" style={{ justifyContent: 'flex-start', height: 'auto', padding: '8px 12px', textAlign: 'left' }} onClick={async () => { setBusy(true); if (!(await switchAccount(a.id))) { setSaved(savedAccounts()); setEmail(a.email); setMsg({ text: `Please sign in to ${a.email} again.`, tone: 'info' }); setBusy(false); } }}><span><b>Continue as {a.name || a.email}</b><br /><span className="small muted">{a.email}{a.label ? ` · ${a.label}` : ''}</span></span></button>)}<div className="small muted mt8">…or sign in with another account:</div></div>}
        <p className="muted mb16">{mode === 'reset' ? 'Enter your work email.' : mode === 'request' ? `Use your ${signup.domains.map(d => '@' + d).join(' or ')} email. An administrator approves new accounts.` : 'Use the account your administrator created for you.'}</p>
        <div className="stack" style={{ gap: 12 }}>
          {mode === 'request' && <label className="field"><span>Full name</span><input className="input" required value={name} onChange={e => setName(e.target.value)} autoComplete="name" style={{ height: 42 }} /></label>}
          <label className="field"><span>Email</span><input className="input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} autoFocus style={{ height: 42 }} /></label>
          {mode !== 'reset' && <label className="field"><span>{mode === 'request' ? 'Choose a password (10+ characters)' : 'Password'}</span><input className="input" type="password" autoComplete={mode === 'request' ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} style={{ height: 42 }} /></label>}
          {mode === 'request' && <label className="field"><span>Repeat password</span><input className="input" type="password" autoComplete="new-password" required value={password2} onChange={e => setPassword2(e.target.value)} style={{ height: 42 }} /></label>}
          <button className="btn primary block" style={{ height: 44 }} disabled={busy}>{busy ? <span className="spin" /> : mode === 'reset' ? <KeyRound size={16} /> : <Lock size={16} />}{mode === 'reset' ? 'Send reset link' : mode === 'request' ? 'Send request' : 'Sign in'}</button>
          {msg && <div className={`notice ${msg.tone}`}>{msg.text}</div>}
          <div className="row between">
            <button type="button" className="link small" onClick={() => { setMode(m => m === 'signin' ? 'reset' : 'signin'); setMsg(null); }}>{mode === 'signin' ? 'Forgot your password?' : 'Back to sign in'}</button>
            {mode === 'signin' && signup.enabled && <button type="button" className="link small" onClick={() => { setMode('request'); setMsg(null); }}>New here? Request access</button>}
          </div>
        </div>
      </form>
    </section>
  </div>;
}
