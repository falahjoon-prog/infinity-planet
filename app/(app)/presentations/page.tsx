'use client';
import { DEFAULT_THEME } from '@/lib/deck-themes';
import { useOpenWindow } from '@/lib/client/nav-history';
import { SplitHandle } from '@/components/split-handle';
import { ArrangeToolbar, ArrangeOverlay } from '@/components/slide-arrange';
import { PhotoPicker } from '@/components/photo-picker';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Presentation, Download, Save, CheckCircle2, Send, RotateCcw, Search, Globe, FileText, Copy, ArrowUp, ArrowDown, Trash2, Plus, Sparkles, User, Undo2, ExternalLink, ChevronLeft, ChevronRight, Maximize2, Minimize2, Palette, Minus, Square, X, Shapes } from 'lucide-react';
import { api, apiFetch, useApi, downloadBlob } from '@/lib/client/api';
import { useApp } from '@/components/app-context';
import { ProjectSelect, ProviderSelect } from '@/components/pickers';
import { SlideView, useDeckThemes, ALL_BUILTIN } from '@/components/deck-view';
import { normalizeDeck } from '@/lib/deck';
import { TemplateGallery, themeName } from '@/components/deck-templates';
import { PageHead, Button, Loading, Empty, StatusBadge, Markdown, useToast, useConfirm, Notice, Modal } from '@/components/ui';
import { ago, personName } from '@/lib/client/format';
import type { Deck, Slide } from '@/lib/deck';

export default function Page() { return <Suspense fallback={<Loading />}><Presentations /></Suspense>; }

function Presentations() {
  const sp = useSearchParams(); const router = useRouter();
  const tab = sp.get('tab') === 'research' ? 'research' : 'decks';
  // The open presentation lives in the address (…?open=id), so Back closes it and stays in Presentations.
  const win = useOpenWindow();
  const [shown, setShown] = useState<{ id: string | null; n: number }>({ id: win.value, n: 0 });
  const own = useRef<string | null>(null); const prev = useRef(win.value);
  useEffect(() => {
    const p = prev.current; prev.current = win.value; if (p === win.value) return;
    if (!p && win.value && win.value === own.current) return; // the presentation just saved for the first time — keep it as it is
    own.current = null; setShown(x => ({ id: win.value, n: x.n + 1 }));
  }, [win.value]);
  const reset = () => setShown(x => ({ id: null, n: x.n + 1 }));
  return <>
    <PageHead title={tab === 'research' ? 'Research' : 'Presentations'} />
    {tab === 'research' ? <ResearchPanel onDeck={() => router.push('/presentations?from=research')} />
      : <DeckStudio key={`deck-${shown.n}`} assetId={shown.id}
          onOpen={id => win.open(id)}
          onSaved={id => { own.current = id; win.open(id); }}
          onNew={() => { if (win.value) win.set(null); else reset(); }}
          onClose={() => { if (win.value) win.close(); else reset(); }} />}
  </>;
}

// ====================================================================== presentations
type Msg = { id: number; role: 'user' | 'assistant'; content: string; prev?: Deck | null; undone?: boolean; engine?: string };

function DeckStudio({ assetId, onOpen, onSaved, onNew, onClose }: { assetId: string | null; onOpen: (id: string) => void; onSaved: (id: string) => void; onNew: () => void; onClose: () => void }) {
  const sp = useSearchParams(); const { me } = useApp(); const toast = useToast(); const confirm = useConfirm();
  const saved = useApi<any>('/api/marketing/assets?kind=deck');
  const [deck, setDeck] = useState<Deck | null>(null); const [cur, setCur] = useState(0);
  const [project, setProject] = useState<string | null>(sp.get('project')); const [provider, setProvider] = useState('auto');
  const [length, setLength] = useState<'brief' | 'standard' | 'comprehensive'>('standard');
  const [research, setResearch] = useState<string | null>(null);
  const [asset, setAsset] = useState<{ id: string; status: string; saved: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState(false); const [focusField, setFocusField] = useState<string | null>(null); const [showSaved, setShowSaved] = useState(false); const [full, setFull] = useState(false); const [mini, setMini] = useState(false); const [arrange, setArrange] = useState(false); const [arrSel, setArrSel] = useState<string | null>(null);
  const { custom, house } = useDeckThemes(); const [pendingTheme, setPendingTheme] = useState<string | null>(null); const [showTpl, setShowTpl] = useState(false);
  const themeId = deck?.theme || pendingTheme || house?.theme_id || DEFAULT_THEME;
  const [wmPending, setWmPending] = useState(true); const wmOn = deck ? deck.watermark !== false : wmPending;
  const toggleWm = () => { if (deck) setDeck({ ...deck, watermark: deck.watermark === false ? undefined : false }); else setWmPending(w => !w); };
  const pickTheme = (id: string) => {
    const t = ALL_BUILTIN.find(x => x.id === id);
    if (deck) setDeck({ ...deck, theme: id });
    else if (t?.outline) { // collection templates start with a ready outline
      setDeck(normalizeDeck({ ...t.outline, theme: id }, t.outline.title)); setCur(0); setPendingTheme(id);
      setMsgs(m => [...m, { id: Date.now(), role: 'assistant', content: `Started **${t.outline!.title}** from the “${t.name}” template — ${t.outline!.slides.length} slides with our own facts (each slide's sources are in its notes). Fill in the [●] parts, or tell me what to change.` }]);
    } else setPendingTheme(id);
    setShowTpl(false);
  };
  useEffect(() => { if (!full) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); }; window.addEventListener('keydown', k); document.body.classList.add('no-scroll'); return () => { window.removeEventListener('keydown', k); document.body.classList.remove('no-scroll'); }; }, [full]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  // Open a saved deck
  useEffect(() => { if (!assetId) return; api.get(`/api/marketing/assets/${assetId}`).then(r => { const d = r.asset.design; setDeck(d); setProject(r.asset.project_id); setAsset({ id: r.asset.id, status: r.asset.status, saved: JSON.stringify(d) }); }).catch((e: any) => toast(e.message, 'error')); }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Arrive from Research with a report
  useEffect(() => { if (sp.get('from') !== 'research') return; try { const r = sessionStorage.getItem('ip-research-to-deck'); if (r) { const j = JSON.parse(r); setResearch(j.report); sessionStorage.removeItem('ip-research-to-deck'); setText(`Make a presentation from this research: ${j.question}`); } } catch {} }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!asset && !!deck && asset.saved !== JSON.stringify(deck);
  const status = !asset ? null : dirty ? 'draft' : asset.status;
  const isExec = ['admin', 'director'].includes(me.role);
  const slide = deck?.slides[cur];

  const send = async (raw?: string) => {
    const message = (raw ?? text).trim(); if (!message || busy) return;
    const id = Date.now(); setMsgs(m => [...m, { id, role: 'user', content: message }]); setText(''); setBusy('chat');
    try {
      const r = await api.post('/api/decks/turn', { message, deck, current_slide: deck ? cur : undefined, theme: themeId, history: msgs.filter(m => !m.undone).map(m => ({ role: m.role, content: m.content })), provider, project_id: project, research, length });
      const prev = deck;
      if (r.deck) { if (!prev && !wmPending) r.deck.watermark = false; setDeck(r.deck); if (!prev) setCur(0); else setCur(c => Math.min(c, r.deck.slides.length - 1)); }
      setMsgs(m => [...m, { id: id + 1, role: 'assistant', content: r.reply, prev: r.deck ? prev : null, engine: r.engine }]);
    } catch (e: any) { setMsgs(m => [...m, { id: id + 1, role: 'assistant', content: `Sorry — ${e.message}` }]); } finally { setBusy(null); }
  };
  const undo = (m: Msg) => { setDeck(m.prev || null); setMsgs(all => all.map(x => x.id === m.id ? { ...x, undone: true } : x)); };
  const lastChange = [...msgs].reverse().find(m => m.role === 'assistant' && m.prev != null && !m.undone);

  const patchSlide = (p: Partial<Slide>) => { if (!deck || !slide) return; const s = deck.slides.slice(); s[cur] = { ...slide, ...p }; setDeck({ ...deck, slides: s }); };
  const move = (dir: -1 | 1) => { if (!deck) return; const j = cur + dir; if (j < 0 || j >= deck.slides.length) return; const s = deck.slides.slice(); [s[cur], s[j]] = [s[j], s[cur]]; setDeck({ ...deck, slides: s }); setCur(j); };
  const go = (dir: -1 | 1) => { if (!deck) return; setCur(c => Math.min(Math.max(0, c + dir), deck.slides.length - 1)); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (/INPUT|TEXTAREA|SELECT/.test(t?.tagName || '') || t?.isContentEditable) return; if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1); if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const removeSlide = () => { if (!deck || deck.slides.length < 2) return; const s = deck.slides.filter((_, i) => i !== cur); setDeck({ ...deck, slides: s }); setCur(Math.max(0, cur - 1)); };
  const addSlide = () => { if (!deck) return; const s = deck.slides.slice(); s.splice(cur + 1, 0, { id: Math.random().toString(36).slice(2, 9), layout: 'bullets', title: 'New slide', bullets: ['[● point]'] }); setDeck({ ...deck, slides: s }); setCur(cur + 1); setEdit(true); };

  // A presentation that appears (from a template or from the conversation) is saved as a draft straight away and becomes
  // a step of its own (…?open=id), so Back closes it and stays in Presentations.
  const autoSaved = useRef(false);
  useEffect(() => { if (!deck || asset || assetId || autoSaved.current || busy === 'chat') return; autoSaved.current = true; save(); }, [deck, asset, assetId, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (): Promise<string | null> => {
    if (!deck) return null;
    try {
      const outline = deckOutlineClient(deck);
      if (!asset) { const r = await api.post('/api/marketing/assets', { title: deck.title, content: outline, design: deck, layout: 'presentation', project_id: project, kind: 'deck', engine: 'deck' }); setAsset({ id: r.asset.id, status: r.asset.status, saved: JSON.stringify(deck) }); saved.reload(); onSaved(r.asset.id); return r.asset.id; }
      if (dirty) { const r = await api.patch(`/api/marketing/assets/${asset.id}`, { title: deck.title, content: outline, design: deck }); setAsset({ id: asset.id, status: r.asset.status, saved: JSON.stringify(deck) }); saved.reload(); }
      return asset.id;
    } catch (e: any) { toast(e.message, 'error'); return null; }
  };
  const doSave = async () => { setBusy('save'); const id = await save(); setBusy(null); if (id) toast('Saved', 'success'); };
  const finalise = async () => {
    if (!(await confirm({ title: 'Finalise this presentation?', body: 'It will be saved and approved by you. PowerPoint and PDF downloads then have no DRAFT mark, and a final PDF is filed in Documents.', confirm: 'Finalise' }))) return;
    setBusy('final');
    try { const id = await save(); if (!id) return; const r = await api.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: id, approvers: [me.id], summary: `Finalised by ${personName(me)}` }); await api.patch(`/api/approvals/${r.approval.id}`, { status: 'approved', note: 'Finalised' }); setAsset(a => a ? { ...a, status: 'approved', saved: JSON.stringify(deck) } : a); saved.reload(); toast('Final — download PowerPoint or PDF', 'success'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const sendForApproval = async () => { setBusy('appr'); try { const id = await save(); if (!id) return; await api.post('/api/approvals', { entity_type: 'marketing_asset', entity_id: id, summary: deck?.title }); setAsset(a => a ? { ...a, status: 'awaiting_approval' } : a); toast('Sent for approval', 'success'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const download = async (format: 'pptx' | 'pdf') => {
    if (!deck) return; setBusy(format);
    try {
      if (asset && !dirty) { const { blob, name } = await api.blob(`/api/decks/${asset.id}/export?format=${format}`); downloadBlob(blob, decodeURIComponent(name)); }
      else { const r = await apiFetch('/api/decks/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deck, format }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Download failed'); const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || `presentation.${format}`; downloadBlob(await r.blob(), decodeURIComponent(name)); }
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const closeDeck = async () => { if (deck && (dirty || !asset) && !(await confirm({ title: 'Close this presentation?', body: asset ? 'Unsaved changes will be lost.' : 'This presentation has not been saved and will be lost.', confirm: 'Close', danger: true }))) return; onClose(); };
  const startNew = async () => { if (deck && (dirty || !asset) && !(await confirm({ title: 'Start a new presentation?', body: asset ? 'Unsaved changes will be lost.' : 'This presentation has not been saved and will be lost.', confirm: 'Start new', danger: true }))) return; onNew(); };

  const starters = ['Investor presentation for this project', 'Company profile of RHC: who we are, projects, team, contact', 'Pitch deck for a joint venture partner'];
  return <div className="dk">
    <div className="ws-bar">
      <label className="ws-f"><span>Project</span><ProjectSelect value={project} onChange={setProject} noneLabel="No project" className="select sm" /></label>
      <div className="ws-f"><span>Length</span><div className="seg-tabs sm">{([['brief', 'Short'], ['standard', 'Standard'], ['comprehensive', 'Full']] as const).map(([v, l]) => <button key={v} className={length === v ? 'on' : ''} onClick={() => setLength(v)}>{l}</button>)}</div></div>
      <div className="ws-f"><span>Template</span><Button size="sm" icon={<Palette size={14} />} onClick={() => setShowTpl(true)}>{themeName(themeId, custom)}</Button></div>
      <label className="ws-f check small" title="The Infinity Planet dome, faint, on the cover and section slides" style={{ alignSelf: 'flex-end', paddingBottom: 6 }}><input type="checkbox" checked={wmOn} onChange={toggleWm} /> Dome watermark</label>
      {research && <div className="ws-f"><span>Research</span><span className="chip">Using research report <button className="link small" onClick={() => setResearch(null)}>remove</button></span></div>}
      <span className="spacer" />
      <div className="ws-f ws-saved"><span>&nbsp;</span><Button size="sm" icon={<FileText size={14} />} onClick={() => setShowSaved(s => !s)}>Saved ({saved.data?.assets?.length ?? 0})</Button>
        {showSaved && <div className="ws-pop right"><div className="ws-pop-h"><b>Saved presentations</b></div>{saved.loading ? <Loading /> : !saved.data?.assets?.length ? <p className="small muted">Nothing saved yet.</p> : <div className="list">{saved.data.assets.map((a: any) => <button key={a.id} className="list-item" onClick={() => { setShowSaved(false); onOpen(a.id); }}><div className="main-col"><div className="title">{a.title}</div><div className="meta">{a.project?.name || 'No project'} · {ago(a.updated_at)}</div></div><StatusBadge value={a.status} /></button>)}</div>}</div>}
      </div>
    </div>
    <div className={`dk-main${mini && deck ? ' dk-min' : ''}`}>
      <SplitHandle id="deck" min={300} max={760} minOther={480} fold foldLabel="AI conversation" />
      <section className="ws-chat">
        <div className={edit && !full && slide ? 'dk-edit-split' : 'dk-chat-col'}>
        {edit && !full && slide && <div className="dk-edit-col"><SlideEditor slide={slide} index={cur} onChange={patchSlide} onClose={() => setEdit(false)} /></div>}
        <div className="dk-chat-col">
        <div className="ws-chat-h"><b>Conversation</b><span className="spacer" /><span className="tiny muted">Writer</span><ProviderSelect value={provider} onChange={setProvider} auto builtin="Built-in (no AI)" compact className="select sm" /></div>
        {deck && slide && <div className="dk-focus">{focusField ? <>Editing the <b>{focusField}</b> on slide {cur + 1} — ask Infinity AI for help any time, e.g. “suggest a better {focusField}”.</> : <>On slide {cur + 1}{slide.title ? ` · “${slide.title.slice(0, 50)}”` : ''}. Say “this slide” and the AI changes it. Double-click any text on the slide to type straight on it.</>}</div>}
        <div className="wchat">
          <div className="wchat-list" ref={listRef}>
            {!msgs.length && <div className="wchat-intro"><b>Describe the presentation.</b><p>Who it's for, the goal, the key messages, and anything it must include. Then change it by talking — "add a slide on funding", "make slide 4 a chart", "shorter titles". You can also start from <a className="link" href="/presentations?tab=research">Research</a>.</p></div>}
            {msgs.map(m => <div key={m.id} className={`wmsg ${m.role}${m.undone ? ' undone' : ''}`}><span className="wmsg-ic">{m.role === 'user' ? <User size={13} /> : <Sparkles size={13} />}</span><div className="wmsg-body"><div className="wmsg-text">{m.content}</div>{m.role === 'assistant' && m.prev !== undefined && m.prev !== null && <div className="wmsg-foot">{m.undone ? <span className="tiny muted">Undone</span> : m === lastChange ? <button className="link small" onClick={() => undo(m)}><Undo2 size={12} /> Undo this change</button> : null}{m.engine && <span className="tiny muted">{m.engine === 'builtin' ? 'Built-in' : m.engine}</span>}</div>}</div></div>)}
            {busy === 'chat' && <div className="wmsg assistant"><span className="wmsg-ic"><Sparkles size={13} /></span><div className="wmsg-body"><div className="wmsg-text typing"><span /><span /><span /> {deck ? 'Changing the slides…' : 'Building the presentation — up to a minute…'}</div></div></div>}
          </div>
          <div className="wchat-quick">{(deck ? (edit || focusField ? ['Rewrite this slide more clearly', 'Suggest a better title for this slide', 'Make this slide shorter', 'Add speaker notes to this slide'] : ['Add a slide on next steps', 'Shorter bullet points', 'Add speaker notes', 'Make the titles punchier']) : starters).map(q => <button key={q} disabled={!!busy} onClick={() => send(q)}>{q}</button>)}</div>
          <div className="wchat-compose"><textarea rows={3} value={text} onChange={e => setText(e.target.value)} disabled={busy === 'chat'} placeholder={deck ? 'Ask for a change…' : 'Describe the presentation…'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} /><button className="btn primary wchat-send" onClick={() => send()} disabled={!!busy || !text.trim()} aria-label="Send"><Send size={16} /></button></div>
          <div className="wchat-hint tiny muted">Enter to send · Shift+Enter for a new line</div>
        </div>
        </div>
        </div>
      </section>
      <section className={`dk-stage${full ? ' full' : ''}`}>
        {!deck ? <div className="dk-start"><div className="dk-start-h"><b>Choose a look</b><span className="small muted">Then describe the presentation on the left. You can change the template any time — the PowerPoint and PDF follow it.</span></div><TemplateGallery value={themeId} onPick={pickTheme} compact /></div> : <>
          <div className="ws-doc-h"><input className="input title-input" value={deck.title} onChange={e => setDeck({ ...deck, title: e.target.value })} aria-label="Presentation title" /><span className="muted small">{cur + 1} / {deck.slides.length}</span>
            <div className="win-bar" role="group" aria-label="Window">
              <button className="win-btn" onClick={() => { setFull(false); setMini(m => !m); }} title={mini ? 'Restore' : 'Minimise — give the conversation the whole width'} aria-label={mini ? 'Restore' : 'Minimise'}>{mini ? <Copy size={14} /> : <Minus size={16} />}</button>
              <button className="win-btn" onClick={() => { setMini(false); setFull(f => !f); }} title={full ? 'Restore (Esc)' : 'Maximise'} aria-label={full ? 'Restore' : 'Maximise'}>{full ? <Minimize2 size={14} /> : <Square size={13} />}</button>
              <button className="win-btn close" onClick={closeDeck} title="Close this presentation" aria-label="Close presentation"><X size={16} /></button>
            </div></div>
          {arrange && slide && <ArrangeToolbar slide={slide} sel={arrSel} setSel={setArrSel} onChange={extras => patchSlide({ extras })} onClose={() => { setArrange(false); setArrSel(null); }} />}
          <div className="dk-view">
            <div className="dk-slide">{slide && <div className={`dk-slide-wrap${arrange ? ' arranging' : ''}`}><SlideView slide={slide} deck={deck} index={cur} inline={arrange ? undefined : { onChange: patchSlide, onOpenPanel: () => setEdit(true), onFocusField: setFocusField }} />{arrange && <ArrangeOverlay slide={slide} sel={arrSel} setSel={setArrSel} onChange={extras => patchSlide({ extras })} />}
              <button className="dk-nav prev" onClick={() => go(-1)} disabled={cur === 0} aria-label="Previous slide"><ChevronLeft size={26} /></button>
              <button className="dk-nav next" onClick={() => go(1)} disabled={cur === deck.slides.length - 1} aria-label="Next slide"><ChevronRight size={26} /></button></div>}</div>
            {edit && full && slide && <SlideEditor slide={slide} index={cur} onChange={patchSlide} onClose={() => setEdit(false)} />}
          </div>
          <div className="dk-tools">
            <Button size="sm" icon={<ChevronLeft size={15} />} onClick={() => go(-1)} disabled={cur === 0}>Previous</Button>
            <span className="dk-count">{cur + 1} / {deck.slides.length}</span>
            <Button size="sm" onClick={() => go(1)} disabled={cur === deck.slides.length - 1}>Next <ChevronRight size={15} /></Button>
            <span className="dk-sep" />
            <Button size="sm" variant={edit ? 'primary' : undefined} onClick={() => setEdit(e => !e)} title="Or double-click any text on the slide to type straight on it">{edit ? 'Done editing' : 'Edit this slide'}</Button><Button size="sm" variant={arrange ? 'primary' : undefined} icon={<Shapes size={14} />} onClick={() => { setArrange(a => !a); setArrSel(null); }} title="Add photos, lines, arrows, boxes and text; move, resize, bring forward or send back">{arrange ? 'Done arranging' : 'Photos & drawing'}</Button>
            <button className="icon-btn" title="Move this slide earlier" onClick={() => move(-1)} disabled={cur === 0}><ArrowUp size={15} style={{ transform: 'rotate(-90deg)' }} /></button>
            <button className="icon-btn" title="Move this slide later" onClick={() => move(1)} disabled={cur === deck.slides.length - 1}><ArrowDown size={15} style={{ transform: 'rotate(-90deg)' }} /></button>
            <button className="icon-btn" title="Add a slide after this one" onClick={addSlide}><Plus size={15} /></button>
            <button className="icon-btn" title="Delete this slide" onClick={removeSlide} disabled={deck.slides.length < 2}><Trash2 size={15} /></button>
          </div>
          <div className="dk-strip">{deck.slides.map((s, i) => <button key={s.id} className={i === cur ? 'on' : ''} onClick={() => setCur(i)} aria-label={`Slide ${i + 1}`}><SlideView slide={s} deck={deck} index={i} small /><span>{i + 1}</span></button>)}</div>
          <div className="ws-actions">
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={startNew}>New</Button>
            {status && <StatusBadge value={status} />}
            <span className="spacer" />
            <Button size="sm" icon={<Download size={14} />} loading={busy === 'pptx'} onClick={() => download('pptx')}>PowerPoint</Button>
            <Button size="sm" icon={<Download size={14} />} loading={busy === 'pdf'} onClick={() => download('pdf')}>PDF</Button>
            {status !== 'approved' && <Button size="sm" icon={<Save size={14} />} loading={busy === 'save'} disabled={!!asset && !dirty} onClick={doSave}>{asset && !dirty ? 'Saved' : 'Save'}</Button>}
            {status !== 'approved' && status !== 'awaiting_approval' && (isExec ? <Button size="sm" variant="primary" icon={<CheckCircle2 size={14} />} loading={busy === 'final'} onClick={finalise}>Finalise</Button> : <Button size="sm" variant="primary" icon={<Send size={14} />} loading={busy === 'appr'} onClick={sendForApproval}>Send for approval</Button>)}
          </div>
        </>}
      </section>
    </div>
    <Modal open={showTpl} onClose={() => setShowTpl(false)} title="Presentation templates" size="xl"><TemplateGallery value={themeId} onPick={pickTheme} /></Modal>
  </div>;
}

function deckOutlineClient(d: Deck) {
  return [`# ${d.title}`, ...d.slides.map((s, i) => [`## ${i + 1}. ${s.title || s.layout}`, s.subtitle || '', ...(s.bullets || []).map(b => `- ${b}`), ...[s.left, s.right].flatMap(c => c ? [c.heading || '', ...c.bullets.map(b => `- ${b}`)] : []), ...(s.stats || []).map(x => `- ${x.value} — ${x.label}`), s.quote ? `"${s.quote}"` : ''].filter(Boolean).join('\n'))].join('\n\n');
}

function SlideEditor({ slide, index, onChange, onClose }: { slide: Slide; index: number; onChange: (p: Partial<Slide>) => void; onClose: () => void }) {
  const lines = (a?: string[]) => (a || []).join('\n'); const arr = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean);
  return <div className="dk-edit">
    <div className="row"><b>Edit slide {index + 1}</b><span className="spacer" /><button className="btn sm primary" onClick={onClose}>Done</button></div>
    <p className="tiny muted" style={{ margin: 0 }}>Changes show on the slide straight away. Use Previous / Next to edit other slides.</p>
    <label>Layout<select className="select sm" value={slide.layout} onChange={e => onChange({ layout: e.target.value as Slide['layout'] })}>{[['title', 'Title'], ['section', 'Section divider'], ['bullets', 'Points'], ['two_column', 'Two columns'], ['stats', 'Big numbers'], ['quote', 'Quote'], ['chart', 'Chart'], ['closing', 'Closing']].map(([v, l]) => <option key={v} value={v} disabled={v === 'chart' && !slide.chart}>{l}</option>)}</select></label>
    <label>Title<input className="input" value={slide.title || ''} onChange={e => onChange({ title: e.target.value })} /></label>
    {['title', 'section', 'closing'].includes(slide.layout) && <label>Subtitle<input className="input" value={slide.subtitle || ''} onChange={e => onChange({ subtitle: e.target.value })} /></label>}
    {['bullets', 'stats', 'chart'].includes(slide.layout) && <label>Points (one per line)<textarea className="textarea" rows={6} value={lines(slide.bullets)} onChange={e => onChange({ bullets: arr(e.target.value) })} /></label>}
    {slide.layout === 'two_column' && <>{(['left', 'right'] as const).map(k => <label key={k}>{k === 'left' ? 'Left' : 'Right'} column — heading, then points<textarea className="textarea" rows={4} value={[slide[k]?.heading || '', ...(slide[k]?.bullets || [])].join('\n')} onChange={e => { const a = e.target.value.split('\n'); onChange({ [k]: { heading: a[0] || '', bullets: a.slice(1).map(x => x.trim()).filter(Boolean) } } as any); }} /></label>)}</>}
    {slide.layout === 'stats' && <label>Numbers — one per line as "value | label"<textarea className="textarea" rows={4} value={(slide.stats || []).map(s => `${s.value} | ${s.label}`).join('\n')} onChange={e => onChange({ stats: e.target.value.split('\n').map(l => { const [v, ...r] = l.split('|'); return { value: (v || '').trim(), label: r.join('|').trim() }; }).filter(x => x.value).slice(0, 4) })} /></label>}
    {slide.layout === 'quote' && <><label>Quote<textarea className="textarea" rows={3} value={slide.quote || ''} onChange={e => onChange({ quote: e.target.value })} /></label><label>By<input className="input" value={slide.by || ''} onChange={e => onChange({ by: e.target.value })} /></label></>}
    {(slide.layout === 'bullets' || slide.layout === 'quote') ? <div className="field"><span className="small" style={{ fontWeight: 600 }}>Photo</span><PhotoPicker value={slide.photo} onChange={v => onChange({ photo: v })} /></div>
      : <p className="tiny muted" style={{ margin: 0 }}>Photos sit beside the text on Points and Quote slides. To put a picture anywhere on this slide, use <b>Photos &amp; drawing</b>.</p>}
    <label>Speaker notes<textarea className="textarea" rows={3} value={slide.notes || ''} onChange={e => onChange({ notes: e.target.value })} /></label>
  </div>;
}

// ====================================================================== research
type RMsg = { id: number; role: 'user' | 'assistant'; content: string; sources?: { title: string; url: string }[]; engine?: string };

function ResearchPanel({ onDeck }: { onDeck: () => void }) {
  const toast = useToast();
  const [provider, setProvider] = useState('auto'); const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard');
  const [msgs, setMsgs] = useState<RMsg[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  const ask = async (raw?: string) => {
    const q = (raw ?? text).trim(); if (!q || busy) return; const id = Date.now();
    setMsgs(m => [...m, { id, role: 'user', content: q }]); setText(''); setBusy(true);
    try { const r = await api.post('/api/research', { question: q, provider, depth, history: msgs.map(m => ({ role: m.role, content: m.content })) }); setMsgs(m => [...m, { id: id + 1, role: 'assistant', content: r.report, sources: r.sources, engine: r.engine }]); }
    catch (e: any) { setMsgs(m => [...m, { id: id + 1, role: 'assistant', content: `Sorry — ${e.message}` }]); } finally { setBusy(false); }
  };
  const questionFor = (m: RMsg) => { const i = msgs.indexOf(m); return msgs.slice(0, i).reverse().find(x => x.role === 'user')?.content || 'Research'; };
  const toDeck = (m: RMsg) => { try { sessionStorage.setItem('ip-research-to-deck', JSON.stringify({ question: questionFor(m), report: m.content })); } catch {} onDeck(); };
  const saveDoc = async (m: RMsg) => { try { await api.post('/api/documents', { name: `Research — ${questionFor(m).slice(0, 90)}`, content_text: `${m.content}\n\nSources:\n${(m.sources || []).map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n')}`, source: 'research' }); toast('Saved to Documents — the AI can now use it too', 'success'); } catch (e: any) { toast(e.message, 'error'); } };
  const engineLabel = (e?: string) => e === 'web' ? 'Web search (no AI)' : e === 'ollama+web' ? 'Web search + Ollama' : e === 'openai' ? 'ChatGPT web search' : e === 'anthropic' ? 'Claude web search' : e === 'gemini' ? 'Gemini + Google Search' : e || '';
  return <div className="rs">
    <div className="ws-bar">
      <div className="ws-f"><span>Depth</span><div className="seg-tabs sm">{([['quick', 'Quick'], ['standard', 'Standard'], ['deep', 'Deep']] as const).map(([v, l]) => <button key={v} className={depth === v ? 'on' : ''} onClick={() => setDepth(v)}>{l}</button>)}</div></div>
      <label className="ws-f"><span>Researcher</span><ProviderSelect value={provider} onChange={setProvider} auto builtin="Web search only (no AI)" compact className="select sm" /></label>
      <span className="spacer" />
      {msgs.length > 0 && <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setMsgs([])}>New research</Button>}
    </div>
    <section className="rs-main">
      <div className="rs-list" ref={listRef}>
        {!msgs.length && <div className="rs-intro"><Globe size={28} /><b>Ask a research question</b><p>The AI searches the web, reads the sources and writes a report with links. Keep asking follow-up questions, then turn it into a presentation or save it to Documents.</p>
          <div className="wchat-quick">{['Entertainment precinct developments in South East Queensland — recent projects, sizes and investors', 'Population and housing growth forecasts for North Brisbane to 2036', 'Who are the major investors in Australian theme parks and integrated resorts?'].map(q => <button key={q} onClick={() => ask(q)}>{q}</button>)}</div></div>}
        {msgs.map(m => m.role === 'user' ? <div key={m.id} className="rs-q"><User size={14} /> {m.content}</div> : <article key={m.id} className="rs-a">
          <div className="rs-a-h"><Sparkles size={14} /><span className="tiny muted">{engineLabel(m.engine)}</span><span className="spacer" />{m.sources && <><Button size="xs" icon={<Presentation size={13} />} onClick={() => toDeck(m)}>Make a presentation</Button><Button size="xs" icon={<FileText size={13} />} onClick={() => saveDoc(m)}>Save to Documents</Button><Button size="xs" variant="ghost" icon={<Copy size={13} />} onClick={() => navigator.clipboard?.writeText(m.content).then(() => toast('Copied', 'success'))}>Copy</Button></>}</div>
          <div className="rs-body"><Markdown text={m.content} /></div>
          {!!m.sources?.length && <div className="rs-sources"><b>Sources</b>{m.sources.slice(0, 15).map((s, i) => <a key={s.url + i} href={s.url} target="_blank" rel="noopener noreferrer"><span>{i + 1}</span>{s.title}<ExternalLink size={11} /></a>)}</div>}
        </article>)}
        {busy && <div className="wmsg assistant"><span className="wmsg-ic"><Search size={13} /></span><div className="wmsg-body"><div className="wmsg-text typing"><span /><span /><span /> Searching the web and reading sources — {depth === 'deep' ? 'a deep search can take 2–3 minutes' : 'about a minute'}…</div></div></div>}
      </div>
      <div className="wchat-compose rs-compose"><textarea rows={2} value={text} onChange={e => setText(e.target.value)} disabled={busy} placeholder={msgs.length ? 'Ask a follow-up question…' : 'What do you want researched?'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }} /><button className="btn primary wchat-send" onClick={() => ask()} disabled={busy || !text.trim()} aria-label="Search"><Search size={16} /></button></div>
      <Notice>Research reads public web pages. Check important figures against the linked sources before relying on them.</Notice>
    </section>
  </div>;
}
