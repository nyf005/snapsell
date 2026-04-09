import { TRPCError } from "@trpc/server";
import { Prisma } from "../../../../generated/prisma";

import { canManageGrid } from "~/lib/rbac";
import { normalizeAndValidatePhoneNumber } from "~/lib/validations/phone";
import { workerLogger } from "~/lib/logger";
import { encrypt, decrypt } from "~/lib/crypto";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  protectedProcedure,
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

function normalizeMetaBusinessPhoneToE164(metaDisplayPhone: string): string {
  const cleaned = metaDisplayPhone.replace(/[^\d+]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  return normalizeAndValidatePhoneNumber(withPlus);
}

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
      amount: r.amount,
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

  setWhatsAppConfig: protectedProcedure
    .input(setMetaConfigInputSchema)
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
      // Si l'utilisateur ne fournit pas token ou wabaId, on récupère les valeurs stockées.
      let tokenToValidate = input.metaAccessToken;
      let wabaIdToValidate = input.metaWabaId;

      if ((tokenToValidate === null || wabaIdToValidate === null) && phoneId != null) {
        const currentTenant = await db.tenant.findUnique({
          where: { id: tenantId },
          select: { metaAccessToken: true, metaWabaId: true },
        });
        tokenToValidate ??= currentTenant?.metaAccessToken
          ? decrypt(currentTenant.metaAccessToken)
          : null;
        wabaIdToValidate ??= currentTenant?.metaWabaId ?? null;
      }

      if (phoneId != null && tokenToValidate != null) {
        try {
          if (wabaIdToValidate != null) {
            // Validation stricte : le phoneId doit figurer dans la liste des numéros du WABA
            const metaRes = await fetch(
              `https://graph.facebook.com/v20.0/${encodeURIComponent(wabaIdToValidate)}/phone_numbers?access_token=${encodeURIComponent(tokenToValidate)}&limit=100`,
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
              `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}?access_token=${encodeURIComponent(tokenToValidate)}`,
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

  testWhatsAppConnection: protectedProcedure.mutation(async ({ ctx }) => {
    if (!canManageGrid(ctx.session.user.role as string)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seuls Owner et Manager peuvent tester la connexion WhatsApp.",
      });
    }
    const tenantId = ctx.session.user.tenantId;
    if (tenantId == null || tenantId === "") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
    }
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { metaPhoneNumberId: true, metaWabaId: true, metaAccessToken: true },
    });
    if (!tenant?.metaPhoneNumberId || !tenant?.metaWabaId || !tenant?.metaAccessToken) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Configuration incomplète. Enregistrez vos identifiants Meta d'abord.",
      });
    }
    const accessToken = decrypt(tenant.metaAccessToken);
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(tenant.metaWabaId)}/phone_numbers?access_token=${encodeURIComponent(accessToken)}&limit=100`,
      );
      if (!metaRes.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Credentials WhatsApp invalides. Vérifie ton Phone Number ID et ton Access Token Meta.",
        });
      }
      const body = (await metaRes.json()) as { data?: Array<{ id: string }> };
      if (!(body.data ?? []).some((p) => p.id === tenant.metaPhoneNumberId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Le Phone Number ID ne correspond pas à ce compte WABA.",
        });
      }
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Impossible de contacter l'API Meta. Réessaie dans quelques instants.",
      });
    }
    return { ok: true };
  }),

  connectWhatsAppEmbedded: protectedProcedure
    .input(connectWhatsAppEmbeddedInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls Owner et Manager peuvent connecter WhatsApp via Meta.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (tenantId == null || tenantId === "") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }

      const appId = env.META_APP_ID ?? process.env.META_APP_ID;
      const appSecret = env.META_APP_SECRET ?? process.env.META_APP_SECRET;

      try {
        const credentials = await resolveMetaEmbeddedSignupCredentials({
          tenantId,
          code: input.code,
          appId: appId ?? "",
          appSecret: appSecret ?? "",
        });

        const normalizedBusinessPhone = normalizeMetaBusinessPhoneToE164(
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
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ) {
          const target = Array.isArray((error as any).meta?.target)
            ? (error as any).meta.target.join(",")
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

      return {
        ok: true,
      };
    }),

  /** Phase 5.3: Get FAQ answers configured for this tenant. */
  getFaqSettings: protectedProcedure.query(async ({ ctx }) => {
    if (!canManageGrid(ctx.session.user.role as string)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Seuls Owner et Manager peuvent consulter les FAQ." });
    }
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { faqDelivery: true, faqPayment: true, faqLocation: true, faqAvailability: true },
    });

    return {
      faqDelivery: tenant?.faqDelivery ?? null,
      faqPayment: tenant?.faqPayment ?? null,
      faqLocation: tenant?.faqLocation ?? null,
      faqAvailability: tenant?.faqAvailability ?? null,
    };
  }),

  /** Phase 5.3: Save FAQ answers for this tenant. */
  setFaqSettings: protectedProcedure
    .input(setFaqSettingsInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Seuls Owner et Manager peuvent modifier les FAQ." });
      }
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });

      await db.tenant.update({
        where: { id: tenantId },
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
