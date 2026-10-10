/** Makes a picture small enough to upload: resizes big photos/logos in the browser (keeps transparency when it can). */
export async function shrinkImage(f: File, opts: { maxSide?: number; maxBytes?: number } = {}): Promise<File> {
  const maxSide = opts.maxSide || 1200; const maxBytes = opts.maxBytes || 2.8 * 1024 * 1024;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return f; // SVG etc. stay as they are
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Could not read that image')); i.src = url; });
    const big = Math.max(img.naturalWidth, img.naturalHeight);
    // Small enough, and a format that works everywhere: keep the original
    if (f.size <= maxBytes && big <= maxSide * 2 && /png|jpeg/.test(f.type)) return f;
    const k = Math.min(1, maxSide / big);
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = (type: string, q?: number) => new Promise<Blob | null>(ok => c.toBlob(ok, type, q));
    const name = f.name.replace(/\.[a-z0-9]+$/i, '');
    let b = await blob('image/png');
    if (b && b.size <= maxBytes) return new File([b], `${name}.png`, { type: 'image/png' });
    // Still too big as PNG: JPEG on white
    const w = document.createElement('canvas'); w.width = c.width; w.height = c.height; const wx = w.getContext('2d')!; wx.fillStyle = '#fff'; wx.fillRect(0, 0, w.width, w.height); wx.drawImage(c, 0, 0);
    for (const q of [0.9, 0.8, 0.7]) { b = await new Promise<Blob | null>(ok => w.toBlob(ok, 'image/jpeg', q)); if (b && b.size <= maxBytes) break; }
    return b ? new File([b], `${name}.jpg`, { type: 'image/jpeg' }) : f;
  } finally { URL.revokeObjectURL(url); }
}
