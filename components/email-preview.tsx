'use client';
import React, { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Loading, ErrorNote } from '@/components/ui';

/** The email as the recipient will see it: logo header, signature block, footer and quoted original. */
export function EmailPreview({ draft, height = 460 }: { draft: any; height?: number }) {
  const [html, setHtml] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [text, setText] = useState('');
  const key = JSON.stringify([draft?.id, draft?.subject, draft?.body, draft?.gmail_thread_id]);
  useEffect(() => { if (!draft) return; const t = setTimeout(() => { api.post('/api/email/preview', draft.id && !draft.dirty ? { draft_id: draft.id } : { subject: draft.subject, body: draft.body, gmail_thread_id: draft.gmail_thread_id, in_reply_to: draft.in_reply_to, quoted: draft.quoted || (draft.original ? { from: draft.original.from, date: draft.original.date, body: draft.original.body } : null) }).then(r => { setHtml(r.html); setText(r.text); setErr(null); }).catch(e => setErr(e.message)); }, 300); return () => clearTimeout(t); }, [key]);
  if (err) return <ErrorNote error={err} />;
  if (html === null && !text) return <Loading />;
  return html ? <iframe title="Email preview" className="email-preview" sandbox="" srcDoc={html} style={{ width: '100%', height, border: '1px solid var(--line)', borderRadius: 8, background: '#eef1f5' }} /> : <div className="doc-text" style={{ fontFamily: 'var(--font)', maxHeight: height }}>{text}</div>;
}

