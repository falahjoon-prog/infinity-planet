'use client';
/** "Database update needed" — copies the update and opens Supabase's SQL editor, so an admin can apply it in a minute. */
import React, { useState } from 'react';
import { AlertTriangle, Copy, ExternalLink, Check } from 'lucide-react';
import { useApp } from '@/components/app-context';
import { Button, useToast } from '@/components/ui';
import { supabase } from '@/lib/client/api';

export function MigrationHelp({ error }: { error?: string | null }) {
  const { can } = useApp(); const toast = useToast(); const [copied, setCopied] = useState(false);
  const file = (String(error || '').match(/\b(00\d)_/) || [])[1] || '006';
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
  const sqlUrl = ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : 'https://supabase.com/dashboard';
  const copy = async () => {
    try {
      const { data } = await supabase().auth.getSession();
      const r = await fetch(`/api/system/migration?file=${file}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ''}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load the update');
      await navigator.clipboard.writeText(await r.text()); setCopied(true); toast('Update copied — paste it in Supabase and click Run', 'success');
    } catch (e: any) { toast(e.message, 'error'); }
  };
  return <div className="migration-help">
    <AlertTriangle size={18} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <b>The database needs update {file}.</b> Some features (roles, colours, scheduled emails) won&apos;t save until it&apos;s applied.
      {can.admin ? <ol><li>Click <b>Copy update</b>.</li><li>Click <b>Open Supabase</b> (sign in if asked).</li><li>Paste into the empty query, click <b>Run</b>, then reload this page.</li></ol> : <div className="small">Ask an admin to apply it.</div>}
    </div>
    {can.admin && <div className="row" style={{ gap: 8, alignSelf: 'center' }}><Button size="sm" variant="primary" icon={copied ? <Check size={13} /> : <Copy size={13} />} onClick={copy}>{copied ? 'Copied' : 'Copy update'}</Button><a className="btn sm" href={sqlUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Open Supabase</a></div>}
  </div>;
}
