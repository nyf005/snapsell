import { db } from "~/server/db";

/**
 * Module: résolution de prix à partir du code (catégorie + numéro).
 *
 * Règle de résolution catégorie (Story 3.7) :
 * - Longest match depuis le début du code normalisé (trim + uppercase) contre les categoryLetter du tenant.
 * - Catégories triées par longueur décroissante pour matcher d'abord les plus longues (ex. Premium avant P, AB avant A).
 * - Si même longueur : ordre stable (alphabétique) pour comportement déterministe.
 * - Aucun match → null. Code vide / invalide → null.
 *
 * Exemples : A12→A, AB12→AB, Premium1→Premium, A1 avec grille [AB] uniquement → null.
 */

/**
 * Résout la catégorie (categoryLetter) à partir du code et de la grille du tenant.
 * Longest match sur le code normalisé (trim + uppercase) ; une seule requête findMany pour éviter N+1.
 *
 * @param tenantId - ID du tenant (vide/blanc → null, pas d'appel DB)
 * @param code - Code produit (ex. A12, AB7, Premium42)
 * @returns categoryLetter résolu ou null si aucun match / code vide / grille vide
 */
export async function resolveCategoryFromCode(
  tenantId: string,
  code: string,
): Promise<string | null> {
  if (!tenantId?.trim()) return null;
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length === 0) return null;

  const rows = await db.categoryPrice.findMany({
    where: { tenantId },
    select: { categoryLetter: true },
  });
  if (rows.length === 0) return null;

  const categories = [...new Set(rows.map((r) => r.categoryLetter))];
  const sorted = [...categories].sort((a, b) => {
    const len = b.length - a.length;
    return len !== 0 ? len : a.localeCompare(b);
  });

  const categoryUpper = (c: string) => c.toUpperCase();
  for (const cat of sorted) {
    const prefix = categoryUpper(cat);
    if (prefix.length > 0 && trimmed.startsWith(prefix)) return cat;
  }
  return null;
}

/**
 * Résout le prix (amount) à partir du code et de la grille catégories→prix du tenant.
 * Utilise resolveCategoryFromCode puis lookup CategoryPrice (Story 1.4, 3.7).
 *
 * @param tenantId - ID du tenant (chaîne vide ou blanc → null, pas d'appel DB)
 * @param code - Code produit
 * @returns amount ou null si catégorie absente / code invalide / tenantId vide
 */
export async function getPriceFromCode(
  tenantId: string,
  code: string,
): Promise<number | null> {
  const categoryLetter = await resolveCategoryFromCode(tenantId, code);
  if (categoryLetter === null) return null;

  const row = await db.categoryPrice.findUnique({
    where: { tenantId_categoryLetter: { tenantId, categoryLetter } },
    select: { amount: true },
  });
  return row?.amount ?? null;
}
