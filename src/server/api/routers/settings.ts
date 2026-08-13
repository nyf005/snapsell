import { TRPCError } from "@trpc/server";

import { appError } from "~/server/api/errors";
import { Prisma } from "../../../../generated/prisma";

import {
  normalizeMetaPhone,
} from "~/lib/validations/phone";
import { workerLogger } from "~/lib/logger";
import { decrypt, encrypt } from "~/lib/crypto";
import { getProviderForTenant } from "~/server/messaging/service";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  managerProcedure,
} from "~/server/api/trpc";
import {
  setCategoryPricesInputSchema,
  setMetaConfigInputSchema,
  connectWhatsAppEmbeddedInputSchema,
  setFaqSettingsInputSchema,
  listCategoryPricesInputSchema,
  setBusinessConfigInputSchema,
  selectMetaCatalogInputSchema,
  selectWhatsAppTemplateInputSchema,
} from "./settings.schema";
import {
  MetaEmbeddedSignupError,
  startCoexistenceSync,
  resolveMetaEmbeddedSignupCredentials,
} from "~/server/messaging/providers/meta/embedded-signup";

import { env } from "~/env";

type WhatsAppTemplate = {
  id?: string;
  name: string;
  language: string;
  category: string;
  status: string;
};

async function getTenantMetaTemplateAccess(tenantId: string): Promise<{
  metaWabaId: string;
  metaPhoneNumberId: string;
  metaAccessToken: string;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string | null;
  whatsappTemplateCategory: string | null;
  accessToken: string;
}> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      metaWabaId: true,
      metaPhoneNumberId: true,
      metaAccessToken: true,
      whatsappTemplateName: true,
      whatsappTemplateLanguage: true,
      whatsappTemplateCategory: true,
    },
  });

  if (!tenant?.metaWabaId || !tenant.metaPhoneNumberId || !tenant.metaAccessToken) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Connectez d'abord votre compte WhatsApp Business.",
    });
  }

  return {
    metaWabaId: tenant.metaWabaId,
    metaPhoneNumberId: tenant.metaPhoneNumberId,
    metaAccessToken: tenant.metaAccessToken,
    whatsappTemplateName: tenant.whatsappTemplateName,
    whatsappTemplateLanguage: tenant.whatsappTemplateLanguage,
    whatsappTemplateCategory: tenant.whatsappTemplateCategory,
    accessToken: decrypt(tenant.metaAccessToken),
  };
}

async function fetchWhatsAppTemplatesFromMeta(opts: {
  wabaId: string;
  accessToken: string;
}): Promise<WhatsAppTemplate[]> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(opts.wabaId)}/message_templates?fields=id,name,language,category,status&limit=100`,
    { headers: { Authorization: `Bearer ${opts.accessToken}` } },
  );

  if (!res.ok) {
    throw appError("BAD_REQUEST", "whatsapp.missingPermissions", {
      logMessage: "meta template list refused",
    });
  }

  const body = (await res.json()) as { data?: WhatsAppTemplate[] };
  return (body.data ?? []).map((template) => ({
    id: template.id,
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
  }));
}

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
        throw appError("BAD_REQUEST", "whatsapp.invalidCredentials", {
          logMessage: "meta phone_numbers lookup refused",
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

/** Fenêtre accordée par Meta pour lancer la reprise après l'intégration. */
const HISTORY_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

export const settingsRouter = createTRPCRouter({
  getCategoryPrices: managerProcedure
    .input(listCategoryPricesInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 20;
      const rows = await db.categoryPrice.findMany({
        where: { tenantId: ctx.session.user.tenantId },
        orderBy: { categoryLetter: "asc" },
        take: limit + 1,
        skip: input.cursor ? 1 : 0,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });
      const items = rows.slice(0, limit).map((r) => ({
        id: r.id,
        categoryLetter: r.categoryLetter,
        amount: r.amount,
        description: r.description ?? undefined,
        updatedAt: r.updatedAt,
      }));
      const nextCursor = rows.length > limit ? rows[limit - 1]?.id : undefined;
      return { items, nextCursor };
    }),

  setCategoryPrices: managerProcedure
    .input(setCategoryPricesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      const codesToKeep = input.items.map((i) => i.categoryLetter);

      // Description obligatoire pour les nouvelles catégories (pas pour les existantes).
      const existing = await db.categoryPrice.findMany({
        where: { tenantId },
        select: { categoryLetter: true },
      });
      const existingLetters = new Set(existing.map((r) => r.categoryLetter));
      const missingDesc = input.items.filter(
        (i) => !existingLetters.has(i.categoryLetter) && !i.description?.trim(),
      );
      if (missingDesc.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Description requise pour les nouvelles catégories : ${missingDesc.map((i) => i.categoryLetter).join(", ")}.`,
        });
      }

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
          metaCoexistence: true,
          metaHistorySyncStatus: true,
          metaContactsSyncStatus: true,
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
      /*
        `null` (indéterminé) est transmis tel quel. L'écrasait en `false`, ce qui
        faisait disparaître de l'écran l'état de la reprise — donc l'erreur, donc
        le bouton « Réessayer » — précisément dans le cas où la détection avait
        échoué et où la reprise avait le plus de chances d'avoir mal tourné.
      */
      coexistence: tenant?.metaCoexistence ?? null,
      // "requested" | "in_progress" | "completed" | "declined" | "failed"
      historySyncStatus: tenant?.metaHistorySyncStatus ?? null,
      // "requested" | "completed" | "failed" — indépendant de l'historique.
      contactsSyncStatus: tenant?.metaContactsSyncStatus ?? null,
    };
  }),

  /**
   * ── UNE PANNE PASSAGÈRE NE DOIT PAS COÛTER L'HISTORIQUE ──────────────────
   *
   * Un échec marquait la synchronisation `failed` sans aucun recours : l'écran
   * ne proposait que d'écrire au support, alors que la fenêtre de 24 h continue
   * de courir. Une base momentanément indisponible chez Meta suffisait donc à
   * perdre définitivement les conversations d'une boutique.
   *
   * Cette reprise ne vaut que dans la fenêtre. Passé 24 h, Meta refuse — mieux
   * vaut le dire franchement que de laisser réessayer un bouton sans effet.
   */
  retryHistorySync: managerProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        metaPhoneNumberId: true,
        metaAccessToken: true,
        metaHistorySyncAt: true,
      },
    });

    if (!tenant?.metaPhoneNumberId || !tenant.metaAccessToken) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "WhatsApp n'est pas connecté.",
      });
    }

    const startedAt = tenant.metaHistorySyncAt;
    const elapsedMs = startedAt ? Date.now() - startedAt.getTime() : Number.POSITIVE_INFINITY;
    if (elapsedMs > HISTORY_SYNC_WINDOW_MS) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Le délai de 24 heures accordé par WhatsApp est dépassé : vos anciennes conversations ne peuvent plus être récupérées.",
      });
    }

    const sync = await startCoexistenceSync({
      phoneNumberId: tenant.metaPhoneNumberId,
      accessToken: decrypt(tenant.metaAccessToken),
    });

    await db.tenant.update({
      where: { id: tenantId },
      // `metaHistorySyncAt` n'est pas touché : la fenêtre part de l'intégration
      // chez Meta, pas de nos tentatives. La repousser mentirait sur le délai
      // restant et ferait réessayer bien après que Meta ait cessé d'accepter.
      data: { metaContactsSyncStatus: sync.contacts },
    });

    /*
      Même règle monotone qu'ailleurs : un webhook retardé peut avoir marqué la
      reprise terminée pendant que l'appel à Meta était en vol. Écrire
      « demandé » par-dessus ferait revenir l'écran en arrière.
    */
    await db.tenant.updateMany({
      where: {
        id: tenantId,
        OR: [{ metaHistorySyncStatus: null }, { metaHistorySyncStatus: { not: "completed" } }],
      },
      data: { metaHistorySyncStatus: sync.history },
    });

    return { historySyncStatus: sync.history, contactsSyncStatus: sync.contacts };
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

      if ((tokenToValidate == null || wabaIdToValidate == null) && phoneId != null) {
        const adapter = await getProviderForTenant(tenantId);
        tokenToValidate ??= adapter?.getAccessToken() ?? null;
        
        if (wabaIdToValidate == null) {
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
          wabaId: input.wabaId,
          phoneNumberId: input.phoneNumberId,
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
              /*
                Ce que Meta a confirmé sur le numéro, pas le mode demandé à
                l'écran. `null` = indéterminé, ce qui fait quand même tenter la
                synchronisation plus bas.
              */
              metaCoexistence: credentials.coexistence,
              /*
                Une nouvelle connexion repart d'une reprise vierge : sans ça,
                le statut d'une connexion précédente survivrait et le garde
                ci-dessous prendrait une ancienne valeur pour une avance.
              */
              metaHistorySyncStatus: null,
              metaContactsSyncStatus: null,
              metaHistorySyncAt: null,
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

        /**
         * ── LA SYNCHRONISATION PART APRÈS L'ÉCRITURE, JAMAIS AVANT ────────
         *
         * Elle était déclenchée pendant la résolution des identifiants, donc
         * avant que `metaPhoneNumberId` n'existe en base. Meta pouvait alors
         * renvoyer un `history` ou un `smb_app_state_sync` sur une boutique
         * que le webhook ne savait pas encore résoudre — évènement jeté, et
         * rien pour le rattraper dans la fenêtre de 24 h.
         *
         * Ici, la transaction est validée : le webhook trouvera la boutique.
         *
         * `null` (indéterminé) déclenche quand même la tentative. Les deux
         * erreurs n'ont pas le même prix : un appel refusé sur un numéro
         * ordinaire ne coûte rien, une synchronisation omise coûte
         * l'historique.
         */
        if (credentials.coexistence !== false) {
          const sync = await startCoexistenceSync({
            phoneNumberId: credentials.phoneNumberId,
            accessToken: credentials.accessToken,
          });
          /*
            La date part sans garde. Elle était écrite dans le même `updateMany`
            que le statut : quand un webhook rapide avait déjà pris la main, la
            garde sautait l'écriture entière et `metaHistorySyncAt` restait nul —
            la reprise devenait alors impossible à relancer, le contrôle des 24 h
            n'ayant plus de point de départ.
          */
          await db.tenant.update({
            where: { id: tenantId },
            data: {
              metaHistorySyncAt: new Date(),
              metaContactsSyncStatus: sync.contacts,
            },
          });

          /*
            Le statut d'historique, lui, garde sa garde : Meta peut avoir déjà
            envoyé une première tranche pendant que cet appel revenait, et écrire
            « demandé » par-dessus « en cours » ferait reculer l'écran.
          */
          await db.tenant.updateMany({
            where: { id: tenantId, metaHistorySyncStatus: null },
            data: { metaHistorySyncStatus: sync.history },
          });
        }
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

        const isMetaError = 
          error instanceof MetaEmbeddedSignupError || 
          (error && typeof error === 'object' && 'name' in error && error.name === 'MetaEmbeddedSignupError');

        if (isMetaError) {
          const metaErr = error as MetaEmbeddedSignupError;
          if (metaErr.kind === "BAD_REQUEST") {
            // Le texte de Meta est en anglais et parle d'identifiants techniques :
            // il part dans les logs, pas à l'écran.
            throw appError("BAD_REQUEST", "whatsapp.metaRefused", {
              cause: metaErr,
              logMessage: metaErr.message,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              metaErr.kind === "CONFIG_ERROR"
                ? "Configuration Meta incomplète côté serveur."
                : metaErr.message,
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

  getBusinessConfig: managerProcedure.query(async ({ ctx }) => {
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.session.user.tenantId },
      select: {
        businessHoursStart: true,
        businessHoursEnd: true,
        businessTimezone: true,
        awayMessage: true,
        metaCatalogId: true,
        hasMetaCatalogSync: true,
      },
    });
    return {
      businessHoursStart: tenant?.businessHoursStart ?? null,
      businessHoursEnd: tenant?.businessHoursEnd ?? null,
      businessTimezone: tenant?.businessTimezone ?? "Africa/Abidjan",
      awayMessage: tenant?.awayMessage ?? null,
      metaCatalogId: tenant?.metaCatalogId ?? null,
      hasMetaCatalogSync: tenant?.hasMetaCatalogSync ?? false,
    };
  }),

  setBusinessConfig: managerProcedure
    .input(setBusinessConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      await db.tenant.update({
        where: { id: ctx.session.user.tenantId },
        data: {
          businessHoursStart: input.businessHoursStart ?? null,
          businessHoursEnd: input.businessHoursEnd ?? null,
          businessTimezone: input.businessTimezone ?? null,
          awayMessage: input.awayMessage ?? null,
        },
      });
      return { ok: true };
    }),

  fetchMetaCatalogs: managerProcedure.query(async ({ ctx }) => {
    const tenant = await db.tenant.findUnique({
      where: { id: ctx.session.user.tenantId },
      select: { metaWabaId: true, metaAccessToken: true },
    });
    if (!tenant?.metaWabaId || !tenant.metaAccessToken) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Connectez d'abord votre compte WhatsApp Business avant de récupérer les catalogues.",
      });
    }
    const { decrypt } = await import("~/lib/crypto");
    const accessToken = decrypt(tenant.metaAccessToken);
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(tenant.metaWabaId)}/product_catalogs?fields=id,name&limit=25`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw appError("BAD_REQUEST", "whatsapp.missingPermissions", {
        logMessage: "meta catalog list refused",
      });
    }
    const body = (await res.json()) as { data?: Array<{ id: string; name?: string }> };
    return (body.data ?? []).map((c) => ({ id: c.id, name: c.name ?? c.id }));
  }),

  selectMetaCatalog: managerProcedure
    .input(selectMetaCatalogInputSchema)
    .mutation(async ({ ctx, input }) => {
      await db.tenant.update({
        where: { id: ctx.session.user.tenantId },
        data: { metaCatalogId: input.catalogId, hasMetaCatalogSync: true },
      });
      return { ok: true };
    }),

  fetchWhatsAppTemplates: managerProcedure.query(async ({ ctx }) => {
    const tenant = await getTenantMetaTemplateAccess(ctx.session.user.tenantId);
    const templates = await fetchWhatsAppTemplatesFromMeta({
      wabaId: tenant.metaWabaId,
      accessToken: tenant.accessToken,
    });

    const sortedTemplates = [...templates].sort((a, b) => {
      if (a.status === "APPROVED" && b.status !== "APPROVED") return -1;
      if (a.status !== "APPROVED" && b.status === "APPROVED") return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      templates: sortedTemplates,
      selectedTemplate:
        tenant.whatsappTemplateName && tenant.whatsappTemplateLanguage
          ? {
              name: tenant.whatsappTemplateName,
              language: tenant.whatsappTemplateLanguage,
              category: tenant.whatsappTemplateCategory,
            }
          : null,
    };
  }),

  selectWhatsAppTemplate: managerProcedure
    .input(selectWhatsAppTemplateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenant = await getTenantMetaTemplateAccess(ctx.session.user.tenantId);
      const templates = await fetchWhatsAppTemplatesFromMeta({
        wabaId: tenant.metaWabaId,
        accessToken: tenant.accessToken,
      });
      const matchingTemplate = templates.find(
        (template) =>
          template.name === input.name &&
          template.language === input.language &&
          template.status === "APPROVED",
      );

      if (!matchingTemplate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sélectionnez un template WhatsApp approuvé.",
        });
      }

      await db.tenant.update({
        where: { id: ctx.session.user.tenantId },
        data: {
          whatsappTemplateName: matchingTemplate.name,
          whatsappTemplateLanguage: matchingTemplate.language,
          whatsappTemplateCategory: matchingTemplate.category,
        },
      });

      return { ok: true };
    }),
});
