/**
 * Worker expiration d'acompte.
 * Trouve les commandes en confirmed_pending_deposit dont depositExpiresAt est dépassé,
 * les annule et notifie le client.
 */

import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { logEvent } from "~/server/events/eventLog";

const BATCH_LIMIT = 50;

export type DepositExpiryRunResult = {
  expiredCount: number;
};

export async function runDepositExpiryJob(): Promise<DepositExpiryRunResult> {
  const now = new Date();

  const expired = await db.order.findMany({
    where: {
      depositStatus: "deposit_pending",
      depositExpiresAt: { lte: now },
    },
    take: BATCH_LIMIT,
    orderBy: { depositExpiresAt: "asc" },
    include: {
      reservation: { select: { clientPhone: true, correlationId: true } },
    },
  });

  let expiredCount = 0;

  for (const order of expired) {
    // Mise à jour atomique — vérifie que le statut n'a pas changé entre temps
    const updated = await db.order.updateMany({
      where: {
        id: order.id,
        depositStatus: "deposit_pending",
      },
      data: {
        status: "cancelled",
        depositStatus: "deposit_rejected",
      },
    });

    if (updated.count === 0) continue; // Déjà traité par un concurrent
    expiredCount += 1;

    const correlationId = order.reservation?.correlationId ?? `deposit-expiry-${order.id}`;

    await logEvent({
      tenantId: order.tenantId,
      eventType: "deposit_rejected",
      entityType: "order",
      entityId: order.id,
      correlationId,
      actorType: "system",
      payload: { reason: "deposit_deadline_expired", order_number: order.orderNumber },
    }).catch((err) => {
      workerLogger.warn("Event log deposit_rejected (expiry) failed", { orderId: order.id, err });
    });

    const clientPhone = order.reservation?.clientPhone;
    if (clientPhone) {
      await writeToOutbox({
        tenantId: order.tenantId,
        to: clientPhone,
        body: botMsg.client.depositExpired(order.orderNumber),
        correlationId,
      }).catch((err) => {
        workerLogger.warn("Deposit expiry notification failed", {
          orderId: order.id,
          tenantId: order.tenantId,
          err,
        });
      });
    }
  }

  if (expired.length > 0) {
    workerLogger.info("Deposit expiry run completed", {
      expiredCount,
      candidates: expired.length,
    });
  }

  return { expiredCount };
}
