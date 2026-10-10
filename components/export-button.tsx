'use client';
import React, { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { api, downloadBlob } from '@/lib/client/api';
import { Button, useToast } from './ui';

/** Downloads a list as a styled Excel workbook (/api/export/<kind>). */
export function ExportExcel({ kind, query = '', label = 'Export' }: { kind: 'tasks' | 'projects' | 'deals' | 'contacts' | 'legal'; query?: string; label?: string }) {
  const [busy, setBusy] = useState(false); const toast = useToast();
  const go = async () => { setBusy(true); try { const { blob, name } = await api.blob(`/api/export/${kind}${query ? `?${query}` : ''}`); downloadBlob(blob, decodeURIComponent(name)); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const what: Record<string, string> = { tasks: 'these tasks', projects: 'these projects', deals: 'these deals', contacts: 'these contacts', legal: 'these legal reviews' };
  return <Button variant="ghost" icon={<FileSpreadsheet size={15} />} loading={busy} onClick={go} title={`Download ${what[kind] || 'this list'} as an Excel spreadsheet`}>{label}</Button>;
}
