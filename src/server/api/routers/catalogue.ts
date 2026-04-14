/**
 * Story 8.2 Task 2: Router tRPC catalogue — CRUD articles persistants
 * Isolation tenant: tenantId depuis ctx.session.user.tenantId (protectedProcedure).
 */

import { TRPCError } from "@trpc/server";
import { Prisma } from "../../../../generated/prisma";
import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  createCatalogueItemInputSchema,
  updateCatalogueItemInputSchema,
  deleteCatalogueItemInputSchema,
  upsertVariantsInputSchema,
  deleteVariantsInputSchema,
  listVariantsInputSchema,
  listCatalogueInputSchema,
  syncToMetaInputSchema,
} from "./catalogue.schema";
import { syncCatalogueItemToMeta } from "~/server/catalogue/syncCatalogueItemToMeta";
import { normalizeCode } from "~/server/live-item/createLiveItem";
import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";
import { isR2Configured } from "~/server/media/r2-client";

export const catalogueRouter = createTRPCRouter({
  /** Story 9.2: Indique si R2 est configuré (sans révéler les credentials) */
  r2Status: protectedProcedure.query(() => {
    return { configured: isR2Configured() };
  }),

  /** Liste paginée des articles catalogue du tenant (dashboard) */
  list: protectedProcedure
    .input(listCatalogueInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      const limit = input.limit ?? 20;

      const rows = await db.catalogueItem.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        skip: input.cursor ? 1 : 0,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      const items = rows.slice(0, limit);
      const nextCursor = rows.length > limit ? rows[limit - 1]?.id : undefined;

      return { items, nextCursor };
    }),

  /** Crée un nouvel article catalogue (dashboard) */
  create: protectedProcedure
    .input(createCatalogueItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      const code = normalizeCode(input.code);
      if (!code) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Code invalide." });
      }

      // Si prix non fourni, dériver de la grille
      let amount = input.amount ?? null;
      if (amount === null) {
        const derivedPrice = await getPriceFromCode(tenantId, code);
        if (derivedPrice === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Prix non configuré pour cette catégorie (première lettre du code).",
          });
        }
        amount = derivedPrice;
      }

      try {
        return await db.catalogueItem.create({
          data: {
            tenantId,
            code,
            amount,
            quantity: input.quantity,
            availableQty: input.quantity,
            reservedQty: 0,
            mediaStorageKey: input.mediaStorageKey ?? null,
            origin: "dashboard",
            createdInLive: false,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Le code "${code}" existe déjà dans votre catalogue.`,
          });
        }
        throw error;
      }
    }),

  /** Met à jour un article catalogue (dashboard) */
  update: protectedProcedure
    .input(updateCatalogueItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      const existing = await db.catalogueItem.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article non trouvé." });
      }

      const updateData: Prisma.CatalogueItemUpdateInput = {};

      if (input.code !== undefined) {
        const normalized = normalizeCode(input.code);
        if (!normalized) throw new TRPCError({ code: "BAD_REQUEST", message: "Code invalide." });
        updateData.code = normalized;
      }

      if (input.quantity !== undefined) {
        const hasVariants =
          Array.isArray(existing.attributes) && existing.attributes.length > 0;
        if (hasVariants) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "La quantité totale est dérivée des variantes tant que celles-ci sont actives.",
          });
        }
        if (input.quantity < existing.reservedQty) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Impossible de réduire la quantité à ${input.quantity} : ${existing.reservedQty} réservation(s) active(s).`,
          });
        }
        const delta = input.quantity - existing.quantity;
        updateData.quantity = input.quantity;
        updateData.availableQty = Math.max(0, existing.availableQty + delta);
      }

      if (input.amount !== undefined) updateData.amount = input.amount;
      if (input.mediaStorageKey !== undefined) updateData.mediaStorageKey = input.mediaStorageKey;

      try {
        return await db.catalogueItem.update({
          where: { id: input.id },
          data: updateData,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Le code "${updateData.code}" existe déjà dans votre catalogue.`,
          });
        }
        throw error;
      }
    }),

  /** Supprime un article catalogue (dashboard) */
  delete: protectedProcedure
    .input(deleteCatalogueItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      const existing = await db.catalogueItem.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article non trouvé." });
      }

      const activeReservations = await db.reservation.count({
        where: {
          catalogueItemId: input.id,
          status: { in: ["reserved", "address_collected"] },
        },
      });

      if (activeReservations > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Impossible de supprimer un article avec des réservations actives.",
        });
      }

      await db.catalogueItem.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /** Synchronise un article vers le catalogue Meta (Starter/Pro) */
  syncToMeta: protectedProcedure
    .input(syncToMetaInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      const result = await syncCatalogueItemToMeta(tenantId, input.id);

      if (!result.success) {
        const messages: Record<string, string> = {
          sync_disabled:        "La synchro catalogue Meta est désactivée.",
          no_entitlement:       "La synchro Meta est disponible à partir du plan Starter.",
          no_catalog_configured:"Aucun catalogue Meta configuré pour ce compte.",
          missing_name:         "L'article doit avoir un nom pour être synchronisé.",
          missing_image:        "L'article doit avoir une image pour être synchronisé.",
          no_access_token:      "Token Meta manquant. Vérifiez la configuration WhatsApp.",
          rate_limited:         "Limite de l'API Meta atteinte. Réessayez dans quelques instants.",
          unauthorized:         "Token Meta invalide ou expiré.",
          catalog_not_found:    "Catalogue Meta introuvable. Vérifiez l'ID catalogue.",
          image_url_failed:     "Impossible de générer l'URL de l'image. Vérifiez la configuration R2.",
          meta_error:           "Erreur lors de la synchronisation avec Meta.",
        };
        throw new TRPCError({
          code: result.reason === "no_entitlement" ? "FORBIDDEN" : "BAD_REQUEST",
          message: messages[result.reason] ?? "Erreur inconnue.",
        });
      }

      return { metaProductId: result.metaProductId, created: result.created };
    }),

  /** Liste les variantes d'un article catalogue */
  listVariants: protectedProcedure
    .input(listVariantsInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      const item = await db.catalogueItem.findUnique({ where: { id: input.catalogueItemId } });
      if (!item || item.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article non trouvé." });
      }

      return db.itemVariant.findMany({
        where: { catalogueItemId: input.catalogueItemId, tenantId },
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, values: true, quantity: true, availableQty: true, reservedQty: true },
      });
    }),

  /** Remplace atomiquement toutes les variantes d'un article. */
  upsertVariants: protectedProcedure
    .input(upsertVariantsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      const item = await db.catalogueItem.findUnique({ where: { id: input.catalogueItemId } });
      if (!item || item.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article non trouvé." });
      }

      const activeReservations = await db.reservation.count({
        where: {
          variant: { catalogueItemId: input.catalogueItemId },
          status: { in: ["reserved", "address_collected"] },
        },
      });
      if (activeReservations > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Impossible de modifier les variantes : ${activeReservations} réservation(s) active(s).`,
        });
      }

      return db.$transaction(async (tx) => {
        await tx.itemVariant.deleteMany({
          where: { catalogueItemId: input.catalogueItemId, tenantId },
        });

        const created = await tx.itemVariant.createMany({
          data: input.variants.map((v) => ({
            tenantId,
            catalogueItemId: input.catalogueItemId,
            label: v.label,
            values: v.values,
            quantity: v.quantity,
            availableQty: v.quantity,
            reservedQty: 0,
          })),
        });

        const totalQty = input.variants.reduce((s, v) => s + v.quantity, 0);
        await tx.catalogueItem.update({
          where: { id: input.catalogueItemId },
          data: {
            attributes: input.dimensions,
            quantity: totalQty,
            availableQty: totalQty,
            reservedQty: 0,
          },
        });

        return { count: created.count };
      });
    }),

  /** Supprime toutes les variantes d'un article (reset) */
  deleteVariants: protectedProcedure
    .input(deleteVariantsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      const item = await db.catalogueItem.findUnique({ where: { id: input.catalogueItemId } });
      if (!item || item.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article non trouvé." });
      }

      const activeReservations = await db.reservation.count({
        where: {
          variant: { catalogueItemId: input.catalogueItemId },
          status: { in: ["reserved", "address_collected"] },
        },
      });
      if (activeReservations > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Impossible de supprimer les variantes : réservations actives.",
        });
      }

      await db.$transaction(async (tx) => {
        await tx.itemVariant.deleteMany({ where: { catalogueItemId: input.catalogueItemId, tenantId } });
        await tx.catalogueItem.update({
          where: { id: input.catalogueItemId },
          data: { attributes: Prisma.JsonNull },
        });
      });

      return { success: true };
    }),
});
