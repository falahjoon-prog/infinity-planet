import { getSupabaseAdmin } from './supabase';
/** The person's chosen language (Settings → My profile): 'en' or 'fa'. */
export async function userLanguage(userId: string): Promise<'en' | 'fa'> {
  const { data, error } = await getSupabaseAdmin().from('profiles').select('language').eq('id', userId).maybeSingle();
  return !error && data?.language === 'fa' ? 'fa' : 'en';
}
export const LANGUAGE_RULE = 'Reply in Farsi (Persian), written naturally for a business audience. Keep people\'s names, company names, numbers, dates, amounts and clause references as written, and give key legal or technical terms in English in brackets the first time. If the user writes in English and asks for English, reply in English.';
