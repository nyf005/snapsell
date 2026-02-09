/**
 * Story 3.6: Blocage à la réservation (reserved_qty += 1), décrément à la confirmation.
 * reserveOneUnit, releaseReservation, confirmReservation avec transaction + SELECT FOR UPDATE.
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { logEvent } from "~/server/events/eventLog";
import { workerLogger } from "~/lib/logger";

/** Client transactionnel Prisma — utilisé pour passer un tx externe à confirmReservation. */
export type PrismaTransactionClient = Prisma.TransactionClient;

export type ReserveOneUnitResult =
  | { success: true }
  | { success: false; reason: "exhausted" | "not_found" };

export type ReleaseReservationResult =
  | { success: true }
  | { success: false; reason: "not_found" | "no_reservation" };

export type ConfirmReservationResult =
  | { success: true }
  | { success: false; reason: "not_found" | "no_reservation" | "concurrency" };

type ReservationOptions = { correlationId?: string };

function getCorrelationId(opt?: string): string {
  return opt ?? `res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Réserve une unité (reservedQty += 1). Ne décrémente pas availableQty.
 * Utilisable par le worker Epic 4 lors du traitement « client envoie code ».
 */
export async function reserveOneUnit(
  tenantId: string,
  liveItemId: string,
  options?: ReservationOptions,
): Promise<ReserveOneUnitResult> {
  const correlationId = getCorrelationId(options?.correlationId);

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; available_qty: number; reserved_qty: number }[]
    >(
      Prisma.sql`
        SELECT id, available_qty, reserved_qty
        FROM live_items
        WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
        FOR UPDATE
      `,
    );
    if (rows.length === 0) return { success: false as const, reason: "not_found" as const };
    const row = rows[0]!;
    const free = row.available_qty - row.reserved_qty;
    if (free < 1) return { success: false as const, reason: "exhausted" as const };

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE live_items
        SET reserved_qty = reserved_qty + 1, updated_at = NOW()
        WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
      `,
    );
    return { success: true as const };
  });

  if (result.success) {
    await logEvent({
      tenantId,
      eventType: "reservation_hold",
      entityType: "live_item",
      entityId: liveItemId,
      correlationId,
      actorType: "system",
      payload: { liveItemId },
    }).catch((err) => {
      workerLogger.warn("Event log failed (reservation_hold)", {
        liveItemId,
        correlationId,
        err,
      });
    });
  }
  return result;
}

/**
 * Libère une réservation à l'expiration (reservedQty -= 1). availableQty inchangé.
 * À appeler par le job TTL expiration (Epic 4).
 */
export async function releaseReservation(
  tenantId: string,
  liveItemId: string,
  options?: ReservationOptions,
): Promise<ReleaseReservationResult> {
  const correlationId = getCorrelationId(options?.correlationId);

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; reserved_qty: number }[]
    >(
      Prisma.sql`
        SELECT id, reserved_qty
        FROM live_items
        WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
        FOR UPDATE
      `,
    );
    if (rows.length === 0) return { success: false as const, reason: "not_found" as const };
    if (rows[0]!.reserved_qty < 1) return { success: false as const, reason: "no_reservation" as const };

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE live_items
        SET reserved_qty = reserved_qty - 1, updated_at = NOW()
        WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
      `,
    );
    return { success: true as const };
  });

  if (result.success) {
    await logEvent({
      tenantId,
      eventType: "reservation_released",
      entityType: "live_item",
      entityId: liveItemId,
      correlationId,
      actorType: "system",
      payload: { liveItemId },
    }).catch((err) => {
      workerLogger.warn("Event log failed (reservation_released)", {
        liveItemId,
        correlationId,
        err,
      });
    });
  }
  return result;
}

/**
 * Logique interne de confirmation : SELECT FOR UPDATE + décrément stock.
 * Extraite pour être réutilisée avec un tx externe ou interne.
 */
async function executeConfirmation(
  tx: PrismaTransactionClient,
  tenantId: string,
  liveItemId: string,
): Promise<ConfirmReservationResult> {
  const rows = await tx.$queryRaw<
    { id: string; available_qty: number; reserved_qty: number }[]
  >(
    Prisma.sql`
      SELECT id, available_qty, reserved_qty
      FROM live_items
      WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
      FOR UPDATE
    `,
  );
  if (rows.length === 0) return { success: false as const, reason: "not_found" as const };
  if (rows[0]!.reserved_qty < 1) return { success: false as const, reason: "no_reservation" as const };

  await tx.$executeRaw(
    Prisma.sql`
      UPDATE live_items
      SET reserved_qty = reserved_qty - 1, available_qty = available_qty - 1, updated_at = NOW()
      WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
    `,
  );

  const after = await tx.$queryRaw<{ available_qty: number }[]>(
    Prisma.sql`
      SELECT available_qty FROM live_items WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
    `,
  );
  if (after.length === 0 || after[0]!.available_qty < 0) {
    throw new Error("CONCURRENCY_ROLLBACK");
  }
  return { success: true as const };
}

/**
 * Confirme une réservation (reservedQty -= 1, availableQty -= 1).
 * Une seule confirmation gagne en cas de concurrence sur le dernier stock (transaction + verrou).
 *
 * Si `options.tx` est fourni, utilise le client transactionnel externe (pas de $transaction imbriquée).
 * Sinon, crée sa propre $transaction (rétrocompatible pour tout autre appelant).
 */
export async function confirmReservation(
  tenantId: string,
  liveItemId: string,
  options?: ReservationOptions & { tx?: PrismaTransactionClient },
): Promise<ConfirmReservationResult> {
  const correlationId = getCorrelationId(options?.correlationId);

  let result: ConfirmReservationResult;

  if (options?.tx) {
    // tx externe fourni → exécuter directement dans la transaction appelante
    result = await executeConfirmation(options.tx, tenantId, liveItemId);
  } else {
    // Pas de tx → comportement actuel (propre $transaction)
    result = await db.$transaction(async (tx) => {
      return executeConfirmation(tx, tenantId, liveItemId);
    }).catch((err: unknown) => {
      if (err instanceof Error && err.message === "CONCURRENCY_ROLLBACK") {
        return { success: false as const, reason: "concurrency" as const };
      }
      throw err;
    });
  }

  // Quand tx est fourni, NE PAS logger ici — la transaction n'est pas encore commitée.
  // Le caller (ex. createOrderFromReservation) logge APRÈS le commit de la transaction.
  // Sans tx (appel autonome), logger normalement (transaction interne déjà commitée).
  if (result.success && !options?.tx) {
    await logEvent({
      tenantId,
      eventType: "reservation_confirmed",
      entityType: "live_item",
      entityId: liveItemId,
      correlationId,
      actorType: "system",
      payload: { liveItemId },
    }).catch((err) => {
      workerLogger.warn("Event log failed (reservation_confirmed)", {
        liveItemId,
        correlationId,
        err,
      });
    });
  }
  return result;
}
