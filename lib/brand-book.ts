import { getSupabaseAdmin } from './supabase';

/** Documents tagged as the brand book (Documents → set category "Brand book", or a Drive link added as brand book). */
export async function brandBookDocs() {
  const { data } = await getSupabaseAdmin().from('documents').select('id,name,content_text,updated_at').eq('category', 'brand_book').not('content_text', 'is', null).order('updated_at', { ascending: false }).limit(5);
  return data || [];
}

/** Text excerpt of the brand book, used to steer AI writing, marketing copy and the Designer. */
export async function brandBookExcerpt(max = 4000): Promise<string> {
  const docs = await brandBookDocs();
  let out = '';
  for (const d of docs) { if (out.length >= max) break; out += `[${d.name}]\n${String(d.content_text || '').replace(/\n{3,}/g, '\n\n').slice(0, max - out.length)}\n`; }
  return out.trim();
}

const NAMED_FONTS = ['Playfair Display', 'Montserrat', 'Inter', 'Helvetica Neue', 'Helvetica', 'Arial', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Raleway', 'Garamond', 'EB Garamond', 'Georgia', 'Times New Roman', 'Futura', 'Gotham', 'Avenir', 'Proxima Nova', 'Source Sans', 'Libre Baskerville', 'Merriweather', 'Nunito', 'Oswald', 'Space Grotesk', 'DM Sans', 'Cormorant', 'Bodoni', 'Didot', 'Calibri', 'Segoe UI'];

/** Pulls colours (hex / RGB / CMYK-labelled hex) and font names out of brand-book text. Rules only — no AI needed. */
export function extractBrandHints(text: string) {
  const t = String(text || '');
  const hex = new Map<string, number>();
  for (const m of t.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toLowerCase(); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    hex.set(`#${h}`, (hex.get(`#${h}`) || 0) + 1);
  }
  for (const m of t.matchAll(/\bR(?:GB)?\s*[:=]?\s*(\d{1,3})[\s,/]+G?\s*[:=]?\s*(\d{1,3})[\s,/]+B?\s*[:=]?\s*(\d{1,3})\b/gi)) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number); if ([r, g, b].some(x => x > 255)) continue;
    const h = `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`; hex.set(h, (hex.get(h) || 0) + 1);
  }
  const colours = [...hex.entries()].filter(([h]) => !['#ffffff', '#000000'].includes(h)).sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 8);
  const fonts = NAMED_FONTS.filter(f => new RegExp(`\\b${f.replace(/ /g, '\\s+')}\\b`, 'i').test(t)).slice(0, 4);
  const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const dark = colours.filter(c => lum(c) < 0.35); const light = colours.filter(c => lum(c) >= 0.35);
  return { colours, fonts, primary: dark[0] || colours[0] || null, accent: light[0] || colours[1] || null };
}
