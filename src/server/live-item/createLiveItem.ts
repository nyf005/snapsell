/**
 * Story 3.2: Création d'un item live avec unicité (tenant_id, live_session_id, code).
 * Story 3.3: resolveOrCreateLiveItem pour chemin client (code non préparé, quantité 1).
 * En cas de doublon (P2002), ne pas mettre à jour ; le caller envoie le message FR40.
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";
import { getOrCreateCurrentSession, updateLastActivity } from "~/server/live-session/service";
import { botMsg } from "~/server/messaging/templates";

/** Code normalisé : trim + uppercase (aligné Story 3.1, contrainte unique) */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Message FR40 : code déjà utilisé (inclut le code pour MODIF) */
export function messageCodeAlreadyUsed(code: string): string {
  const c = normalizeCode(code) || code;
  return botMsg.seller.itemAlreadyUsed(c);
}

/** Story 4.2 FR42 : code inexistant ou typo — message clair avec exemple */
export function messageCodeUnknown(code: string): string {
  const c = normalizeCode(code) || code;
  return botMsg.client.codeUnknown(c);
}

/** Story 4.2 FR42 : typo avec suggestion quand le code extrait existe en session */
export function messageCodeUnknownSuggestion(code: string): string {
  const c = normalizeCode(code) || code;
  return botMsg.client.codeSuggestion(c);
}

export type CreateLiveItemResult =
  | {
      success: true;
      liveItem: {
        id: string;
        code: string;
        liveSessionId: string;
        amount: number | null;
        quantity: number;
        availableQty: number;
        reservedQty: number;
        mediaStorageKey?: string | null;
      };
    }
  | { success: false; duplicate: true }
  | { success: false; reason: "invalid_code" };

export type ResolveOrCreateLiveItemResult = {
  liveItem: {
    id: string;
    code: string;
    liveSessionId: string;
    amount: number | null;
    quantity: number;
    availableQty: number;
    reservedQty: number;
  };
  created: boolean;
};

/**
 * Crée un enregistrement LiveItem en base (factorisation Story 3.2 / 3.3 / 3.4).
 * Story 3.4: availableQty = quantité en stock préparé, reservedQty = 0 à la création.
 * Ne met pas à jour lastActivityAt (réservé au flux vendeur).
 */
async function createLiveItemRecord(
  tenantId: string,
  liveSessionId: string,
  code: string,
  quantity: number,
  options?: { availableQty?: number; reservedQty?: number; mediaStorageKey?: string | null },
): Promise<{
  id: string;
  code: string;
  liveSessionId: string;
  amount: number | null;
  quantity: number;
  availableQty: number;
  reservedQty: number;
}> {
  const normalized = normalizeCode(code);
  const amount = await getPriceFromCode(tenantId, normalized);
  const availableQty = options?.availableQty ?? quantity;
  const reservedQty = options?.reservedQty ?? 0;
  const totalQty = availableQty + reservedQty;
  const liveItem = await db.liveItem.create({
    data: {
      tenantId,
      liveSessionId,
      code: normalized,
      amount: amount ?? undefined,
      quantity: totalQty,
      availableQty,
      reservedQty,
      mediaStorageKey: options?.mediaStorageKey ?? undefined,
    },
  });
  return {
    id: liveItem.id,
    code: liveItem.code,
    liveSessionId: liveItem.liveSessionId,
    amount: liveItem.amount,
    quantity: liveItem.quantity,
    availableQty: liveItem.availableQty,
    reservedQty: liveItem.reservedQty,
  };
}

/**
 * Résout ou crée un LiveItem pour (tenantId, liveSessionId, code). Story 3.3.
 * Si l'item existe → le retourne (created: false).
 * Sinon crée avec quantity 1 et prix grille ; en cas de race (P2002), lit l'item créé par l'autre (read-after-conflict).
 * Code vide après normalisation → throw (le caller ne doit invoquer qu'avec un body valide type code).
 */
export async function resolveOrCreateLiveItem(
  tenantId: string,
  liveSessionId: string,
  code: string,
): Promise<ResolveOrCreateLiveItemResult> {
  const normalized = normalizeCode(code);
  if (!normalized.length) {
    throw new Error("resolveOrCreateLiveItem: invalid_code");
  }

  const existing = await db.liveItem.findFirst({
    where: {
      tenantId,
      liveSessionId,
      code: normalized,
    },
  });
  if (existing) {
    return {
      liveItem: {
        id: existing.id,
        code: existing.code,
        liveSessionId: existing.liveSessionId,
        amount: existing.amount,
        quantity: existing.quantity,
        availableQty: existing.availableQty,
        reservedQty: existing.reservedQty,
      },
      created: false,
    };
  }

  try {
    // Story 3.3: article unique → quantity 1, availableQty 1, reservedQty 0
    const liveItem = await createLiveItemRecord(tenantId, liveSessionId, normalized, 1, {
      availableQty: 1,
      reservedQty: 0,
    });
    return { liveItem, created: true };
  } catch (error) {
    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!isUniqueViolation) throw error;
    const afterConflict = await db.liveItem.findFirstOrThrow({
      where: { tenantId, liveSessionId, code: normalized },
    });
    return {
      liveItem: {
        id: afterConflict.id,
        code: afterConflict.code,
        liveSessionId: afterConflict.liveSessionId,
        amount: afterConflict.amount,
        quantity: afterConflict.quantity,
        availableQty: afterConflict.availableQty,
        reservedQty: afterConflict.reservedQty,
      },
      created: false,
    };
  }
}

/**
 * Crée un item live pour la session courante du tenant.
 * Résout la session via getOrCreateCurrentSession, calcule le prix via getPriceFromCode,
 * insère en base. En cas de contrainte unique violée (P2002), retourne duplicate sans modifier l'existant.
 */
export async function createLiveItem(
  tenantId: string,
  code: string,
  options?: { quantity?: number; mediaStorageKey?: string | null },
): Promise<CreateLiveItemResult> {
  const normalized = normalizeCode(code);
  if (!normalized.length) return { success: false, reason: "invalid_code" };

  const session = await getOrCreateCurrentSession(tenantId);
  const quantity = options?.quantity ?? 1;
  // Story 3.4: stock préparé → availableQty = quantity, reservedQty = 0
  const availableQty = quantity;
  const reservedQty = 0;

  try {
    const liveItem = await createLiveItemRecord(tenantId, session.id, normalized, quantity, {
      availableQty,
      reservedQty,
      mediaStorageKey: options?.mediaStorageKey ?? undefined,
    });
    await updateLastActivity(session.id);
    return {
      success: true,
      liveItem,
    };
  } catch (error) {
    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (isUniqueViolation) return { success: false, duplicate: true };
    throw error;
  }
}
