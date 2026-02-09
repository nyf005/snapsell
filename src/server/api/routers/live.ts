/**
 * Story 6.4: Live Ops — session courante (lecture seule), items, réservations, libérer une réservation.
 * Isolation tenant: tenantId depuis ctx.session.user.tenantId.
 */

import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { releaseReservationInputSchema } from "./live.schema";
import { getCurrentSessionReadOnly } from "~/server/live-session/service";
import { releaseReservation } from "~/server/live-item/reservation";
import {
  createReservation,
  type CreateReservationResult,
} from "~/server/reservation/service";
import { logEvent, logWaitlistPromoted } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";
import { workerLogger } from "~/lib/logger";

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
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
    }
    const session = await getCurrentSessionReadOnly(tenantId);
    if (!session) {
      return { session: null, waitlistCount: 0, items: [], reservations: [] };
    }

    const [items, reservations, waitlistCount] = await Promise.all([
      db.liveItem.findMany({
        where: { liveSessionId: session.id, tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          amountCents: true,
          quantity: true,
          availableQty: true,
          reservedQty: true,
          mediaStorageKey: true,
        },
      }),
      db.reservation.findMany({
        where: {
          liveSessionId: session.id,
          tenantId,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        },
        orderBy: { expiresAt: "asc" },
        include: { liveItem: { select: { code: true } } },
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
        amountCents: i.amountCents,
        quantity: i.quantity,
        availableQty: i.availableQty,
        reservedQty: i.reservedQty,
        mediaStorageKey: i.mediaStorageKey,
      })),
      reservations: reservations.map((r) => ({
        id: r.id,
        liveItemId: r.liveItemId,
        code: r.liveItem.code,
        clientPhoneMasked: maskClientPhone(r.clientPhone),
        status: r.status,
        expiresAt: r.expiresAt,
      })),
    };
  }),

  getCurrentSession: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
    }
    const session = await getCurrentSessionReadOnly(tenantId);
    if (!session) return null;
    return {
      id: session.id,
      lastActivityAt: session.lastActivityAt,
    };
  }),

  getSessionItems: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
    }
    const session = await getCurrentSessionReadOnly(tenantId);
    if (!session) return [];

    const items = await db.liveItem.findMany({
      where: { liveSessionId: session.id, tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        amountCents: true,
        quantity: true,
        availableQty: true,
        reservedQty: true,
        mediaStorageKey: true,
      },
    });

    return items.map((i) => ({
      id: i.id,
      code: i.code,
      amountCents: i.amountCents,
      quantity: i.quantity,
      availableQty: i.availableQty,
      reservedQty: i.reservedQty,
      mediaStorageKey: i.mediaStorageKey,
    }));
  }),

  getSessionReservations: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
    }
    const session = await getCurrentSessionReadOnly(tenantId);
    if (!session) return [];

    const reservations = await db.reservation.findMany({
      where: {
        liveSessionId: session.id,
        tenantId,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      },
      orderBy: { expiresAt: "asc" },
      include: {
        liveItem: { select: { code: true } },
      },
    });

    return reservations.map((r) => ({
      id: r.id,
      liveItemId: r.liveItemId,
      code: r.liveItem.code,
      clientPhoneMasked: maskClientPhone(r.clientPhone),
      status: r.status,
      expiresAt: r.expiresAt,
    }));
  }),

  releaseReservation: protectedProcedure
    .input(releaseReservationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }

      const reservation = await db.reservation.findFirst({
        where: { id: input.reservationId, tenantId },
        include: { liveItem: { select: { code: true } } },
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

      const liveItemId = reservation.liveItemId;
      const liveSessionId = reservation.liveSessionId;
      const correlationId = reservation.correlationId;

      await db.reservation.update({
        where: { id: reservation.id },
        data: { status: "expired" },
      });

      const releaseResult = await releaseReservation(tenantId, liveItemId, { correlationId });
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

      await logEvent({
        tenantId,
        eventType: "reservation_expired",
        entityType: "reservation",
        entityId: reservation.id,
        correlationId,
        actorType: "seller",
        payload: {
          reservation_id: reservation.id,
          live_item_id: liveItemId,
          reason: "released_by_seller",
        },
      }).catch((err) => {
        workerLogger.warn("Event log reservation_expired (seller) failed", {
          reservationId: reservation.id,
          err,
        });
      });

      const firstInWaitlist = await db.waitlist.findFirst({
        where: { liveItemId, liveSessionId },
        orderBy: { position: "asc" },
      });

      if (firstInWaitlist) {
        const createResult: CreateReservationResult = await createReservation(
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
            firstInWaitlist.liveItemId,
            firstInWaitlist.correlationId,
            { live_session_id: firstInWaitlist.liveSessionId },
          ).catch((err) => {
            workerLogger.warn("Event log waitlist_promoted failed", {
              reservationId: createResult.reservation.id,
              err,
            });
          });

          const code = reservation.liveItem?.code ?? "article";
          const body = `Une place s'est libérée pour ${code}. Tu es réservé. Envoie ton adresse.`;
          await writeToOutbox({
            tenantId: firstInWaitlist.tenantId,
            to: firstInWaitlist.clientPhone,
            body,
            correlationId: firstInWaitlist.correlationId,
          }).catch((err) => {
            workerLogger.warn("writeToOutbox after waitlist promotion failed", {
              waitlistId: firstInWaitlist.id,
              err,
            });
          });
        }
      }

      return { success: true };
    }),
});
