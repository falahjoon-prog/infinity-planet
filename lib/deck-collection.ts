/**
 * The Infinity Planet template collection — 18 presentation templates drawn to the Infinity Planet Brand Book (Jan 2025):
 * Navy and/or Stone + ONE accent colour from the complete palette + white / cream / taupe backgrounds; Gabarito headings,
 * DM Sans body; the Endless Possibilities Ribbon in Aqua only. Artwork: public/brand/deck/t/<template>-*.jpg|png.
 * Each template starts a new presentation with a ready outline built from our own material
 * (Infinity Planet Presentation 2025, Investment Plan 2025, Brand Book, infinityplanet.com.au). [●] = to fill in / confirm.
 */
import type { DeckTheme, DeckArt, TextBox, Spot } from './deck-themes';

// Brand Book palette
const NAVY = '#002A3A', STONE = '#45747B', AQUA = '#00E4FD', TAUPE = '#EFEECF', CREAM = '#FCF8F1', WHITE = '#FFFFFF';
const TEAL = '#0FA3B1', SKY = '#0072CE', GREEN = '#6CC24A', YELLOW = '#F7EA48', ORANGE = '#FFB25B', RED = '#F1093C', FUCHSIA = '#E56DB1';
const INK = '#173845';
const FONTS = { head: 'Gabarito', body: 'DM Sans' };
const SW = 13.333;

// Taglines and contact
const TAG1 = "Australia's First Integrated Entertainment City — Where Imagination Becomes an Experience";
const TAG2 = 'We bring the world to Australia, and Australia to the world.';
const CONTACT = 'infinityplanet.com.au · info@infinityplanet.com.au · +61 7 3162 1162 · Level 38, 71 Eagle Street, Brisbane QLD 4000';
const DECK = 'Infinity Planet Presentation 2025 (RHC City)', INV = 'Investment Plan 2025 (RHC City)', WEB = 'infinityplanet.com.au', BOOK = 'Infinity Planet Brand Book, Jan 2025', PRESS = 'Media coverage of Infinity Planet (2025–26)';

// Logos: with descriptor (navy / white) and with the "Endless Possibilities" tagline (navy / white)
const LOGOS: Partial<DeckArt> = { mark: 't/logo-desc.png', markLight: 't/logo-desc-w.png', markAspect: 1.427, tagMark: 't/logo-tag.png', tagMarkLight: 't/logo-tag-w.png', tagAspect: 1.493 };
const centreTag = (h: number, y: number, light = true): Spot => ({ x: +((SW - h * 1.493) / 2).toFixed(3), y, h, light, tag: true });
const topLeft = (light: boolean, h = 1.15): Spot => ({ x: 0.55, y: 0.45, h, light });
const box = (x: number, y: number, w: number, h: number, ink: string, sub: string, more: Partial<TextBox> = {}): TextBox => ({ x, y, w, h, ink, sub, ...more });
const centreText = (y: number, h: number, ink: string, sub: string): TextBox => ({ x: 1.2, y, w: SW - 2.4, h, ink, sub, align: 'center' });

// Slide helpers for the outlines
const title = (t: string, sub = TAG1) => ({ layout: 'title', title: t, subtitle: sub });
const section = (t: string, sub?: string) => ({ layout: 'section', title: t, ...(sub ? { subtitle: sub } : {}) });
const points = (t: string, bullets: string[], photo?: string, sources: string[] = [DECK], notes?: string) => ({ layout: 'bullets', title: t, bullets, ...(photo ? { photo } : {}), sources, ...(notes ? { notes } : {}) });
const stats = (t: string, s: [string, string][], sources: string[] = [DECK], notes?: string, bullets?: string[]) => ({ layout: 'stats', title: t, stats: s.map(([value, label]) => ({ value, label })), sources, ...(notes ? { notes } : {}), ...(bullets ? { bullets } : {}) });
const cols = (t: string, lh: string, l: string[], rh: string, r: string[], sources: string[] = [DECK]) => ({ layout: 'two_column', title: t, left: { heading: lh, bullets: l }, right: { heading: rh, bullets: r }, sources });
const chart = (t: string, type: 'bar' | 'line' | 'pie' | 'doughnut', labels: string[], name: string, values: number[], sources: string[] = [DECK], notes?: string, bullets?: string[]) => ({ layout: 'chart', title: t, chart: { type, labels, series: [{ name, values }] }, sources, ...(notes ? { notes } : {}), ...(bullets ? { bullets } : {}) });
const quote = (q: string, by: string) => ({ layout: 'quote', quote: q, by });
const closing = () => ({ layout: 'closing', title: TAG2, subtitle: CONTACT });

// Shared facts
const CONCEPTS_L = ['Entertainment Centre & City Hall', 'Outdoor and indoor theme parks', 'Global Cultural Mall', 'International Food Court', 'Cinema Complex', 'Wedding Centre and Event Management Centre', 'Modern City Centre'];
const CONCEPTS_R = ['Accommodation and cultural glamping', 'Beach & Waterfall', 'Sustainability World and Innovation Centre', 'Underwater Life', 'Technology Park', 'Industrial Park & Offices', 'Car parking zones'];
const PHASES = ['Phase 1 — Oct 2027: first 15+ cultural market halls, outdoor theme park activity, multilevel parking', 'Phase 2 — Oct 2028: 25+ more market halls, industrial park, ring road', 'Phase 3 — Oct 2029: remaining market halls, outdoor theme park with 4 hubs, 2 office towers', 'Phase 4 — Feb 2030: hotels and apartments, glamping, beach & waterfall — grand opening'];
const IMPACT: [string, string][] = [['12,000', 'Jobs, direct and indirect'], ['3,624', 'Construction jobs'], ['$5.67B', 'Output over the project lifecycle'], ['$1.95B', 'Gross Regional Product (GRP) value']];

type Spec = {
  id: string; name: string; description: string; accent: string; bg?: string; soft?: string; line?: string;
  cover: string; coverInk?: string; coverMuted: string; heading: DeckTheme['heading']; bullet: DeckTheme['bullet']; stats: DeckTheme['stats']; round: number;
  art: DeckArt; outline: { title: string; subtitle?: string; slides: any[] };
};
const make = (o: Spec): DeckTheme => ({
  id: o.id, name: o.name, category: 'Infinity Planet collection', description: o.description,
  colors: { bg: o.bg || CREAM, ink: INK, muted: STONE, primary: NAVY, accent: o.accent, soft: o.soft || '#F4F2E1', line: o.line || '#E2DFCB', cover: o.cover, coverInk: o.coverInk || WHITE, coverMuted: o.coverMuted },
  fonts: FONTS, cover: 'house', heading: o.heading, bullet: o.bullet, stats: o.stats, deco: 'none', round: o.round,
  art: { ...LOGOS, ...o.art }, outline: o.outline,
});
const dark = (bg: string, accent: string, muted = '#A9C6CC', line = '#1D4A5C') => ({ bg, ink: WHITE, muted, accent, line });
const t = (f: string) => `t/${f}`;

export const COLLECTION: DeckTheme[] = [
  // 1 ── the whole project
  make({
    id: 'ip-project', name: 'The Project', description: 'Navy & Aqua with the Endless Possibilities Ribbon — the whole Infinity Planet story. Starts with a ready outline.',
    accent: AQUA, cover: NAVY, coverMuted: AQUA, heading: 'bar', bullet: 'dot', stats: 'big', round: 0.3,
    art: { cover: t('project-cover.jpg'), coverMark: topLeft(true), coverText: box(0.6, 2.55, 4.1, 2.55, WHITE, '#CFEFF4'), kicker: 'Infinity Planet · The project',
      section: t('project-section.jpg'), sectionText: box(0.6, 2.6, 5.7, 2.15, WHITE, '#CFEFF4', { num: AQUA }), sectionBg: NAVY,
      closing: t('project-closing.jpg'), closingBg: AQUA, closingMark: centreTag(2.3, 0.75, false), closingLogo: null, closingText: centreText(3.6, 2.1, NAVY, NAVY),
      strip: t('project-strip.png'), dark: t('project-dark.jpg'), darkColors: dark(NAVY, AQUA), paper: t('project-paper.jpg') },
    outline: { title: 'Infinity Planet', subtitle: TAG1, slides: [
      title('Infinity Planet'),
      points('Welcome to Infinity Planet', ["A visionary city where the world's cultures come to life — beyond traditional tourism", "Australia's first Integrated Entertainment City — not just a theme park", 'Master developer: RHC City Pty Ltd, Brisbane', 'Elimbah, Moreton Bay — on the Bruce Highway, about 60 km north of the Brisbane CBD'], 'd02', [DECK, BOOK]),
      stats('The project at a glance', [['$2.6B', 'Project value'], ['68 ha', 'Site at Elimbah, Moreton Bay'], ['20', 'Concept areas in one city'], ['2,943', "Hotel rooms — Australia's largest hotel complex"]], [DECK, PRESS]),
      section('A world of attractions', '20 concept areas'),
      cols('20 concept areas', 'Entertainment & culture', CONCEPTS_L, 'Stay, work & sustain', CONCEPTS_R),
      points('A green, car-free city', ['Only 47% of the 666,700 m² site is built — 53% is landscape, roads and pools', 'Ring road and a 9,500-space car park in four zones', 'Electric tram (a replica San Francisco tram): 2.8 km, 7 stops', 'Solar power, geothermal HVAC and stormwater harvesting — targeting a 6-Star Green Star rating'], 'd04'),
      stats('Driving economic growth', IMPACT),
      points('The path to realisation', PHASES, undefined, [DECK, INV, WEB]),
      quote('Endless possibilities — to explore, to shop, to learn, to be inspired, to celebrate, to relax, to escape.', 'Infinity Planet brand essence'),
      closing(),
    ] },
  }),
  // 2 ── the land & location
  make({
    id: 'ip-land', name: 'The Land & Location', description: 'Stone & Teal with contour lines — the 68 ha site at Elimbah, access and scale.',
    accent: TEAL, cover: CREAM, coverInk: NAVY, coverMuted: STONE, heading: 'underline', bullet: 'dash', stats: 'card', round: 0.2,
    art: { cover: t('land-cover.jpg'), coverMark: { x: SW - 0.6 - 1.15 * 1.427, y: 5.55, h: 1.15 }, coverText: box(0.6, 5.0, 8.2, 2.05, NAVY, STONE), kicker: 'Infinity Planet · The site',
      section: t('land-section.jpg'), sectionText: box(0.6, 2.55, 5.6, 2.15, WHITE, TAUPE, { num: TAUPE }), sectionBg: STONE,
      closing: t('land-closing.jpg'), closingBg: STONE, closingMark: centreTag(2.3, 0.75), closingLogo: null, closingText: centreText(3.6, 2.1, WHITE, TAUPE),
      side: t('land-side.jpg'), dark: t('land-dark.jpg'), darkColors: dark(STONE, WHITE, TAUPE, '#5F8C92'), paper: t('land-paper.jpg') },
    outline: { title: 'The Land & Location', subtitle: '68 hectares at Elimbah, Moreton Bay — 60 km north of Brisbane', slides: [
      title('The Land & Location', '68 hectares at Elimbah, Moreton Bay — 60 km north of Brisbane'),
      points('Where we are', ['235 & 245 Bartholomew Road, Elimbah — Moreton Bay Region, South East Queensland', 'On the Bruce Highway, about 60 km north of the Brisbane CBD', 'Zero traffic lights from the site to the CBD and Brisbane Airport; rail via Elimbah station', 'A Category 2 SEQ Development Area, approved by the Deputy Premier'], 'w08'),
      stats('The site', [['666,700 m²', 'Total land (68 ha)'], ['53%', 'Landscapes, roads & pools — 356,340 m²'], ['47%', 'Gross development areas — 310,360 m²'], ['672,952 m²', 'Gross built-up area']]),
      chart('How the land is used (m²)', 'doughnut', ['Landscapes, roads & pools', 'Gross development areas'], 'Land area (m²)', [356340, 310360]),
      section('Scale', "Comparable with the world's great attractions"),
      chart('Site area compared (hectares)', 'bar', ['Infinity Planet', 'Disneyland Paris', 'Tokyo Disneyland', 'Magic Kingdom', 'Disneyland Anaheim'], 'Hectares', [68, 57, 47, 43, 40]),
      chart('South East Queensland attractions (hectares)', 'bar', ['Infinity Planet', 'Sea World', 'Dreamworld', "Wet'n'Wild", 'South Bank', 'WhiteWater World'], 'Hectares', [68, 21, 14, 13, 9, 8]),
      points('Access & movement', ['Bruce Highway — the main road corridor north of Brisbane', 'Accessible via 3 airports; Elimbah station on the North Coast line', 'Ring road around the city; 9,500-space car park in four zones', 'Car-free streets inside, with an electric tram (2.8 km, 7 stops)'], 'd04'),
      closing(),
    ] },
  }),
  // 3 ── masterplan & concepts
  make({
    id: 'ip-masterplan', name: 'Masterplan & Concepts', description: 'Navy blueprint grid with Teal — the masterplan and the 20 concept areas.',
    accent: TEAL, cover: NAVY, coverMuted: TEAL, heading: 'band', bullet: 'square', stats: 'card', round: 0.1,
    art: { cover: t('masterplan-cover.jpg'), coverMark: topLeft(true), coverLogo: null, coverText: box(0.6, 2.55, 5.0, 2.55, WHITE, '#BFE3E8'), kicker: 'Infinity Planet · Masterplan',
      section: t('masterplan-section.jpg'), sectionText: box(0.6, 2.55, 5.5, 2.15, WHITE, '#BFE3E8', { num: TEAL }), sectionBg: NAVY,
      closing: t('masterplan-closing.jpg'), closingBg: NAVY, closingMark: centreTag(1.9, 1.15), closingLogo: null, closingText: centreText(3.8, 2.0, WHITE, '#BFE3E8'),
      band: t('masterplan-band.jpg'), bandInk: WHITE, dark: t('masterplan-dark.jpg'), darkColors: dark(NAVY, TEAL), paper: t('masterplan-paper.jpg') },
    outline: { title: 'The Masterplan', subtitle: '20 concept areas in one integrated city', slides: [
      title('The Masterplan', '20 concept areas in one integrated city'),
      points('A world of attractions', ['Twenty distinctive concepts and zones within an innovative smart city', 'Only 47% of the 666,700 m² site is built — 53% is public and green space', 'The Entertainment City Hall at the heart, ringed by four indoor theme park halls', 'Four garden avenues and four paradise gardens tie the city together'], 'd07', [DECK, BOOK]),
      cols('The 20 concept areas', 'Entertainment & culture', CONCEPTS_L, 'Stay, work & sustain', CONCEPTS_R),
      section('The heart of the city'),
      points('Entertainment City Hall', ['About 10,000 m² — the epicentre of the city', 'Versatile 10,000-person capacity', 'Festivals, concerts, seasonal carnivals and international cultural performances', 'Cutting-edge technology, with a programme refreshed through the year'], 'w06', [DECK], 'Recent media coverage describes a 9,000-seat City Hall — confirm the current figure before presenting.'),
      stats('Theme parks', [['40,000 m²', 'Outdoor theme park — southern area'], ['20,000 m²', 'Indoor theme park — four halls'], ['4', 'Themed hubs in the completed outdoor park']]),
      points('Moving around the city', ['Car-free streets with excellent walkability', 'Electric tram, a replica San Francisco tram — 2.8 km, 7 stops, a 25–30 minute loop', 'Ring road and a 9,500-space car park in four zones'], 'p75'),
      points('The support city', ['An independent industrial complex on the southern grounds', 'Deliveries and loading without trucks entering the city', 'Warehousing, water treatment, waste separation and construction facilities', 'Training centre and office facilities'], 'p70'),
      closing(),
    ] },
  }),
  // 4 ── theme parks
  make({
    id: 'ip-themepark', name: 'Theme Parks & Attractions', description: 'Navy & Green (the Brand Book colour for theme parks) — rides, VR, beach & waterfall.',
    accent: GREEN, cover: NAVY, coverMuted: GREEN, heading: 'band', bullet: 'check', stats: 'filled', round: 0.5,
    art: { cover: t('themepark-cover.jpg'), coverMark: topLeft(true), coverText: box(0.6, 2.55, 4.3, 2.55, WHITE, '#DCEFD3'), kicker: 'Infinity Planet · Attractions',
      section: t('themepark-section.jpg'), sectionText: box(0.6, 2.55, 5.6, 2.15, WHITE, '#DCEFD3', { num: GREEN }), sectionBg: NAVY,
      closing: t('themepark-closing.jpg'), closingBg: NAVY, closingMark: topLeft(true, 1.25), closingLogo: null, closingText: centreText(4.6, 1.9, WHITE, '#DCEFD3'),
      band: t('themepark-band.jpg'), bandInk: WHITE, dark: t('themepark-dark.jpg'), darkColors: dark(NAVY, GREEN), paper: t('themepark-paper.jpg') },
    outline: { title: 'Theme Parks & Attractions', subtitle: TAG1, slides: [
      title('Theme Parks & Attractions'),
      stats('Two parks, one city', [['40,000 m²', 'Outdoor theme park'], ['20,000 m²', 'Indoor theme park in 4 halls'], ['1–1.2M', 'Theme park visitors a year (projected)'], ['20M+', 'Annual visitor capacity of the city']], [DECK, PRESS]),
      points('Outdoor Theme Park', ['Occupies the southern area of the site — about 40,000 m²', 'Completed in Phase 3 (Oct 2029) with four themed hubs', 'Rides, shows and family attractions', 'Next to the beach & waterfall and the hotel hill'], 'w10', [DECK, WEB]),
      points('Indoor Theme Parks', ['Four halls on the second floor, encircling the Entertainment City Hall', 'Indoor Virtual Reality Theme Park', 'Sustainability World and the Innovation Centre', 'Underwater Life'], 'p51'),
      section('Experiences'),
      cols('Something for every visitor', 'Families', ['Safe, pollution-free, car-free streets', 'Rides, shows and play areas', 'Beach & waterfall'], 'Thrill & tech seekers', ['VR theme park and simulators', 'Innovation Centre', 'Night events at the dome']),
      points('Beach & Waterfall', ['A beach area beneath the hotel hill', 'A waterfall cascading down the hillside, cooling the city', 'Luxury glamping above the cliff and waterfall'], 'd05'),
      closing(),
    ] },
  }),
  // 5 ── City Hall, events & weddings
  make({
    id: 'ip-cityhall', name: 'City Hall, Events & Weddings', description: 'Navy & Fuchsia (the Brand Book colour for entertainment) — the City Hall, events and cultural weddings.',
    accent: FUCHSIA, cover: NAVY, coverMuted: FUCHSIA, heading: 'bar', bullet: 'dot', stats: 'card', round: 0.3,
    art: { cover: t('cityhall-cover.jpg'), coverMark: { x: 0.7, y: 0.55, h: 1.1, light: true }, coverLogo: { x: SW - 0.75, y: 0.62, h: 0.58, align: 'right' }, coverText: box(0.75, 2.6, 5.3, 2.55, WHITE, '#F5DCEB'), kicker: 'Infinity Planet · Entertainment',
      section: t('cityhall-section.jpg'), sectionText: box(0.6, 2.55, 5.4, 2.15, WHITE, '#F5DCEB', { num: FUCHSIA }), sectionBg: NAVY,
      closing: t('cityhall-closing.jpg'), closingBg: NAVY, closingMark: centreTag(2.2, 0.95), closingLogo: null, closingText: centreText(3.75, 2.0, WHITE, '#F5DCEB'),
      dark: t('cityhall-dark.jpg'), darkColors: dark(NAVY, FUCHSIA), paper: t('cityhall-paper.jpg') },
    outline: { title: 'City Hall, Events & Weddings', subtitle: 'The cultural heart of Infinity Planet', slides: [
      title('City Hall, Events & Weddings', 'The cultural heart of Infinity Planet'),
      points('Entertainment City Hall', ['About 10,000 m² at the heart of the city', 'Versatile 10,000-person capacity', 'Festivals, music concerts, seasonal carnivals and cultural celebrations', 'International cultural performances with cutting-edge technology'], 'w06', [DECK], 'Recent media coverage describes a 9,000-seat City Hall — confirm the current figure.'),
      stats('A year-round stage', [['10,000 m²', 'City Hall floor area'], ['10,000', 'Person capacity'], ['50', 'Cultural pavilions around the city']], [DECK, PRESS]),
      section('Weddings & ceremonies'),
      points('Wedding & Event Centre', ['Next to the Entertainment City Hall', 'Authentic cultural and bi-cultural weddings, engagements and ceremonies', 'Traditional food, music and rituals arranged by our weddings team', 'Integrated with the hotel complex for guests and wedding parties'], 'p66'),
      points('Event management', ['A dedicated centre runs the hall and curates the programme', 'Cinema halls and flexible event spaces', 'Corporate events, conferences and product launches', '[● events calendar and booking contact]'], 'p50'),
      cols('Programme ideas', 'Culture', ['International cultural performances', 'National days and festivals', 'Art and heritage exhibitions'], 'Entertainment', ['Concerts and shows', 'Seasonal carnivals', 'Cinema premieres']),
      points('The 2032 opportunity', ['Brisbane hosts the 2032 Olympic and Paralympic Games', 'Infinity Planet can be a cultural hub for international visitors and spectators', 'Performances, cuisine and heritage experiences beyond sport'], 'd01'),
      closing(),
    ] },
  }),
  // 6 ── hotels
  make({
    id: 'ip-hotels', name: 'Hotels & Accommodation', description: "Cream & Navy with Sky Blue (the Brand Book colour for hotels) — Australia's largest hotel complex.",
    accent: SKY, cover: CREAM, coverInk: NAVY, coverMuted: SKY, heading: 'plain', bullet: 'dash', stats: 'big', round: 0.2,
    art: { cover: t('hotels-cover.jpg'), coverMark: topLeft(false), coverText: box(0.6, 2.45, 4.7, 2.55, NAVY, STONE), kicker: 'Infinity Planet · Hotels',
      section: t('hotels-section.jpg'), sectionText: box(0.6, 2.55, 5.4, 2.15, WHITE, '#D8E7F5', { num: SKY }), sectionBg: NAVY,
      closing: t('hotels-closing.jpg'), closingBg: NAVY, closingMark: centreTag(2.2, 0.9), closingLogo: null, closingText: centreText(3.65, 2.0, WHITE, '#D8E7F5'),
      side: t('hotels-side.jpg'), dark: t('hotels-dark.jpg'), darkColors: dark(NAVY, SKY), paper: t('hotels-paper.jpg') },
    outline: { title: 'Hotels & Accommodation', subtitle: "Australia's largest hotel complex", slides: [
      title('Hotels & Accommodation', "Australia's largest hotel complex"),
      stats("Australia's largest hotel complex", [['2,943', 'Rooms in one location'], ['5', 'Interconnected hotel buildings'], ['92%', 'Of the 3,195 rooms the region needs before 2032'], ['Top 30', "Of the world's largest hotels by rooms"]], [DECK], 'Recent media coverage mentions three hotel towers with 700+ rooms in the first stage — confirm the current staging.'),
      points('The hotel hill', ['Five interconnected buildings on a three-storey hill', 'One 5-star international hotel, with 4-star and 3-star hotels', 'A beach and cascading waterfall below', 'Linked to the Wedding & Event Centre'], 'd05'),
      chart('Largest hotels in the world (rooms)', 'bar', ["Disney's Port Orleans", 'The Mirage', 'The Cosmopolitan', 'The Venetian Macao', 'Infinity Planet'], 'Rooms', [3056, 3044, 3027, 3000, 2943], [DECK], 'The closest comparison in Australia is the Crown complex of separate hotels, 1,605 rooms.'),
      section('Cultural glamping'),
      points('Stay with a view', ['Luxury yurts, themed log cabins and traditional huts', 'Three rows cascading down the hillside', 'Views over the city, the cliff and the waterfall', 'Each dwelling captures the spirit of a different culture'], 'p56'),
      stats('Demand before 2032', [['3,195', 'Rooms needed — Moreton Bay 1,395 + Sunshine Coast 1,800'], ['278,860', 'Room nights a year (projected)'], ['$88M', 'Accommodation spend a year (projected)']], [DECK, PRESS]),
      closing(),
    ] },
  }),
  // 7 ── glamping, beach & waterfall
  make({
    id: 'ip-glamping', name: 'Glamping, Beach & Waterfall', description: 'Cream & Stone with Orange — nature, glamping and the beach & waterfall.',
    accent: ORANGE, cover: CREAM, coverInk: NAVY, coverMuted: STONE, heading: 'bar', bullet: 'dot', stats: 'filled', round: 0.6,
    art: { cover: t('glamping-cover.jpg'), coverMark: topLeft(false), coverLogo: null, coverText: box(0.6, 2.35, 4.5, 2.55, NAVY, STONE), kicker: 'Infinity Planet · Escape',
      section: t('glamping-section.jpg'), sectionText: box(0.6, 2.55, 5.6, 2.15, WHITE, TAUPE, { num: ORANGE }), sectionBg: STONE,
      closing: t('glamping-closing.jpg'), closingBg: STONE, closingMark: centreTag(2.2, 0.9), closingLogo: null, closingText: centreText(3.65, 2.0, WHITE, TAUPE),
      strip: t('glamping-strip.png'), dark: t('glamping-dark.jpg'), darkColors: dark(STONE, ORANGE, TAUPE, '#5F8C92'), paper: t('glamping-paper.jpg') },
    outline: { title: 'Glamping, Beach & Waterfall', subtitle: 'Endless possibilities to relax, to escape', slides: [
      title('Glamping, Beach & Waterfall', 'Endless possibilities to relax, to escape'),
      points('Cultural glamping', ['Yurts, permanent tents, themed log cabins and traditional huts', 'Three rows cascading down the hill below the hotels', 'Luxury interiors that capture the spirit of each culture'], 'p57'),
      points('Beach & Waterfall', ['A beach area beneath the hotel hill', 'A waterfall flowing down the hillside, cooling the city', 'Pools, landscape and shade — 53% of the site is green and open'], 'd05'),
      section('Cultures under canvas'),
      cols('Three ways to stay', 'Yurts & tents', ['Elegant yurts', 'Permanent tents', 'Views over the city'], 'Cabins & huts', ['Themed log cabins', 'Traditional huts', 'Cultural décor and cuisine']),
      points('Nature & wellbeing', ['Car-free streets — quiet, safe and walkable', 'Four paradise gardens: Japanese, European, Chinese and Wild West', 'Solar power and stormwater harvesting'], 'p35'),
      stats('At a glance', [['~50', 'Glamping suites (projected)'], ['2,943', 'Hotel rooms next door'], ['Feb 2030', 'Phase 4 — grand opening']], [DECK, PRESS, WEB]),
      closing(),
    ] },
  }),
  // 8 ── Global Cultural Mall
  make({
    id: 'ip-culturalmall', name: 'Global Cultural Mall', description: 'Navy & Orange (the Brand Book colour for shopping) with heritage stars and arches.',
    accent: ORANGE, cover: NAVY, coverMuted: ORANGE, heading: 'band', bullet: 'square', stats: 'card', round: 0.15,
    art: { cover: t('culturalmall-cover.jpg'), coverMark: topLeft(true), coverLogo: null, coverText: box(0.6, 2.55, 5.8, 2.55, WHITE, '#F7E6CF'), kicker: 'Infinity Planet · Shopping',
      section: t('culturalmall-section.jpg'), sectionText: box(0.6, 2.55, 5.0, 2.15, WHITE, '#F7E6CF', { num: ORANGE }), sectionBg: NAVY,
      closing: t('culturalmall-closing.jpg'), closingBg: NAVY, closingMark: topLeft(true, 1.2), closingLogo: null, closingText: centreText(4.2, 2.0, WHITE, '#F7E6CF'),
      band: t('culturalmall-band.jpg'), bandInk: WHITE, dark: t('culturalmall-dark.jpg'), darkColors: dark(NAVY, ORANGE), paper: t('culturalmall-paper.jpg') },
    outline: { title: 'Global Cultural Mall', subtitle: "Shop the world's cultures", slides: [
      title('Global Cultural Mall', "Shop the world's cultures"),
      points('Themed cultural retail worlds', ['Shop authentic brands and products from diverse cultures', 'Traditional architecture from many countries at entrances and inside', 'Exclusive global brands in an innovative shopping environment', 'Take home a piece of the world'], 'w09'),
      stats('Retail at a glance', [['136,000 m²', 'Retail and dining'], ['50', 'Cultural pavilions'], ['1.8M', 'Retail visitors a year (projected)'], ['40+', 'Cultural market halls open by Phase 2']], [PRESS, INV]),
      section('The Market Halls'),
      points('Every culture brought to life', ['Multimedia displays, statues and memorials in each Market Hall', 'Immersive cultural craftsmanship', 'Live demonstrations, festivals and national days'], 'd06'),
      points('Opening in phases', ['Phase 1 — Oct 2027: 15+ cultural market halls', 'Phase 2 — Oct 2028: 25+ more market halls', 'Phase 3 — Oct 2029: the remaining market halls'], undefined, [INV]),
      cols('Opportunities', 'For countries', ['A national pavilion or market hall', 'Cultural events and national days', 'Tourism and trade promotion'], 'For brands', ['Flagship stores', 'Authentic products and crafts', 'Pop-ups and launches']),
      closing(),
    ] },
  }),
  // 9 ── International Food Court
  make({
    id: 'ip-food', name: 'International Food Court', description: 'Cream & Navy with Red — food from around the world.',
    accent: RED, cover: CREAM, coverInk: NAVY, coverMuted: STONE, heading: 'bar', bullet: 'dot', stats: 'big', round: 0.4,
    art: { cover: t('food-cover.jpg'), coverMark: topLeft(false), coverLogo: null, coverText: box(0.6, 2.6, 4.75, 2.55, NAVY, STONE), kicker: 'Infinity Planet · Dining',
      section: t('food-section.jpg'), sectionText: box(0.6, 2.55, 5.4, 2.15, WHITE, '#F6D9DF', { num: RED }), sectionBg: NAVY,
      closing: t('food-closing.jpg'), closingBg: NAVY, closingMark: topLeft(true, 1.2), closingLogo: null, closingText: centreText(3.95, 2.0, WHITE, '#F6D9DF'),
      side: t('food-side.jpg'), dark: t('food-dark.jpg'), darkColors: dark(NAVY, RED), paper: t('food-paper.jpg') },
    outline: { title: 'International Food Court', subtitle: 'Taste the world in one city', slides: [
      title('International Food Court', 'Taste the world in one city'),
      points('Food from around the world', ['Food and beverages from the cultures represented in the city', 'Cooking demonstrations and live kitchens', 'Set within the Global Cultural Mall', 'Traditional catering for weddings and festivals'], 'p68'),
      section('Dining experiences'),
      cols('From every day to special occasions', 'Every day', ['International food court', 'Cafés and dessert bars', 'Family dining'], 'Occasions', ['Festival food markets', 'Cultural weddings', 'Corporate catering']),
      points('Opportunities for operators', ['Restaurants and food brands from each culture', 'Kiosks, cafés and dessert bars', 'Event catering for the City Hall and the Wedding Centre', '[● leasing terms and contact]'], 'p69'),
      stats('Visitors', [['1.8M', 'Retail visitors a year (projected)'], ['~800,000', 'International visitors a year (projected)'], ['[●]', 'Seats in the food court']], [PRESS]),
      closing(),
    ] },
  }),
  // 10 ── gardens
  make({
    id: 'ip-gardens', name: 'Garden Avenues & Paradise Gardens', description: 'Cream & Stone with Fuchsia — four garden avenues, four paradise gardens and world landmarks.',
    accent: FUCHSIA, cover: CREAM, coverInk: NAVY, coverMuted: STONE, heading: 'underline', bullet: 'dot', stats: 'card', round: 0.6,
    art: { cover: t('gardens-cover.jpg'), coverMark: topLeft(false), coverText: box(0.6, 2.45, 5.0, 2.55, NAVY, STONE), kicker: 'Infinity Planet · Gardens',
      section: t('gardens-section.jpg'), sectionText: box(0.6, 2.55, 5.6, 2.15, NAVY, STONE, { num: STONE }), sectionBg: TAUPE, sectionDark: false,
      closing: t('gardens-closing.jpg'), closingBg: STONE, closingMark: centreTag(2.2, 0.9), closingLogo: null, closingText: centreText(3.65, 2.0, WHITE, TAUPE),
      strip: t('gardens-strip.png'), dark: t('gardens-dark.jpg'), darkColors: dark(STONE, WHITE, TAUPE, '#5F8C92'), paper: t('gardens-paper.jpg') },
    outline: { title: 'Garden Avenues & Paradise Gardens', subtitle: 'A city where more than half is green', slides: [
      title('Garden Avenues & Paradise Gardens', 'A city where more than half is green'),
      points('Four Garden Avenues', ['Inspired by the iconic Chahar Bagh avenue', 'Landscapes of Western Asia, North Africa, former Islamic Andalusia and South Asia', 'Design inspired by the Rambla de Catalunya, Barcelona', 'Lined with replicas of world landmarks'], 'w04'),
      cols('Landmark replicas', 'Europe', ['Brandenburg Gate, Germany', 'Parthenon, Greece', 'Eiffel Tower, France', 'La Sagrada Familia, Spain', 'Colosseum, Italy', "St Basil's Cathedral, Russia"], 'Asia & Africa', ['Persepolis, Iran', 'Grand Palace, Thailand', 'Fort Santiago, Philippines', 'Rohtas Fort, Pakistan', 'The Great Pyramids, Egypt', 'De Haar Castle, Netherlands']),
      section('Four Paradise Gardens'),
      points('Paradise gardens', ['Japanese garden', 'European landscape', 'Chinese garden', 'Wild West landscape'], 'p61'),
      stats('A green city', [['53%', 'Public and green space'], ['356,340 m²', 'Landscapes, roads and pools'], ['4 + 4', 'Garden avenues and paradise gardens']]),
      closing(),
    ] },
  }),
  // 11 ── technology
  make({
    id: 'ip-tech', name: 'Technology Park & Innovation', description: 'Navy & Aqua with circuit lines — smart city, technology park and innovation.',
    accent: AQUA, bg: WHITE, soft: '#EEF6F7', line: '#DCE6E8', cover: NAVY, coverMuted: AQUA, heading: 'band', bullet: 'square', stats: 'filled', round: 0,
    art: { cover: t('tech-cover.jpg'), coverMark: topLeft(true), coverText: box(0.6, 2.55, 5.6, 2.55, WHITE, '#CAF6FC'), kicker: 'Infinity Planet · Innovation',
      section: t('tech-section.jpg'), sectionText: box(0.6, 2.55, 5.4, 2.15, WHITE, '#CAF6FC', { num: AQUA }), sectionBg: NAVY,
      closing: t('tech-closing.jpg'), closingBg: NAVY, closingMark: centreTag(2.2, 0.95), closingLogo: null, closingText: centreText(3.75, 2.0, WHITE, '#CAF6FC'),
      band: t('tech-band.jpg'), bandInk: WHITE, dark: t('tech-dark.jpg'), darkColors: dark(NAVY, AQUA), paper: t('tech-paper.jpg') },
    outline: { title: 'Technology Park & Innovation', subtitle: 'A smart city built on technology', slides: [
      title('Technology Park & Innovation', 'A smart city built on technology'),
      points('Infinity Planet Technology Park', ['Smart building technologies across the city', 'The PIPP.ai platform', 'Innovation Centre inside the indoor theme parks', 'Office facilities and a training centre'], 'w11'),
      points('Smart mobility', ['Car-free streets with excellent walkability', 'Electric tram — 2.8 km, 7 stops, a 25–30 minute loop', 'Ring road and a 9,500-space car park', 'Rail via Elimbah station'], 'p75'),
      section('Innovation'),
      cols('Opportunities', 'Tenants', ['Technology and AI companies', 'Research & development', 'Start-ups and incubators'], 'Partners', ['Smart-city platforms', 'VR and entertainment technology', 'Education and training']),
      points('Research behind the city', ['RHC completed a global research programme for Infinity Planet across 83 countries (June 2026)', '[● key findings]', '[● partners and next steps]'], 'w07', [WEB]),
      closing(),
    ] },
  }),
  // 12 ── sustainability
  make({
    id: 'ip-sustain', name: 'Sustainability & ESG', description: 'White & Stone with Green — energy, environment and ESG, towards net zero.',
    accent: GREEN, bg: WHITE, soft: '#F4F2E1', line: '#E3E6E2', cover: WHITE, coverInk: NAVY, coverMuted: STONE, heading: 'bar', bullet: 'check', stats: 'card', round: 0.8,
    art: { cover: t('sustain-cover.jpg'), coverMark: { x: 0.55, y: 0.35, h: 0.95 }, coverLogo: null, coverText: box(0.6, 1.95, 5.5, 2.75, NAVY, STONE), kicker: 'Infinity Planet · Sustainability',
      section: t('sustain-section.jpg'), sectionText: box(0.6, 2.55, 5.4, 2.15, WHITE, TAUPE, { num: TAUPE }), sectionBg: STONE,
      closing: t('sustain-closing.jpg'), closingBg: STONE, closingMark: centreTag(2.2, 0.9), closingLogo: null, closingText: centreText(3.65, 2.0, WHITE, TAUPE),
      dark: t('sustain-dark.jpg'), darkColors: dark(STONE, WHITE, TAUPE, '#5F8C92'), paper: t('sustain-paper.jpg') },
    outline: { title: 'Sustainability World', subtitle: 'Towards net zero', slides: [
      title('Sustainability World', 'Towards net zero'),
      points('Energy efficiency', ['Solar power with battery storage', 'Geothermal HVAC systems', 'Smart building technologies'], 'p78', [DECK, PRESS]),
      points('Environmental design', ['The PIPP.ai platform', 'Waste management and recycling', 'Stormwater harvesting', 'Water treatment and waste separation in the industrial park'], 'p73'),
      stats('Our commitments', [['6-Star', 'Green Star rating target'], ['53%', 'Public and green space'], ['Car-free', 'Streets inside the city'], ['Net zero', 'Our direction']]),
      section('Social & governance'),
      points('Social & governance', ['Community engagement, including local Indigenous stakeholders', 'Local economic development — 12,000 jobs', 'A clear governance framework', 'Family-friendly, safe, pollution-free zones'], 'p35'),
      closing(),
    ] },
  }),
  // 13 ── investment
  make({
    id: 'ip-investment', name: 'Investment Opportunity', description: 'Navy & Yellow with the Ribbon — the Brand Book’s “Why Invest?” look for investor packs.',
    accent: YELLOW, cover: NAVY, coverMuted: YELLOW, heading: 'band', bullet: 'square', stats: 'filled', round: 0,
    art: { cover: t('investment-cover.jpg'), coverMark: topLeft(true), coverText: box(0.6, 2.55, 4.6, 2.55, WHITE, TAUPE), kicker: 'Investor briefing · Confidential',
      section: t('investment-section.jpg'), sectionText: box(0.6, 2.55, 5.6, 2.15, WHITE, TAUPE, { num: YELLOW }), sectionBg: NAVY,
      closing: t('investment-closing.jpg'), closingBg: NAVY, closingMark: { x: 0.6, y: 0.55, h: 1.45, light: true, tag: true }, closingLogo: null, closingText: box(0.6, 2.35, 8.6, 1.9, WHITE, TAUPE),
      band: t('investment-band.jpg'), bandInk: WHITE, dark: t('investment-dark.jpg'), darkColors: dark(NAVY, YELLOW), paper: t('investment-paper.jpg') },
    outline: { title: 'Investment Opportunity', subtitle: 'Infinity Planet — Moreton Bay, Queensland', slides: [
      title('Investment Opportunity', 'Infinity Planet — Moreton Bay, Queensland'),
      points('Why invest', ["Australia's first Integrated Entertainment City on a 68 ha site", 'Brisbane hosts the 2032 Olympic and Paralympic Games', 'A AAA-rated, stable and well-regulated economy', 'A Category 2 SEQ Development Area'], 'd01'),
      stats('Why invest? Driving economic growth', IMPACT, [DECK, BOOK]),
      section('Structure'),
      points('Investment structure', ['RHC City Pty Ltd — master developer', 'Rose Heritage City Unit Trust — 100,000 units', 'RAS & Business Partners Pty Ltd — trustee', '[● unit price, minimum and maximum holding]'], undefined, [INV], 'Investment Plan 2025: AU$807 per unit; minimum 2,000 units (AU$1,614,000); maximum 10,000 units (AU$8,070,000). Confirm current terms before sending.'),
      cols('Two ways to invest', 'Long term', ['Units in the investor company', 'Land and assets held by the master developer', 'Managed with three directors from the investment company'], 'Short term', ['Capital returned with interest after 3–4 years', '[● interest paid monthly — rate]', '[● minimum annual return]'], [INV]),
      points('The Olympic precedent', ["Property near London's 2012 Olympic Park rose 101% — £238,348 to £479,421", 'Brisbane is poised for similar demand for property and infrastructure', 'Planned exit through a REIT or listing well before the 2032 Games'], 'p37', [DECK, INV]),
      points('Next steps', ['[● site visit / briefing date]', 'Information memorandum and NDA', 'Expression of interest'], undefined, []),
      closing(),
    ] },
  }),
  // 14 ── finance
  make({
    id: 'ip-finance', name: 'Financials & Returns', description: 'White & Navy with Teal bar charts — financial summaries and board papers.',
    accent: TEAL, bg: WHITE, soft: '#EEF6F7', line: '#DCE6E8', cover: NAVY, coverMuted: TEAL, heading: 'underline', bullet: 'square', stats: 'big', round: 0.1,
    art: { cover: t('finance-cover.jpg'), coverMark: topLeft(true), coverText: box(0.6, 2.55, 6.0, 2.55, WHITE, '#BFE3E8'), kicker: 'Infinity Planet · Financial overview',
      section: t('finance-section.jpg'), sectionText: box(0.6, 2.55, 5.8, 2.15, WHITE, '#BFE3E8', { num: TEAL }), sectionBg: NAVY,
      closing: t('finance-closing.jpg'), closingBg: NAVY, closingMark: centreTag(1.35, 0.4), closingLogo: null, closingText: centreText(2.05, 1.75, WHITE, '#BFE3E8'),
      dark: t('finance-dark.jpg'), darkColors: dark(NAVY, TEAL), paper: t('finance-paper.jpg') },
    outline: { title: 'Financials & Returns', subtitle: 'Financial overview · [● date]', slides: [
      title('Financials & Returns', 'Financial overview · [● date]'),
      stats('Economic output', [['$5.67B', 'Output over the project lifecycle'], ['$1.95B', 'Gross Regional Product value'], ['12,000', 'Jobs, direct and indirect'], ['$88M', 'Accommodation spend a year (projected)']], [DECK, PRESS]),
      chart('Land value (AUD million)', 'bar', ['2023 purchase', '2026 with DA (outlook)'], 'AUD million', [55, 204], [INV], 'Investment Plan 2025: AUD 81/m² in 2023 → AUD 300/m² with development approval (outlook), on 680,000 m². An outlook, not a valuation — confirm before sending.'),
      section('Revenue'),
      cols('Income streams', 'Visitors & retail', ['Retail and cultural market halls', 'Hotels and glamping', 'Theme parks and attractions'], 'Venues & services', ['City Hall events and weddings', 'Food and beverage', 'Car parking, offices and the industrial park']),
      points('Funding by phase', ['Phase 1 — Oct 2027: [● capital required]', 'Phase 2 — Oct 2028: [● capital required]', 'Phase 3 — Oct 2029: [● capital required]', 'Phase 4 — Feb 2030: [● capital required]'], undefined, [INV]),
      points('Assumptions & sources', ['[● key assumptions]', "Figures from RHC City's Infinity Planet Presentation 2025 and Investment Plan 2025", 'Forecasts are estimates, not guarantees'], undefined, [DECK, INV]),
      closing(),
    ] },
  }),
  // 15 ── real estate
  make({
    id: 'ip-realestate', name: 'Real Estate & Property', description: 'White & Stone with Sky Blue — property, land value and the Moreton Bay growth story.',
    accent: SKY, bg: WHITE, soft: '#F1F5F8', line: '#DFE6EC', cover: CREAM, coverInk: NAVY, coverMuted: SKY, heading: 'kicker', bullet: 'dash', stats: 'outline', round: 0,
    art: { cover: t('realestate-cover.jpg'), coverMark: { x: 7.7 - 0.28 - 0.95 * 1.427, y: 3.78, h: 0.95 }, coverText: box(1.0, 4.25, 4.9, 2.5, NAVY, STONE), kicker: 'Infinity Planet · Property',
      section: t('realestate-section.jpg'), sectionText: box(0.6, 2.55, 5.4, 2.15, WHITE, TAUPE, { num: TAUPE }), sectionBg: STONE,
      closing: t('realestate-closing.jpg'), closingBg: STONE, closingMark: centreTag(2.2, 0.9), closingLogo: null, closingText: centreText(3.65, 2.0, WHITE, TAUPE),
      side: t('realestate-side.jpg'), dark: t('realestate-dark.jpg'), darkColors: dark(STONE, WHITE, TAUPE, '#5F8C92'), paper: t('realestate-paper.jpg') },
    outline: { title: 'Real Estate & Property', subtitle: 'Property opportunities in Moreton Bay', slides: [
      title('Real Estate & Property', 'Property opportunities in Moreton Bay'),
      points('The growth story', ['Moreton Bay economy expected to double to $40B in the next 20 years', 'Population growing from 480,000 to 700,000', "Australia's 5th fastest-growing region", 'A Singaporean developer made a major land acquisition near Infinity Planet (Feb 2026)'], 'p81', [DECK, WEB]),
      stats('By the numbers', [['$40B', 'Moreton Bay economy in 20 years'], ['700,000', 'Moreton Bay population'], ['101%', 'Property uplift near London 2012 Olympic Park'], ['3.7×', 'Land value, 2023 → 2026 with DA (outlook)']], [DECK, INV]),
      section('Opportunities'),
      cols('Property at Infinity Planet', 'Stay & work', ['Hotels and hotel apartments', 'Two office towers (Phase 3)', 'Industrial park and warehousing'], 'Retail & venues', ['Cultural market halls and retail', 'Food and beverage', 'Event and wedding venues'], [DECK, INV]),
      stats('Space', [['672,952 m²', 'Gross built-up area'], ['310,360 m²', 'Gross development areas'], ['9,500', 'Car spaces in four zones']]),
      closing(),
    ] },
  }),
  // 16 ── international investors
  make({
    id: 'ip-international', name: 'International Investors', description: 'Navy & Aqua world map with routes to Brisbane — for overseas investors, partners and governments.',
    accent: AQUA, cover: NAVY, coverMuted: AQUA, heading: 'band', bullet: 'dot', stats: 'big', round: 0.3,
    art: { cover: t('international-cover.jpg'), coverMark: topLeft(true), coverLogo: null, coverText: box(0.6, 2.55, 4.6, 2.55, WHITE, '#CFEFF4'), kicker: 'Infinity Planet · Global',
      section: t('international-section.jpg'), sectionText: box(0.6, 2.55, 5.2, 2.15, WHITE, '#CFEFF4', { num: AQUA }), sectionBg: NAVY,
      closing: t('international-closing.jpg'), closingBg: NAVY, closingMark: centreTag(2.2, 0.9), closingLogo: null, closingText: centreText(3.65, 2.0, WHITE, '#CFEFF4'),
      band: t('international-band.jpg'), bandInk: WHITE, dark: t('international-dark.jpg'), darkColors: dark(NAVY, AQUA), paper: t('international-paper.jpg') },
    outline: { title: 'Invest in Australia', subtitle: TAG2, slides: [
      title('Invest in Australia', TAG2),
      points('Why Australia', ['AAA credit rating', "Set to become the world's 12th largest economy", 'Average real GDP growth of 2.9% a year over the next five years (KPMG, Q3 2024)', 'An open, well-regulated economy with a skilled workforce'], 'p37'),
      stats('Australia at a glance', [['AAA', 'Credit rating'], ['12th', 'Largest economy in the world'], ['2.9%', 'Forecast real GDP growth a year'], ['2032', 'Brisbane Olympic & Paralympic Games']]),
      points('Why Queensland', ['GMT+10 — 2 hours behind Singapore and other Asian capitals', 'Subtropical climate and an enviable lifestyle', 'Six international airports', 'A new policy framework to attract global talent and capital (Dec 2025)'], 'p38', [DECK, WEB]),
      section('A global city'),
      points('The world in one city', ["RHC's research programme for Infinity Planet spans 83 countries (June 2026)", 'Cultural pavilions and market halls for nations', 'Brands, operators and investors from Asia, the Middle East, Europe and the Americas'], 'd08', [WEB, DECK]),
      points('How we work with you', ['Introductions to government and local organisations', 'Investment through the RHC City structure', 'Site visits and briefings in Brisbane', '[● contact for your region]'], 'p84'),
      closing(),
    ] },
  }),
  // 17 ── Queensland & Moreton Bay
  make({
    id: 'ip-queensland', name: 'Why Queensland & Moreton Bay', description: 'Stone & Yellow (the sunshine state) — Queensland, Moreton Bay and Brisbane 2032.',
    accent: YELLOW, cover: STONE, coverMuted: YELLOW, heading: 'bar', bullet: 'dot', stats: 'card', round: 0.4,
    art: { cover: t('queensland-cover.jpg'), coverMark: topLeft(true), coverText: box(0.6, 4.25, 8.5, 2.6, WHITE, TAUPE), kicker: 'Infinity Planet · Location',
      section: t('queensland-section.jpg'), sectionText: box(0.6, 2.55, 5.4, 2.15, WHITE, TAUPE, { num: YELLOW }), sectionBg: STONE,
      closing: t('queensland-closing.jpg'), closingBg: STONE, closingMark: { x: 0.6, y: 0.55, h: 1.2, light: true }, closingLogo: null, closingText: centreText(2.6, 2.0, WHITE, TAUPE),
      strip: t('queensland-strip.png'), dark: t('queensland-dark.jpg'), darkColors: dark(STONE, YELLOW, TAUPE, '#5F8C92'), paper: t('queensland-paper.jpg') },
    outline: { title: 'Why Queensland & Moreton Bay', subtitle: 'The place to live, visit, invest and do business', slides: [
      title('Why Queensland & Moreton Bay', 'The place to live, visit, invest and do business'),
      points('Why Queensland', ['Second-largest state by area; third most populated', 'Subtropical climate — summer 20–29°C, winter 9–22°C', 'GMT+10, two hours behind Singapore', 'A pro-business government and a lower cost of living'], 'p37'),
      stats('Queensland at a glance', [['$87.3B', 'Goods exported (2018–19)'], ['11', 'Universities'], ['6', 'International airports'], ['6.2%', 'Retail growth — fastest in the nation']], [DECK], 'Figures from the Infinity Planet Presentation 2025 — update to the latest year before presenting.'),
      section('Moreton Bay'),
      stats('Moreton Bay', [['$21B', 'Gross Regional Product'], ['$40B', 'Economy in the next 20 years'], ['700,000', 'Population (from 480,000)'], ['2×', 'Annual visitors compared with Noosa']]),
      points('Brisbane 2032', ['Brisbane hosts the 2032 Olympic and Paralympic Games', 'Major upgrades to transport, accommodation and public facilities', 'Infinity Planet as a cultural hub for international visitors'], 'p38'),
      closing(),
    ] },
  }),
  // 18 ── newsletter (the website's pattern)
  make({
    id: 'ip-newsletter', name: 'Newsletter & News', description: 'The infinityplanet.com.au look — cream, white rounded cards with the arrow button and lime highlight.',
    accent: '#E4ED64', bg: '#F6F3EC', soft: WHITE, line: '#E0E0E0', cover: '#F6F3EC', coverInk: '#111111', coverMuted: '#4B4B4B', heading: 'band', bullet: 'dash', stats: 'filled', round: 0.9,
    art: { cover: t('newsletter-cover.jpg'), coverMark: topLeft(false, 1.05), coverLogo: null, coverText: box(0.6, 2.2, 4.85, 2.55, '#111111', '#111111', { size: 44 }), kicker: 'Newsletter',
      section: t('newsletter-section.jpg'), sectionText: box(0.6, 2.55, 5.5, 2.15, '#111111', '#4B4B4B', { num: '#111111' }), sectionBg: '#F6F3EC', sectionDark: false,
      closing: t('newsletter-closing.jpg'), closingBg: '#000000', closingMark: null, closingLogo: null, closingText: centreText(4.25, 2.1, WHITE, '#E4ED64'),
      band: t('newsletter-band.jpg'), bandInk: '#111111', dark: t('newsletter-dark.jpg'), darkColors: { bg: '#000000', ink: WHITE, muted: '#BDBDBD', accent: '#E4ED64', line: '#333333' }, paper: t('newsletter-paper.jpg') },
    outline: { title: 'Infinity Planet News', subtitle: '[● Month Year]', slides: [
      title('Infinity Planet News', '[● Month Year]'),
      points('RHC completes global research programme across 83 countries', ['[● summary — 2–3 lines]', 'Published 28 June 2026'], 'w07', [WEB]),
      points('Singaporean developer makes major land acquisition near Infinity Planet', ['[● summary — 2–3 lines]', 'Published 10 February 2026'], 'p81', [WEB]),
      points('New Queensland policy framework accelerates global talent and capital', ['[● summary — 2–3 lines]', 'Published 8 December 2025'], 'p37', [WEB]),
      stats('By the numbers', [['68 ha', 'Site at Elimbah'], ['20', 'Concept areas'], ['2030', 'Grand opening']], [DECK, WEB]),
      points('Coming up', ['[● event, date and place]', '[● milestone]', 'Read more at infinityplanet.com.au/news'], undefined, [WEB]),
      closing(),
    ] },
  }),
];
