/**
 * Story 8.1 Task 2: Find-or-create dans le catalogue pour le flux client.
 * (1) normaliser le code ; (2) si invalide → null ; (3) chercher dans catalogue ;
 * (4) si absent → créer CatalogueItem (qty 1, prix grille, createdInLive true) ;
 * (5) retourner l'item (existant ou créé). Race (P2002) → retry lookup.
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { normalizeCode } from "~/server/live-item/createLiveItem";
import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";
import type { CatalogueItemLookup } from "./findOrderableItemByCode";

function toCatalogueItemLookup(item: {
  id: string;
  tenantId: string;
  code: string;
  amountCents: number | null;
  quantity: number;
  availableQty: number;
  reservedQty: number;
  mediaStorageKey: string | null;
  createdInLive: boolean;
}): CatalogueItemLookup {
  return {
    id: item.id,
    tenantId: item.tenantId,
    code: item.code,
    amountCents: item.amountCents,
    quantity: item.quantity,
    availableQty: item.availableQty,
    reservedQty: item.reservedQty,
    mediaStorageKey: item.mediaStorageKey,
    createdInLive: item.createdInLive,
  };
}

/**
 * Cherche un CatalogueItem par (tenantId, code) ; si absent, le crée
 * (qty 1, availableQty 1, prix via grille, createdInLive = true).
 *
 * Retourne null si :
 * - code vide après normalisation
 * - lettre non configurée dans la grille (pas de prix → pas de création)
 *
 * En cas de doublon (race condition P2002), réessaie le lookup.
 */
export async function findOrCreateOrderableItemByCode(
  tenantId: string,
  code: string,
): Promise<CatalogueItemLookup | null> {
  const normalized = normalizeCode(code);
  if (!normalized.length) return null;

  // Valider que le code a un prix (lettre configurée dans la grille)
  const amountCents = await getPriceFromCode(tenantId, normalized);
  if (amountCents === null) return null;

  // Lookup existant
  const existing = await db.catalogueItem.findUnique({
    where: { tenantId_code: { tenantId, code: normalized } },
  });
  if (existing) return toCatalogueItemLookup(existing);

  // Créer
  try {
    const created = await db.catalogueItem.create({
      data: {
        tenantId,
        code: normalized,
        amountCents,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
        createdInLive: true,
      },
    });
    return toCatalogueItemLookup(created);
  } catch (error) {
    // Race condition : un autre processus a créé le même item
    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!isUniqueViolation) throw error;

    // Retry lookup
    const afterConflict = await db.catalogueItem.findUnique({
      where: { tenantId_code: { tenantId, code: normalized } },
    });
    if (afterConflict) return toCatalogueItemLookup(afterConflict);

    // Ne devrait pas arriver, mais sécurité
    return null;
  }
}
