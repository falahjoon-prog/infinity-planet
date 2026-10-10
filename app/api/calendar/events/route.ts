import { NextRequest } from 'next/server';
import { route, ok, body, must, pick, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { googleClient, googleCall, googleIntegration } from '@/lib/google';
import { google } from 'googleapis';

const EVENT_FIELDS = ['title', 'starts_at', 'ends_at', 'location', 'description', 'project_id', 'attendees', 'reminder_minutes', 'all_day'];

/** Internal RHC events merged with Google Calendar events (when connected). */
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') || new Date(Date.now() - 7 * 864e5).toISOString();
  const to = sp.get('to') || new Date(Date.now() + 60 * 864e5).toISOString();
  let q = getSupabaseAdmin().from('calendar_events').select('*, project:projects(id,name)').gte('starts_at', from).lte('starts_at', to).order('starts_at');
  if (sp.get('project_id')) q = q.eq('project_id', sp.get('project_id')!);
  const { data, error } = await q;
  if (error) throw error;
  let googleEvents: any[] = []; let googleError: string | null = null; let googleConnected = false;
  const integ = await googleIntegration();
  if (integ?.status === 'connected' && !sp.get('project_id')) {
    googleConnected = true;
    try {
      const { auth } = await googleClient();
      const cal = google.calendar({ version: 'v3', auth });
      const r = await googleCall(() => cal.events.list({ calendarId: 'primary', timeMin: from, timeMax: to, singleEvents: true, orderBy: 'startTime', maxResults: 250 }));
      const linked = new Set((data || []).map(e => e.external_id).filter(Boolean));
      googleEvents = (r.data.items || []).filter(e => !linked.has(e.id)).map(e => ({
        id: `google:${e.id}`, external_id: e.id, provider: 'google', title: e.summary || '(no title)', starts_at: e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00` : null),
        ends_at: e.end?.dateTime || null, all_day: !!e.start?.date, location: e.location || null, description: e.description || null, attendees: (e.attendees || []).map(a => a.email).filter(Boolean), html_link: e.htmlLink, readonly: true,
      }));
    } catch (e: any) { googleError = e?.message || 'Google Calendar unavailable'; }
  }
  return ok({ events: [...(data || []), ...googleEvents].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))), google: { connected: googleConnected, error: googleError } });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const b = await body(req);
  must(b.title, 'Title is required'); must(b.starts_at, 'Start time is required');
  const row = pick(b, EVENT_FIELDS);
  if (typeof row.attendees === 'string') row.attendees = row.attendees.split(/[,;\s]+/).filter(Boolean);
  if (row.ends_at && new Date(row.ends_at) < new Date(row.starts_at)) throw new HttpError(400, 'End time is before start time');
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('calendar_events').insert({ ...row, provider: 'internal', created_by: actor.id }).select().single();
  if (error) throw error;
  let googleError: string | null = null; let event = data;
  if (b.sync_google) {
    try {
      const { auth } = await googleClient();
      const cal = google.calendar({ version: 'v3', auth });
      const end = data.ends_at || new Date(new Date(data.starts_at).getTime() + 3600_000).toISOString();
      const r = await googleCall(() => cal.events.insert({ calendarId: 'primary', sendUpdates: b.notify_attendees ? 'all' : 'none', requestBody: { summary: data.title, location: data.location || undefined, description: data.description || undefined, start: { dateTime: data.starts_at, timeZone: 'Australia/Brisbane' }, end: { dateTime: end, timeZone: 'Australia/Brisbane' }, attendees: (data.attendees || []).map((email: string) => ({ email })), reminders: data.reminder_minutes != null ? { useDefault: false, overrides: [{ method: 'popup', minutes: data.reminder_minutes }] } : { useDefault: true } } }));
      event = (await db.from('calendar_events').update({ external_id: r.data.id, provider: 'google', synced_at: new Date().toISOString() }).eq('id', data.id).select().single()).data || data;
    } catch (e: any) { googleError = e?.message || 'Google sync failed'; }
  }
  if (data.reminder_minutes != null) await db.from('reminders').insert({ title: `Meeting: ${data.title}`, remind_at: new Date(new Date(data.starts_at).getTime() - data.reminder_minutes * 60_000).toISOString(), project_id: data.project_id, event_id: data.id, recipient_id: null });
  await writeAudit({ actorId: actor.id, action: 'calendar.event_created', entityType: 'calendar_event', entityId: data.id, metadata: { title: data.title, google: !!event.external_id } });
  return ok({ event, google_error: googleError }, 201);
});
