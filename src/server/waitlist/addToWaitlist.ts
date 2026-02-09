/**
 * Story 4.3: File d'attente — insertion avec position = max(position)+1 sous lock.
 * Idempotence : même client + même item + session → une seule entrée (unicité tenant, session, client, item).
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";

const PRISMA_UNIQUE_VIOLATION = "P2002";

export type AddToWaitlistResult =
  | { ok: true; position: number; alreadyInWaitlist?: boolean }
  | { ok: false; reason: "not_found" };

/**
 * Ajoute le client en file pour (live_item_id, live_session_id).
 * Position = max(position)+1 sous lock sur le live_item pour éviter double promotion.
 * Idempotent : si déjà en file pour ce client+item+session, retourne la position existante.
 */
export async function addToWaitlist(
  tenantId: string,
  liveSessionId: string,
  liveItemId: string,
  clientPhone: string,
  correlationId: string,
): Promise<AddToWaitlistResult> {
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
      const lockItem = await tx.$queryRaw<
        { id: string }[]
      >(
        Prisma.sql`
          SELECT id FROM live_items
          WHERE id = ${liveItemId} AND tenant_id = ${tenantId}
          FOR UPDATE
        `,
      );
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
