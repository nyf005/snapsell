import { OrderStatus } from "../../../generated/prisma";
import { db } from "~/server/db";
import { logOrderStatusChanged } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { workerLogger } from "~/lib/logger";
import { canTransitionFrom } from "~/lib/order-status-transitions";

/**
 * Story 5.2 & 5.4: Centralise la mise à jour du statut d'une commande
 * avec gestion des transactions, logs d'événements et notifications WhatsApp.
 */
export async function updateOrderStatus(opts: {
  tenantId: string;
  orderId: string;
  newStatus: OrderStatus;
  correlationIdPrefix?: string;
}): Promise<{ ok: boolean; orderNumber?: string; error?: string }> {
  const { tenantId, orderId, newStatus, correlationIdPrefix = "order" } = opts;

  const order = await db.order.findFirst({
    where: { id: orderId, tenantId },
    include: { reservation: { select: { clientPhone: true } } },
  });

  if (!order) {
    return { ok: false, error: "Commande introuvable." };
  }

  const from = order.status as OrderStatus;
  if (!canTransitionFrom(from as any, newStatus as any)) {
    return { 
      ok: false, 
      error: `Transition non autorisée: ${from} → ${newStatus}.` 
    };
  }

  const correlationId = `${correlationIdPrefix}-${order.id}-${Date.now()}`;
  
  const updated = await db.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: orderId },
      data: { status: newStatus },
    });
    await logOrderStatusChanged(tenantId, order.id, correlationId, {
      from,
      to: newStatus,
    });
    return o;
  });

  // Notification WhatsApp si nécessaire
  if (["delivered", "cancelled", "in_delivery"].includes(newStatus)) {
    const body =
      newStatus === "delivered"
        ? botMsg.client.orderDelivered(updated.orderNumber)
        : newStatus === "cancelled"
          ? botMsg.client.orderCancelled(updated.orderNumber)
          : botMsg.client.orderInDelivery(updated.orderNumber);
    
    writeToOutbox({
      tenantId,
      to: order.reservation.clientPhone,
      body,
      correlationId,
    }).catch((err) => {
      workerLogger.error("Outbox write failed after order status change", {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        newStatus,
        err,
      });
    });
  }

  return { ok: true, orderNumber: updated.orderNumber };
}
