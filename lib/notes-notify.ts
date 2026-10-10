import { getSupabaseAdmin } from './supabase';
import { displayName } from './people';

/** Lets a person know a note was assigned to them (shows in their bell as a reminder). */
export async function notifyNote(userId: string, note: any, actor: { full_name: string | null; email: string | null }) {
  await getSupabaseAdmin().from('reminders').insert({ title: `Note for you from ${displayName(actor)}: ${note.title}`, remind_at: new Date().toISOString(), recipient_id: userId, project_id: note.project_id || null }).then(() => {}, () => {});
}
