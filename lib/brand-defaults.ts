/**
 * RHC's own look, built into the app: the RHC logo, colours and letterhead (top band with the logo and pattern,
 * bottom band with the Eagle St address and colour blocks). Used whenever nothing else has been chosen in Settings.
 */
import { promises as fs } from 'fs';
import path from 'path';

export const RHC_PRIMARY = '#1148a5';
export const RHC_ACCENT = '#f6cd00';
/** Colours the app used to start with — treated as "not chosen yet". */
export const OLD_DEFAULT_COLOURS = ['#13294b', '#c8a45c'];

const cache = new Map<string, Buffer | null>();
export async function builtinFile(rel: string): Promise<Buffer | null> {
  if (cache.has(rel)) return cache.get(rel)!;
  let b: Buffer | null = null;
  for (const base of [process.cwd(), path.join(process.cwd(), '..')]) {
    try { b = await fs.readFile(path.join(base, 'public', rel)); break; } catch {}
  }
  cache.set(rel, b);
  return b;
}
export const RHC_LOGO = 'brand/rhc-logo.png';
export const RHC_HEADER = 'letterhead/rhc-header.png';
export const RHC_FOOTER = 'letterhead/rhc-footer.png';

/** The built-in RHC look applies only while the business is RHC (another business name gets a neutral letterhead). */
export const isRhc = (businessName?: string | null) => /\b(rhc|rose heritage)\b/i.test(String(businessName || ''));
