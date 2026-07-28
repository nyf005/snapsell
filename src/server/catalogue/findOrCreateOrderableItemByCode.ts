/**
 * Story 8.1 Task 2: Find-or-create dans le catalogue pour le flux client.
 * (1) normaliser le code ; (2) si invalide → null ; (3) chercher dans catalogue ;
 * (4) si absent → créer CatalogueItem (qty 1, prix grille, createdInLive true) ;
 * (5) retourner l'item (existant ou créé). Race (P2002) → retry lookup.
 */

import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { normalizeCode } from "~/server/live-item/createLiveItem";
import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";
import type { CatalogueItemLookup } from "./findOrderableItemByCode";

function toCatalogueItemLookup(item: {
  id: string;
  tenantId: string;
  code: string;
  amount: number | null;
  quantity: number;
  availableQty: number;
  reservedQty: number;
  mediaStorageKey: string | null;
  origin: "live" | "seller_whatsapp" | "dashboard";
  createdInLive: boolean;
  attributes?: any;
  variants?: { id: string }[];
}): CatalogueItemLookup {
  return {
    id: item.id,
    tenantId: item.tenantId,
    code: item.code,
    amount: item.amount,
    quantity: item.quantity,
    availableQty: item.availableQty,
    reservedQty: item.reservedQty,
    mediaStorageKey: item.mediaStorageKey,
    origin: item.origin,
    createdInLive: item.createdInLive,
    attributes: item.attributes,
    hasVariants: (item.variants?.length ?? 0) > 0,
  };
}

/**
 * Cherche un CatalogueItem par (tenantId, code) ; si absent, le crée
 * (qty 1, availableQty 1, prix via grille, createdInLive = true).
 *
 * ── ORDRE DE RÉSOLUTION ─────────────────────────────────────────────────────
 * 1. Le catalogue d'abord. Un article déjà enregistré porte son propre prix ;
 *    la grille n'a rien à dire sur lui.
 * 2. La grille ensuite, uniquement pour créer un article inconnu — c'est le seul
 *    moyen de connaître un prix pour un code annoncé en live et jamais saisi.
 *
 * L'ordre inverse (grille avant catalogue) refusait les commandes d'articles
 * pourtant présents au catalogue avec leur prix, dès lors qu'aucune catégorie ne
 * correspondait à leur code : la cliente recevait « Code introuvable » pendant le
 * live, alors que le même code fonctionnait hors live.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Retourne null si :
 * - code vide après normalisation
 * - article absent du catalogue ET lettre non configurée dans la grille
 *   (aucun prix connaissable → pas de création)
 *
 * En cas de doublon (race condition P2002), réessaie le lookup.
 */
export async function findOrCreateOrderableItemByCode(
  tenantId: string,
  code: string,
): Promise<CatalogueItemLookup | null> {
  const normalized = normalizeCode(code);
  if (!normalized.length) return null;

  // 1. Lookup existant — l'article porte son propre prix.
  const existing = await db.catalogueItem.findUnique({
    where: { tenantId_code: { tenantId, code: normalized } },
    include: { variants: { select: { id: true } } },
  });
  if (existing) return toCatalogueItemLookup(existing);

  // 2. Article inconnu : la grille est le seul moyen d'en connaître le prix.
  const amount = await getPriceFromCode(tenantId, normalized);
  if (amount === null) return null;

  // Créer
  try {
    const created = await db.catalogueItem.create({
      data: {
        tenantId,
        code: normalized,
        amount,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
        origin: "live",
        createdInLive: true,
      },
      include: { variants: { select: { id: true } } },
    });
    return toCatalogueItemLookup(created);
  } catch (error) {
    // Race condition : un autre processus a créé le même item
    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!isUniqueViolation) throw error;

    // Retry lookup
    const afterConflict = await db.catalogueItem.findUnique({
      where: { tenantId_code: { tenantId, code: normalized } },
      include: { variants: { select: { id: true } } },
    });
    if (afterConflict) return toCatalogueItemLookup(afterConflict);

    // Ne devrait pas arriver, mais sécurité
    return null;
  }
}
