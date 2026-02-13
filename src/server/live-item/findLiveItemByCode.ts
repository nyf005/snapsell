/**
 * Story 4.2: Lookup LiveItem par (tenantId, liveSessionId, code) sans création.
 * Utilisé par le flux client pour distinguer code inconnu vs épuisé.
 */

import { db } from "~/server/db";
import { normalizeCode } from "./createLiveItem";

/**
 * Résultat lookup LiveItem (flux 4.2).
 * N'inclut pas mediaStorageKey : volontaire pour le flux réservation (pas d'usage dans Code inconnu / Réservé / Épuisé).
 */
export type LiveItemLookup = {
  id: string;
  code: string;
  liveSessionId: string;
  amount: number | null;
  quantity: number;
  availableQty: number;
  reservedQty: number;
};

/**
 * Trouve un LiveItem existant pour (tenantId, liveSessionId, code).
 * Ne crée jamais d'item. Retourne null si aucun trouvé.
 */
export async function findLiveItemByCode(
  tenantId: string,
  liveSessionId: string,
  code: string,
): Promise<LiveItemLookup | null> {
  const normalized = normalizeCode(code);
  if (!normalized.length) return null;

  const item = await db.liveItem.findFirst({
    where: {
      tenantId,
      liveSessionId,
      code: normalized,
    },
  });

  if (!item) return null;

  return {
    id: item.id,
    code: item.code,
    liveSessionId: item.liveSessionId,
    amount: item.amount,
    quantity: item.quantity,
    availableQty: item.availableQty,
    reservedQty: item.reservedQty,
  };
}
