import { NextRequest } from 'next/server';
import { route, ok, HttpError } from '@/lib/http';
import { getActor, requireWriter } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { BUCKET, ensureBucket, safeName } from '@/lib/documents';
export const runtime = 'nodejs';

/** Upload an image for use in Designer layouts. */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireWriter(req);
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new HttpError(400, 'Choose an image');
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new HttpError(400, 'Use a PNG, JPG, WEBP or GIF image');
  if (file.size > 15 * 1024 * 1024) throw new HttpError(400, 'Image is larger than 15 MB');
  await ensureBucket();
  const db = getSupabaseAdmin();
  const path = `designs/${actor.id}/${Date.now()}-${safeName(file.name)}`;
  const up = await db.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (up.error) throw up.error;
  const s = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
  return ok({ path, url: s.data?.signedUrl }, 201);
});
export const GET = route(async (req: NextRequest) => {
  await getActor(req);
  const path = req.nextUrl.searchParams.get('path') || '';
  if (!path.startsWith('designs/')) throw new HttpError(400, 'Invalid path');
  const s = await getSupabaseAdmin().storage.from(BUCKET).createSignedUrl(path, 3600);
  if (s.error) throw s.error;
  return ok({ url: s.data.signedUrl });
});
