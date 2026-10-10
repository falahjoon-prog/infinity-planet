/**
 * Company stamp / seal maker. Builds an inked-looking stamp as SVG (round seal, oval or rectangle)
 * and turns it into a transparent PNG in the browser, ready to use as a stamp on PDFs.
 */
export type StampShape = 'round' | 'oval' | 'rect';
export type StampSpec = { shape: StampShape; company: string; caption: string; name: string; role: string; color: string; texture: boolean; dome: boolean; tilt: number; extra?: string };

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "'Arial Black','Bahnschrift','Segoe UI Black','Inter Display Black','Inter Black',Impact,'Arial Narrow',sans-serif";
const FONT2 = "'Bahnschrift SemiBold','Arial','Segoe UI','Inter','Inter Display',sans-serif";

const grunge = (seed: number) => `<filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed}" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 4.6" result="holes"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="${seed + 3}" result="w"/>
  <feColorMatrix in="w" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -10 7.6" result="wear"/>
  <feComposite in="holes" in2="wear" operator="in" result="mask"/>
  <feComposite in="SourceGraphic" in2="mask" operator="in"/>
</filter>`;

/** A simple dome mark (the Infinity Planet dome) drawn as lines. */
const domeMark = (cx: number, cy: number, w: number, color: string) => {
  const r = w / 2, h = r * 0.82;
  return `<g fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
  <path d="M ${cx - r} ${cy} A ${r} ${h} 0 0 1 ${cx + r} ${cy} Z" stroke-width="${w * 0.055}"/>
  <path d="M ${cx - r * 0.55} ${cy} C ${cx - r * 0.6} ${cy - h * 0.55}, ${cx - r * 0.2} ${cy - h * 0.85}, ${cx} ${cy - h * 0.98}" stroke-width="${w * 0.04}"/>
  <path d="M ${cx + r * 0.55} ${cy} C ${cx + r * 0.6} ${cy - h * 0.55}, ${cx + r * 0.2} ${cy - h * 0.85}, ${cx} ${cy - h * 0.98}" stroke-width="${w * 0.04}"/>
  <path d="M ${cx - r * 0.93} ${cy - h * 0.35} C ${cx - r * 0.4} ${cy - h * 0.5}, ${cx + r * 0.4} ${cy - h * 0.5}, ${cx + r * 0.93} ${cy - h * 0.35}" stroke-width="${w * 0.04}"/>
  <path d="M ${cx - r * 0.7} ${cy - h * 0.72} C ${cx - r * 0.25} ${cy - h * 0.62}, ${cx + r * 0.25} ${cy - h * 0.62}, ${cx + r * 0.7} ${cy - h * 0.72}" stroke-width="${w * 0.035}"/>
  <path d="M ${cx - r * 1.12} ${cy + w * 0.04} L ${cx + r * 1.12} ${cy + w * 0.04}" stroke-width="${w * 0.05}"/>
</g>`;
};
const star = (x: number, y: number, s: number, c: string) => { const p: string[] = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? s * 0.42 : s; p.push(`${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`); } return `<polygon points="${p.join(' ')}" fill="${c}"/>`; };
/** Font size that keeps a line inside a width (rough character-width estimate). */
const fitSize = (text: string, width: number, max: number, ratio = 0.68) => Math.max(10, Math.min(max, width / Math.max(1, text.length * ratio)));

export function stampSvg(s: StampSpec): { svg: string; w: number; h: number } {
  const c = s.color || '#C8102E'; const seed = 11;
  const company = s.company.toUpperCase(), caption = s.caption.toUpperCase(), name = s.name.toUpperCase(), role = s.role.toUpperCase(), extra = (s.extra || '').toUpperCase();
  let body = '', w = 600, h = 600;
  if (s.shape === 'round' || s.shape === 'oval') {
    const round = s.shape === 'round'; w = round ? 620 : 820; h = round ? 620 : 540; const cx = w / 2, cy = h / 2;
    const rx = round ? 292 : 392, ry = round ? 292 : 252; const band = round ? 78 : 70;
    const mx = rx - 11 - band / 2, my = ry - 11 - band / 2; // middle of the text band
    const arcLen = Math.PI * (mx + my) / 2 * 0.86;
    const ts = fitSize(company, arcLen, round ? 50 : 46, 0.78), bs = fitSize(caption, arcLen * 0.8, round ? 40 : 36, 0.78);
    // letters stand outward from the path, so the path sits a little inside the middle of the band
    const tx = mx - ts * 0.36, ty = my - ts * 0.36, bx = mx + bs * 0.36, by = my + bs * 0.36;
    const top = `M ${cx - tx} ${cy} A ${tx} ${ty} 0 0 1 ${cx + tx} ${cy}`;
    const bot = `M ${cx - bx} ${cy} A ${bx} ${by} 0 0 0 ${cx + bx} ${cy}`;
    body = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="16"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx - 22}" ry="${ry - 22}" fill="none" stroke="${c}" stroke-width="4"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx - band}" ry="${ry - band}" fill="none" stroke="${c}" stroke-width="5"/>
<path id="tp" d="${top}" fill="none"/><path id="bp" d="${bot}" fill="none"/>
<text font-family="${FONT}" font-size="${ts}" fill="${c}" letter-spacing="${round ? 4 : 5}"><textPath href="#tp" startOffset="50%" text-anchor="middle">${esc(company)}</textPath></text>
<text font-family="${FONT}" font-size="${bs}" fill="${c}" letter-spacing="5"><textPath href="#bp" startOffset="50%" text-anchor="middle">${esc(caption)}</textPath></text>
${star(cx - mx, cy, 17, c)}${star(cx + mx, cy, 17, c)}
${s.dome ? domeMark(cx, cy - (round ? 46 : 44), round ? 205 : 190, c) : ''}
<line x1="${cx - (rx - band) * 0.78}" y1="${cy - 14}" x2="${cx + (rx - band) * 0.78}" y2="${cy - 14}" stroke="${c}" stroke-width="4"/>
<text x="${cx}" y="${cy + 30}" font-family="${FONT}" font-size="${fitSize(name, (rx - band) * 1.7, 46)}" fill="${c}" text-anchor="middle" dominant-baseline="middle">${esc(name)}</text>
<text x="${cx}" y="${cy + 78}" font-family="${FONT2}" font-weight="700" font-size="${fitSize(role, (rx - band) * 1.5, 28, 0.62)}" fill="${c}" text-anchor="middle" letter-spacing="2" dominant-baseline="middle">${esc(role)}</text>
${extra ? `<text x="${cx}" y="${cy + 118}" font-family="${FONT2}" font-weight="700" font-size="${fitSize(extra, (rx - band) * 1.2, 20, 0.6)}" fill="${c}" text-anchor="middle" letter-spacing="2">${esc(extra)}</text>` : ''}`;
  } else {
    w = 920; h = 400; const m = 16;
    const cs = fitSize(company, s.dome ? 640 : 800, 92, 0.74);
    body = `<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}" rx="18" fill="none" stroke="${c}" stroke-width="16"/>
<rect x="${m + 22}" y="${m + 22}" width="${w - 2 * (m + 22)}" height="${h - 2 * (m + 22)}" rx="8" fill="none" stroke="${c}" stroke-width="4"/>
${s.dome ? domeMark(150, 140, 120, c) : ''}
<text x="${s.dome ? 530 : w / 2}" y="118" font-family="${FONT}" font-size="${cs}" fill="${c}" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${esc(company)}</text>
<line x1="90" y1="178" x2="${w - 90}" y2="178" stroke="${c}" stroke-width="5"/>
${star(150, 214, 20, c)}${star(w - 150, 214, 20, c)}
<text x="${w / 2}" y="216" font-family="${FONT}" font-size="${fitSize(caption, 520, 44, 0.74)}" fill="${c}" text-anchor="middle" dominant-baseline="middle" letter-spacing="6">${esc(caption)}</text>
<line x1="90" y1="252" x2="${w - 90}" y2="252" stroke="${c}" stroke-width="5"/>
<text x="${w / 2}" y="${extra ? 290 : 296}" font-family="${FONT}" font-size="${fitSize(name, 700, 50, 0.74)}" fill="${c}" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">${esc(name)}</text>
<text x="${w / 2}" y="${extra ? 330 : 340}" font-family="${FONT2}" font-weight="700" font-size="${fitSize(role, 560, 28, 0.62)}" fill="${c}" text-anchor="middle" dominant-baseline="middle" letter-spacing="3">${esc(role)}${extra ? ` · ${esc(extra)}` : ''}</text>`;
  }
  const pad = 20; const W = w + pad * 2, H = h + pad * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${s.texture ? grunge(seed) : ''}</defs>
<g transform="translate(${pad} ${pad}) rotate(${s.tilt || 0} ${w / 2} ${h / 2})" ${s.texture ? 'filter="url(#ink)"' : ''} opacity="0.93">${body}</g></svg>`;
  return { svg, w: W, h: H };
}

/** Renders the stamp to a transparent PNG (browser only). */
export async function stampPng(s: StampSpec, scale = 1.5): Promise<Blob> {
  const { svg, w, h } = stampSvg(s);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.decoding = 'async';
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('Could not draw the stamp')); img.src = url; });
    const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((ok, bad) => cv.toBlob(b => b ? ok(b) : bad(new Error('Could not save the stamp')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
