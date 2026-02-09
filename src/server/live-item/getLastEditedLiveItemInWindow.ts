/**
 * Story 3.5: Dernier LiveItem créé/édité par le vendeur dans la session courante
 * dont updatedAt est dans la fenêtre (ex. 2 min). Utilisé pour « photo seule → dernier code ».
 */

import { db } from "~/server/db";
import { getOrCreateCurrentSession } from "~/server/live-session/service";

export type LastEditedLiveItemInWindow = {
  id: string;
  code: string;
  liveSessionId: string;
};

/**
 * Retourne le dernier LiveItem (par updatedAt) pour le tenant dans la session live courante,
 * dont updatedAt >= now - windowMs. Null si aucun item dans la fenêtre.
 * Utilise getOrCreateCurrentSession : la session est créée si aucune n'existe (ex. photo seule sans signal live avant).
 */
export async function getLastEditedLiveItemInWindow(
  tenantId: string,
  windowMs: number,
): Promise<LastEditedLiveItemInWindow | null> {
  const session = await getOrCreateCurrentSession(tenantId);
  const cutoff = new Date(Date.now() - windowMs);

  const item = await db.liveItem.findFirst({
    where: {
      tenantId,
      liveSessionId: session.id,
      updatedAt: { gte: cutoff },
    },
    orderBy: { updatedAt: "desc" },
    take: 1,
    select: { id: true, code: true, liveSessionId: true },
  });

  return item;
}
