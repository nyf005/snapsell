/**
 * Story 3.6: Blocage à la réservation (reserved_qty += 1), décrément à la confirmation.
 * Story 8.1: Support CatalogueItem en plus de LiveItem (même sémantique, table différente).
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

/** Story 8.1: table cible pour les opérations de stock (live_items ou catalogue_items). */
export type StockTable = "live_items" | "catalogue_items";

function getCorrelationId(opt?: string): string {
  return opt ?? `res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const VALID_STOCK_TABLES: ReadonlySet<string> = new Set(["live_items", "catalogue_items"]);

/**
 * Story 8.1: Résout la table et l'entityType pour le log en fonction du paramètre.
 * Inclut une validation runtime pour sécuriser Prisma.raw().
 */
function resolveStockTarget(table: StockTable): { entityType: "live_item" | "catalogue_item"; tableName: string } {
  if (!VALID_STOCK_TABLES.has(table)) {
    throw new Error(`Invalid stock table: ${table}`);
  }
  return table === "catalogue_items"
    ? { entityType: "catalogue_item" as const, tableName: "catalogue_items" }
    : { entityType: "live_item" as const, tableName: "live_items" };
}

/**
 * Réserve une unité (reservedQty += 1). Ne décrémente pas availableQty.
 * Utilisable par le worker Epic 4 lors du traitement « client envoie code ».
 * Story 8.1: supporte table = "catalogue_items" (défaut "live_items" pour rétrocompat).
 */
export async function reserveOneUnit(
  tenantId: string,
  itemId: string,
  options?: ReservationOptions & { table?: StockTable },
): Promise<ReserveOneUnitResult> {
  const correlationId = getCorrelationId(options?.correlationId);
  const { entityType, tableName } = resolveStockTarget(options?.table ?? "live_items");

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; available_qty: number; reserved_qty: number }[]
    >(
      Prisma.sql`
        SELECT id, available_qty, reserved_qty
        FROM ${Prisma.raw(tableName)}
        WHERE id = ${itemId} AND tenant_id = ${tenantId}
        FOR UPDATE
      `,
    );
    if (rows.length === 0) return { success: false as const, reason: "not_found" as const };
    const row = rows[0]!;
    const free = row.available_qty - row.reserved_qty;
    if (free < 1) return { success: false as const, reason: "exhausted" as const };

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE ${Prisma.raw(tableName)}
        SET reserved_qty = reserved_qty + 1, updated_at = NOW()
        WHERE id = ${itemId} AND tenant_id = ${tenantId}
      `,
    );
    return { success: true as const };
  });

  if (result.success) {
    await logEvent({
      tenantId,
      eventType: "reservation_hold",
      entityType,
      entityId: itemId,
      correlationId,
      actorType: "system",
      payload: { [`${entityType}_id`]: itemId },
    }).catch((err) => {
      workerLogger.warn("Event log failed (reservation_hold)", {
        itemId,
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
 * Story 8.1: supporte table = "catalogue_items" (défaut "live_items" pour rétrocompat).
 */
export async function releaseReservation(
  tenantId: string,
  itemId: string,
  options?: ReservationOptions & { table?: StockTable },
): Promise<ReleaseReservationResult> {
  const correlationId = getCorrelationId(options?.correlationId);
  const { entityType, tableName } = resolveStockTarget(options?.table ?? "live_items");

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; reserved_qty: number }[]
    >(
      Prisma.sql`
        SELECT id, reserved_qty
        FROM ${Prisma.raw(tableName)}
        WHERE id = ${itemId} AND tenant_id = ${tenantId}
        FOR UPDATE
      `,
    );
    if (rows.length === 0) return { success: false as const, reason: "not_found" as const };
    if (rows[0]!.reserved_qty < 1) return { success: false as const, reason: "no_reservation" as const };

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE ${Prisma.raw(tableName)}
        SET reserved_qty = reserved_qty - 1, updated_at = NOW()
        WHERE id = ${itemId} AND tenant_id = ${tenantId}
      `,
    );
    return { success: true as const };
  });

  if (result.success) {
    await logEvent({
      tenantId,
      eventType: "reservation_released",
      entityType,
      entityId: itemId,
      correlationId,
      actorType: "system",
      payload: { [`${entityType}_id`]: itemId },
    }).catch((err) => {
      workerLogger.warn("Event log failed (reservation_released)", {
        itemId,
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
 * Story 8.1: paramètre tableName pour supporter catalogue_items.
 */
async function executeConfirmation(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string,
  tableName: string = "live_items",
): Promise<ConfirmReservationResult> {
  const rows = await tx.$queryRaw<
    { id: string; available_qty: number; reserved_qty: number }[]
  >(
    Prisma.sql`
      SELECT id, available_qty, reserved_qty
      FROM ${Prisma.raw(tableName)}
      WHERE id = ${itemId} AND tenant_id = ${tenantId}
      FOR UPDATE
    `,
  );
  if (rows.length === 0) return { success: false as const, reason: "not_found" as const };
  if (rows[0]!.reserved_qty < 1) return { success: false as const, reason: "no_reservation" as const };

  await tx.$executeRaw(
    Prisma.sql`
      UPDATE ${Prisma.raw(tableName)}
      SET reserved_qty = reserved_qty - 1, available_qty = available_qty - 1, updated_at = NOW()
      WHERE id = ${itemId} AND tenant_id = ${tenantId}
    `,
  );

  const after = await tx.$queryRaw<{ available_qty: number }[]>(
    Prisma.sql`
      SELECT available_qty FROM ${Prisma.raw(tableName)} WHERE id = ${itemId} AND tenant_id = ${tenantId}
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
 * Story 8.1: supporte table = "catalogue_items" (défaut "live_items" pour rétrocompat).
 */
export async function confirmReservation(
  tenantId: string,
  itemId: string,
  options?: ReservationOptions & { tx?: PrismaTransactionClient; table?: StockTable },
): Promise<ConfirmReservationResult> {
  const correlationId = getCorrelationId(options?.correlationId);
  const { entityType, tableName } = resolveStockTarget(options?.table ?? "live_items");

  let result: ConfirmReservationResult;

  if (options?.tx) {
    // tx externe fourni → exécuter directement dans la transaction appelante
    result = await executeConfirmation(options.tx, tenantId, itemId, tableName);
  } else {
    // Pas de tx → comportement actuel (propre $transaction)
    result = await db.$transaction(async (tx) => {
      return executeConfirmation(tx, tenantId, itemId, tableName);
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
      entityType,
      entityId: itemId,
      correlationId,
      actorType: "system",
      payload: { [`${entityType}_id`]: itemId },
    }).catch((err) => {
      workerLogger.warn("Event log failed (reservation_confirmed)", {
        itemId,
        correlationId,
        err,
      });
    });
  }
  return result;
}
