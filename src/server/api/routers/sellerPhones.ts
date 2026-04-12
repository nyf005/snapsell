import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { e164PhoneSchema, normalizeIncomingPhone } from "~/lib/validations/phone";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  managerProcedure,
} from "~/server/api/trpc";

import { idSchema, phoneStringSchema } from "~/lib/validations/common";

const addSellerPhoneInputSchema = z.object({
  phoneNumber: phoneStringSchema.pipe(e164PhoneSchema),
});

const removeSellerPhoneInputSchema = z.object({
  id: idSchema,
});

export const sellerPhonesRouter = createTRPCRouter({
  list: managerProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    const list = await db.sellerPhone.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true, phoneNumber: true, createdAt: true },
    });
    return list;
  }),

  add: managerProcedure
    .input(addSellerPhoneInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;

      // Migration CI & Normalisation : stocker toujours en format 10 chiffres E.164
      const phoneNumber = normalizeIncomingPhone(input.phoneNumber);
      
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

  remove: managerProcedure
    .input(removeSellerPhoneInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      
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
