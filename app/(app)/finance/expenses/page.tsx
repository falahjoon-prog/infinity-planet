'use client';
import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { FinanceList } from '@/components/finance';
export default function Page() { return <Suspense fallback={<Loading />}><FinanceList mode="expenses" /></Suspense>; }
