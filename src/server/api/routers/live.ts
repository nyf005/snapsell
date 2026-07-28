/**
 * Story 6.4 + 8.1: Live Ops — session courante (lecture seule), items, réservations, libérer une réservation.
 * Story 8.1: support CatalogueItem — releaseReservation sur catalogue_items si reservation.catalogueItemId.
 * Isolation tenant: tenantId depuis ctx.session.user.tenantId.
 */

import { TRPCError } from "@trpc/server";

import { appError } from "~/server/api/errors";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  releaseReservationInputSchema,
  sendProductCardInputSchema,
  addItemFromCatalogueInputSchema,
} from "./live.schema";
import { getCurrentSessionReadOnly, getOrCreateCurrentSession } from "~/server/live-session/service";
import { releaseReservation } from "~/server/live-item/reservation";
import type { StockTable } from "~/server/live-item/reservation";
import {
  createReservation,
  type CreateReservationResult,
} from "~/server/reservation/service";
import { logEvent, logWaitlistPromoted, logLiveSessionCreated, logLiveSessionClosed } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { workerLogger } from "~/lib/logger";
import { LiveSessionStatus } from "../../../../generated/prisma";
import { promoteSessionToCatalogue } from "~/server/catalogue/promoteSessionToCatalogue";
import { createLiveItem } from "~/server/live-item/createLiveItem";
import { getSessionInventory } from "~/server/live-session/getSessionInventory";

const ACTIVE_RESERVATION_STATUSES = ["reserved", "address_collected"] as const;

/** Masque le numéro client pour PII (ex. ***6789). */
function maskClientPhone(phone: string): string {
  if (phone.length <= 4) return "***";
  return "***" + phone.slice(-4);
}

export const liveRouter = createTRPCRouter({
  /** Une seule requête : session + items + reservations (1 appel getCurrentSessionReadOnly). */
  getLiveOpsData: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const session = await getCurrentSessionReadOnly(tenantId);
    if (!session) {
      return { session: null, waitlistCount: 0, items: [], reservations: [] };
    }

    const [items, reservations, waitlistCount] = await Promise.all([
      getSessionInventory(tenantId, session.id),
      db.reservation.findMany({
        where: {
          tenantId,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
          OR: [
            { liveSessionId: session.id },
            { catalogueItemId: { not: null }, liveSessionId: null },
          ],
        },
        orderBy: { expiresAt: "asc" },
        include: {
          liveItem: { select: { code: true } },
          catalogueItem: { select: { code: true } },
        },
      }),
      db.waitlist.count({
        where: { liveSessionId: session.id, tenantId },
      }),
    ]);

    return {
      session: { id: session.id, lastActivityAt: session.lastActivityAt },
      waitlistCount,
      items: items.map((i) => ({
        id: i.id,
        code: i.code,
        amount: i.amount,
        quantity: i.quantity,
        availableQty: i.availableQty,
        reservedQty: i.reservedQty,
        mediaStorageKey: i.mediaStorageKey,
      })),
      reservations: reservations.map((r) => ({
        id: r.id,
        liveItemId: r.liveItemId,
        catalogueItemId: r.catalogueItemId,
        code: r.catalogueItem?.code ?? r.liveItem?.code ?? "—",
        clientPhoneMasked: maskClientPhone(r.clientPhone),
        status: r.status,
        expiresAt: r.expiresAt,
      })),
    };
  }),

  getCurrentSession: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const session = await getCurrentSessionReadOnly(tenantId);
    if (!session) return null;
    return {
      id: session.id,
      lastActivityAt: session.lastActivityAt,
    };
  }),

  /** Story 8.3: Démarrer une session live explicitement (clic bouton dashboard). */
  startLive: protectedProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const session = await getOrCreateCurrentSession(tenantId);

    // Log uniquement si une nouvelle session a été créée
    if (session.created) {
      await logLiveSessionCreated(tenantId, session.id, ctx.session.user.id, { actorType: "seller" }).catch((err) => {
        workerLogger.warn("Failed to log live_session_created from startLive", {
          tenantId,
          liveSessionId: session.id,
          err,
        });
      });
    }

    return {
      id: session.id,
      lastActivityAt: session.lastActivityAt,
      created: session.created,
    };
  }),

  /** Terminer manuellement la session live active (bouton "Terminer la session"). */
  endLive: protectedProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const session = await getCurrentSessionReadOnly(tenantId);

    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Aucun live en cours." });
    }

    await db.liveSession.update({
      where: { id: session.id },
      data: { status: LiveSessionStatus.closed },
    });

    await logLiveSessionClosed(tenantId, session.id, `live-session-${session.id}`).catch((err) => {
      workerLogger.warn("Failed to log live_session_closed from endLive", {
        tenantId,
        liveSessionId: session.id,
        err,
      });
    });

    // Promouvoir les items restants vers le catalogue (même logique que le worker)
    await promoteSessionToCatalogue(tenantId, session.id).catch((err) => {
      workerLogger.warn("Failed to promote session to catalogue from endLive", {
        tenantId,
        liveSessionId: session.id,
        err,
      });
    });

    // Phase 6.1: Post-live summary — send to seller WhatsApp.
    // Awaité directement (pas de fire-and-forget) pour garantir l'envoi avant que
    // Vercel serverless termine la fonction. Erreur non-bloquante : catch silencieux.
    try {
      const [orderCount, pendingDeposit, pendingReservations, items, sellerPhone, sessionOrders] =
        await Promise.all([
        db.order.count({ where: { tenantId, reservation: { liveSessionId: session.id }, status: { not: "confirmed_pending_deposit" } } }),
        db.order.count({ where: { tenantId, reservation: { liveSessionId: session.id }, status: "confirmed_pending_deposit" } }),
        db.reservation.count({
          where: { tenantId, liveSessionId: session.id, status: { in: ["reserved", "address_collected"] } },
        }),
        getSessionInventory(tenantId, session.id),
        db.sellerPhone.findFirst({
          where: { tenantId },
          orderBy: { createdAt: "asc" },
          select: { phoneNumber: true },
        }),
        // Le chiffre d'affaires se lit sur les commandes, pas sur les réservations :
        // `reservedQty` est décrémenté à la confirmation, donc il ne compte que ce
        // qui est encore en attente.
        db.order.findMany({
          where: {
            tenantId,
            reservation: { liveSessionId: session.id },
            status: { notIn: ["confirmed_pending_deposit", "cancelled"] },
          },
          select: {
            reservation: {
              select: {
                quantity: true,
                liveItem: { select: { amount: true } },
                catalogueItem: { select: { amount: true } },
              },
            },
          },
        }),
      ]);

      // Encore vendable = stock possédé moins ce qui est déjà retenu.
      const unsoldItems = items.reduce((sum, i) => sum + (i.availableQty - i.reservedQty), 0);
      const revenue = sessionOrders.reduce((sum, o) => {
        const unitAmount =
          o.reservation.catalogueItem?.amount ?? o.reservation.liveItem?.amount ?? 0;
        return sum + unitAmount * o.reservation.quantity;
      }, 0);
      const revenueInFcfa = Math.round(revenue / 100);
      const liveDateLabel = session.createdAt.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      if (sellerPhone) {
        await writeToOutbox({
          tenantId,
          to: sellerPhone.phoneNumber,
          body: botMsg.seller.liveSummary({
            liveDateLabel,
            orderCount,
            pendingDeposit,
            pendingReservations,
            unsoldItems,
            revenue: revenueInFcfa,
          }),
          correlationId: `live-summary-${session.id}`,
        });
      }
    } catch (err) {
      workerLogger.warn("Failed to send post-live summary (Phase 6.1)", {
        tenantId,
        liveSessionId: session.id,
        err,
      });
    }

    return { success: true };
  }),

  getSessionItems: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const session = await getCurrentSessionReadOnly(tenantId);
    if (!session) return [];

    return getSessionInventory(tenantId, session.id);
  }),

  getSessionReservations: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const session = await getCurrentSessionReadOnly(tenantId);
    if (!session) return [];

    const reservations = await db.reservation.findMany({
      where: {
        tenantId,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        OR: [
          { liveSessionId: session.id },
          { catalogueItemId: { not: null }, liveSessionId: null },
        ],
      },
      orderBy: { expiresAt: "asc" },
      include: {
        liveItem: { select: { code: true } },
        catalogueItem: { select: { code: true } },
      },
    });

    return reservations.map((r) => ({
      id: r.id,
      liveItemId: r.liveItemId,
      catalogueItemId: r.catalogueItemId,
      code: r.catalogueItem?.code ?? r.liveItem?.code ?? "—",
      clientPhoneMasked: maskClientPhone(r.clientPhone),
      status: r.status,
      expiresAt: r.expiresAt,
    }));
  }),

  /**
   * Envoie une fiche produit WhatsApp interactive à un client (catalog product message).
   * Requiert que l'article soit synchronisé avec Meta (metaProductId non null).
   */
  sendProductCard: protectedProcedure
    .input(sendProductCardInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      const [item, tenant] = await Promise.all([
        db.catalogueItem.findUnique({
          where: { id: input.catalogueItemId },
          select: { id: true, tenantId: true, code: true, name: true, syncedToMeta: true, metaProductId: true },
        }),
        db.tenant.findUnique({
          where: { id: tenantId },
          select: { metaCatalogId: true, metaAccessToken: true },
        }),
      ]);

      if (!item || item.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article introuvable." });
      }
      if (!item.syncedToMeta || !item.metaProductId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "L'article doit être synchronisé avec Meta avant d'être partagé. Synchronisez-le d'abord depuis l'onglet Catalogue.",
        });
      }
      if (!tenant?.metaCatalogId || !tenant.metaAccessToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Configuration Meta incomplète. Vérifiez votre connexion WhatsApp Business.",
        });
      }

      const { botMsg } = await import("~/server/messaging/templates");
      await writeToOutbox({
        tenantId,
        to: input.clientPhone,
        ...botMsg.client.productCard(tenant.metaCatalogId, item.code),
        correlationId: `product-card-${item.id}-${Date.now()}`,
      });

      return { ok: true };
    }),

  /**
   * Ajoute un article du catalogue à la session live en cours.
   * Hérite du code, prix et image du catalogue — évite la re-saisie.
   */
  addItemFromCatalogue: protectedProcedure
    .input(addItemFromCatalogueInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      const catalogueItem = await db.catalogueItem.findUnique({
        where: { id: input.catalogueItemId },
        select: {
          id: true,
          tenantId: true,
          code: true,
          availableQty: true,
          mediaStorageKey: true,
        },
      });

      if (!catalogueItem || catalogueItem.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article catalogue introuvable." });
      }
      if (catalogueItem.availableQty <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Stock épuisé — cet article n'est plus disponible.",
        });
      }

      const result = await createLiveItem(tenantId, catalogueItem.code, {
        quantity: catalogueItem.availableQty,
        mediaStorageKey: catalogueItem.mediaStorageKey,
      });

      if (!result.success) {
        if ("duplicate" in result && result.duplicate) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Le code "${catalogueItem.code}" est déjà dans le live en cours.`,
          });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Code article invalide." });
      }

      return result.liveItem;
    }),

  releaseReservation: protectedProcedure
    .input(releaseReservationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      const reservation = await db.reservation.findFirst({
        where: { id: input.reservationId, tenantId },
        include: {
          liveItem: { select: { code: true } },
          catalogueItem: { select: { code: true } },
        },
      });

      if (!reservation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Réservation introuvable." });
      }

      if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status as typeof ACTIVE_RESERVATION_STATUSES[number])) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La réservation n'est plus active (déjà confirmée ou expirée).",
        });
      }

      // Story 8.1: polymorphisme — item catalogue ou live
      const itemIdForStock = reservation.catalogueItemId ?? reservation.liveItemId;
      const stockTable: StockTable = reservation.catalogueItemId ? "catalogue_items" : "live_items";
      const liveSessionId = reservation.liveSessionId;
      const correlationId = reservation.correlationId;

      if (!itemIdForStock) {
        throw appError("BAD_REQUEST", "reservation.invalid", {
          logMessage: "reservation has neither liveItemId nor catalogueItemId",
        });
      }

      await db.reservation.update({
        where: { id: reservation.id },
        data: { status: "expired" },
      });

      const releaseResult = await releaseReservation(tenantId, itemIdForStock, reservation.quantity, { correlationId, table: stockTable });
      if (!releaseResult.success) {
        await db.reservation.update({
          where: { id: reservation.id },
          data: { status: reservation.status },
        }).catch((rollbackErr) => {
          workerLogger.error("Rollback reservation status failed after releaseReservation failure", {
            reservationId: reservation.id,
            err: rollbackErr,
          });
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: "Impossible de libérer le stock (réservation déjà libérée ou incohérence). Réessayez.",
        });
      }

      const entityPayload: Record<string, string | null> = reservation.catalogueItemId
        ? { catalogue_item_id: reservation.catalogueItemId }
        : { live_item_id: reservation.liveItemId };

      await logEvent({
        tenantId,
        eventType: "reservation_expired",
        entityType: "reservation",
        entityId: reservation.id,
        correlationId,
        actorType: "seller",
        payload: {
          reservation_id: reservation.id,
          ...entityPayload,
          reason: "released_by_seller",
        },
      }).catch((err) => {
        workerLogger.warn("Event log reservation_expired (seller) failed", {
          reservationId: reservation.id,
          err,
        });
      });

      // Story 9.1: waitlist lookup — catalogue entries use catalogueItemId, live entries use liveItemId
      const isCatalogueWaitlist = !!reservation.catalogueItemId;
      const firstInWaitlist = isCatalogueWaitlist
        ? await db.waitlist.findFirst({
            where: { tenantId: reservation.tenantId, catalogueItemId: reservation.catalogueItemId },
            orderBy: { position: "asc" },
          })
        : reservation.liveItemId
          ? await db.waitlist.findFirst({
              where: { tenantId: reservation.tenantId, liveItemId: reservation.liveItemId, liveSessionId: liveSessionId ?? undefined },
              orderBy: { position: "asc" },
            })
          : null;

      if (!firstInWaitlist) {
        return { success: true };
      }

      // Story 9.1: promotion catalogue utilise catalogueItemId directement (plus de sentinel)
      const isCataloguePromotion = !!firstInWaitlist.catalogueItemId;
      const createResult: CreateReservationResult = isCataloguePromotion
        ? await createReservation(
            firstInWaitlist.tenantId,
            firstInWaitlist.liveSessionId,
            null,
            firstInWaitlist.clientPhone,
            firstInWaitlist.correlationId,
            { catalogueItemId: firstInWaitlist.catalogueItemId!, liveSessionId: firstInWaitlist.liveSessionId },
          )
        : await createReservation(
            firstInWaitlist.tenantId,
            firstInWaitlist.liveSessionId,
            firstInWaitlist.liveItemId,
            firstInWaitlist.clientPhone,
            firstInWaitlist.correlationId,
          );

      if (createResult.success) {
        await db.waitlist.delete({ where: { id: firstInWaitlist.id } }).catch((err) => {
          workerLogger.warn("Failed to delete waitlist entry after promotion", {
            waitlistId: firstInWaitlist.id,
            err,
          });
        });
        await logWaitlistPromoted(
          firstInWaitlist.tenantId,
          createResult.reservation.id,
          firstInWaitlist.catalogueItemId ?? firstInWaitlist.liveItemId ?? "unknown",
          firstInWaitlist.correlationId,
          { live_session_id: firstInWaitlist.liveSessionId ?? undefined },
        ).catch((err) => {
          workerLogger.warn("Event log waitlist_promoted failed", {
            reservationId: createResult.reservation.id,
            err,
          });
        });

        const code = reservation.catalogueItem?.code ?? reservation.liveItem?.code ?? "article";
        await writeToOutbox({
          tenantId: firstInWaitlist.tenantId,
          to: firstInWaitlist.clientPhone,
          ...botMsg.client.waitlistPromotedInteractive(code),
          correlationId: firstInWaitlist.correlationId,
        }).catch((err) => {
          workerLogger.warn("writeToOutbox after waitlist promotion failed", {
            waitlistId: firstInWaitlist.id,
            err,
          });
        });
      }

      return { success: true };
    }),
});
