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
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
    }

    const items = await db.catalogueItem.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return items;
  }),

  /** Crée un nouvel article catalogue (dashboard) */
  create: protectedProcedure
    .input(createCatalogueItemInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }

      // Normaliser le code (trim + uppercase)
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
        const created = await db.catalogueItem.create({
          data: {
            tenantId,
            code,
            amount,
            quantity: input.quantity,
            availableQty: input.quantity,
            reservedQty: 0,
            mediaStorageKey: input.mediaStorageKey ?? null,
            createdInLive: false, // Création manuelle via dashboard
          },
        });

        return created;
      } catch (error) {
        // Doublon (tenant_id, code) unique
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
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
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }

      // Vérifier que l'item appartient au tenant
      const existing = await db.catalogueItem.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.tenantId !== tenantId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article non trouvé.",
        });
      }

      // Construire les données de mise à jour
      const updateData: Prisma.CatalogueItemUpdateInput = {};

      if (input.code !== undefined) {
        const normalized = normalizeCode(input.code);
        if (!normalized) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Code invalide." });
        }
        updateData.code = normalized;
      }

      if (input.quantity !== undefined) {
        // Empêcher de réduire la quantité sous les réservations actives
        if (input.quantity < existing.reservedQty) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Impossible de réduire la quantité à ${input.quantity} : ${existing.reservedQty} réservation(s) active(s).`,
          });
        }
        // Ajuster availableQty en conséquence (delta par rapport à la quantité actuelle)
        const delta = input.quantity - existing.quantity;
        updateData.quantity = input.quantity;
        updateData.availableQty = Math.max(0, existing.availableQty + delta);
      }

      if (input.amount !== undefined) {
        updateData.amount = input.amount;
      }

      if (input.mediaStorageKey !== undefined) {
        updateData.mediaStorageKey = input.mediaStorageKey;
      }

      try {
        const updated = await db.catalogueItem.update({
          where: { id: input.id },
          data: updateData,
        });

        return updated;
      } catch (error) {
        // Doublon si changement de code
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
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
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }

      // Vérifier que l'item appartient au tenant
      const existing = await db.catalogueItem.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.tenantId !== tenantId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article non trouvé.",
        });
      }

      // Vérifier qu'il n'y a pas de réservations actives sur cet article
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

      await db.catalogueItem.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
