/**
 * Story 4.1: Service réservation (entité) — création, lecture, collecte adresse.
 * Story 4.3: expiresAt (TTL) à la création pour réservations actives.
 * Story 8.1: Support réservation sur CatalogueItem (catalogueItemId, liveSessionId optionnel).
 * Idempotence catalogue : (tenant_id, client_phone, catalogue_item_id) unique (actif).
 * Idempotence legacy : (tenant_id, live_session_id, client_phone, live_item_id) unique.
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
 * Story 8.1: Options pour la création de réservation catalogue.
 * Si catalogueItemId est fourni, la réservation se fait sur le catalogue (liveSessionId optionnel).
 * Si catalogueItemId est absent, comportement legacy sur LiveItem.
 */
export type CreateReservationCatalogueOptions = {
  catalogueItemId: string;
  liveSessionId?: string | null; // optionnel pour traçabilité
};

/**
 * Crée une réservation (entité) et réserve une unité.
 * Story 8.1: Supporte deux modes :
 * - Legacy (liveSessionId + liveItemId) : comportement existant.
 * - Catalogue (catalogueItemId, liveSessionId optionnel) : réservation sur CatalogueItem.
 *
 * Overload 1 : Legacy (rétrocompat)
 */
export async function createReservation(
  tenantId: string,
  liveSessionId: string | null,
  liveItemId: string | null,
  clientPhone: string,
  correlationId: string,
): Promise<CreateReservationResult>;
/**
 * Overload 2 : Catalogue (Story 8.1)
 */
export async function createReservation(
  tenantId: string,
  liveSessionId: string | null,
  liveItemId: null,
  clientPhone: string,
  correlationId: string,
  catalogueOptions: CreateReservationCatalogueOptions,
): Promise<CreateReservationResult>;
export async function createReservation(
  tenantId: string,
  liveSessionId: string | null,
  liveItemId: string | null,
  clientPhone: string,
  correlationId: string,
  catalogueOptions?: CreateReservationCatalogueOptions,
): Promise<CreateReservationResult> {
  const isCatalogue = !!catalogueOptions?.catalogueItemId;
  const catalogueItemId = catalogueOptions?.catalogueItemId ?? null;
  const effectiveSessionId = liveSessionId ?? catalogueOptions?.liveSessionId ?? null;

  // Idempotence check
  const existing = await db.reservation.findFirst({
    where: isCatalogue
      ? {
          tenantId,
          clientPhone,
          catalogueItemId,
          status: { in: [...ACTIVE_STATUSES] },
        }
      : {
          tenantId,
          liveSessionId: liveSessionId!,
          clientPhone,
          liveItemId: liveItemId!,
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

  // Reserve stock on the right table
  const itemIdForStock = isCatalogue ? catalogueItemId! : liveItemId!;
  const stockTable = isCatalogue ? "catalogue_items" as const : "live_items" as const;
  const reserveResult = await reserveOneUnit(tenantId, itemIdForStock, {
    correlationId,
    table: stockTable,
  });
  if (!reserveResult.success) {
    return { success: false, reason: reserveResult.reason as "exhausted" };
  }

  try {
    const reservation = await db.reservation.create({
      data: {
        tenantId,
        liveSessionId: effectiveSessionId,
        liveItemId: liveItemId,
        catalogueItemId,
        clientPhone,
        status: "reserved",
        correlationId,
        expiresAt,
      },
    });

    const logPayload: Record<string, string> = {};
    if (catalogueItemId) logPayload.catalogue_item_id = catalogueItemId;
    if (liveItemId) logPayload.live_item_id = liveItemId;
    if (effectiveSessionId) logPayload.live_session_id = effectiveSessionId;

    await logReservationStarted(tenantId, reservation.id, correlationId, logPayload).catch(
      (err) => {
        workerLogger.warn("Event log reservation_started failed", {
          reservationId: reservation.id,
          correlationId,
          err,
        });
      },
    );
    return { success: true, reservation: { id: reservation.id, status: reservation.status } };
  } catch (error) {
    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (isUniqueViolation) {
      await releaseReservation(tenantId, itemIdForStock, { correlationId, table: stockTable });
      const existingAfter = await db.reservation.findFirst({
        where: isCatalogue
          ? { tenantId, clientPhone, catalogueItemId, status: { in: [...ACTIVE_STATUSES] } }
          : {
              tenantId,
              liveSessionId: liveSessionId!,
              clientPhone,
              liveItemId: liveItemId!,
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
    await releaseReservation(tenantId, itemIdForStock, {
      correlationId,
      table: stockTable,
    }).catch((releaseErr) => {
      workerLogger.error("releaseReservation after create failure", releaseErr, {
        tenantId,
        itemId: itemIdForStock,
        correlationId,
      });
    });
    throw error;
  }
}

/**
 * Retourne la réservation active (reserved ou address_collected) pour ce client.
 * Story 8.1: ne filtre plus obligatoirement sur liveSessionId — les réservations catalogue
 * ont liveSessionId null. Si liveSessionId est fourni, filtre dessus (rétrocompat).
 */
export async function getActiveReservationForClient(
  tenantId: string,
  clientPhone: string,
  options?: { liveSessionId?: string | null; liveItemId?: string; catalogueItemId?: string },
) {
  const where: Record<string, unknown> = {
    tenantId,
    clientPhone,
    status: { in: [...ACTIVE_STATUSES] },
  };

  // Story 8.1: ne filtrer sur liveSessionId que s'il est explicitement fourni (non-null)
  if (options?.liveSessionId) where.liveSessionId = options.liveSessionId;
  if (options?.liveItemId) where.liveItemId = options.liveItemId;
  if (options?.catalogueItemId) where.catalogueItemId = options.catalogueItemId;

  return db.reservation.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    include: { liveItem: true, catalogueItem: true },
  });
}

/** Type d'item retourné par collectAddress (code + prix, polymorphe LiveItem ou CatalogueItem). */
export type CollectAddressItemInfo = {
  code: string;
  amountCents: number | null;
  catalogueItemId?: string | null; // Story 9.4: pour lookup photo
  mediaStorageKey?: string | null; // Story 9.4: clé R2 photo
};

export type CollectAddressResult =
  | { success: true; reservation: { id: string; item: CollectAddressItemInfo } }
  | { success: false; reason: "no_reservation" | "already_collected" | "address_too_long" };

/**
 * Enregistre l'adresse sur la réservation (status reserved → address_collected). Story 4.1, 8.1.
 * Story 8.1: cherche par (tenantId, clientPhone) sans contraindre liveSessionId,
 * pour trouver aussi les réservations catalogue (liveSessionId null).
 */
export async function collectAddress(
  tenantId: string,
  clientPhone: string,
  addressText: string,
): Promise<CollectAddressResult> {
  const reservation = await db.reservation.findFirst({
    where: {
      tenantId,
      clientPhone,
      status: "reserved",
    },
    orderBy: { createdAt: "desc" },
    include: { liveItem: true, catalogueItem: true },
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

  // Story 8.1: item info depuis catalogueItem ou liveItem
  // Story 9.4: inclure catalogueItemId et mediaStorageKey pour photo WhatsApp
  const item: CollectAddressItemInfo = reservation.catalogueItem
    ? {
        code: reservation.catalogueItem.code,
        amountCents: reservation.catalogueItem.amountCents,
        catalogueItemId: reservation.catalogueItem.id,
        mediaStorageKey: reservation.catalogueItem.mediaStorageKey,
      }
    : reservation.liveItem
      ? { code: reservation.liveItem.code, amountCents: reservation.liveItem.amountCents }
      : { code: "?", amountCents: null };

  return {
    success: true,
    reservation: {
      id: reservation.id,
      item,
    },
  };
}
