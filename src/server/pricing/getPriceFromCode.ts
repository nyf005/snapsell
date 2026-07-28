import { db } from "~/server/db";
import { resolveCategoryFromCategories } from "~/lib/pricing/resolve-category";

/**
 * Module: résolution de prix à partir du code (catégorie + numéro).
 *
 * Règle de résolution catégorie (Story 3.7) : voir src/lib/pricing/resolve-category.ts,
 * fonction pure partagée avec le client. Ce module n'ajoute que l'accès base.
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
  if (code.trim().length === 0) return null;

  const rows = await db.categoryPrice.findMany({
    where: { tenantId },
    select: { categoryLetter: true },
  });
  if (rows.length === 0) return null;

  // La règle vit dans src/lib/pricing/resolve-category.ts, partagée avec le
  // client : l'aperçu affiché à la vendeuse ne peut pas diverger du calcul réel.
  return resolveCategoryFromCategories(
    rows.map((r) => r.categoryLetter),
    code,
  );
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
