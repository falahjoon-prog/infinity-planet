import mammoth from 'mammoth';

const MAX_TEXT = 5_000_000;

export type ExtractionResult = {
  text: string | null;
  status: 'indexed' | 'pending_extraction' | 'needs_ocr' | 'unsupported' | 'failed';
  method: string;
  pages?: number;
  needsOcr?: boolean;
  error?: string;
};

/** PDF text via a current pdf.js build (unpdf), preserving line breaks so clauses can be segmented. */
async function parsePdf(bytes: Buffer): Promise<{ text: string; numpages: number }> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let out = ''; let lastY: number | null = null;
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue;
      const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
      out += item.str;
      if (item.hasEOL) out += '\n';
      if (y !== null) lastY = y;
    }
    pages.push(out.replace(/[ \t]+\n/g, '\n').trim());
  }
  return { text: pages.join('\n\n'), numpages: pdf.numPages };
}

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/tiff', 'image/bmp', 'image/gif'];

export async function extractDocumentText(bytes: Buffer, mimeType: string, fileName: string): Promise<ExtractionResult> {
  const lower = fileName.toLowerCase();
  try {
    if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
      const parsed = await parsePdf(bytes);
      const text = parsed.text.replace(/\u0000/g, '').trim().slice(0, MAX_TEXT);
      // Fewer than ~20 characters per page means a scanned/image-only PDF.
      const meaningful = text.replace(/\s+/g, '').length > Math.max(40, parsed.numpages * 20);
      if (!meaningful) return { text: null, status: 'needs_ocr', method: 'pdf-text', pages: parsed.numpages, needsOcr: true };
      return { text, status: 'indexed', method: 'pdf-text', pages: parsed.numpages };
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lower.endsWith('.docx')) {
      const parsed = await mammoth.extractRawText({ buffer: bytes });
      const text = parsed.value.trim().slice(0, MAX_TEXT);
      return { text: text || null, status: text ? 'indexed' : 'failed', method: 'docx-text' };
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || lower.endsWith('.xlsx')) {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(bytes as any);
      const parts: string[] = [];
      wb.eachSheet(ws => {
        const rows: string[] = [];
        ws.eachRow({ includeEmpty: false }, row => {
          const vals = (row.values as any[]).slice(1).map(v => v == null ? '' : typeof v === 'object' ? (v.text ?? v.result ?? (v.richText ? v.richText.map((r: any) => r.text).join('') : v instanceof Date ? v.toISOString().slice(0, 10) : '')) : String(v));
          if (vals.some(x => String(x).trim())) rows.push(vals.join(' | '));
        });
        if (rows.length) parts.push(`Sheet: ${ws.name}\n${rows.join('\n')}`);
      });
      const text = parts.join('\n\n').slice(0, MAX_TEXT).trim();
      return { text: text || null, status: text ? 'indexed' : 'failed', method: 'xlsx-text' };
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || /\.(pptx|potx)$/i.test(lower)) {
      // PowerPoint: the text of every slide, in order, so the AI can read and learn from decks
      const JSZip = (await import('jszip')).default; const zip = await JSZip.loadAsync(bytes);
      const files = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => parseInt(a.match(/(\d+)\.xml$/)![1]) - parseInt(b.match(/(\d+)\.xml$/)![1]));
      const parts: string[] = [];
      for (const [i, f] of files.entries()) { const x = await zip.file(f)!.async('string'); const paras = x.split(/<\/a:p>/).map(p => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join('')).map(t => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim()).filter(Boolean); if (paras.length) parts.push(`Slide ${i + 1}: ${paras[0]}\n${paras.slice(1).join('\n')}`.trim()); }
      const text = parts.join('\n\n').slice(0, MAX_TEXT).trim();
      return { text: text || null, status: text ? 'indexed' : 'failed', method: 'pptx-text', pages: files.length };
    }
    if (IMAGE_TYPES.includes(mimeType) || /\.(png|jpe?g|webp|tiff?|bmp|gif)$/i.test(lower)) {
      return { text: null, status: 'needs_ocr', method: 'image', needsOcr: true };
    }
    if (mimeType.startsWith('text/') || ['application/json', 'application/xml', 'application/sql', 'application/rtf'].includes(mimeType) || /\.(txt|md|csv|json|xml|html?|sql|rtf|eml)$/i.test(lower)) {
      let text = bytes.toString('utf8');
      if (/\.html?$/i.test(lower) || mimeType === 'text/html') text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
      text = text.slice(0, MAX_TEXT).trim();
      return { text: text || null, status: text ? 'indexed' : 'failed', method: 'plain-text' };
    }
    return { text: null, status: 'unsupported', method: 'none' };
  } catch (e: any) {
    return { text: null, status: 'failed', method: 'failed', error: e?.message };
  }
}
