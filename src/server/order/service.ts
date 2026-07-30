import { OrderStatus } from "../../../generated/prisma";
import { db } from "~/server/db";
import { logOrderStatusChanged } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { workerLogger } from "~/lib/logger";
import { canTransitionFrom } from "~/lib/order-status-transitions";

/**
 * Story 5.2: Inclusion standard pour les requêtes de commande.
 * Évite la duplication des "select/include" dans les routers.
 *
 * ── LES PREUVES VOYAGENT AVEC LA COMMANDE ───────────────────────────────────
 * `proofs.listPending` filtre sur `status: "pending"` **et** sur
 * `order.depositStatus: "deposit_pending"`, et c'est le seul listing de preuves
 * du produit. Une preuve validée disparaissait donc de toute l'interface : pour
 * une commande en préparation ou en livraison, il était impossible de revoir ce
 * qui avait été envoyé — alors que l'aide promet de pouvoir trancher une
 * contestation, laquelle porte précisément sur l'image.
 *
 * Les rattacher ici les rend consultables partout où une commande est lue, sans
 * requête supplémentaire.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Les champs d'adresse détaillés étaient absents de ce `select` alors que
 * `mapOrderOutput` les lisait : `deliveryAddressCity`, `Commune`, `Zone` et
 * `Details` valaient donc toujours `null`, silencieusement.
 */
export const ORDER_QUERY_INCLUDE = {
  reservation: {
    select: {
      id: true,
      clientPhone: true,
      address: true,
      addressCity: true,
      addressCommune: true,
      addressZone: true,
      addressDetails: true,
      quantity: true,
      variant: { select: { label: true } },
      liveItemId: true,
      liveItem: { select: { code: true } },
      catalogueItemId: true,
      catalogueItem: { select: { code: true } },
    },
  },
  paymentProofs: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      mediaStorageKey: true,
      textPayload: true,
      createdAt: true,
      reviewedAt: true,
    },
  },
} as const;

type RawProof = {
  id: string;
  status: string;
  mediaStorageKey: string | null;
  textPayload: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

/**
 * Une preuve telle qu'elle est affichée : le `kind` remplace la clé R2.
 *
 * `mediaStorageKey` ne sort pas d'ici. C'est un chemin de stockage interne, et
 * l'image se lit de toute façon par `/api/proofs/[proofId]/media`, qui vérifie la
 * session et l'appartenance au tenant. Exposer la clé n'apporterait rien et
 * contreviendrait à la règle de `terms.ts` : aucun nom d'infrastructure à l'écran.
 */
export type OrderProofOutput = {
  id: string;
  kind: "image" | "text" | "empty";
  status: string;
  text: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

function mapProofOutput(p: RawProof): OrderProofOutput {
  return {
    id: p.id,
    kind: p.mediaStorageKey ? "image" : p.textPayload ? "text" : "empty",
    status: p.status,
    text: p.textPayload,
    createdAt: p.createdAt,
    reviewedAt: p.reviewedAt,
  };
}

/**
 * Unifie le mapping de l'objet de commande pour les API / Frontend.
 */
export function mapOrderOutput(o: any) {
  const proofs: OrderProofOutput[] = (o.paymentProofs ?? []).map(mapProofOutput);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    depositStatus: o.depositStatus,
    depositExpiresAt: o.depositExpiresAt ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    reservationId: o.reservationId,
    clientPhone: o.reservation.clientPhone,
    quantity: o.reservation.quantity ?? null,
    variantLabel: o.reservation.variant?.label ?? null,
    deliveryAddress: o.reservation.address ?? null,
    deliveryAddressCity: o.reservation.addressCity ?? null,
    deliveryAddressCommune: o.reservation.addressCommune ?? null,
    deliveryAddressZone: o.reservation.addressZone ?? null,
    deliveryAddressDetails: o.reservation.addressDetails ?? null,
    liveItemCode: o.reservation.catalogueItem?.code ?? o.reservation.liveItem?.code ?? null,
    proofs,
  };
}

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

/**
 *Story 5.2: Récupérer une commande par son ID et son tenant.
 * Utilise l'inclusion standard.
 */
export async function getOrderById(tenantId: string, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, tenantId },
    include: ORDER_QUERY_INCLUDE,
  });
  return order ? mapOrderOutput(order) : null;
}
