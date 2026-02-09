/**
 * Story 4.1: Service réservation (entité) — création, lecture, collecte adresse.
 * Story 4.3: expiresAt (TTL) à la création pour réservations actives.
 * Idempotence : (tenant_id, live_session_id, client_phone, live_item_id) unique.
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { reserveOneUnit, releaseReservation } from "~/server/live-item/reservation";
import { logReservationStarted } from "~/server/events/eventLog";
import { workerLogger } from "~/lib/logger";
import { env } from "~/env";

const ACTIVE_STATUSES = ["reserved", "address_collected"] as const;

/** TTL réservation en minutes (Story 4.3), défaut 10. Utilisé pour locked si RESERVATION_TTL_LOCKED_MINUTES non défini. */
const RESERVATION_TTL_MINUTES = env.RESERVATION_TTL_MINUTES ?? 10;

/** Story 4.5: TTL soft (sans acompte) et locked (avec acompte). Rétrocompat: locked = RESERVATION_TTL_MINUTES, soft = moitié si non définis. */
function getReservationTtlMinutes(requireDeposit: boolean): number {
  if (requireDeposit) {
    return env.RESERVATION_TTL_LOCKED_MINUTES ?? RESERVATION_TTL_MINUTES;
  }
  return env.RESERVATION_TTL_SOFT_MINUTES ?? Math.max(1, Math.floor(RESERVATION_TTL_MINUTES / 2));
}

/** Longueur max adresse (Dev Notes: validation optionnelle). */
const ADDRESS_MAX_LENGTH = 2000;

export type CreateReservationResult =
  | { success: true; reservation: { id: string; status: string } }
  | { success: false; reason: "exhausted" | "already_reserved"; reservation?: { id: string } };

/**
 * Crée une réservation (entité) et réserve une unité sur le LiveItem (reserved_qty += 1).
 * Idempotent : si une réservation active existe déjà pour (tenant, session, client, item), retourne already_reserved.
 */
export async function createReservation(
  tenantId: string,
  liveSessionId: string,
  liveItemId: string,
  clientPhone: string,
  correlationId: string,
): Promise<CreateReservationResult> {
  const existing = await db.reservation.findFirst({
    where: {
      tenantId,
      liveSessionId,
      clientPhone,
      liveItemId,
      status: { in: [...ACTIVE_STATUSES] },
    },
  });
  if (existing) {
    return { success: false, reason: "already_reserved", reservation: { id: existing.id } };
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { requireDeposit: true },
  });
  const requireDeposit = tenant?.requireDeposit ?? false;
  const ttlMinutes = getReservationTtlMinutes(requireDeposit);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const reserveResult = await reserveOneUnit(tenantId, liveItemId, { correlationId });
  if (!reserveResult.success) {
    return { success: false, reason: reserveResult.reason };
  }

  try {
    const reservation = await db.reservation.create({
      data: {
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone,
        status: "reserved",
        correlationId,
        expiresAt,
      },
    });
    await logReservationStarted(tenantId, reservation.id, correlationId, {
      live_item_id: liveItemId,
      live_session_id: liveSessionId,
    }).catch((err) => {
      workerLogger.warn("Event log reservation_started failed", {
        reservationId: reservation.id,
        correlationId,
        err,
      });
    });
    return { success: true, reservation: { id: reservation.id, status: reservation.status } };
  } catch (error) {
    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (isUniqueViolation) {
      await releaseReservation(tenantId, liveItemId, { correlationId });
      const existingAfter = await db.reservation.findFirst({
        where: {
          tenantId,
          liveSessionId,
          clientPhone,
          liveItemId,
          status: { in: [...ACTIVE_STATUSES] },
        },
      });
      return {
        success: false,
        reason: "already_reserved",
        reservation: existingAfter ? { id: existingAfter.id } : undefined,
      };
    }
    // Tout autre échec create : libérer l'unité réservée pour éviter une fuite de reserved_qty
    await releaseReservation(tenantId, liveItemId, { correlationId }).catch((releaseErr) => {
      workerLogger.error("releaseReservation after create failure", releaseErr, {
        tenantId,
        liveItemId,
        correlationId,
      });
    });
    throw error;
  }
}

/**
 * Retourne la réservation active (reserved ou address_collected) pour ce client en session.
 * Si liveItemId est fourni, filtre sur cet item ; sinon retourne la première réservation active (pour collecte adresse).
 */
export async function getActiveReservationForClient(
  tenantId: string,
  liveSessionId: string,
  clientPhone: string,
  liveItemId?: string,
) {
  return db.reservation.findFirst({
    where: {
      tenantId,
      liveSessionId,
      clientPhone,
      ...(liveItemId ? { liveItemId } : {}),
      status: { in: [...ACTIVE_STATUSES] },
    },
    orderBy: { createdAt: "desc" },
    include: { liveItem: true },
  });
}

export type CollectAddressResult =
  | { success: true; reservation: { id: string; liveItem: { code: string; amountCents: number | null } } }
  | { success: false; reason: "no_reservation" | "already_collected" | "address_too_long" };

/**
 * Enregistre l'adresse sur la réservation (status reserved → address_collected). Story 4.1.
 */
export async function collectAddress(
  tenantId: string,
  liveSessionId: string,
  clientPhone: string,
  addressText: string,
): Promise<CollectAddressResult> {
  const reservation = await db.reservation.findFirst({
    where: {
      tenantId,
      liveSessionId,
      clientPhone,
      status: "reserved",
    },
    orderBy: { createdAt: "desc" },
    include: { liveItem: true },
  });
  if (!reservation) return { success: false, reason: "no_reservation" };
  if (reservation.status !== "reserved") return { success: false, reason: "already_collected" };

  const trimmed = addressText.trim();
  if (!trimmed.length) return { success: false, reason: "no_reservation" };
  if (trimmed.length > ADDRESS_MAX_LENGTH) return { success: false, reason: "address_too_long" };

  await db.reservation.update({
    where: { id: reservation.id },
    data: { address: trimmed, status: "address_collected" },
  });

  return {
    success: true,
    reservation: {
      id: reservation.id,
      liveItem: {
        code: reservation.liveItem.code,
        amountCents: reservation.liveItem.amountCents,
      },
    },
  };
}
