/**
 * Story 4.3 + 8.1 + 9.1: File d'attente — insertion avec position = max(position)+1 sous lock.
 * Idempotence : même client + même item → une seule entrée.
 * Story 9.1: catalogueItemId nullable sur Waitlist, plus de sentinel.
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import type { StockTable } from "~/server/live-item/reservation";

const PRISMA_UNIQUE_VIOLATION = "P2002";
const VALID_STOCK_TABLES: ReadonlySet<string> = new Set(["live_items", "catalogue_items"]);

export type AddToWaitlistResult =
  | { ok: true; position: number; alreadyInWaitlist?: boolean }
  | { ok: false; reason: "not_found" };

/**
 * Ajoute le client en file pour un item (live ou catalogue).
 * Position = max(position)+1 sous lock sur l'item pour éviter double promotion.
 * Idempotent : si déjà en file pour ce client+item, retourne la position existante.
 * Story 9.1: catalogue → catalogueItemId au lieu du sentinel.
 */
export async function addToWaitlist(
  tenantId: string,
  liveSessionId: string | null,
  liveItemId: string | null,
  clientPhone: string,
  correlationId: string,
  options?: { table?: StockTable; catalogueItemId?: string },
): Promise<AddToWaitlistResult> {
  const table = options?.table ?? "live_items";
  if (!VALID_STOCK_TABLES.has(table)) {
    throw new Error(`Invalid stock table: ${table}`);
  }

  const isCatalogue = table === "catalogue_items";
  const catalogueItemId = isCatalogue ? (options?.catalogueItemId ?? null) : null;
  // For catalogue entries, the lock target is the catalogueItemId
  const lockItemId = isCatalogue ? catalogueItemId : liveItemId;

  if (!lockItemId) {
    throw new Error("No item ID provided for waitlist entry");
  }

  // Idempotence check: find existing entry
  const existing = isCatalogue
    ? await db.waitlist.findFirst({
        where: { tenantId, catalogueItemId, clientPhone },
      })
    : await db.waitlist.findFirst({
        where: { tenantId, liveSessionId: liveSessionId!, clientPhone, liveItemId: liveItemId! },
      });

  if (existing) {
    return { ok: true, position: existing.position, alreadyInWaitlist: true };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // Lock on the correct table (live_items or catalogue_items)
      const lockSql = Prisma.sql`
        SELECT id FROM ${Prisma.raw(table)}
        WHERE id = ${lockItemId} AND tenant_id = ${tenantId}
        FOR UPDATE
      `;
      const lockItem = await tx.$queryRaw<{ id: string }[]>(lockSql);
      if (lockItem.length === 0) return { ok: false as const, reason: "not_found" as const };

      // Story 9.1: MAX(position) groupé par le bon champ selon le type
      const maxPos = isCatalogue
        ? await tx.$queryRaw<[{ max: number | null }]>(
            Prisma.sql`
              SELECT COALESCE(MAX(position), 0) AS max
              FROM waitlist
              WHERE catalogue_item_id = ${catalogueItemId}
            `,
          )
        : await tx.$queryRaw<[{ max: number | null }]>(
            Prisma.sql`
              SELECT COALESCE(MAX(position), 0) AS max
              FROM waitlist
              WHERE live_item_id = ${liveItemId} AND live_session_id = ${liveSessionId}
            `,
          );
      const nextPosition = (maxPos[0]?.max ?? 0) + 1;

      await tx.waitlist.create({
        data: {
          tenantId,
          liveSessionId: isCatalogue ? null : liveSessionId,
          liveItemId: isCatalogue ? null : liveItemId,
          catalogueItemId,
          clientPhone,
          position: nextPosition,
          correlationId,
        },
      });

      return { ok: true as const, position: nextPosition };
    });

    return result;
  } catch (error) {
    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION;
    if (isUniqueViolation) {
      const existing = isCatalogue
        ? await db.waitlist.findFirst({
            where: { tenantId, catalogueItemId, clientPhone },
          })
        : await db.waitlist.findFirst({
            where: { tenantId, liveSessionId: liveSessionId!, clientPhone, liveItemId: liveItemId! },
          });
      if (existing) {
        return { ok: true, position: existing.position, alreadyInWaitlist: true };
      }
    }
    throw error;
  }
}
