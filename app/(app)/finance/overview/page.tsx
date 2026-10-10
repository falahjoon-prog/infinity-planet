'use client';
import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { FinanceOverview } from '@/components/finance';
export default function Page() { return <Suspense fallback={<Loading />}><FinanceOverview /></Suspense>; }
