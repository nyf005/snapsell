/**
 * Story 4.5: Création de commande à la confirmation (OUI + adresse).
 * Idempotent sur (tenant_id, reservation_id). Envoie message preuve d'acompte si requireDeposit.
 * Order number: unique (tenant_id, order_number) avec retry sur conflit concurrent (P2002).
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { confirmReservation } from "~/server/live-item/reservation";
import { writeToOutbox } from "~/server/messaging/outbox";
import { logOrderCreated, logDepositRequested } from "~/server/events/eventLog";
import { workerLogger } from "~/lib/logger";
import { env } from "~/env";

const DEPOSIT_TTL_MINUTES = env.DEPOSIT_TTL_MINUTES ?? 15;

export type CreateOrderFromReservationResult =
  | { success: true; order: { id: string; orderNumber: string; status: string; depositStatus: string } }
  | { success: false; reason: "order_exists" | "reservation_not_found" | "confirm_failed" };

/**
 * Génère le prochain numéro de commande pour le tenant (SS-0001, SS-0002, ...). Préfixe SS = SnapSell.
 */
async function getNextOrderNumber(tenantId: string): Promise<string> {
  const count = await db.order.count({ where: { tenantId } });
  const num = count + 1;
  const padded = String(num).padStart(4, "0");
  return `SS-${padded}`;
}

/**
 * Crée une commande à partir d'une réservation en address_collected.
 * Idempotent : si une commande existe déjà pour cette réservation, la retourne sans refaire confirmReservation.
 */
export async function createOrderFromReservation(
  tenantId: string,
  reservationId: string,
  requireDeposit: boolean,
  clientPhone: string,
  correlationId: string,
): Promise<CreateOrderFromReservationResult> {
  const existingOrder = await db.order.findUnique({
    where: { reservationId },
  });
  if (existingOrder) {
    return {
      success: true,
      order: {
        id: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        status: existingOrder.status,
        depositStatus: existingOrder.depositStatus,
      },
    };
  }

  const reservation = await db.reservation.findUnique({
    where: { id: reservationId, tenantId },
    include: { liveItem: true },
  });
  if (!reservation || reservation.status !== "address_collected") {
    return { success: false, reason: "reservation_not_found" };
  }

  const confirmResult = await confirmReservation(tenantId, reservation.liveItemId, {
    correlationId,
  });
  if (!confirmResult.success) {
    return { success: false, reason: "confirm_failed" };
  }

  await db.reservation.update({
    where: { id: reservationId },
    data: { status: "confirmed" },
  });

  const depositExpiresAt = requireDeposit
    ? new Date(Date.now() + DEPOSIT_TTL_MINUTES * 60 * 1000)
    : null;

  const maxOrderCreateAttempts = 3;
  let order: { id: string; orderNumber: string; status: string; depositStatus: string };
  for (let attempt = 0; attempt < maxOrderCreateAttempts; attempt++) {
    const orderNumber = await getNextOrderNumber(tenantId);
    try {
      const created = await db.order.create({
        data: {
          tenantId,
          reservationId,
          orderNumber,
          status: requireDeposit ? "confirmed_pending_deposit" : "confirmed",
          depositStatus: requireDeposit ? "deposit_pending" : "no_deposit",
          depositExpiresAt,
        },
      });
      order = created;
      break;
    } catch (err) {
      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUniqueViolation) throw err;

      const target = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
      const isReservationIdConflict =
        target.includes("reservation_id") || target.includes("reservationId");
      if (isReservationIdConflict) {
        const existing = await db.order.findUnique({ where: { reservationId } });
        if (existing) {
          return {
            success: true,
            order: {
              id: existing.id,
              orderNumber: existing.orderNumber,
              status: existing.status,
              depositStatus: existing.depositStatus,
            },
          };
        }
      }
      if (attempt < maxOrderCreateAttempts - 1) {
        workerLogger.warn("Order create P2002 (duplicate order_number), retrying", {
          tenantId,
          reservationId,
          attempt: attempt + 1,
          correlationId,
        });
        continue;
      }
      throw err;
    }
  }
  const orderRecord = order!;

  await logOrderCreated(tenantId, orderRecord.id, reservationId, correlationId).catch((err) => {
    workerLogger.warn("Event log order_created failed", {
      orderId: orderRecord.id,
      correlationId,
      err,
    });
  });

  if (requireDeposit) {
    const body = `Envoyez votre preuve d'acompte (photo ou message) dans les ${DEPOSIT_TTL_MINUTES} min.`;
    await writeToOutbox({
      tenantId,
      to: clientPhone,
      body,
      correlationId,
    });
    await logDepositRequested(tenantId, orderRecord.id, correlationId, {
      deposit_expires_minutes: DEPOSIT_TTL_MINUTES,
    }).catch((err) => {
      workerLogger.warn("Event log deposit_requested failed", {
        orderId: orderRecord.id,
        correlationId,
        err,
      });
    });
  }

  return {
    success: true,
    order: {
      id: orderRecord.id,
      orderNumber: orderRecord.orderNumber,
      status: orderRecord.status,
      depositStatus: orderRecord.depositStatus,
    },
  };
}
