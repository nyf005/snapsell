import { db } from "~/server/db";
import { resolveCategoryFromCode } from "./getPriceFromCode";

/**
 * Dérive un nom lisible pour un article à partir de son code.
 * Utilise la description de la catégorie résolue (CategoryPrice.description).
 * Exemple : code="A12", description="Robes femme" → "Robes femme A12"
 *
 * @returns Le nom dérivé, ou null si la catégorie est introuvable ou sans description.
 */
export async function getItemNameFromCode(
  tenantId: string,
  code: string,
): Promise<string | null> {
  const categoryLetter = await resolveCategoryFromCode(tenantId, code);
  if (categoryLetter === null) return null;

  const row = await db.categoryPrice.findUnique({
    where: { tenantId_categoryLetter: { tenantId, categoryLetter } },
    select: { description: true },
  });

  if (!row?.description) return null;

  return `${row.description} ${code.toUpperCase()}`;
}
