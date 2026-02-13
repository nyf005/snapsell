/**
 * Story 8.1 Task 2: Lookup dans le catalogue par (tenantId, code).
 * Retourne le CatalogueItem ou null si absent / code invalide.
 */

import { db } from "~/server/db";
import { normalizeCode } from "~/server/live-item/createLiveItem";

export type CatalogueItemLookup = {
  id: string;
  tenantId: string;
  code: string;
  amount: number | null;
  quantity: number;
  availableQty: number;
  reservedQty: number;
  mediaStorageKey: string | null;
  createdInLive: boolean;
};

/**
 * Lookup catalogue : retourne l'item commandable pour (tenantId, code).
 * Normalise le code (trim + uppercase). Retourne null si code vide ou absent du catalogue.
 */
export async function findOrderableItemByCode(
  tenantId: string,
  code: string,
): Promise<CatalogueItemLookup | null> {
  const normalized = normalizeCode(code);
  if (!normalized.length) return null;

  const item = await db.catalogueItem.findUnique({
    where: {
      tenantId_code: { tenantId, code: normalized },
    },
  });

  if (!item) return null;

  return {
    id: item.id,
    tenantId: item.tenantId,
    code: item.code,
    amount: item.amount,
    quantity: item.quantity,
    availableQty: item.availableQty,
    reservedQty: item.reservedQty,
    mediaStorageKey: item.mediaStorageKey,
    createdInLive: item.createdInLive,
  };
}
