'use client';
import React, { useState } from 'react';
import { Languages } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useToast } from './ui';

const hasFarsi = (t: string) => /[؀-ۿ]/.test(t);
/** "Translate" link that shows an English ⇄ Farsi translation under any text. */
export function Translate({ text, className = '' }: { text: string; className?: string }) {
  const toast = useToast();
  const [out, setOut] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [to, setTo] = useState<string>('');
  if (!text || text.trim().length < 2) return null;
  const go = async () => {
    if (out) { setOut(null); return; }
    setBusy(true);
    try { const r = await api.post('/api/ai/translate', { text, to: hasFarsi(text) ? 'en' : 'fa' }); setOut(r.text); setTo(r.to); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return <span className={className}>
    <button type="button" className="link tiny" onClick={go} disabled={busy} title="Translate English ⇄ Farsi"><Languages size={11} /> {busy ? 'Translating…' : out ? 'Hide translation' : hasFarsi(text) ? 'Translate to English' : 'ترجمه به فارسی'}</button>
    {out && <div className="translated" dir={to === 'fa' ? 'rtl' : 'ltr'}>{out}</div>}
  </span>;
}
