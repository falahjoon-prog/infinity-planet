/** A person's display name on the server: their real name, or a tidy name made from their email — never the raw email. */
export function displayName(p?: { full_name?: string | null; email?: string | null } | null): string {
  const n = String(p?.full_name || '').trim();
  if (n && !n.includes('@')) return n;
  const src = n.includes('@') ? n : String(p?.email || '');
  return (src.split('@')[0] || '').split(/[._\-+0-9]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Someone';
}
