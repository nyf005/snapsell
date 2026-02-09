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

const ACTIVE_STATUSES = ["reserved", "address_collected"] as const;
const BATCH_LIMIT = 50;

/** Story 4.4: fenêtre T-2 min (Dev Notes REMINDER_WINDOW_MINUTES). */
const REMINDER_WINDOW_MINUTES = 2;
const REMINDER_WINDOW_END_OFFSET_MINUTES = 3; // now+2min à now+3min (fenêtre 1 min)
const REMINDER_BODY =
  "Il te reste 2 min pour confirmer. Réponds OUI ou envoie ton adresse.";

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

      await logReservationReminderSent(
        res.tenantId,
        res.id,
        res.correlationId,
        {
          live_item_id: res.liveItemId,
          live_session_id: res.liveSessionId,
        },
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
 * Exécute une passe : expirer les réservations T=0, puis promouvoir le premier en file par (live_item_id, live_session_id).
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
    include: { liveItem: true },
  });

  let expiredCount = 0;
  let promotedCount = 0;

  for (const res of expired) {
    const updated = await db.$transaction(async (tx) => {
      const [updatedRow] = await tx.$queryRaw<
        { id: string; tenant_id: string; live_item_id: string; live_session_id: string; correlation_id: string }[]
      >(
        Prisma.sql`
          UPDATE reservations
          SET status = 'expired', updated_at = NOW()
          WHERE id = ${res.id}
            AND status IN (${Prisma.join(ACTIVE_STATUSES.map((s) => Prisma.sql`${s}`))})
            AND expires_at <= ${now}
          RETURNING id, tenant_id, live_item_id, live_session_id, correlation_id
        `,
      );
      if (!updatedRow) return null;

      await tx.$executeRaw(
        Prisma.sql`
          UPDATE live_items
          SET reserved_qty = reserved_qty - 1, updated_at = NOW()
          WHERE id = ${res.liveItemId} AND tenant_id = ${res.tenantId}
        `,
      );

      const firstInWaitlist = await tx.waitlist.findFirst({
        where: {
          liveItemId: res.liveItemId,
          liveSessionId: res.liveSessionId,
        },
        orderBy: { position: "asc" },
      });

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
          clientPhone: firstInWaitlist.clientPhone,
          correlationId: firstInWaitlist.correlationId,
        },
      };
    });

    if (!updated) continue;
    expiredCount += 1;

    await logReservationExpired(
      updated.expired.tenant_id,
      updated.expired.id,
      updated.expired.correlation_id,
      {
        live_item_id: updated.expired.live_item_id,
        live_session_id: updated.expired.live_session_id,
      },
    ).catch((err) => {
      workerLogger.warn("Event log reservation_expired failed", {
        reservationId: updated.expired.id,
        err,
      });
    });

    if (updated.promoted) {
      const createResult: CreateReservationResult = await createReservation(
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
          updated.promoted.liveItemId,
          updated.promoted.correlationId,
          { live_session_id: updated.promoted.liveSessionId },
        ).catch((err) => {
          workerLogger.warn("Event log waitlist_promoted failed", {
            reservationId: createResult.reservation.id,
            err,
          });
        });

        const liveItem = await db.liveItem.findUnique({
          where: { id: updated.promoted.liveItemId },
          select: { code: true },
        });
        const code = liveItem?.code ?? "article";
        const body = `Une place s'est libérée pour ${code}. Tu es réservé. Envoie ton adresse.`;

        await writeToOutbox({
          tenantId: updated.promoted.tenantId,
          to: updated.promoted.clientPhone,
          body,
          correlationId: updated.promoted.correlationId,
        });
      } else {
        workerLogger.warn("Promotion createReservation failed (exhausted or race)", {
          tenantId: updated.promoted.tenantId,
          liveItemId: updated.promoted.liveItemId,
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
