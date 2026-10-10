import { NextRequest } from 'next/server';
import { route, ok, body, HttpError } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { learnDecks } from '@/lib/deck-learn';
import { writeAudit } from '@/lib/audit';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Learn the house structure and style from the business's own decks (Google Drive and Documents). { folder?: Drive folder link or id } */
export const POST = route(async (req: NextRequest) => {
  const actor = await requireRole(req, ['admin', 'director', 'manager', 'marketing']);
  const b = await body(req);
  const folder = typeof b.folder === 'string' && b.folder.trim() ? (b.folder.match(/folders\/([\w-]{10,})/)?.[1] || b.folder.match(/^[\w-]{10,}$/)?.[0] || null) : null;
  if (b.folder && !folder) throw new HttpError(400, 'Paste a Google Drive folder link');
  try {
    const r = await learnDecks({ actorId: actor.id, folderId: folder, max: Number(b.max) || 8, makeTemplate: b.template !== false });
    await writeAudit({ actorId: actor.id, action: 'deck.learned', metadata: { from: r.house.from, structure: r.house.structure, template: r.template?.id } });
    return ok(r);
  } catch (e: any) { throw new HttpError(e?.status || 400, e?.message || 'Could not learn from your presentations'); }
});
