'use client';
/**
 * What the person has open right now, so Infinity AI can answer about it ("what does clause 12 mean?").
 * Pages are read from the address (legal reviews, PDFs, drafts, projects, deals); pop-ups such as the
 * document viewer and an open email register themselves with useScreenItem().
 */
import { useEffect } from 'react';

export type ScreenKind = 'legal_review' | 'document' | 'email' | 'project' | 'deal' | 'draft' | 'deck' | 'page';
export type ScreenItem = { kind: ScreenKind; id: string; title?: string };
export type ScreenInfo = { path: string; page: string; item: ScreenItem | null; selection?: string | null };

const stack: { key: number; item: ScreenItem }[] = []; let seq = 0;
/** Registers an item that is open on screen (newest wins) while the component is shown. */
export function useScreenItem(item: ScreenItem | null) {
  useEffect(() => {
    if (!item?.id) return; const key = ++seq; stack.push({ key, item });
    return () => { const i = stack.findIndex(s => s.key === key); if (i >= 0) stack.splice(i, 1); };
  }, [item?.kind, item?.id, item?.title]); // eslint-disable-line react-hooks/exhaustive-deps
}

const UUID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
function fromPath(path: string, search: URLSearchParams): ScreenItem | null {
  let m: RegExpMatchArray | null;
  if ((m = path.match(new RegExp(`^/legal/${UUID}`)))) return { kind: 'legal_review', id: m[1] };
  if ((m = path.match(new RegExp(`^/pdf/${UUID}`)))) return { kind: 'document', id: m[1] };
  if ((m = path.match(new RegExp(`^/drafting/${UUID}`)))) return { kind: 'draft', id: m[1] };
  if ((m = path.match(new RegExp(`^/projects/${UUID}`)))) return { kind: 'project', id: m[1] };
  if ((m = path.match(new RegExp(`^/crm/${UUID}`)))) return { kind: 'deal', id: m[1] };
  if (path.startsWith('/presentations') && search.get('open')) return { kind: 'deck', id: String(search.get('open')) };
  if (path.startsWith('/gmail') && search.get('open')) return { kind: 'email', id: String(search.get('open')) };
  return null;
}
const PAGE_NAMES: [RegExp, string][] = [[/^\/$/, 'Today'], [/^\/gmail/, 'Gmail'], [/^\/team/, 'Team chat'], [/^\/projects/, 'Projects'], [/^\/crm/, 'Deals'], [/^\/tasks/, 'Tasks'], [/^\/calendar/, 'Calendar'], [/^\/documents/, 'Documents'], [/^\/pdf/, 'PDF viewer'], [/^\/drafting/, 'Drafting'], [/^\/notes/, 'Notes'], [/^\/legal/, 'Legal AI'], [/^\/marketing/, 'Marketing'], [/^\/designer/, 'Designer'], [/^\/presentations/, 'Presentations'], [/^\/approvals/, 'Approvals'], [/^\/system/, 'Settings']];

/** A snapshot of the screen for the AI. */
export function currentScreen(selection?: string | null): ScreenInfo {
  const path = typeof location !== 'undefined' ? location.pathname : '/';
  const search = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const item = stack.length ? stack[stack.length - 1].item : fromPath(path, search);
  const page = PAGE_NAMES.find(([re]) => re.test(path))?.[1] || 'the app';
  return { path: path + (search.toString() ? `?${search}` : ''), page, item, selection: selection ? selection.slice(0, 2000) : null };
}
