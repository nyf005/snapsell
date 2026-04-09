/**
 * Story 4.3: Job expiration TTL (T=0) et promotion du premier en file.
 * Story 4.4: Rappel T-2 min avant expiration (une seule fois par réservation).
 * Ordre d'exécution: rappels T-2 min puis expiration T=0.
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import {
  createReservation,
  type CreateReservationResult,
} from "~/server/reservation/service";
import {
  logReservationExpired,
  logReservationReminderSent,
  logWaitlistPromoted,
} from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";

const ACTIVE_STATUSES = ["reserved", "address_collected"] as const;
const BATCH_LIMIT = 50;

/** Story 4.4: fenêtre T-2 min (Dev Notes REMINDER_WINDOW_MINUTES). */
const REMINDER_WINDOW_MINUTES = 2;
const REMINDER_WINDOW_END_OFFSET_MINUTES = 3; // now+2min à now+3min (fenêtre 1 min)
const REMINDER_BODY = botMsg.client.reminder();

export type ReservationTtlRunResult = {
  expiredCount: number;
  promotedCount: number;
};

export type ReservationReminderRunResult = {
  reminderSentCount: number;
};

/**
 * Story 4.4: Envoie un rappel T-2 min aux clients dont la réservation expire dans 2 min.
 * Idempotent: une seule fois par réservation (reminder_sent_at).
 */
export async function runReservationReminderJob(): Promise<ReservationReminderRunResult> {
  const now = new Date();
  const windowStart = new Date(
    now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000,
  );
  const windowEnd = new Date(
    now.getTime() + REMINDER_WINDOW_END_OFFSET_MINUTES * 60 * 1000,
  );

  const candidates = await db.reservation.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      expiresAt: { gte: windowStart, lte: windowEnd },
      reminderSentAt: null,
    },
    take: BATCH_LIMIT,
    orderBy: { expiresAt: "asc" },
  });

  let reminderSentCount = 0;

  for (const res of candidates) {
    const updated = await db.reservation.updateMany({
      where: { id: res.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });

    if (updated.count === 0) continue;

    try {
      await writeToOutbox({
        tenantId: res.tenantId,
        to: res.clientPhone,
        body: REMINDER_BODY,
        correlationId: res.correlationId,
      });

      // Story 8.1: payload adapté catalogue ou live
      const reminderPayload: Record<string, string | null> = res.catalogueItemId
        ? { catalogue_item_id: res.catalogueItemId }
        : { live_item_id: res.liveItemId };
      if (res.liveSessionId) reminderPayload.live_session_id = res.liveSessionId;
      await logReservationReminderSent(
        res.tenantId,
        res.id,
        res.correlationId,
        reminderPayload,
      ).catch((err) => {
        workerLogger.warn("Event log reservation_reminder_sent failed", {
          reservationId: res.id,
          err,
        });
      });

      reminderSentCount += 1;
    } catch (err) {
      workerLogger.error("Reminder writeToOutbox failed, rolling back reminder_sent_at for retry", {
        reservationId: res.id,
        tenantId: res.tenantId,
        err,
      });
      await db.reservation
        .updateMany({
          where: { id: res.id },
          data: { reminderSentAt: null },
        })
        .catch((rollbackErr) => {
          workerLogger.warn("Failed to rollback reminder_sent_at", {
            reservationId: res.id,
            err: rollbackErr,
          });
        });
    }
  }

  if (candidates.length > 0) {
    workerLogger.info("Reservation reminder run completed", {
      reminderSentCount,
      candidates: candidates.length,
    });
  }

  return { reminderSentCount };
}

/**
 * Exécute une passe : expirer les réservations T=0, puis promouvoir le premier en file.
 * Story 8.1: support CatalogueItem — décrémente catalogue_items si catalogueItemId présent.
 */
export async function runReservationTtlJob(): Promise<ReservationTtlRunResult> {
  const now = new Date();
  const expired = await db.reservation.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      expiresAt: { lte: now },
    },
    take: BATCH_LIMIT,
    orderBy: { expiresAt: "asc" },
    include: {
      liveItem: { select: { code: true } },
      catalogueItem: { select: { code: true } },
    },
  });

  let expiredCount = 0;
  let promotedCount = 0;

  for (const res of expired) {
    // Story 8.1: polymorphisme item catalogue ou live
    const isCatalogue = !!res.catalogueItemId;
    const itemIdForStock = res.catalogueItemId ?? res.liveItemId;
    const stockTableName = isCatalogue ? "catalogue_items" : "live_items";

    if (!itemIdForStock) {
      workerLogger.warn("Reservation has no associated item (neither liveItemId nor catalogueItemId), skipping", {
        reservationId: res.id,
      });
      continue;
    }

    const updated = await db.$transaction(async (tx) => {
      const [updatedRow] = await tx.$queryRaw<
        { id: string; tenant_id: string; live_item_id: string | null; catalogue_item_id: string | null; live_session_id: string | null; correlation_id: string }[]
      >(
        Prisma.sql`
          UPDATE reservations
          SET status = 'expired', updated_at = NOW()
          WHERE id = ${res.id}
            AND status IN (${Prisma.join(ACTIVE_STATUSES.map((s) => Prisma.sql`${s}`))})
            AND expires_at <= ${now}
          RETURNING id, tenant_id, live_item_id, catalogue_item_id, live_session_id, correlation_id
        `,
      );
      if (!updatedRow) return null;

      // Story 8.1: décrémente reserved_qty sur la bonne table (itemIdForStock garanti non-null par le guard ci-dessus)
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE ${Prisma.raw(stockTableName)}
          SET reserved_qty = reserved_qty - 1, updated_at = NOW()
          WHERE id = ${itemIdForStock} AND tenant_id = ${res.tenantId}
        `,
      );

      // Story 9.1: Waitlist lookup — catalogue entries use catalogueItemId, live entries use liveItemId
      const firstInWaitlist = isCatalogue
        ? await tx.waitlist.findFirst({
            where: { tenantId: res.tenantId, catalogueItemId: res.catalogueItemId },
            orderBy: { position: "asc" },
          })
        : res.liveItemId
          ? await tx.waitlist.findFirst({
              where: {
                tenantId: res.tenantId,
                liveItemId: res.liveItemId,
                ...(res.liveSessionId ? { liveSessionId: res.liveSessionId } : {}),
              },
              orderBy: { position: "asc" },
            })
          : null;

      if (!firstInWaitlist) {
        return { expired: updatedRow, promoted: null };
      }

      return {
        expired: updatedRow,
        promoted: {
          waitlistId: firstInWaitlist.id,
          tenantId: firstInWaitlist.tenantId,
          liveSessionId: firstInWaitlist.liveSessionId,
          liveItemId: firstInWaitlist.liveItemId,
          catalogueItemId: firstInWaitlist.catalogueItemId,
          clientPhone: firstInWaitlist.clientPhone,
          correlationId: firstInWaitlist.correlationId,
        },
      };
    });

    if (!updated) continue;
    expiredCount += 1;

    // Event log payload — catalogue_item_id ou live_item_id selon contexte
    const logPayload: Record<string, string | null> = isCatalogue
      ? { catalogue_item_id: updated.expired.catalogue_item_id }
      : { live_item_id: updated.expired.live_item_id };
    if (updated.expired.live_session_id) {
      logPayload.live_session_id = updated.expired.live_session_id;
    }

    await logReservationExpired(
      updated.expired.tenant_id,
      updated.expired.id,
      updated.expired.correlation_id,
      logPayload,
    ).catch((err) => {
      workerLogger.warn("Event log reservation_expired failed", {
        reservationId: updated.expired.id,
        err,
      });
    });

    // Phase 3.2: notifier le client que sa réservation a expiré
    const expiredCode = (res.catalogueItem?.code ?? res.liveItem?.code) ?? null;
    if (expiredCode && res.clientPhone) {
      await writeToOutbox({
        tenantId: res.tenantId,
        to: res.clientPhone,
        body: botMsg.client.reservationExpired(expiredCode),
        correlationId: res.correlationId,
      }).catch((err) => {
        workerLogger.warn("writeToOutbox reservation_expired notification failed", {
          reservationId: res.id,
          err,
        });
      });
    }

    if (updated.promoted) {
      // Story 9.1: promotion catalogue utilise catalogueItemId directement (plus de sentinel)
      const isCataloguePromotion = !!updated.promoted.catalogueItemId;
      const createResult: CreateReservationResult = isCataloguePromotion
        ? await createReservation(
            updated.promoted.tenantId,
            updated.promoted.liveSessionId,
            null,
            updated.promoted.clientPhone,
            updated.promoted.correlationId,
            {
              catalogueItemId: updated.promoted.catalogueItemId!,
              liveSessionId: updated.promoted.liveSessionId,
            },
          )
        : await createReservation(
            updated.promoted.tenantId,
            updated.promoted.liveSessionId,
            updated.promoted.liveItemId,
            updated.promoted.clientPhone,
            updated.promoted.correlationId,
          );

      if (createResult.success) {
        promotedCount += 1;
        await db.waitlist.delete({ where: { id: updated.promoted.waitlistId } }).catch((err) => {
          workerLogger.warn("Failed to delete waitlist entry after promotion", {
            waitlistId: updated.promoted.waitlistId,
            err,
          });
        });
        await logWaitlistPromoted(
          updated.promoted.tenantId,
          createResult.reservation.id,
          updated.promoted.catalogueItemId ?? updated.promoted.liveItemId ?? "unknown",
          updated.promoted.correlationId,
          { live_session_id: updated.promoted.liveSessionId ?? undefined },
        ).catch((err) => {
          workerLogger.warn("Event log waitlist_promoted failed", {
            reservationId: createResult.reservation.id,
            err,
          });
        });

        // Story 8.1: code depuis catalogueItem ou liveItem (déjà chargés via include)
        const code = isCataloguePromotion
          ? (res.catalogueItem?.code ?? "article")
          : (res.liveItem?.code ?? "article");
        const body = botMsg.client.waitlistPromoted(code);

        await writeToOutbox({
          tenantId: updated.promoted.tenantId,
          to: updated.promoted.clientPhone,
          body,
          correlationId: updated.promoted.correlationId,
        });
      } else {
        workerLogger.warn("Promotion createReservation failed (exhausted or race)", {
          tenantId: updated.promoted.tenantId,
          itemId: updated.promoted.liveItemId,
          reason: createResult.reason,
        });
      }
    }
  }

  if (expired.length > 0) {
    workerLogger.info("Reservation TTL run completed", {
      expiredCount,
      promotedCount,
      candidates: expired.length,
    });
  }

  return { expiredCount, promotedCount };
}

const DEFAULT_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Démarre le worker périodique expiration réservations + promotion file.
 */
export function startReservationTtlWorker(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): NodeJS.Timeout {
  workerLogger.info("Starting reservation TTL worker", {
    intervalMs,
    intervalSeconds: Math.round(intervalMs / 1000),
  });

  const run = () => {
    void runReservationReminderJob()
      .catch((err) => {
        workerLogger.error("Reservation reminder job failed", { err });
      })
      .then(() => {
        void runReservationTtlJob();
      });
  };

  run();
  return setInterval(run, intervalMs);
}

/**
 * Arrête le worker (clear l'interval).
 */
export function stopReservationTtlWorker(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  workerLogger.info("Reservation TTL worker stopped");
}
