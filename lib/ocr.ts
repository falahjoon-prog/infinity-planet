import path from 'path';
import os from 'os';
import fs from 'fs';
import { chat, isProvider, Provider, providerStatus } from './providers';
import { HttpError } from './http';

export type ImageRead = { text: string; method: string; confidence?: number; unreadable?: boolean };

/** How much of OCR output looks like real words (screenshots and photos often come out as junk). */
export function readability(text: string): number {
  const toks = String(text || '').split(/\s+/).filter(Boolean);
  if (!toks.length) return 0;
  const SHORT = new Set(['a', 'i', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'am', 'pm', 'st', 'rd', 'nd', 'th', 'ok', 'id', 'vs']);
  const good = toks.filter(t => {
    const w = t.replace(/^[("'“‘[]+|[)"'”’\].,;:!?]+$/g, '');
    if (/^\$?\d[\d,.:/%-]*$/.test(w)) return true;
    if (!/^[A-Za-z][A-Za-z'’-]*$/.test(w)) return false;
    if (w.length <= 2) return SHORT.has(w.toLowerCase());
    return /[aeiouy]/i.test(w) && !/(.)\1\1/i.test(w);
  }).length;
  return good / toks.length;
}

/**
 * Reads the text in a photo, screenshot or scan.
 *  - With an AI key (Gemini, Claude or OpenAI) the AI reads the picture — far better on screenshots, tables and phone photos.
 *  - Otherwise the built-in reader (Tesseract) runs on a cleaned-up copy; if the result is mostly junk it is not stored.
 */
export async function readImage(bytes: Buffer, requested?: unknown): Promise<ImageRead> {
  await (await import('./ai-keys')).ensureAiKeys().catch(() => {});
  const st = providerStatus();
  const order: Provider[] = isProvider(requested) && requested !== 'ollama' ? [requested] : ['gemini', 'anthropic', 'openai'];
  const provider = order.find(p => st[p]);
  if (provider) {
    try {
      const sharp = (await import('sharp')).default;
      const img = await sharp(bytes, { failOn: 'none' }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      const text = await chat(provider, {
        system: 'You read images for a business document system. Be exact.',
        messages: [{ role: 'user', content: 'Transcribe ALL readable text in this image exactly, top to bottom, keeping lines, numbers and table rows (use " | " between table cells). If the image has little or no text, reply with one line starting "[Photo]" that briefly describes what it shows. No commentary.' }],
        attachments: [{ mimeType: 'image/png', base64: img.toString('base64') }],
        maxTokens: 6000, timeoutMs: 120_000,
      });
      if (text.trim()) return { text: text.trim(), method: `ai-image:${provider}` };
    } catch { /* fall back to the built-in reader */ }
  }
  let input = bytes;
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(bytes, { failOn: 'none' }).metadata();
    const w = meta.width || 0;
    input = await sharp(bytes, { failOn: 'none' }).rotate().grayscale().resize({ width: w && w < 1600 ? Math.min(w * 2, 3000) : Math.min(w || 2400, 3000), withoutEnlargement: false }).normalise().sharpen().png().toBuffer();
  } catch { input = bytes; }
  const r = await ocrImage(input);
  const score = readability(r.text);
  if (!r.text.trim() || (r.confidence ?? 0) < 55 || score < 0.5) return { ...r, text: '', unreadable: true };
  return r;
}

/** Built-in OCR for images using Tesseract (runs on the Infinity Planet server; downloads English language data once). */
export async function ocrImage(bytes: Buffer): Promise<{ text: string; method: string; confidence?: number }> {
  const { createWorker } = await import('tesseract.js');
  // English language data ships with the app (@tesseract.js-data/eng) so OCR works offline.
  const local = path.join(process.cwd(), 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int');
  const langPath = fs.existsSync(path.join(local, 'eng.traineddata.gz')) ? local : undefined;
  let workerError: string | null = null;
  const worker = await withTimeout(createWorker('eng', 1, {
    ...(langPath ? { langPath, gzip: true } : {}),
    cachePath: process.env.RHC_OCR_CACHE || path.join(os.tmpdir(), 'rhc-ocr-cache'),
    errorHandler: (e: any) => { workerError = String(e?.message || e); },
  }), 60_000, 'OCR engine failed to start (language data could not be loaded)');
  try {
    const { data } = await withTimeout(worker.recognize(bytes), 180_000, 'OCR timed out');
    if (workerError) throw new HttpError(500, `OCR failed: ${workerError}`);
    return { text: data.text || '', method: 'tesseract-ocr', confidence: Math.round(data.confidence) };
  } finally { await worker.terminate().catch(() => {}); }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new HttpError(504, message)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(new HttpError(500, `OCR failed: ${e?.message || e}`)); });
  });
}

/** Scanned PDFs: transcribed by a vision-capable provider (Gemini, Claude or OpenAI). */
export async function ocrPdfWithAI(bytes: Buffer, requested?: unknown): Promise<{ text: string; method: string; confidence?: number }> {
  const st = providerStatus();
  const order: Provider[] = isProvider(requested) && requested !== 'ollama' ? [requested] : ['gemini', 'anthropic', 'openai'];
  const provider = order.find(p => st[p]);
  if (!provider) throw new HttpError(409, 'Scanned PDFs need a vision-capable AI key (GEMINI_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY) on the Infinity Planet server. Images can be OCR\'d without a key.');
  if (bytes.byteLength > 30 * 1024 * 1024) throw new HttpError(413, 'PDF is too large for AI OCR (30 MB limit)');
  const text = await chat(provider, {
    system: 'You are an OCR engine. Transcribe documents exactly.',
    messages: [{ role: 'user', content: 'Transcribe ALL text in this scanned document exactly as written, page by page, preserving clause numbering, headings and table rows. Mark each page start as "--- Page N ---". Do not summarise, correct or add anything. If something is illegible write [illegible].' }],
    attachments: [{ mimeType: 'application/pdf', base64: bytes.toString('base64') }],
    maxTokens: 16000, timeoutMs: 280_000,
  });
  return { text, method: `ai-ocr:${provider}` };
}
