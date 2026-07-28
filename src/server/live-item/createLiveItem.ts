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

/**
 * Code normalisé : trim + uppercase (aligné Story 3.1, contrainte unique).
 * Ré-export de la définition partagée — voir src/lib/pricing/resolve-category.ts.
 */
import { normalizeCode } from "~/lib/pricing/resolve-category";

export { normalizeCode };

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
