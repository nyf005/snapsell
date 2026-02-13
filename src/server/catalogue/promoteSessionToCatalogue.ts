/**
 * Story 8.2 Task 1: Promotion session → catalogue à la fermeture
 *
 * Après fermeture d'une session live, récupère les LiveItem avec stock restant
 * (availableQty - reservedQty > 0) et les upsert dans le catalogue.
 * Si le code existe déjà en catalogue : ajoute les quantités restantes.
 */

import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { Prisma } from "../../../generated/prisma";

export type PromotionResult = {
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
};

/**
 * Promeut les items restants d'une session fermée vers le catalogue.
 * Pour chaque LiveItem avec stock disponible > 0, upsert CatalogueItem :
 * - Si absent : création avec les quantités restantes
 * - Si présent : ajout des quantités restantes
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
      // Vérifier si l'item existe déjà en catalogue (pour statistiques)
      const existingBefore = await db.catalogueItem.findUnique({
        where: { tenantId_code: { tenantId, code: item.code } },
        select: { id: true },
      });

      // Tenter l'upsert : créer ou ajouter les quantités
      await upsertCatalogueItemFromLive(
        tenantId,
        item.code,
        remainingQty,
        item.amount,
        item.mediaStorageKey,
      );

      if (existingBefore) {
        result.itemsUpdated++;
      } else {
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
async function upsertCatalogueItemFromLive(
  tenantId: string,
  code: string,
  additionalQty: number,
  amount: number | null,
  mediaStorageKey: string | null,
): Promise<void> {
  try {
    // Essayer de mettre à jour l'existant (ajouter les quantités)
    const updated = await db.catalogueItem.updateMany({
      where: { tenantId, code },
      data: {
        quantity: { increment: additionalQty },
        availableQty: { increment: additionalQty },
        // Ne pas écraser le prix ou la photo si déjà présents
        // (l'item catalogue peut avoir été modifié manuellement)
      },
    });

    // Si aucune ligne mise à jour → item absent, créer
    if (updated.count === 0) {
      try {
        await db.catalogueItem.create({
          data: {
            tenantId,
            code,
            amount,
            quantity: additionalQty,
            availableQty: additionalQty,
            reservedQty: 0,
            mediaStorageKey,
            createdInLive: true, // Provenance : session live
          },
        });
      } catch (createError) {
        // Race condition : un autre process a créé l'item entre-temps
        const isUniqueViolation =
          createError instanceof Prisma.PrismaClientKnownRequestError &&
          createError.code === "P2002";

        if (isUniqueViolation) {
          // Retry update
          await db.catalogueItem.updateMany({
            where: { tenantId, code },
            data: {
              quantity: { increment: additionalQty },
              availableQty: { increment: additionalQty },
            },
          });
        } else {
          throw createError;
        }
      }
    }
  } catch (error) {
    workerLogger.error("Error in upsertCatalogueItemFromLive", error, {
      tenantId,
      code,
      additionalQty,
    });
    throw error;
  }
}
