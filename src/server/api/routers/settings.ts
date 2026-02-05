import { TRPCError } from "@trpc/server";
import { Prisma } from "../../../../generated/prisma";

import { canManageGrid } from "~/lib/rbac";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  setCategoryPricesInputSchema,
  setWhatsAppConfigInputSchema,
} from "./settings.schema";

export const settingsRouter = createTRPCRouter({
  getCategoryPrices: protectedProcedure.query(async ({ ctx }) => {
    if (!canManageGrid(ctx.session.user.role as string)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seuls Owner et Manager peuvent consulter la grille de prix.",
      });
    }
    const tenantId = ctx.session.user.tenantId;
    const rows = await db.categoryPrice.findMany({
      where: { tenantId },
      orderBy: { categoryLetter: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      categoryLetter: r.categoryLetter,
      amountCents: r.amountCents,
      description: r.description ?? undefined,
      updatedAt: r.updatedAt,
    }));
  }),

  setCategoryPrices: protectedProcedure
    .input(setCategoryPricesInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls Owner et Manager peuvent modifier la grille.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (tenantId == null || tenantId === "") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }

      const codesToKeep = input.items.map((i) => i.categoryLetter);

      await db.$transaction(async (tx) => {
        if (codesToKeep.length > 0) {
          await tx.categoryPrice.deleteMany({
            where: {
              tenantId,
              categoryLetter: { notIn: codesToKeep },
            },
          });
        } else {
          await tx.categoryPrice.deleteMany({ where: { tenantId } });
        }
        for (const item of input.items) {
          await tx.categoryPrice.upsert({
            where: {
              tenantId_categoryLetter: { tenantId, categoryLetter: item.categoryLetter },
            },
            create: {
              tenantId,
              categoryLetter: item.categoryLetter,
              amountCents: item.amountCents,
              description: item.description ?? null,
            },
            update: {
              amountCents: item.amountCents,
              description: item.description ?? null,
            },
          });
        }
      });

      return { ok: true };
    }),

  getWhatsAppConfig: protectedProcedure.query(async ({ ctx }) => {
    if (!canManageGrid(ctx.session.user.role as string)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seuls Owner et Manager peuvent consulter la config WhatsApp.",
      });
    }
    const tenantId = ctx.session.user.tenantId;
    if (tenantId == null || tenantId === "") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Tenant non identifié.",
      });
    }
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { whatsappPhoneNumber: true },
    });
    return {
      whatsappPhoneNumber: tenant?.whatsappPhoneNumber ?? null,
    };
  }),

  setWhatsAppConfig: protectedProcedure
    .input(setWhatsAppConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls Owner et Manager peuvent modifier la config WhatsApp.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (tenantId == null || tenantId === "") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }
      const phone = input.whatsappPhoneNumber;
      if (phone != null) {
        const existing = await db.tenant.findFirst({
          where: {
            whatsappPhoneNumber: phone,
            id: { not: tenantId },
          },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ce numéro est déjà associé à un autre vendeur.",
          });
        }
      }
      try {
        await db.tenant.update({
          where: { id: tenantId },
          data: { whatsappPhoneNumber: phone },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ce numéro est déjà associé à un autre vendeur.",
          });
        }
        throw err;
      }
      return { ok: true };
    }),
});
