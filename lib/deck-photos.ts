/**
 * Our photo library for presentations: photos taken from RHC's own decks (Infinity Planet presentation and
 * Investment Plan) and renders from infinityplanet.com.au, each labelled with what it shows. Files: public/brand/deck/photos/<id>.jpg (cropped to the
 * slide's photo frame, 5 × 4.2 in) and thumbs/<id>.jpg. The AI and the built-in writer pick from these by subject.
 */
import type { Deck, Slide } from './deck';

export type LibPhoto = { id: string; label: string; tags: string };
const RAW: [string, string, string][] = [
  // renders from infinityplanet.com.au
  ['w01', "Infinity Planet aerial", "infinity planet aerial project overview whole project city render scale masterplan"],
  ['w02', "Hotel tower at sunset", "hotel hotels accommodation tower rooms luxury sunset"],
  ['w03', "Cultural park", "cultural park culture pavilions heritage domes courtyard"],
  ['w04', "Garden avenues", "garden avenues gardens landscape heritage landmarks"],
  ['w05', "Cultural road", "cultural road global heritage avenue landmarks concept areas"],
  ['w06', "City Hall", "city hall dome events conventions performances venue"],
  ['w07', "RHC reference countries", "international investors countries global research reference countries world"],
  ['w08', "Site location aerial", "site land location aerial elimbah bruce highway nearby centres access"],
  ['w09', "Global Cultural Mall interior", "global cultural mall retail shopping brands interior"],
  ['w10', "Theme park render", "theme park attractions rides outdoor theme park"],
  ['w11', "Technology Park & AI Hub", "technology park ai hub innovation smart city tech"],
  ['w12', "Dome at night", "dome night attractions entertainment lights"],
  // official renders (Infinity Planet Design pack)
  ['d01', "Entertainment dome at night", "dome night entertainment centre attractions ferris wheel lights indoor theme park events"],
  ['d02', "City aerial — dome and districts", "aerial project overview city dome districts masterplan whole project scale"],
  ['d03', "Cultural avenue — world landmarks", "cultural avenue garden avenues heritage landmarks pavilions global cultural mall countries culture"],
  ['d04', "Panorama from the Bruce Highway", "panorama land site location bruce highway elimbah landscape city skyline"],
  ['d05', "Beach, waterfall and resort hotel", "hotel hotels accommodation resort beach waterfall pools glamping rooms"],
  ['d06', "Heritage boulevard with fountains", "heritage boulevard avenue fountains cultural pavilions flags international countries"],
  ['d07', "Masterplan — 20 concept areas (labelled)", "masterplan concept areas zones site plan layout attractions labelled"],
  ['d08', "Welcome in many languages (media wall)", "welcome international languages investors global countries visitors world"],
  ['p01', "Stock market growth", "investment growth returns shares stock market profit"],
  ['p02', "Masterplan site plan", "masterplan site plan layout zones design"],
  ['p04', "Infinity Planet aerial render", "project overview aerial render infinity planet site scale"],
  ['p05', "Project aerial render", "project aerial render overview development"],
  ['p06', "Masterplan (round view)", "masterplan city hall centre layout"],
  ['p09', "Investment", "investment investors growth capital"],
  ['p10', "Seed money", "seed money capital funding investment founders"],
  ['p13', "Project zones", "zones stages phases framework dividing project sections"],
  ['p19', "Project panorama", "project scale overview aerial panorama"],
  ['p20', "Masterplan top view", "masterplan city hall top view"],
  ['p21', "Theme park top view", "theme park attractions masterplan"],
  ['p22', "Car-free city design", "car-free city transport circuit design"],
  ['p23', "Global heritage avenue", "global heritage cultural avenues landmarks concept areas"],
  ['p26', "Virtual reality", "entertainment technology virtual reality experiences vr"],
  ['p28', "Dome by night", "attractions entertainment night dome world of attractions"],
  ['p30', "Shopping mall", "mall retail shopping outlet"],
  ['p32', "Integrated resort benchmark", "integrated resort benchmark tourism comparable singapore"],
  ['p33', "Moreton Bay coast", "location moreton bay coast queensland"],
  ['p34', "World map", "international global investors countries markets world"],
  ['p35', "Queensland nature", "queensland nature beach rainforest tourism"],
  ['p36', "International community", "international olympics cultures flags community nations"],
  ['p37', "Brisbane skyline", "brisbane city queensland economy why queensland"],
  ['p38', "Moreton Bay aerial", "moreton bay location suburbs growth population"],
  ['p39', "Agri-tech drone", "agriculture technology drone innovation"],
  ['p40', "Partners signing", "partners agreement signing mou team collaboration"],
  ['p41', "The subject site", "subject site land highway acreage"],
  ['p42', "Location map", "location map distances brisbane sunshine coast"],
  ['p43', "Nearby towns map", "nearby towns residential location map"],
  ['p44', "Cultural avenue", "cultural mall global heritage avenue"],
  ['p45', "Ferris wheel", "theme park entertainment attractions ferris wheel"],
  ['p46', "Hotel complex", "hotel accommodation resort rooms"],
  ['p47', "Project overview render", "project scale overview aerial complex"],
  ['p49', "Cultural performance", "culture cultural performances events city hall"],
  ['p50', "Performing arts", "performances arts theatre events dance"],
  ['p51', "VR gaming", "technology gaming entertainment vr arcade"],
  ['p52', "VR simulator", "theme park technology simulator ride"],
  ['p53', "Theme park ride", "theme park rides family fun"],
  ['p54', "Resort pool", "hotel resort pool accommodation luxury"],
  ['p55', "Hotel guests", "hotel hospitality guests breakfast"],
  ['p56', "Glamping tent", "glamping accommodation camping tents"],
  ['p57', "Glamping cabin", "glamping cabins accommodation"],
  ['p58', "Traditional hut", "glamping cultural huts"],
  ['p59', "Garden avenue", "four garden avenues landmarks"],
  ['p60', "Global cultural mall", "cultural mall global courtyard"],
  ['p61', "Paradise gardens", "gardens paradise gardens landscape japanese"],
  ['p62', "Wedding & event centre", "city hall wedding event centre building"],
  ['p63', "Masterplan with circuit", "masterplan circuit layout"],
  ['p64', "Retail store", "retail shopping fashion store"],
  ['p65', "Shopping arcade", "shopping arcade retail heritage gallery"],
  ['p66', "Wedding", "wedding events celebration"],
  ['p67', "Wedding ceremony", "wedding ceremony events"],
  ['p68', "International food court", "food court international food dining"],
  ['p69', "Desserts", "food desserts gelato food court"],
  ['p70', "Industrial park", "industrial park warehouse logistics office"],
  ['p71', "Recycling", "sustainability recycling environment net zero"],
  ['p72', "Training", "training education office workforce jobs"],
  ['p73', "Water infrastructure", "infrastructure water utilities sustainability"],
  ['p74', "Car park", "car park parking transport"],
  ['p75', "Tram", "transport tram car-free city"],
  ['p76', "Walkable street", "street pedestrians car-free walkable city"],
  ['p77', "Autonomous shuttle", "transport autonomous shuttle technology"],
  ['p78', "Solar energy", "solar renewable energy sustainability technology park"],
  ['p79', "Infinity Planet app", "app technology digital smart city"],
  ['p80', "Full masterplan", "masterplan site plan"],
  ['p81', "Redcliffe coast", "moreton bay redcliffe location coast"],
  ['p82', "Site from above", "site project land aerial view"],
  ['p83', "Site panorama", "site highway land panorama"],
  ['p84', "Investor briefing", "events presentations investor briefing"],
  ['p85', "Partnership", "partnership agreement signing handshake"],
  ['p86', "Boardroom meeting", "meetings government collaboration board"],
  ['p87', "Investor lunch", "events investor lunch networking"],
  ['p88', "Launch event", "launch event team partners"]
];
export const PHOTOS: LibPhoto[] = RAW.map(([id, label, tags]) => ({ id, label, tags }));
const BY_ID = new Map(PHOTOS.map(p => [p.id, p]));
export const photoSrc = (id: string) => `asset:photos/${id}.jpg`;
export const photoThumb = (id: string) => `/brand/deck/photos/thumbs/${id}.jpg`;
/** The library photo behind a slide's photo value, if it is one. */
export const libId = (src?: string | null) => { const m = /^asset:photos\/([pwd]\d{2})\.jpg$/.exec(src || ''); return m && BY_ID.has(m[1]) ? m[1] : null; };

/** Accepts what the AI or the screen sends: a library id ("p46"), a library path, an uploaded picture, or "none". */
export function cleanPhoto(v: any): string | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  if (v === 'none') return 'none';
  if (/^[pwd]\d{2}$/.test(v) && BY_ID.has(v)) return photoSrc(v);
  if (libId(v)) return v;
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 3_500_000) return v;
  return undefined;
}

/** For the AI: the catalogue it may choose from. */
export function photoCatalogue(): string {
  return PHOTOS.map(p => `${p.id}: ${p.label} — ${p.tags}`).join('\n');
}

const STOP = new Set('the and for with our that this from into over your their have has are was were will what when where which while about across after also been being both each more most much only other some such than then them they very within without would could should project projects development overview plan design new key next step steps why how who per its infinity planet rhc city presentation investor investors agenda summary contents'.split(' '));
const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter(w => !STOP.has(w));
const stem = (w: string) => w.replace(/(ies|es|s|ing|ed)$/,'');

/** The library photo that best matches some words (e.g. "hotel pool"); ones already used only win when clearly better. */
export function bestPhoto(query: string, exclude: Set<string> = new Set()): LibPhoto | null {
  const q = new Set(words(query).map(stem)); let best: LibPhoto | null = null, bs = 0;
  for (const p of PHOTOS) { let sc = 0; for (const w of new Set(words(`${p.label} ${p.tags}`).map(stem))) if (q.has(w)) sc++; if (exclude.has(p.id)) sc -= 0.5; if (sc > bs) { best = p; bs = sc; } }
  return best;
}

/** Slides a photo suits: short bullet lists and quotes, without hand-placed items. */
export const photoFits = (s: Slide) => (s.layout === 'bullets' && (s.bullets?.length || 0) <= 5 && (s.bullets || []).join(' ').length < 520) || s.layout === 'quote';

/** Gives slides that suit a photo the best-matching library photo (each used once). Slides already decided are left alone. */
export function autoPhotos(deck: Deck, max = 6): Deck {
  const used = new Set(deck.slides.map(s => libId(s.photo)).filter(Boolean) as string[]);
  let added = deck.slides.filter(s => s.photo && s.photo !== 'none').length;
  const slides = deck.slides.map(s => {
    if (added >= max || s.photo !== undefined || s.extras?.length || !photoFits(s)) return s;
    const title = new Set(words(`${s.title || ''} ${s.quote || ''}`).map(stem)); const body = new Set(words((s.bullets || []).join(' ')).map(stem));
    if (/^(agenda|contents|summary|executive summary|overview)$/i.test((s.title || '').trim())) return s;
    let best: LibPhoto | null = null, bestScore = 0;
    for (const p of PHOTOS) {
      if (used.has(p.id)) continue;
      const tw = new Set(words(`${p.label} ${p.tags}`).map(stem)); let sc = 0, inTitle = false;
      for (const w of tw) { if (title.has(w)) { sc += 3; inTitle = true; } else if (body.has(w)) sc += 1; }
      if (inTitle && sc > bestScore) { best = p; bestScore = sc; }
    }
    if (!best) return s;
    used.add(best.id); added++;
    return { ...s, photo: photoSrc(best.id) };
  });
  return { ...deck, slides };
}
