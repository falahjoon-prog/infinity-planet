'use client';
import React, { useEffect, useState } from 'react';

export type ClientBrand = { app_name: string; tagline: string; ai_name: string; search_name: string; version: string; business_name: string; short_name: string; logo_url: string | null; primary?: string; accent?: string; serif?: boolean };
const FALLBACK: ClientBrand = { app_name: 'Infinity Planet', tagline: 'Business Operating System', ai_name: 'Infinity AI', search_name: 'Infinity Search', version: '4.3.0', business_name: 'RHC City', short_name: 'RHC', logo_url: null };

let cache: ClientBrand | null = null;
let inflight: Promise<ClientBrand> | null = null;
const listeners = new Set<(b: ClientBrand) => void>();

export function loadBrand(force = false): Promise<ClientBrand> {
  if (cache && !force) return Promise.resolve(cache);
  if (!inflight || force) inflight = fetch('/api/brand', { cache: 'no-store' }).then(r => r.json()).then((b: ClientBrand) => { cache = { ...FALLBACK, ...b }; listeners.forEach(l => l(cache!)); return cache; }).catch(() => cache || FALLBACK).finally(() => { inflight = null; });
  return inflight;
}
/** Business name/logo (Settings → Business details) and product names. Call refreshBrand() after changing them. */
export function useBrand(): ClientBrand {
  const [b, setB] = useState<ClientBrand>(cache || FALLBACK);
  useEffect(() => { listeners.add(setB); loadBrand().then(setB); return () => { listeners.delete(setB); }; }, []);
  return b;
}
export const refreshBrand = () => loadBrand(true);

/** The Infinity Planet product mark. */
export function InfinityMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return <img src="/brand/infinity-planet.svg" width={size} height={size} alt="Infinity Planet" className={className} style={{ borderRadius: size * 0.22, display: 'block', flex: 'none' }} />;
}

/** Business logo if one is set, otherwise the business initial in the brand tile. */
export function BusinessMark({ brand, size = 36 }: { brand: ClientBrand; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (brand.logo_url && !failed) return <span className="biz-logo" style={{ width: size, height: size }}><img src={brand.logo_url} alt={brand.business_name} onError={() => setFailed(true)} /></span>;
  return <div className="brand-mark" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>{(brand.short_name || brand.business_name || 'B').trim().charAt(0).toUpperCase()}</div>;
}
