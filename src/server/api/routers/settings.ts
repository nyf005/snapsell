import { TRPCError } from "@trpc/server";
import { Prisma } from "../../../../generated/prisma";

import {
  normalizeMetaPhone,
} from "~/lib/validations/phone";
import { workerLogger } from "~/lib/logger";
import { encrypt } from "~/lib/crypto";
import { getProviderForTenant } from "~/server/messaging/service";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  managerProcedure,
} from "~/server/api/trpc";
import {
  connectWhatsAppEmbeddedInputSchema,
  setCategoryPricesInputSchema,
  setFaqSettingsInputSchema,
  setMetaConfigInputSchema,
} from "./settings.schema";
import {
  MetaEmbeddedSignupError,
  resolveMetaEmbeddedSignupCredentials,
} from "~/server/messaging/providers/meta/embedded-signup";

import { env } from "~/env";

/**
 * Valide les identifiants Meta auprès de l'API Graph.
 * Centralise la logique utilisée par setWhatsAppConfig et testWhatsAppConnection.
 */
async function validateMetaCredentials(opts: {
  phoneId: string;
  wabaId: string | null;
  accessToken: string;
}): Promise<void> {
  const { phoneId, wabaId, accessToken } = opts;
  try {
    if (wabaId) {
      // Validation stricte : le phoneId doit figurer dans la liste des numéros du WABA
      const metaRes = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/phone_numbers?limit=100`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!metaRes.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Credentials WhatsApp invalides. Vérifie ton WABA ID et ton Access Token Meta.",
        });
      }
      const body = (await metaRes.json()) as { data?: Array<{ id: string }> };
      if (!(body.data ?? []).some((p) => p.id === phoneId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Le Phone Number ID ne correspond pas à ce compte WABA. Vérifie tes identifiants Meta.",
        });
      }
    } else {
      // Fallback si wabaId absent : valide juste token + phoneId
      const metaRes = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!metaRes.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Credentials WhatsApp invalides. Vérifie ton Phone Number ID et ton Access Token Meta.",
        });
      }
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Impossible de contacter l'API Meta. Réessaie dans quelques instants.",
    });
  }
}

export const settingsRouter = createTRPCRouter({
  getCategoryPrices: managerProcedure.query(async ({ ctx }) => {
    const rows = await db.categoryPrice.findMany({
      where: { tenantId: ctx.session.user.tenantId },
      orderBy: { categoryLetter: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      categoryLetter: r.categoryLetter,
      amount: r.amount,
      description: r.description ?? undefined,
      updatedAt: r.updatedAt,
    }));
  }),

  setCategoryPrices: managerProcedure
    .input(setCategoryPricesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
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
              amount: item.amount,
              description: item.description ?? null,
            },
            update: {
              amount: item.amount,
              description: item.description ?? null,
            },
          });
        }
      });

      return { ok: true };
    }),

  getWhatsAppConfig: managerProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const [tenant, primarySellerPhone] = await Promise.all([
      db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          metaPhoneNumberId: true,
          metaWabaId: true,
          metaAccessToken: true,
        },
      }),
      db.sellerPhone.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: { phoneNumber: true },
      }),
    ]);
    return {
      metaPhoneNumberId: tenant?.metaPhoneNumberId ?? null,
      metaWabaId: tenant?.metaWabaId ?? null,
      metaBusinessPhoneNumber: primarySellerPhone?.phoneNumber ?? null,
      hasAccessToken: !!(tenant?.metaAccessToken),
    };
  }),

  setWhatsAppConfig: managerProcedure
    .input(setMetaConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      const phoneId = input.metaPhoneNumberId;

      if (phoneId != null) {
        const existing = await db.tenant.findFirst({
          where: {
            metaPhoneNumberId: phoneId,
            id: { not: tenantId },
          },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ce Phone Number ID est déjà associé à un autre vendeur.",
          });
        }
      }

      // Valider les credentials auprès de l'API Meta avant toute sauvegarde.
      let tokenToValidate = input.metaAccessToken;
      let wabaIdToValidate = input.metaWabaId;

      if ((tokenToValidate === null || wabaIdToValidate === null) && phoneId != null) {
        const adapter = await getProviderForTenant(tenantId);
        tokenToValidate ??= adapter?.getAccessToken() ?? null;
        
        if (wabaIdToValidate === null) {
          const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { metaWabaId: true } });
          wabaIdToValidate = t?.metaWabaId ?? null;
        }
      }

      if (phoneId != null && tokenToValidate != null) {
        await validateMetaCredentials({
          phoneId,
          wabaId: wabaIdToValidate,
          accessToken: tokenToValidate,
        });
      }

      // H1-fix: ne pas écraser le token existant si l'utilisateur n'en a pas saisi un nouveau
      const data: Record<string, string | null> = {
        metaPhoneNumberId: phoneId,
        metaWabaId: input.metaWabaId,
      };
      if (input.metaAccessToken != null) {
        data.metaAccessToken = encrypt(input.metaAccessToken);
      }
      try {
        await db.tenant.update({
          where: { id: tenantId },
          data,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ce Phone Number ID est déjà associé à un autre vendeur.",
          });
        }
        throw err;
      }
      return { ok: true };
    }),

  testWhatsAppConnection: managerProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, metaPhoneNumberId: true, metaWabaId: true, metaAccessToken: true },
    });
    const adapter = await getProviderForTenant(tenant);
    if (!tenant || !adapter || !tenant.metaWabaId || !tenant.metaPhoneNumberId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Configuration incomplète ou invalide. Enregistrez vos identifiants Meta d'abord.",
      });
    }
    
    await validateMetaCredentials({
      phoneId: tenant.metaPhoneNumberId,
      wabaId: tenant.metaWabaId,
      accessToken: adapter.getAccessToken(),
    });

    return { ok: true };
  }),

  connectWhatsAppEmbedded: managerProcedure
    .input(connectWhatsAppEmbeddedInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      const appId = env.META_APP_ID ?? process.env.META_APP_ID;
      const appSecret = env.META_APP_SECRET ?? process.env.META_APP_SECRET;

      try {
        const credentials = await resolveMetaEmbeddedSignupCredentials({
          tenantId,
          code: input.code,
          appId: appId ?? "",
          appSecret: appSecret ?? "",
        });

        const normalizedBusinessPhone = normalizeMetaPhone(
          credentials.businessPhoneNumber,
        );

        await db.$transaction(async (tx) => {
          await tx.tenant.update({
            where: { id: tenantId },
            data: {
              metaPhoneNumberId: credentials.phoneNumberId,
              metaWabaId: credentials.wabaId,
              metaAccessToken: encrypt(credentials.accessToken),
            },
          });

          await tx.sellerPhone.upsert({
            where: {
              tenantId_phoneNumber: {
                tenantId,
                phoneNumber: normalizedBusinessPhone,
              },
            },
            create: {
              tenantId,
              phoneNumber: normalizedBusinessPhone,
            },
            update: {},
          });
          workerLogger.info("Embedded signup seller phone ensured", {
            tenantId,
            phoneNumber: normalizedBusinessPhone,
          });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join(",")
            : "";
          if (target === "" || target.includes("meta_phone_number_id")) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Ce Phone Number ID est déjà associé à un autre vendeur.",
            });
          }
        }

        if (error instanceof MetaEmbeddedSignupError) {
          if (error.kind === "BAD_REQUEST") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error.message,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              error.kind === "CONFIG_ERROR"
                ? "Configuration Meta incomplète côté serveur."
                : error.message,
          });
        }

        if (error instanceof Error) {
          workerLogger.error("Failed to auto-add seller phone after embedded signup", error, {
            tenantId,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Impossible de finaliser la connexion WhatsApp via Meta.",
        });
      }

      return { ok: true };
    }),

  getFaqSettings: managerProcedure.query(async ({ ctx }) => {
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.session.user.tenantId },
      select: { faqDelivery: true, faqPayment: true, faqLocation: true, faqAvailability: true },
    });

    return {
      faqDelivery: tenant?.faqDelivery ?? null,
      faqPayment: tenant?.faqPayment ?? null,
      faqLocation: tenant?.faqLocation ?? null,
      faqAvailability: tenant?.faqAvailability ?? null,
    };
  }),

  setFaqSettings: managerProcedure
    .input(setFaqSettingsInputSchema)
    .mutation(async ({ ctx, input }) => {
      await db.tenant.update({
        where: { id: ctx.session.user.tenantId },
        data: {
          faqDelivery: input.faqDelivery ?? null,
          faqPayment: input.faqPayment ?? null,
          faqLocation: input.faqLocation ?? null,
          faqAvailability: input.faqAvailability ?? null,
        },
      });

      return { ok: true };
    }),
});
