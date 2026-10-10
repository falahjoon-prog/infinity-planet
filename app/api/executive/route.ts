import { NextRequest } from 'next/server';
import { route, ok } from '@/lib/http';
import { getActor } from '@/lib/auth';
import { executiveData, rulesSummary } from '@/lib/executive';
import { getBrand } from '@/lib/brand';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const actor = await getActor(req);
  const [data, B] = await Promise.all([executiveData(actor.id), getBrand()]);
  return ok({ ...data, summary: { text: rulesSummary(data, B.business_name), engine: 'rules' } });
});
