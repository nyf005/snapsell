/**
 * Story 4.3 + 8.1: File d'attente — insertion avec position = max(position)+1 sous lock.
 * Idempotence : même client + même item + session → une seule entrée (unicité tenant, session, client, item).
 * Story 8.1: support CatalogueItem via options.table = "catalogue_items".
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import type { StockTable } from "~/server/live-item/reservation";

const PRISMA_UNIQUE_VIOLATION = "P2002";

/** Valeur sentinelle utilisée comme liveSessionId dans la waitlist pour les articles catalogue sans session live. */
export const CATALOGUE_SESSION_SENTINEL = "catalogue";
const VALID_STOCK_TABLES: ReadonlySet<string> = new Set(["live_items", "catalogue_items"]);

export type AddToWaitlistResult =
  | { ok: true; position: number; alreadyInWaitlist?: boolean }
  | { ok: false; reason: "not_found" };

/**
 * Ajoute le client en file pour un item (live ou catalogue).
 * Position = max(position)+1 sous lock sur l'item pour éviter double promotion.
 * Idempotent : si déjà en file pour ce client+item+session, retourne la position existante.
 * Story 8.1: options.table = "catalogue_items" pour verrouiller sur catalogue_items au lieu de live_items.
 */
export async function addToWaitlist(
  tenantId: string,
  liveSessionId: string,
  liveItemId: string,
  clientPhone: string,
  correlationId: string,
  options?: { table?: StockTable },
): Promise<AddToWaitlistResult> {
  const table = options?.table ?? "live_items";
  if (!VALID_STOCK_TABLES.has(table)) {
    throw new Error(`Invalid stock table: ${table}`);
  }

  const existing = await db.waitlist.findUnique({
    where: {
      tenantId_liveSessionId_clientPhone_liveItemId: {
        tenantId,
        liveSessionId,
        clientPhone,
        liveItemId,
      },
    },
  });
  if (existing) {
    return { ok: true, position: existing.position, alreadyInWaitlist: true };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // Story 8.1: lock on the correct table (live_items or catalogue_items)
      const lockSql = Prisma.sql`
        SELECT id FROM ${Prisma.raw(table)}
        WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
        FOR UPDATE
      `;
      const lockItem = await tx.$queryRaw<{ id: string }[]>(lockSql);
      if (lockItem.length === 0) return { ok: false as const, reason: "not_found" as const };

      const maxPos = await tx.$queryRaw<[{ max: number | null }]>(
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
          liveSessionId,
          liveItemId,
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
      const existing = await db.waitlist.findUnique({
        where: {
          tenantId_liveSessionId_clientPhone_liveItemId: {
            tenantId,
            liveSessionId,
            clientPhone,
            liveItemId,
          },
        },
      });
      if (existing) {
        return { ok: true, position: existing.position, alreadyInWaitlist: true };
      }
    }
    throw error;
  }
}
