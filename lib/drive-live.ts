/**
 * Keeps Infinity AI connected to the Google Drive folders/links you added:
 *  - autoSyncDrive(): re-syncs every saved Drive link in the background (new and changed files only),
 *    every 30 minutes while the server runs, and whenever the AI is used and the last sync is stale;
 *  - liveDriveSearch(): when the knowledge base has no answer, searches Drive directly (full text),
 *    imports the best matching files and lets the AI answer from them straight away;
 *  - driveStatus(): what is connected and indexed (shown by the AI when it can't find something).
 */
import { google } from 'googleapis';
import { getSupabaseAdmin } from './supabase';
import { googleClient, googleCall, googleConfigured } from './google';
import { importDriveFile } from './drive';
import { syncDriveLink } from './drive-links';
import { terms } from './retrieval';

const STALE_MS = 30 * 60_000;
let syncing: Promise<any> | null = null;

export async function googleConnected() {
  if (!googleConfigured()) return false;
  const { data } = await getSupabaseAdmin().from('integrations').select('status').eq('provider', 'google').maybeSingle();
  return data?.status === 'connected';
}

/** Syncs saved Drive links whose last sync is older than 30 minutes (or all with force). One run at a time. */
export function autoSyncDrive(opts: { force?: boolean } = {}): Promise<{ synced: number; skipped?: string }> {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      if (!(await googleConnected())) return { synced: 0, skipped: 'Google not connected' };
      const db = getSupabaseAdmin();
      const { data: links } = await db.from('drive_links').select('id,last_synced_at');
      let n = 0;
      for (const l of links || []) {
        if (!opts.force && l.last_synced_at && Date.now() - new Date(l.last_synced_at).getTime() < STALE_MS) continue;
        try { await syncDriveLink(l.id, null); n++; } catch { /* recorded on the link */ }
      }
      return { synced: n };
    } catch (e: any) { return { synced: 0, skipped: e?.message }; }
    finally { setTimeout(() => { syncing = null; }, 0); }
  })();
  return syncing;
}
/** Fire-and-forget version used by the AI (never delays a reply). */
export function kickDriveSync() { autoSyncDrive().catch(() => {}); }

export async function driveStatus() {
  const db = getSupabaseAdmin();
  const [conn, links, docs] = await Promise.all([
    googleConnected().catch(() => false),
    db.from('drive_links').select('name,last_synced_at,last_status').order('last_synced_at', { ascending: false, nullsFirst: false }),
    db.from('documents').select('id', { count: 'exact', head: true }).eq('source', 'google_drive'),
  ]);
  return { connected: conn, links: links.data || [], indexed: docs.count || 0, last_sync: links.data?.[0]?.last_synced_at || null };
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
/**
 * Searches Google Drive for the question's key words and imports up to `limit` matching files
 * into the knowledge base (skipping unchanged ones). Returns the documents found.
 */
export async function liveDriveSearch(query: string, limit = 3): Promise<{ id: string; name: string }[]> {
  if (!(await googleConnected())) return [];
  const t = terms(query).filter(w => w.length > 2).slice(0, 4);
  if (!t.length) return [];
  const { auth } = await googleClient();
  const drive = google.drive({ version: 'v3', auth });
  const base = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
  const tries = [t.map(w => `fullText contains '${esc(w)}'`).join(' and '), t.slice(0, 2).map(w => `fullText contains '${esc(w)}'`).join(' and '), `(${t.map(w => `name contains '${esc(w)}'`).join(' or ')})`];
  let files: any[] = [];
  for (const q of tries) {
    const r = await googleCall(() => drive.files.list({ q: `${base} and ${q}`, pageSize: limit, fields: 'files(id,name,mimeType,modifiedTime,webViewLink,size)', supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'allDrives' })).catch(() => null);
    files = r?.data.files || [];
    if (files.length) break;
  }
  const out: { id: string; name: string }[] = [];
  for (const f of files.slice(0, limit)) {
    const r = await Promise.race([importDriveFile(drive, f, {}), new Promise<any>(res => setTimeout(() => res({ status: 'failed' }), 25_000))]);
    if (r?.document_id) out.push({ id: r.document_id, name: r.name || f.name });
  }
  return out;
}

/** Human line describing the Drive connection, for "I couldn't find that" replies. */
export async function driveHint(): Promise<string> {
  const s = await driveStatus().catch(() => null);
  if (!s) return '';
  if (!s.connected) return 'Google Drive is not connected — an admin can connect it in Settings → Google.';
  if (!s.links.length) return `Google Drive is connected but no folders are linked yet — add your Drive folder in Documents → Google Drive links so I can read it.`;
  return `I searched ${s.indexed.toLocaleString()} files from your Google Drive (last synced ${s.last_sync ? new Date(s.last_sync).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'not yet'}) and searched Drive directly.`;
}
