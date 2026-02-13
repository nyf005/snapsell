/**
 * Story 8.2 Task 4: Upsert catalogue depuis flux WhatsApp vendeur
 *
 * Utilisé par webhook-processor lors de l'intent vendeur "créer item" :
 * - Avec session active : upsert catalogue + LiveItem
 * - Sans session active : upsert catalogue seul (pas de session créée)
 */

import { db } from "~/server/db";
import { Prisma } from "../../../generated/prisma";
import { normalizeCode } from "~/server/live-item/createLiveItem";
import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";
import { workerLogger } from "~/lib/logger";

export type UpsertCatalogueFromWebhookResult =
  | { success: true; created: boolean; catalogueItemId: string }
  | { success: false; reason: "invalid_code" | "no_price" };

/**
 * Upsert un CatalogueItem lors de l'intent vendeur "créer item" via WhatsApp.
 * - Si le code existe déjà : ajoute les quantités
 * - Si absent : crée avec createdInLive = true
 *
 * @param tenantId - ID tenant
 * @param code - Code brut (sera normalisé)
 * @param quantity - Quantité à ajouter (ou créer)
 * @returns Résultat avec success/created/catalogueItemId ou raison d'échec
 */
export async function upsertCatalogueItemFromWebhook(
  tenantId: string,
  code: string,
  quantity: number,
): Promise<UpsertCatalogueFromWebhookResult> {
  const normalized = normalizeCode(code);
  if (!normalized.length) {
    return { success: false, reason: "invalid_code" };
  }

  // Dériver le prix de la grille (première lettre du code)
  const amount = await getPriceFromCode(tenantId, normalized);
  if (amount === null) {
    // Pas de prix configuré pour cette catégorie → ne pas créer
    workerLogger.warn("Cannot upsert catalogue item: no price for category", {
      tenantId,
      code: normalized,
    });
    return { success: false, reason: "no_price" };
  }

  try {
    // Tenter de mettre à jour un item existant (ajouter les quantités)
    const updated = await db.catalogueItem.updateMany({
      where: { tenantId, code: normalized },
      data: {
        quantity: { increment: quantity },
        availableQty: { increment: quantity },
        // Ne pas écraser le prix si l'item existe déjà
      },
    });

    // Si aucune ligne mise à jour → créer
    if (updated.count === 0) {
      try {
        const created = await db.catalogueItem.create({
          data: {
            tenantId,
            code: normalized,
            amount,
            quantity,
            availableQty: quantity,
            reservedQty: 0,
            createdInLive: true, // Provenance : création en live par WhatsApp
          },
        });

        workerLogger.info("Catalogue item created from webhook", {
          tenantId,
          catalogueItemId: created.id,
          code: normalized,
          quantity,
        });

        return { success: true, created: true, catalogueItemId: created.id };
      } catch (createError) {
        // Race condition : un autre processus a créé l'item entre-temps
        const isUniqueViolation =
          createError instanceof Prisma.PrismaClientKnownRequestError &&
          createError.code === "P2002";

        if (isUniqueViolation) {
          // Retry update
          const retried = await db.catalogueItem.updateMany({
            where: { tenantId, code: normalized },
            data: {
              quantity: { increment: quantity },
              availableQty: { increment: quantity },
            },
          });

          if (retried.count > 0) {
            // Récupérer l'ID après update
            const existing = await db.catalogueItem.findUnique({
              where: { tenantId_code: { tenantId, code: normalized } },
              select: { id: true },
            });

            if (existing) {
              workerLogger.info("Catalogue item updated from webhook (after race)", {
                tenantId,
                catalogueItemId: existing.id,
                code: normalized,
                quantity,
              });
              return { success: true, created: false, catalogueItemId: existing.id };
            }
          }
        }

        throw createError;
      }
    } else {
      // Update réussi : récupérer l'ID
      const existing = await db.catalogueItem.findUnique({
        where: { tenantId_code: { tenantId, code: normalized } },
        select: { id: true },
      });

      if (existing) {
        workerLogger.info("Catalogue item updated from webhook", {
          tenantId,
          catalogueItemId: existing.id,
          code: normalized,
          quantity,
        });
        return { success: true, created: false, catalogueItemId: existing.id };
      }

      // Ne devrait pas arriver (updateMany count > 0 mais findUnique null)
      workerLogger.error("Updated catalogue item but cannot find it after update", {
        tenantId,
        code: normalized,
      });
      throw new Error(`Catalogue item updated but not found: tenant=${tenantId} code=${normalized}`);
    }
  } catch (error) {
    workerLogger.error("Error upserting catalogue item from webhook", error, {
      tenantId,
      code: normalized,
      quantity,
    });
    throw error;
  }
}
