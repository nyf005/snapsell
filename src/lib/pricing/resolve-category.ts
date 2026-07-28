/**
 * Résolution de la catégorie de prix à partir d'un code article.
 *
 * Fonction **pure**, sans accès base, pour que le client et le serveur appliquent
 * exactement la même règle. Le serveur l'utilise via `src/server/pricing/getPriceFromCode.ts` ;
 * l'interface l'utilise pour afficher en direct le prix qu'une cliente recevra.
 *
 * ── LA RÈGLE ────────────────────────────────────────────────────────────────
 * Correspondance du **plus long préfixe** au début du code normalisé (trim + majuscules).
 * Ce n'est PAS « la première lettre » : une catégorie peut faire plusieurs caractères.
 *
 *   A12       + grille [A, B]           → A
 *   AB12      + grille [A, AB]          → AB      (le plus long gagne)
 *   Premium1  + grille [P, Premium]     → Premium
 *   A1        + grille [AB]             → null    (aucun préfixe ne correspond)
 *
 * À longueur égale, l'ordre alphabétique tranche, pour un comportement déterministe.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Normalisation canonique d'un code article : trim + majuscules.
 *
 * Définition **unique**, partagée par le serveur et l'interface. Elle vivait en
 * double (`src/server/live-item/createLiveItem.ts`), ce qui rendait l'aperçu
 * code→prix silencieusement faux le jour où l'une des deux aurait changé —
 * exactement ce que l'extraction du matcher visait à empêcher.
 */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Résout la catégorie correspondant à un code, parmi celles du vendeur.
 *
 * @param categories Libellés de catégorie du vendeur (`categoryLetter`).
 * @param code       Code saisi ou annoncé, par ex. « A12 ».
 * @returns Le libellé de catégorie tel qu'il est enregistré, ou `null`.
 */
export function resolveCategoryFromCategories(
  categories: readonly string[],
  code: string,
): string | null {
  const normalized = normalizeCode(code);
  if (normalized.length === 0) return null;

  const unique = [...new Set(categories)];
  if (unique.length === 0) return null;

  const sorted = [...unique].sort((a, b) => {
    const byLength = b.length - a.length;
    return byLength !== 0 ? byLength : a.localeCompare(b);
  });

  for (const category of sorted) {
    const prefix = category.toUpperCase();
    if (prefix.length > 0 && normalized.startsWith(prefix)) return category;
  }
  return null;
}
