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
import type { CatalogueItemOriginValue } from "./origin";
import { syncCatalogueItemToMeta } from "./syncCatalogueItemToMeta";
import { getItemNameFromCode } from "~/server/pricing/getItemNameFromCode";

export type UpsertCatalogueFromWebhookResult =
  | { success: true; created: boolean; catalogueItemId: string }
  | { success: false; reason: "invalid_code" | "no_price" | "already_in_stock"; availableQty?: number };

/**
 * Upsert un CatalogueItem lors de l'intent vendeur "créer item" via WhatsApp.
 * - Si le code existe déjà : ajoute les quantités
 * - Si absent : crée avec createdInLive selon le contexte du flux
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
  options?: {
    createdInLive?: boolean;
    origin?: CatalogueItemOriginValue;
  },
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
    const createdInLive = options?.createdInLive ?? false;
    const origin = options?.origin ?? (createdInLive ? "live" : "seller_whatsapp");

    // Vérifier si l'item existe et son stock avant toute modification
    const existing = await db.catalogueItem.findUnique({
      where: { tenantId_code: { tenantId, code: normalized } },
      select: { id: true, availableQty: true },
    });

    // Si l'item existe avec un stock non nul → refuser (le vendeur doit d'abord l'épuiser)
    if (existing && existing.availableQty > 0) {
      workerLogger.warn("Cannot upsert catalogue item: already in stock", {
        tenantId,
        code: normalized,
        availableQty: existing.availableQty,
      });
      return { success: false, reason: "already_in_stock", availableQty: existing.availableQty };
    }

    // Tenter de mettre à jour un item existant (ajouter les quantités)
    // Cas autorisé : item inexistant (created: true) ou item avec availableQty = 0 (restock)
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
        // Dériver le nom depuis la description de catégorie (ex. "Robes femme A12")
        const name = await getItemNameFromCode(tenantId, normalized);

        const created = await db.catalogueItem.create({
          data: {
            tenantId,
            code: normalized,
            name,
            amount,
            quantity,
            availableQty: quantity,
            reservedQty: 0,
            origin,
            createdInLive,
          },
        });

        workerLogger.info("Catalogue item created from webhook", {
          tenantId,
          catalogueItemId: created.id,
          code: normalized,
          quantity,
        });

        // Pas de sync immédiate sur création : l'article n'a ni name ni image à ce stade.
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
        // Restock d'un article existant : sync Meta immédiate si l'article a déjà name + image.
        // Fire-and-forget — ne bloque pas le flux vendeur si Meta est indisponible.
        void syncCatalogueItemToMeta(tenantId, existing.id).catch((err) => {
          workerLogger.warn("Post-restock Meta sync failed (non-blocking)", {
            tenantId,
            catalogueItemId: existing.id,
            err,
          });
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
