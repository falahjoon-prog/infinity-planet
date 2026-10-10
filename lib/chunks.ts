const MAX_CHUNK = 2400;
const OVERLAP = 300;

export function chunkText(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [] as { ordinal:number; content:string; start:number; end:number }[];
  const out: { ordinal:number; content:string; start:number; end:number }[] = [];
  let start = 0;
  let ordinal = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + MAX_CHUNK);
    if (end < normalized.length) {
      const boundary = Math.max(normalized.lastIndexOf('\n', end), normalized.lastIndexOf('. ', end));
      if (boundary > start + 900) end = boundary + (normalized[boundary] === '.' ? 1 : 0);
    }
    const content = normalized.slice(start, end).trim();
    if (content) out.push({ ordinal, content, start, end });
    if (end >= normalized.length) break;
    start = Math.max(end - OVERLAP, start + 1);
    ordinal++;
  }
  return out;
}
