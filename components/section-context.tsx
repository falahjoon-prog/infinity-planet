'use client';
import { createContext } from 'react';
/** The name of the page/tab shown in the top bar — pages don't repeat it as a big title. */
export const SectionTitleContext = createContext<string | null>(null);

/** The menu section the page belongs to (Work, Documents, Legal AI…) — shown as a small label above the page title. */
export const SectionGroupContext = createContext<string | null>(null);
