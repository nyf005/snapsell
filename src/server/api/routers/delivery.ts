import { TRPCError } from "@trpc/server";

import { canManageGrid } from "~/lib/rbac";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  deleteDeliveryFeeCommuneInputSchema,
  deleteDeliveryZoneInputSchema,
  setInteriorDeliveryFeeInputSchema,
  upsertDeliveryFeeCommuneInputSchema,
  upsertDeliveryZoneInputSchema,
} from "./delivery.schema";

const INTERIOR_ZONE_NAME = "Intérieur du pays";

function checkDeliveryAccess(role: string) {
  if (!canManageGrid(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Seuls Owner et Manager peuvent gérer les frais de livraison.",
    });
  }
}

export const deliveryRouter = createTRPCRouter({
  getDeliveryZones: protectedProcedure.query(async ({ ctx }) => {
    checkDeliveryAccess(ctx.session.user.role as string);
    const tenantId = ctx.session.user.tenantId!;
    const zones = await db.deliveryZone.findMany({
      where: { tenantId },
      include: { communes: true },
      orderBy: { name: "asc" },
    });
    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      amountCents: z.amountCents,
      communeNames: z.communes.map((c) => c.communeName),
      updatedAt: z.updatedAt,
    }));
  }),

  upsertDeliveryZone: protectedProcedure
    .input(upsertDeliveryZoneInputSchema)
    .mutation(async ({ ctx, input }) => {
      checkDeliveryAccess(ctx.session.user.role as string);
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }
      const zoneId = input.id;
      const communeNames = [...new Set(input.communeNames.filter(Boolean))];

      if (zoneId) {
        const existing = await db.deliveryZone.findFirst({
          where: { id: zoneId, tenantId },
        });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Zone introuvable." });
        }
        await db.$transaction(async (tx) => {
          await tx.deliveryZoneCommune.deleteMany({ where: { zoneId } });
          await tx.deliveryZone.update({
            where: { id: zoneId },
            data: { name: input.name, amountCents: input.amountCents },
          });
          for (const name of communeNames) {
            await tx.deliveryZoneCommune.create({
              data: { zoneId, communeName: name },
            });
          }
        });
        return { id: zoneId };
      }

      const zone = await db.deliveryZone.create({
        data: {
          tenantId,
          name: input.name,
          amountCents: input.amountCents,
          communes: {
            create: communeNames.map((communeName) => ({ communeName })),
          },
        },
      });
      return { id: zone.id };
    }),

  deleteDeliveryZone: protectedProcedure
    .input(deleteDeliveryZoneInputSchema)
    .mutation(async ({ ctx, input }) => {
      checkDeliveryAccess(ctx.session.user.role as string);
      const tenantId = ctx.session.user.tenantId!;
      await db.deliveryZone.deleteMany({
        where: { id: input.zoneId, tenantId },
      });
      return { ok: true };
    }),

  /** Tarif unique pour l'intérieur du pays (Côte d'Ivoire). Stocké comme une zone sans communes. */
  getInteriorDeliveryFee: protectedProcedure.query(async ({ ctx }) => {
    checkDeliveryAccess(ctx.session.user.role as string);
    const tenantId = ctx.session.user.tenantId!;
    const zone = await db.deliveryZone.findFirst({
      where: { tenantId, name: INTERIOR_ZONE_NAME },
    });
    return { amountCents: zone?.amountCents ?? null };
  }),

  setInteriorDeliveryFee: protectedProcedure
    .input(setInteriorDeliveryFeeInputSchema)
    .mutation(async ({ ctx, input }) => {
      checkDeliveryAccess(ctx.session.user.role as string);
      const tenantId = ctx.session.user.tenantId!;
      const existing = await db.deliveryZone.findFirst({
        where: { tenantId, name: INTERIOR_ZONE_NAME },
      });
      if (existing) {
        await db.deliveryZone.update({
          where: { id: existing.id },
          data: { amountCents: input.amountCents },
        });
      } else {
        await db.deliveryZone.create({
          data: {
            tenantId,
            name: INTERIOR_ZONE_NAME,
            amountCents: input.amountCents,
          },
        });
      }
      return { ok: true };
    }),

  getDeliveryFeeCommunes: protectedProcedure.query(async ({ ctx }) => {
    checkDeliveryAccess(ctx.session.user.role as string);
    const tenantId = ctx.session.user.tenantId!;
    const rows = await db.deliveryFeeCommune.findMany({
      where: { tenantId },
      orderBy: { communeName: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      communeName: r.communeName,
      amountCents: r.amountCents,
      updatedAt: r.updatedAt,
    }));
  }),

  upsertDeliveryFeeCommune: protectedProcedure
    .input(upsertDeliveryFeeCommuneInputSchema)
    .mutation(async ({ ctx, input }) => {
      checkDeliveryAccess(ctx.session.user.role as string);
      const tenantId = ctx.session.user.tenantId!;
      await db.deliveryFeeCommune.upsert({
        where: {
          tenantId_communeName: { tenantId, communeName: input.communeName },
        },
        create: {
          tenantId,
          communeName: input.communeName,
          amountCents: input.amountCents,
        },
        update: {
          amountCents: input.amountCents,
        },
      });
      return { ok: true };
    }),

  deleteDeliveryFeeCommune: protectedProcedure
    .input(deleteDeliveryFeeCommuneInputSchema)
    .mutation(async ({ ctx, input }) => {
      checkDeliveryAccess(ctx.session.user.role as string);
      const tenantId = ctx.session.user.tenantId!;
      await db.deliveryFeeCommune.deleteMany({
        where: { tenantId, communeName: input.communeName },
      });
      return { ok: true };
    }),
});
