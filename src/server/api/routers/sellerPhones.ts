import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { e164PhoneSchema } from "~/lib/validations/phone";
import { canManageGrid } from "~/lib/rbac";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

const addSellerPhoneInputSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, "Le numéro est requis")
    .transform((s) => s.trim())
    .pipe(e164PhoneSchema),
});

const removeSellerPhoneInputSchema = z.object({
  id: z.string().min(1, "L’identifiant est requis"),
});

export const sellerPhonesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (!canManageGrid(ctx.session.user.role as string)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seuls Owner et Manager peuvent gérer les numéros vendeur.",
      });
    }
    const tenantId = ctx.session.user.tenantId;
    if (tenantId == null || tenantId === "") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Tenant non identifié.",
      });
    }
    const list = await db.sellerPhone.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true, phoneNumber: true, createdAt: true },
    });
    return list;
  }),

  add: protectedProcedure
    .input(addSellerPhoneInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls Owner et Manager peuvent ajouter un numéro vendeur.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (tenantId == null || tenantId === "") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }
      const phoneNumber = input.phoneNumber;
      const existing = await db.sellerPhone.findUnique({
        where: {
          tenantId_phoneNumber: { tenantId, phoneNumber },
        },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ce numéro est déjà enregistré pour ce compte.",
        });
      }
      const created = await db.sellerPhone.create({
        data: { tenantId, phoneNumber },
        select: { id: true, phoneNumber: true, createdAt: true },
      });
      return created;
    }),

  remove: protectedProcedure
    .input(removeSellerPhoneInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls Owner et Manager peuvent retirer un numéro vendeur.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (tenantId == null || tenantId === "") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }
      const deleted = await db.sellerPhone.deleteMany({
        where: { id: input.id, tenantId },
      });
      if (deleted.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Numéro vendeur introuvable ou déjà supprimé.",
        });
      }
      return { ok: true };
    }),
});
