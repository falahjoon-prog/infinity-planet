/**
 * Weekly Board Meeting Record: the form's data, its limits and small helpers shared by the page and the server.
 * Pure code only (no server imports) so the browser can use it too.
 * Records are stored as PDF documents (category 'board_minutes') with this data in documents.metadata.board_meeting,
 * so no extra database table is needed.
 */
export const BOARD_TITLE = 'WEEKLY BOARD MEETING RECORD';
export const BOARD_CATEGORY = 'board_minutes';
export const DEFAULT_NOTE_TAKER = 'Payam Moradi';

export type AgendaItem = { text: string; presenter: string; attachment: string };
export type ActionItem = { action: string; responsible: string; due: string };
export type BoardRecord = {
  date: string; // yyyy-mm-dd (from the date picker); any other text is printed as typed
  meeting_no: string;
  time: string; // HH:MM (24h) from the time picker; any other text is printed as typed
  called_by: string;
  location: string;
  note_taker: string;
  attendees: string[];
  guests: string;
  absents: string;
  agenda: AgendaItem[];
  decisions: string[];
  actions: ActionItem[];
  previous_minutes: string;
  other_notes: string;
  /** How many signature blocks to print (names are never printed — each name is added when that person signs). */
  signature_blocks: number;
};

/** A box on the PDF as fractions of the page (0–1, top-left origin) — the same units the e-signing fields use. */
export type Box = { x: number; y: number; w: number; h: number };
export type SignatureBlock = { page: number; signature: Box; name: Box; date: Box };
export type BoardLayout = { pages: number; blocks: SignatureBlock[] };
export type BoardSignField = Box & { page: number; kind: 'signature' | 'name' | 'date'; label: string; required?: boolean };

export const LIMITS = { short: 200, long: 20_000, attendees: 40, agenda: 120, decisions: 120, actions: 120, blocks: 30 };

const str = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
const line = (v: unknown, max = LIMITS.short) => str(v, max).replace(/\s*\n\s*/g, ' ').trim();
const text = (v: unknown, max = LIMITS.long) => str(v, max).replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** Cleans whatever the form (or an API caller) sent into a complete, safe record. */
export function normaliseBoardRecord(input: any): BoardRecord {
  const i = input && typeof input === 'object' ? input : {};
  const attendees = arr(i.attendees).map(a => line(a, 120)).filter(Boolean).slice(0, LIMITS.attendees);
  const agenda = arr(i.agenda).map((a: any) => ({ text: text(a?.text), presenter: line(a?.presenter), attachment: line(a?.attachment, 300) }))
    .filter(a => a.text || a.presenter || a.attachment).slice(0, LIMITS.agenda);
  const decisions = arr(i.decisions).map(d => text(typeof d === 'string' ? d : (d as any)?.text, 5000)).filter(Boolean).slice(0, LIMITS.decisions);
  const actions = arr(i.actions).map((a: any) => ({ action: text(a?.action, 5000), responsible: line(a?.responsible), due: line(a?.due, 60) }))
    .filter(a => a.action || a.responsible || a.due).slice(0, LIMITS.actions);
  const n = Math.round(Number(i.signature_blocks));
  const signature_blocks = Number.isFinite(n) && n >= 1 ? Math.min(LIMITS.blocks, n) : Math.max(1, Math.min(LIMITS.blocks, attendees.length || 4));
  return {
    date: line(i.date, 40), meeting_no: line(i.meeting_no, 40), time: line(i.time, 40), called_by: line(i.called_by), location: line(i.location),
    note_taker: line(i.note_taker), attendees, guests: text(i.guests, 2000), absents: text(i.absents, 2000), agenda, decisions, actions,
    previous_minutes: text(i.previous_minutes), other_notes: text(i.other_notes), signature_blocks,
  };
}

/** Brisbane's today as yyyy-mm-dd. */
export function todayBrisbane() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** A blank record. With the previous record: same board (attendees, location, time, called by, note taker) and the next meeting number. */
export function newBoardRecord(prev?: Partial<BoardRecord> | null): BoardRecord {
  const attendees = (prev?.attendees || []).slice();
  return {
    date: todayBrisbane(), meeting_no: nextMeetingNo(prev?.meeting_no), time: prev?.time || '', called_by: prev?.called_by || '', location: prev?.location || '',
    note_taker: prev?.note_taker || DEFAULT_NOTE_TAKER, attendees, guests: '', absents: '', agenda: [{ text: '', presenter: '', attachment: '' }], decisions: [],
    actions: [], previous_minutes: '', other_notes: '', signature_blocks: Math.max(1, Math.min(LIMITS.blocks, attendees.length || 4)),
  };
}

/** "163" → "164", "BOD-09" → "BOD-10"; blank (or no number in it) → blank. */
export function nextMeetingNo(prev?: string | null) {
  const m = /^(.*?)(\d+)(\D*)$/.exec(String(prev || '').trim());
  if (!m) return '';
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0');
  return `${m[1]}${n}${m[3]}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "2025-03-10" → "Monday 10 March 2025" (short: "10 Mar 2025"). Other text is returned as typed. */
export function formatMeetingDate(v: string, short = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim());
  if (!m) return String(v || '').trim();
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(+d) || d.getUTCMonth() !== +m[2] - 1) return v;
  return short ? `${+m[3]} ${MONTHS[+m[2] - 1].slice(0, 3)} ${m[1]}` : `${DAYS[d.getUTCDay()]} ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}
/** "21:30" → "9:30 pm". Other text is returned as typed. */
export function formatMeetingTime(v: string) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return String(v || '').trim();
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

/** Short title used for the document list, the signing request and the email. */
export function boardRecordTitle(r: Pick<BoardRecord, 'meeting_no' | 'date'>) {
  return ['Weekly Board Meeting Record', r.meeting_no ? `No. ${r.meeting_no}` : '', r.date ? formatMeetingDate(r.date, true) : ''].filter(Boolean).join(' — ');
}
/** File name in Documents, e.g. "2025-03-10 Weekly Board Meeting Record No 163.pdf". */
export function boardRecordFileName(r: Pick<BoardRecord, 'meeting_no' | 'date'>) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '';
  const no = r.meeting_no.replace(/[^A-Za-z0-9 _.-]+/g, '').trim();
  return `${[date, 'Weekly Board Meeting Record', no ? `No ${no}` : ''].filter(Boolean).join(' ')}.pdf`;
}

/** The three boxes one signer completes on their own block: signature on the line, their name on "Name:", the date on "Date:". */
export function signFieldsForBlock(b: SignatureBlock): BoardSignField[] {
  return [
    { page: b.page, ...b.signature, kind: 'signature', label: 'Signature', required: true },
    { page: b.page, ...b.name, kind: 'name', label: 'Name' },
    { page: b.page, ...b.date, kind: 'date', label: 'Date' },
  ];
}

/** Which signature block a sign request was placed on (matched by its signature box), or -1. */
export function blockOfFields(layout: BoardLayout | null | undefined, fields: any[]): number {
  const sig = arr(fields).find((f: any) => f?.kind === 'signature');
  if (!sig || !layout?.blocks) return -1;
  return layout.blocks.findIndex(b => b.page === sig.page && Math.abs(b.signature.x - sig.x) < 0.002 && Math.abs(b.signature.y - sig.y) < 0.002);
}

/** True when the text has characters the PDF's standard fonts cannot print (e.g. Persian or Arabic script). */
export const hasUnprintable = (s: string) => /[^\x00-\x7e -ÿ–—‘’“”•…€™]/.test(s || '');
