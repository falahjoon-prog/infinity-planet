'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

export type Me = { id: string; role: string; full_name: string | null; email: string | null; areas?: string[] | null; custom_role?: string | null; language?: string | null; color?: string | null };
export type ProviderInfo = { id: string; label: string; model: string; configured: boolean; detail: string };
export type Status = { providers: ProviderInfo[]; google: { configured: boolean; connected: boolean; status: string; account: string | null; redirect_uri?: string }; supabase: { migration_v4: boolean; migration_error: string | null; storage_bucket: boolean }; ocr: { images: boolean; scanned_pdf: boolean } };
type Ctx = {
  me: Me; can: { write: boolean; admin: boolean; approve: string[] };
  status: Status | null; projects: { id: string; name: string; status: string }[]; members: { id: string; full_name: string | null; email: string | null; role: string; presence: string; color?: string | null; language?: string | null }[];
  refreshProjects: () => void; refreshStatus: () => void; refreshMembers: () => void;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error('useApp outside provider'); return c; };

export function AppProvider({ me, can, children }: { me: Me; can: Ctx['can']; children: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [projects, setProjects] = useState<Ctx['projects']>([]);
  const [members, setMembers] = useState<Ctx['members']>([]);
  const refreshStatus = useCallback(() => { api.get<Status>('/api/system/status').then(setStatus).catch(() => {}); }, []);
  const refreshProjects = useCallback(() => { api.get('/api/projects').then(d => setProjects((d.projects || []).map((p: any) => ({ id: p.id, name: p.name, status: p.status })))).catch(() => {}); }, []);
  const refreshMembers = useCallback(() => { api.get('/api/team/members').then(d => setMembers(d.members || [])).catch(() => {}); }, []);
  useEffect(() => { refreshStatus(); refreshProjects(); refreshMembers(); const t = setInterval(refreshMembers, 90_000); return () => clearInterval(t); }, [refreshStatus, refreshProjects, refreshMembers]);
  return <AppCtx.Provider value={{ me, can, status, projects, members, refreshProjects, refreshStatus, refreshMembers }}>{children}</AppCtx.Provider>;
}
