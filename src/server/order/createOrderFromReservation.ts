/**
 * Story 4.5: Création de commande à la confirmation (OUI + adresse).
 * Idempotent sur (tenant_id, reservation_id). Envoie message preuve d'acompte si requireDeposit.
 * Order number: unique (tenant_id, order_number) avec retry sur conflit concurrent (P2002).
 *
 * TECH story: Transaction globale Prisma — confirmReservation + reservation.update + order.create
 * dans une seule $transaction atomique. Rollback total si l'une des opérations échoue.
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { confirmReservation } from "~/server/live-item/reservation";
import type { PrismaTransactionClient } from "~/server/live-item/reservation";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { logEvent, logOrderCreated, logDepositRequested } from "~/server/events/eventLog";
import { workerLogger } from "~/lib/logger";
import { env } from "~/env";

const DEPOSIT_TTL_MINUTES = env.DEPOSIT_TTL_MINUTES ?? 15;

export type CreateOrderFromReservationResult =
  | { success: true; order: { id: string; orderNumber: string; status: string; depositStatus: string } }
  | { success: false; reason: "order_exists" | "reservation_not_found" | "confirm_failed" | "quota_exceeded" };

/**
 * Génère le prochain numéro de commande pour le tenant (SS-0001, SS-0002, ...). Préfixe SS = SnapSell.
 *
 * Le numéro vient d'un compteur porté par la boutique, incrémenté par un
 * `UPDATE … RETURNING` : l'opération prend un verrou sur la ligne tenant, donc
 * les transactions concurrentes se sérialisent et chacune repart avec un numéro
 * distinct.
 *
 * Reposait auparavant sur `COUNT(*) + 1`, qui n'est pas atomique. Cinq
 * confirmations simultanées visaient le même `SS-000N` ; la contrainte unique en
 * refusait quatre, et le retry finissait par abandonner au bout de trois essais
 * — la vente était perdue en plein live. `COUNT(*)` réattribuait en prime un
 * numéro déjà utilisé dès qu'une commande était supprimée. Constaté par
 * `createOrderFromReservation.integration.test.ts`.
 *
 * À n'appeler que dans une transaction : hors transaction, le verrou serait
 * relâché immédiatement et le numéro pourrait être consommé pour rien.
 */
async function getNextOrderNumber(
  tenantId: string,
  tx: PrismaTransactionClient,
): Promise<string> {
  const rows = await tx.$queryRaw<{ order_seq: number }[]>(
    Prisma.sql`
      UPDATE tenants
      SET order_seq = order_seq + 1
      WHERE id = ${tenantId}
      RETURNING order_seq
    `,
  );
  const next = rows[0]?.order_seq;
  if (next === undefined) {
    throw new Error(`Tenant introuvable pour la numérotation : ${tenantId}`);
  }
  return `SS-${String(next).padStart(4, "0")}`;
}

/** Erreur interne pour signaler un échec de confirmReservation dans la transaction. */
class ConfirmFailedError extends Error {
  constructor(public readonly reason: string) {
    super(`CONFIRM_FAILED:${reason}`);
    this.name = "ConfirmFailedError";
  }
}

/**
 * Crée une commande à partir d'une réservation en address_collected.
 * Idempotent : si une commande existe déjà pour cette réservation, la retourne sans refaire confirmReservation.
 *
 * Les opérations critiques (confirmReservation + reservation.update + order.create) sont dans
 * une transaction globale Prisma. Si l'une échoue, tout est rollback (stock non décrémenté, pas d'Order).
 */
export async function createOrderFromReservation(
  tenantId: string,
  reservationId: string,
  requireDeposit: boolean,
  clientPhone: string,
  correlationId: string,
): Promise<CreateOrderFromReservationResult> {
  // 1. Idempotence check (HORS transaction — fast-path, ne modifie rien)
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

  // 2. Load reservation (HORS transaction)
  // Story 8.1: inclure catalogueItem en plus de liveItem
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId, tenantId },
    include: { liveItem: true, catalogueItem: true },
  });
  if (!reservation || reservation.status !== "address_collected") {
    return { success: false, reason: "reservation_not_found" };
  }

  // Note: Le système de quota commandes a été remplacé par le système de credits (sessions client).
  // Les commandes ne bloquent plus l'activité. Les métriques sont toujours sauvegardées pour stats.
  // Le check des credits se fait dans le webhook processor lors de l'ouverture d'une nouvelle session.

  const depositExpiresAt = requireDeposit
    ? new Date(Date.now() + DEPOSIT_TTL_MINUTES * 60 * 1000)
    : null;

  // Plan Variantes: résoudre l'item, la table et la quantité
  const isCatalogue = !!reservation.catalogueItemId;
  const variantId = reservation.variantId;
  const itemIdForStock = variantId ?? (isCatalogue ? reservation.catalogueItemId! : reservation.liveItemId!);
  const stockTable = variantId ? "item_variants" : (isCatalogue ? "catalogue_items" : ("live_items" as const));
  const quantity = reservation.quantity;

  // 3. TRANSACTION GLOBALE avec retry sur P2002 (order_number)
  //    Le retry ré-exécute toute la transaction (rollback = stock intact, on recommence).
  //    Depuis que le numéro vient du compteur `tenants.order_seq`, ce retry n'est
  //    plus le mécanisme mais un filet : il ne devrait plus se déclencher, sauf
  //    numéro posé à la main en base. On le garde à ce titre.
  const maxAttempts = 3;
  let orderRecord: { id: string; orderNumber: string; status: string; depositStatus: string } | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      orderRecord = await db.$transaction(async (tx) => {
        // 3a. confirmReservation avec tx (SELECT FOR UPDATE + décrément stock)
        const confirmResult = await confirmReservation(tenantId, itemIdForStock, quantity, {
          correlationId,
          tx,
          table: stockTable,
        });
        if (!confirmResult.success) {
          throw new ConfirmFailedError(confirmResult.reason);
        }

        // 3b. Update reservation status → confirmed
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: "confirmed" },
        });

        // 3c. Create Order (SS-XXXX)
        const orderNumber = await getNextOrderNumber(tenantId, tx);
        const created = await tx.order.create({
          data: {
            tenantId,
            reservationId,
            orderNumber,
            status: requireDeposit ? "confirmed_pending_deposit" : "confirmed",
            depositStatus: requireDeposit ? "deposit_pending" : "no_deposit",
            depositExpiresAt,
          },
        });
        return created;
      }, { timeout: 10_000 });
      break; // Transaction réussie
    } catch (err) {
      // confirmReservation a échoué → retourner confirm_failed (pas de retry)
      if (err instanceof ConfirmFailedError) {
        workerLogger.warn("confirmReservation failed inside transaction", {
          tenantId,
          reservationId,
          reason: err.reason,
          correlationId,
        });
        return { success: false, reason: "confirm_failed" };
      }

      // CONCURRENCY_ROLLBACK de executeConfirmation (stock conflit via tx externe)
      // → transaction rollback automatique, retourner confirm_failed
      if (err instanceof Error && err.message === "CONCURRENCY_ROLLBACK") {
        workerLogger.warn("confirmReservation concurrency rollback inside transaction", {
          tenantId,
          reservationId,
          correlationId,
        });
        return { success: false, reason: "confirm_failed" };
      }

      const isUniqueViolation =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isUniqueViolation) throw err;

      const target = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
      const isReservationIdConflict =
        target.includes("reservation_id") || target.includes("reservationId");

      // P2002 sur reservation_id → commande créée par un concurrent (idempotence)
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

      // P2002 sur order_number → retry toute la transaction
      if (attempt < maxAttempts - 1) {
        workerLogger.warn("Order create P2002 (duplicate order_number), retrying full transaction", {
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

  // Guard clause — TypeScript ne peut pas prouver que orderRecord est assigné après la boucle,
  // mais tous les chemins sans assignation font un return ou un throw.
  if (!orderRecord) {
    throw new Error("Unreachable: transaction loop exited without assigning orderRecord");
  }

  // 4. Post-transaction (non critique) : event log, outbox
  //    logEvent reservation_confirmed ici car confirmReservation ne logge pas quand tx est fourni
  //    (le commit n'a lieu qu'à la fin du $transaction, pas au moment de l'appel).
  const entityType = isCatalogue ? "catalogue_item" as const : "live_item" as const;
  await logEvent({
    tenantId,
    eventType: "reservation_confirmed",
    entityType,
    entityId: itemIdForStock,
    correlationId,
    actorType: "system",
    payload: { [`${entityType}_id`]: itemIdForStock, quantity, variant_id: variantId },
  }).catch((err) => {
    workerLogger.warn("Event log reservation_confirmed failed", { correlationId, err });
  });

  // Story 8.1 AC#5: Libération du code après vente pour articles créés en live
  if (isCatalogue && reservation.catalogueItem?.createdInLive) {
    try {
      const catItem = await db.catalogueItem.findUnique({
        where: { id: reservation.catalogueItemId! },
        select: { availableQty: true },
      });
      if (catItem && catItem.availableQty <= 0) {
        await db.catalogueItem.delete({
          where: { id: reservation.catalogueItemId! },
        });
        workerLogger.info("Catalogue code released after sale (createdInLive, qty=0)", {
          tenantId,
          catalogueItemId: reservation.catalogueItemId,
          correlationId,
        });
      }
    } catch (err) {
      workerLogger.warn("Failed to release catalogue code after sale", {
        tenantId,
        catalogueItemId: reservation.catalogueItemId,
        correlationId,
        err,
      });
    }
  }

  await logOrderCreated(tenantId, orderRecord.id, reservationId, correlationId).catch((err) => {
    workerLogger.warn("Event log order_created failed", {
      orderId: orderRecord.id,
      correlationId,
      err,
    });
  });

  if (requireDeposit) {
    const body = botMsg.client.orderWithDeposit(DEPOSIT_TTL_MINUTES);
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
