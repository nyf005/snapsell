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
} from "./catalogue.schema";
import { normalizeCode } from "~/server/live-item/createLiveItem";
import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";
import { isR2Configured } from "~/server/media/r2-client";

export const catalogueRouter = createTRPCRouter({
  /** Story 9.2: Indique si R2 est configuré (sans révéler les credentials) */
  r2Status: protectedProcedure.query(() => {
    return { configured: isR2Configured() };
  }),

  /** Liste tous les articles catalogue du tenant (dashboard) */
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.catalogueItem.findMany({
      where: { tenantId: ctx.session.user.tenantId },
      orderBy: { createdAt: "desc" },
    });
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
