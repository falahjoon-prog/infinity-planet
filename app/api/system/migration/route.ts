import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { route, HttpError } from '@/lib/http';
import { requireRole } from '@/lib/auth';
export const runtime = 'nodejs';

/** Admin-only: the text of a database update file, so it can be copied into Supabase → SQL Editor in one click. */
export const GET = route(async (req: NextRequest) => {
  await requireRole(req, ['admin', 'director']);
  const want = String(req.nextUrl.searchParams.get('file') || '').replace(/[^0-9]/g, '').slice(0, 3);
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const file = (await fs.readdir(dir)).find(f => f.startsWith(want.padStart(3, '0') + '_') && f.endsWith('.sql'));
  if (!want || !file) throw new HttpError(404, 'Update file not found');
  return new NextResponse(await fs.readFile(path.join(dir, file), 'utf8'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-file-name': file } });
});
