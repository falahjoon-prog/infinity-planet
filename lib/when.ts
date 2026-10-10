/**
 * Natural-language date/time parsing for the built-in AI bot (no AI key needed).
 * Times are Queensland time (UTC+10, no daylight saving).
 * Examples: "tomorrow 3pm", "friday at 9:30", "in 2 hours", "on 14/10 at 10am", "12 Oct", "next monday morning".
 */
export const TZ_OFFSET_MIN = 600;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

type Local = { y: number; mo: number; d: number; h: number; mi: number };
const toLocal = (t: Date): Local => { const x = new Date(t.getTime() + TZ_OFFSET_MIN * 60_000); return { y: x.getUTCFullYear(), mo: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes() }; };
const fromLocal = (l: Local) => new Date(Date.UTC(l.y, l.mo, l.d, l.h, l.mi) - TZ_OFFSET_MIN * 60_000);
const addDays = (l: Local, n: number): Local => { const t = new Date(Date.UTC(l.y, l.mo, l.d + n)); return { ...l, y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate() }; };
const dow = (l: Local) => new Date(Date.UTC(l.y, l.mo, l.d)).getUTCDay();

export type WhenResult = { at: Date; matched: string[]; hasTime: boolean; hasDate: boolean };

/** Finds a date/time in free text. Returns null if nothing date-like is found. */
export function parseWhen(text: string, now = new Date()): WhenResult | null {
  const s = ` ${text.toLowerCase().replace(/[,]/g, ' ')} `;
  const matched: string[] = [];
  const take = (re: RegExp) => { const m = s.match(re); if (m) matched.push(m[0].trim()); return m; };
  const base = toLocal(now);

  // Relative: in 20 minutes / in 2 hours / in 3 days / in a week
  let m = take(/\bin\s+(an?|\d+(?:\.\d+)?)\s*(min(?:ute)?s?|hours?|hrs?|days?|weeks?)\b/);
  if (m) {
    const n = /^an?$/.test(m[1]) ? 1 : Number(m[1]); const u = m[2];
    const ms = /^min/.test(u) ? 60_000 : /^h/.test(u) ? 3_600_000 : /^d/.test(u) ? 86_400_000 : 7 * 86_400_000;
    return { at: new Date(now.getTime() + n * ms), matched, hasTime: true, hasDate: true };
  }

  let date: Local | null = null;
  if (take(/\b(day after tomorrow)\b/)) date = addDays(base, 2);
  else if (take(/\b(tomorrow|tmrw|tmr)\b/)) date = addDays(base, 1);
  else if (take(/\b(today|tonight)\b/)) date = { ...base };
  if (!date) {
    m = take(/\b(next|this|on)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/);
    if (m) {
      const idx = WEEKDAYS.findIndex(w => w.startsWith(m![2].slice(0, 3)));
      let diff = (idx - dow(base) + 7) % 7; if (diff === 0) diff = 7;
      date = addDays(base, diff);
    }
  }
  if (!date) {
    // 14/10, 14/10/2026, 14-10-26 (Australian day/month)
    m = take(/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/) || take(/\b(?:on\s+)?(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})\b/);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
      let y = m[3] ? Number(m[3]) : base.y; if (y < 100) y += 2000;
      date = { ...base, y, mo: Number(m[2]) - 1, d: Number(m[1]) };
      if (!m[3] && fromLocal({ ...date, h: 23, mi: 59 }) < now) date.y += 1;
    } else if (m) matched.pop();
  }
  if (!date) {
    // 14 Oct / 14th October 2026 / October 14
    m = take(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/)
      || take(/\b(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/);
    if (m) {
      const dayFirst = /^\d/.test(m[1]);
      const d = Number(dayFirst ? m[1] : m[2]); const mo = MONTHS.indexOf((dayFirst ? m[2] : m[1]).slice(0, 3));
      date = { ...base, y: m[3] ? Number(m[3]) : base.y, mo, d };
      if (!m[3] && fromLocal({ ...date, h: 23, mi: 59 }) < now) date.y += 1;
    }
  }

  // Time of day
  let h: number | null = null, mi = 0;
  m = take(/\b(?:at\s+|@\s*)?(\d{1,2})(?::|\.)(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?\b/);
  if (m) { h = Number(m[1]); mi = Number(m[2]); if (m[3]?.startsWith('p') && h < 12) h += 12; if (m[3]?.startsWith('a') && h === 12) h = 0; }
  else {
    m = take(/\b(?:at\s+|@\s*)?(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\b/);
    if (m) { h = Number(m[1]); if (m[2].startsWith('p') && h < 12) h += 12; if (m[2].startsWith('a') && h === 12) h = 0; }
    else if ((m = take(/\bat\s+(\d{1,2})\b(?!\s*(?:min|hour|day|week|%|\/|-))/))) { h = Number(m[1]); if (h >= 1 && h <= 7) h += 12; }
    else if (take(/\b(noon|midday)\b/)) h = 12;
    else if (take(/\b(end of (the )?day|eod|cob|close of business)\b/)) h = 17;
    else if (take(/\b(first thing|morning)\b/)) h = 9;
    else if (take(/\bafternoon\b/)) h = 14;
    else if (take(/\b(evening|tonight)\b/)) h = 18;
  }
  if (h !== null && (h > 23 || mi > 59)) { h = null; mi = 0; }

  if (!date && h === null) return null;
  const hasTime = h !== null;
  if (!date) {
    date = { ...base };
    if (fromLocal({ ...date, h: h!, mi }) <= now) date = addDays(date, 1);
  }
  const at = fromLocal({ ...date, h: hasTime ? h! : 9, mi: hasTime ? mi : 0 });
  return { at, matched: matched.filter(Boolean), hasTime, hasDate: true };
}

/** Removes the date words found by parseWhen (and dangling "at/on/by/due") from a phrase. */
export function stripWhen(text: string, w: WhenResult | null) {
  let out = ` ${text} `;
  for (const piece of w?.matched || []) out = out.replace(new RegExp(`\\s${piece.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/\s+/g, '\\s+')}(?=\\W|$)`, 'i'), ' ');
  return out.replace(/\s+(at|on|by|due|before|from)\s*$/i, ' ').replace(/\s{2,}/g, ' ').trim().replace(/[\s,.;:-]+$/, '');
}

export function formatWhen(d: Date) {
  return d.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
