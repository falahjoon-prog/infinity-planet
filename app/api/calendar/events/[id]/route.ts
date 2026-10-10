import { NextRequest } from 'next/server';
import { route, ok, body, pick, HttpError } from '@/lib/http';
import { requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { googleClient, googleCall } from '@/lib/google';
import { google } from 'googleapis';

const FIELDS = ['title', 'starts_at', 'ends_at', 'location', 'description', 'project_id', 'attendees', 'reminder_minutes', 'all_day'];

export const PATCH = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const patch = pick(await body(req), FIELDS);
  if (typeof patch.attendees === 'string') patch.attendees = patch.attendees.split(/[,;\s]+/).filter(Boolean);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('calendar_events').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  let googleError: string | null = null;
  if (data.external_id) {
    try {
      const { auth } = await googleClient();
      const end = data.ends_at || new Date(new Date(data.starts_at).getTime() + 3600_000).toISOString();
      await googleCall(() => google.calendar({ version: 'v3', auth }).events.patch({ calendarId: 'primary', eventId: data.external_id, requestBody: { summary: data.title, location: data.location || undefined, description: data.description || undefined, start: { dateTime: data.starts_at, timeZone: 'Australia/Brisbane' }, end: { dateTime: end, timeZone: 'Australia/Brisbane' }, attendees: (data.attendees || []).map((email: string) => ({ email })) } }));
      await db.from('calendar_events').update({ synced_at: new Date().toISOString() }).eq('id', id);
    } catch (e: any) { googleError = e?.message || 'Google update failed'; }
  }
  if ('starts_at' in patch || 'reminder_minutes' in patch) {
    await db.from('reminders').delete().eq('event_id', id).eq('status', 'pending');
    if (data.reminder_minutes != null) await db.from('reminders').insert({ title: `Meeting: ${data.title}`, remind_at: new Date(new Date(data.starts_at).getTime() - data.reminder_minutes * 60_000).toISOString(), project_id: data.project_id, event_id: id });
  }
  await writeAudit({ actorId: actor.id, action: 'calendar.event_updated', entityType: 'calendar_event', entityId: id, metadata: { fields: Object.keys(patch) } });
  return ok({ event: data, google_error: googleError });
});

export const DELETE = route(async (req: NextRequest, { params }) => {
  const actor = await requireWriter(req);
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data } = await db.from('calendar_events').select('external_id,title').eq('id', id).maybeSingle();
  if (!data) throw new HttpError(404, 'Event not found');
  let googleError: string | null = null;
  if (data.external_id) {
    try { const { auth } = await googleClient(); await googleCall(() => google.calendar({ version: 'v3', auth }).events.delete({ calendarId: 'primary', eventId: data.external_id })); }
    catch (e: any) { googleError = e?.message || 'Google delete failed'; }
  }
  await db.from('calendar_events').delete().eq('id', id);
  await writeAudit({ actorId: actor.id, action: 'calendar.event_deleted', entityType: 'calendar_event', entityId: id, metadata: { title: data.title } });
  return ok({ deleted: true, google_error: googleError });
});
