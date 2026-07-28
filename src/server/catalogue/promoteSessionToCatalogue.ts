/**
 * Story 8.2 Task 1: Promotion session → catalogue à la fermeture
 *
 * Récupère les LiveItem d'une session fermée et crée l'article catalogue
 * correspondant **s'il n'existe pas encore**.
 *
 * ── POURQUOI ON N'ADDITIONNE PLUS ───────────────────────────────────────────
 * La version précédente incrémentait `quantity` et `availableQty` de l'article
 * catalogue existant, avec la quantité restante lue sur le `LiveItem`.
 *
 * Or les réservations des clientes décrémentent `catalogue_items`, jamais
 * `live_items` : la quantité lue sur le LiveItem est celle de sa création, figée.
 * Chaque fin de live ré-ajoutait donc le stock initial au stock réel — un article
 * à 10 en stock passait à 20, puis 30, sans qu'aucune vente ne l'explique.
 *
 * Aujourd'hui les deux chemins qui créent un LiveItem garantissent déjà l'article
 * catalogue (tableau de bord : il en part ; vendeur WhatsApp :
 * `upsertCatalogueItemFromWebhook` s'exécute avant). La création n'est donc plus
 * qu'un filet de sécurité pour un orphelin, et l'addition n'a plus lieu d'être :
 * le catalogue est déjà la source de vérité.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { Prisma } from "../../../generated/prisma";
import { syncPendingCatalogueItems } from "./syncCatalogueItemToMeta";
import { getItemNameFromCode } from "~/server/pricing/getItemNameFromCode";

export type PromotionResult = {
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
};

/**
 * Promeut les items restants d'une session fermée vers le catalogue.
 * Pour chaque LiveItem avec stock disponible > 0 :
 * - Si l'article catalogue est absent : création avec les quantités restantes
 * - S'il est présent : on n'y touche pas (il porte déjà le stock réel)
 *
 * @param tenantId - ID du tenant (isolation)
 * @param liveSessionId - ID de la session fermée
 * @returns Statistiques de promotion (items traités, créés, mis à jour, ignorés)
 */
export async function promoteSessionToCatalogue(
  tenantId: string,
  liveSessionId: string,
): Promise<PromotionResult> {
  // Récupérer tous les LiveItem de cette session
  const liveItems = await db.liveItem.findMany({
    where: {
      tenantId,
      liveSessionId,
    },
    select: {
      id: true,
      code: true,
      amount: true,
      availableQty: true,
      reservedQty: true,
      mediaStorageKey: true,
      quantity: true,
    },
  });

  const result: PromotionResult = {
    itemsProcessed: liveItems.length,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
  };

  for (const item of liveItems) {
    const remainingQty = item.availableQty - item.reservedQty;

    // Ignorer les items sans stock restant
    if (remainingQty <= 0) {
      result.itemsSkipped++;
      workerLogger.debug("Skipping LiveItem with no remaining stock", {
        tenantId,
        liveSessionId,
        liveItemId: item.id,
        code: item.code,
        remainingQty,
      });
      continue;
    }

    try {
      const existingBefore = await db.catalogueItem.findUnique({
        where: { tenantId_code: { tenantId, code: item.code } },
        select: { id: true },
      });

      if (existingBefore) {
        // L'article catalogue porte déjà le stock réel : rien à faire.
        result.itemsUpdated++;
      } else {
        await createCatalogueItemFromLive(
          tenantId,
          item.code,
          remainingQty,
          item.amount,
          item.mediaStorageKey,
          await getItemNameFromCode(tenantId, item.code),
        );
        result.itemsCreated++;
      }

      workerLogger.info("Promoted LiveItem to catalogue", {
        tenantId,
        liveSessionId,
        liveItemId: item.id,
        code: item.code,
        remainingQty,
        action: existingBefore ? "updated" : "created",
      });
    } catch (error) {
      workerLogger.error("Error promoting LiveItem to catalogue", error, {
        tenantId,
        liveSessionId,
        liveItemId: item.id,
        code: item.code,
      });
      result.itemsSkipped++;
    }
  }

  workerLogger.info("Session promotion completed", {
    tenantId,
    liveSessionId,
    ...result,
  });

  // Déclenche la sync Meta immédiatement pour les articles promus éligibles
  // (name + mediaStorageKey non null, availableQty > 0).
  // Fire-and-forget : ne bloque pas la fermeture de session si Meta est lent ou indisponible.
  if (result.itemsCreated > 0 || result.itemsUpdated > 0) {
    void syncPendingCatalogueItems(tenantId).catch((err) => {
      workerLogger.warn("Post-promotion Meta sync failed (non-blocking)", {
        tenantId,
        liveSessionId,
        err,
      });
    });
  }

  return result;
}

/**
 * Upsert un CatalogueItem : crée si absent, sinon ajoute les quantités.
 * Règle produit : addition des quantités (pas de remplacement).
 *
 * @param tenantId - ID tenant
 * @param code - Code normalisé de l'article
 * @param additionalQty - Quantité à ajouter (ou créer si absent)
 * @param amount - Prix en centimes (optionnel)
 * @param mediaStorageKey - Clé R2 pour photo (optionnel)
 */
async function createCatalogueItemFromLive(
  tenantId: string,
  code: string,
  additionalQty: number,
  amount: number | null,
  mediaStorageKey: string | null,
  name: string | null = null,
): Promise<void> {
  try {
    {
      try {
        await db.catalogueItem.create({
          data: {
            tenantId,
            code,
            name,
            amount,
            quantity: additionalQty,
            availableQty: additionalQty,
            reservedQty: 0,
            mediaStorageKey,
            origin: "live",
            createdInLive: true, // Provenance : session live
          },
        });
      } catch (createError) {
        // Race condition : un autre process a créé l'item entre-temps
        const isUniqueViolation =
          createError instanceof Prisma.PrismaClientKnownRequestError &&
          createError.code === "P2002";

        if (isUniqueViolation) {
          // Un autre processus a créé l'article entre-temps : il fait autorité,
          // rien à faire.
        } else {
          throw createError;
        }
      }
    }
  } catch (error) {
    workerLogger.error("Error in createCatalogueItemFromLive", error, {
      tenantId,
      code,
      additionalQty,
    });
    throw error;
  }
}
