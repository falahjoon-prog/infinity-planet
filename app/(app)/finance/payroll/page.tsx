'use client';
import { Suspense } from 'react';
import { Loading } from '@/components/ui';
import { Payroll } from '@/components/finance';
export default function Page() { return <Suspense fallback={<Loading />}><Payroll /></Suspense>; }
