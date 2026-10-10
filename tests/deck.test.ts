/** Presentations, research parsing and instant navigation (no network, no database). Run: npm run test:decks */
import { builtinDeck, builtinDeckEdit, outlineToSlides, normalizeDeck, deckOutline } from '../lib/deck';
import { parseDuckDuckGo } from '../lib/research';
import { quickNav } from '../lib/client/quick-nav';
import { writeFileSync } from 'fs';

let pass = 0, fail = 0;
const t = (name: string, c: boolean) => { if (c) pass++; else { fail++; console.log('FAIL', name); } };

const project = { name: 'Riverside Residences', description: 'Riverfront apartments in Hamilton. 220 homes over three towers.', location: 'Hamilton, QLD', deal_value: 120000000, project_type: 'residential', status: 'marketing', highlights: 'River views\nWalk to ferry\n5-star energy rating' };
let d = builtinDeck({ request: 'Investor presentation about Riverside covering the opportunity, location, numbers and timeline', project, business: 'RHC City Pty Ltd', contact: { name: 'Falah Joon', email: 'falah@rhccity.com.au' } });
t('title slide first', d.slides[0].layout === 'title');
t('closing slide last', d.slides[d.slides.length - 1].layout === 'closing' && /Falah Joon/.test(d.slides[d.slides.length - 1].subtitle || ''));
t('project facts become stats', d.slides.some(s => s.layout === 'stats' && s.stats!.some(x => x.value === '$120m')));
t('highlights slide', d.slides.some(s => s.title === 'Highlights' && s.bullets!.includes('Walk to ferry')));
t('agenda', d.slides.some(s => s.title === 'Agenda'));
const n0 = d.slides.length;
let r = builtinDeckEdit(d, 'add a slide about funding: senior debt; equity partner; pre-sales'); t('add slide', !!r && r.deck.slides.length === n0 + 1 && r.deck.slides.some(s => s.title === 'Funding' && s.bullets!.length === 3)); d = r!.deck;
r = builtinDeckEdit(d, 'make slide 3 a bar chart: 2024 = 12, 2025 = 18, 2026 = 25'); t('chart slide', !!r && r.deck.slides[2].layout === 'chart' && r.deck.slides[2].chart!.labels.join() === '2024,2025,2026' && r.deck.slides[2].chart!.series[0].values.join() === '12,18,25'); d = r!.deck;
r = builtinDeckEdit(d, 'move slide 4 to 2'); t('move slide', !!r && r.deck.slides[1].id === d.slides[3].id); d = r!.deck;
r = builtinDeckEdit(d, 'remove slide 2'); t('remove slide', !!r && r.deck.slides.length === d.slides.length - 1); d = r!.deck;
r = builtinDeckEdit(d, 'rename slide 2 to The opportunity'); t('rename', r!.deck.slides[1].title === 'The opportunity'); d = r!.deck;
r = builtinDeckEdit(d, 'replace Riverside with Riverside Park'); t('replace text', !!r && /Riverside Park/.test(JSON.stringify(r.deck)));
t('unknown request', builtinDeckEdit(d, 'what do you think?') === null);
const slides = outlineToSlides('## Summary\nThe market is growing [1].\n## Key findings\n- Population up 2% [2]\n- Prices up 5%\n## Sources\n[1] ABS — https://abs.gov.au');
t('outline to slides', slides.length === 2 && slides[1].bullets!.length === 2 && !/\[1\]/.test(slides[0].bullets![0]));
const nd = normalizeDeck({ title: 'X', slides: [{ layout: 'chart', title: 'No data', chart: { type: 'bar', labels: [], series: [] } }, { layout: 'weird', bullets: 'a\nb' }, { stats: [{ value: 5, label: 'Five' }] }] });
t('normalise: chart without data becomes points', nd.slides[0].layout === 'bullets');
t('normalise: unknown layout', nd.slides[1].layout === 'bullets' && nd.slides[1].bullets!.length === 2);
t('normalise: stats inferred', nd.slides[2].layout === 'stats' && nd.slides[2].stats![0].value === '5');
t('outline text', /## 1\./.test(deckOutline(d)));

// research parsing
const html = `<div class="result"><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.abs.gov.au%2Fstats&amp;rut=x">ABS <b>Brisbane</b> population</a></h2><a class="result__snippet" href="x">Brisbane grew by <b>2.1%</b> in 2024.</a></div>
<div class="result"><a class="result__a" href="https://example.com/b">Second</a><div class="result__snippet">Second snippet</div></div>
<div class="result"><a class="result__a" href="https://duckduckgo.com/y.js?ad_domain=x">Ad</a></div>`;
const res = parseDuckDuckGo(html);
t('search results parsed', res.length === 2 && res[0].url === 'https://www.abs.gov.au/stats' && res[0].title === 'ABS Brisbane population' && res[0].snippet === 'Brisbane grew by 2.1% in 2024.');
t('second result', res[1].url === 'https://example.com/b' && res[1].snippet === 'Second snippet');

// instant navigation
t('open task', quickNav('open task')?.href === '/tasks');
t('go to approvals', quickNav('please go to approvals')?.href === '/approvals');
t('show calendar', quickNav('show calendar')?.href === '/calendar');
t('open the presentations page', quickNav('open the presentations page')?.href === '/presentations');
t('not a navigation', quickNav('open a task for Ali to call the council') === null && quickNav('create a task') === null);

(async () => {
  console.log(`decks: ${pass} passed, ${fail} failed`);
  if (process.env.DECK_OUT) writeFileSync(`${process.env.DECK_OUT}/deck.json`, JSON.stringify(d, null, 1));
  process.exit(fail ? 1 : 0);
})();
