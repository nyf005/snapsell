import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Prisma } from "../../../../generated/prisma";
import { decrypt, encrypt } from "~/lib/crypto";
import { createTRPCRouter, opsProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { validateMetaCredentials } from "~/server/messaging/providers/meta/credentials";

const tenantIdSchema = z.object({ tenantId: z.string().cuid() });

async function getWhatsAppTenant(tenantId: string) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      subscriptionPlan: true,
      metaPhoneNumberId: true,
      metaWabaId: true,
      metaAccessToken: true,
      metaCoexistence: true,
      metaHistorySyncStatus: true,
      metaContactsSyncStatus: true,
      metaHistorySyncAt: true,
      updatedAt: true,
      users: {
        where: { role: "OWNER" },
        select: { email: true },
        take: 1,
      },
    },
  });

  if (!tenant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Boutique introuvable." });
  }
  return tenant;
}

export const opsWhatsappRouter = createTRPCRouter({
  list: opsProcedure
    .input(z.object({ query: z.string().trim().max(100).default("") }))
    .query(async ({ input }) => {
      const query = input.query;
      const tenants = await db.tenant.findMany({
        where: query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { metaPhoneNumberId: { contains: query, mode: "insensitive" } },
                {
                  users: {
                    some: { email: { contains: query, mode: "insensitive" } },
                  },
                },
              ],
            }
          : undefined,
        select: {
          id: true,
          name: true,
          metaPhoneNumberId: true,
          metaWabaId: true,
          metaAccessToken: true,
          users: {
            where: { role: "OWNER" },
            select: { email: true },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
        take: 50,
      });

      return tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        ownerEmail: tenant.users[0]?.email ?? null,
        phoneNumberId: tenant.metaPhoneNumberId,
        connected: Boolean(
          tenant.metaPhoneNumberId && tenant.metaWabaId && tenant.metaAccessToken,
        ),
      }));
    }),

  diagnostic: opsProcedure.input(tenantIdSchema).query(async ({ input }) => {
    const tenant = await getWhatsAppTenant(input.tenantId);
    const recentInterventions = await db.eventLog.findMany({
      where: {
        tenantId: input.tenantId,
        eventType: { startsWith: "ops.whatsapp_" },
      },
      select: {
        id: true,
        eventType: true,
        actorType: true,
        payload: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      id: tenant.id,
      name: tenant.name,
      ownerEmail: tenant.users[0]?.email ?? null,
      subscriptionPlan: tenant.subscriptionPlan,
      phoneNumberId: tenant.metaPhoneNumberId,
      wabaId: tenant.metaWabaId,
      hasAccessToken: Boolean(tenant.metaAccessToken),
      connected: Boolean(
        tenant.metaPhoneNumberId && tenant.metaWabaId && tenant.metaAccessToken,
      ),
      coexistence: tenant.metaCoexistence,
      historySyncStatus: tenant.metaHistorySyncStatus,
      contactsSyncStatus: tenant.metaContactsSyncStatus,
      historySyncAt: tenant.metaHistorySyncAt,
      updatedAt: tenant.updatedAt,
      recentInterventions,
    };
  }),

  testConnection: opsProcedure
    .input(tenantIdSchema)
    .mutation(async ({ ctx, input }) => {
      const tenant = await getWhatsAppTenant(input.tenantId);
      if (!tenant.metaPhoneNumberId || !tenant.metaAccessToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La configuration WhatsApp est incomplète.",
        });
      }

      await validateMetaCredentials({
        phoneId: tenant.metaPhoneNumberId,
        wabaId: tenant.metaWabaId,
        accessToken: decrypt(tenant.metaAccessToken),
      });
      await db.eventLog.create({
        data: {
          tenantId: input.tenantId,
          eventType: "ops.whatsapp_connection_tested",
          entityType: "tenant",
          entityId: input.tenantId,
          correlationId: crypto.randomUUID(),
          actorType: "ops",
          payload: { actorUserId: ctx.session.user.id, result: "success" },
        },
      });
      return { ok: true };
    }),

  updateConfig: opsProcedure
    .input(
      tenantIdSchema.extend({
        phoneNumberId: z.string().trim().min(1),
        wabaId: z.string().trim().min(1),
        accessToken: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenant = await getWhatsAppTenant(input.tenantId);
      const accessToken = input.accessToken
        ? input.accessToken
        : tenant.metaAccessToken
          ? decrypt(tenant.metaAccessToken)
          : null;

      if (!accessToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ajoutez un Access Token pour cette première configuration.",
        });
      }

      await validateMetaCredentials({
        phoneId: input.phoneNumberId,
        wabaId: input.wabaId,
        accessToken,
      });

      try {
        await db.$transaction(async (tx) => {
          await tx.tenant.update({
            where: { id: input.tenantId },
            data: {
              metaPhoneNumberId: input.phoneNumberId,
              metaWabaId: input.wabaId,
              ...(input.accessToken
                ? { metaAccessToken: encrypt(input.accessToken) }
                : {}),
            },
          });
          await tx.eventLog.create({
            data: {
              tenantId: input.tenantId,
              eventType: "ops.whatsapp_config_updated",
              entityType: "tenant",
              entityId: input.tenantId,
              correlationId: crypto.randomUUID(),
              actorType: "ops",
              payload: {
                actorUserId: ctx.session.user.id,
                phoneNumberIdChanged:
                  tenant.metaPhoneNumberId !== input.phoneNumberId,
                wabaIdChanged: tenant.metaWabaId !== input.wabaId,
                accessTokenChanged: Boolean(input.accessToken),
              },
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ce Phone Number ID appartient déjà à une autre boutique.",
          });
        }
        throw error;
      }

      return { ok: true };
    }),
});
