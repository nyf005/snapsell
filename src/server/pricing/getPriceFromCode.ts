import { db } from "~/server/db";

/**
 * MVP: première lettre du code après normalisation (trim + uppercase).
 * Lettres acceptées : A–Z ASCII uniquement (pas de lettres accentuées en MVP).
 * Grilles multi-lettres (ex. AB, Premium) : non supportées en MVP — première lettre uniquement.
 * @returns categoryLetter (ex. "A") ou null si code vide/invalide
 */
export function extractCategoryLetter(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  const first = trimmed[0];
  return /^[A-Z]$/.test(first) ? first : null;
}

/**
 * Résout le prix (amountCents) à partir du code et de la grille catégories→prix du tenant.
 * Utilise uniquement la table category_prices (Story 1.4).
 * @param tenantId - ID du tenant (chaîne vide ou blanc → null, pas d'appel DB)
 * @returns amountCents ou null si catégorie absente / code invalide / tenantId vide
 */
export async function getPriceFromCode(
  tenantId: string,
  code: string,
): Promise<number | null> {
  if (!tenantId?.trim()) return null;
  const categoryLetter = extractCategoryLetter(code);
  if (categoryLetter === null) return null;

  const row = await db.categoryPrice.findUnique({
    where: { tenantId_categoryLetter: { tenantId, categoryLetter } },
    select: { amountCents: true },
  });
  return row?.amountCents ?? null;
}
