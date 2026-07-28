/**
 * Inventaire d'une session live.
 *
 * ── POURQUOI CE MODULE ──────────────────────────────────────────────────────
 * Deux tables décrivent un article pendant un live :
 *
 *   LiveItem      → quels codes font partie de cette session (appartenance)
 *   CatalogueItem → combien il en reste réellement (stock)
 *
 * Les réservations des clientes décrémentent **toujours** `catalogue_items`
 * (voir `reserveUnits` dans src/server/reservation/service.ts) : `LiveItem` garde
 * les valeurs figées de sa création. Lire le stock sur `LiveItem` affichait donc
 * des compteurs qui ne bougeaient jamais, et faisait annoncer 0 FCFA dans le
 * récapitulatif envoyé au vendeur après chaque live.
 *
 * Ce module fait l'assemblage : appartenance depuis `LiveItem`, chiffres depuis
 * `CatalogueItem`, joints par code.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { db } from "~/server/db";

export type SessionInventoryItem = {
  /** Identifiant du LiveItem — reste la clé d'affichage de la session. */
  id: string;
  code: string;
  amount: number | null;
  quantity: number;
  availableQty: number;
  reservedQty: number;
  mediaStorageKey: string | null;
};

/**
 * Articles de la session, avec le stock réel.
 *
 * Repli sur les valeurs du `LiveItem` si aucun `CatalogueItem` ne correspond —
 * ne devrait pas arriver (les deux chemins de création d'un `LiveItem` créent
 * d'abord l'article catalogue), mais mieux vaut afficher une valeur périmée que
 * rien du tout.
 */
export async function getSessionInventory(
  tenantId: string,
  liveSessionId: string,
): Promise<SessionInventoryItem[]> {
  const liveItems = await db.liveItem.findMany({
    where: { tenantId, liveSessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      code: true,
      amount: true,
      quantity: true,
      availableQty: true,
      reservedQty: true,
      mediaStorageKey: true,
    },
  });

  if (liveItems.length === 0) return [];

  const catalogueItems = await db.catalogueItem.findMany({
    where: { tenantId, code: { in: liveItems.map((i) => i.code) } },
    select: {
      code: true,
      amount: true,
      quantity: true,
      availableQty: true,
      reservedQty: true,
    },
  });
  const stockByCode = new Map(catalogueItems.map((c) => [c.code, c]));

  return liveItems.map((item) => {
    const stock = stockByCode.get(item.code);
    return {
      id: item.id,
      code: item.code,
      amount: stock?.amount ?? item.amount,
      quantity: stock?.quantity ?? item.quantity,
      availableQty: stock?.availableQty ?? item.availableQty,
      reservedQty: stock?.reservedQty ?? item.reservedQty,
      mediaStorageKey: item.mediaStorageKey,
    };
  });
}
