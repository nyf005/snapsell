# Story 3.7: Étendre les catégories (lettres, groupes de lettres, mots)

Status: done

<!-- Note: Story issue de la rétrospective Epic 3 (chemin critique avant Epic 4). Validation optionnelle avant dev-story. -->

## Story

As a **système**,
I want **résoudre la catégorie à partir du code en supportant lettres, groupes de lettres et mots (selon la grille du tenant)**,
so that **le prix soit correctement appliqué que la catégorie soit "A", "AB", "Premium" ou tout libellé configuré**.

## Acceptance Criteria

1. **Given** une grille du tenant avec des catégories pouvant être une lettre (A), un groupe (AB), ou un mot (Premium)
   **When** le système calcule le prix pour un code (ex. A12, AB7, Premium42)
   **Then** la catégorie résolue est celle qui matche selon la règle définie (longest match depuis le début du code, ou équivalent), et le prix retourné est celui de cette catégorie (FR11 étendu)
   **And** les cas existants (A12 → A, B7 → B) restent valides (non-régression)

2. **Given** un code qui ne matche aucune catégorie de la grille
   **When** le système tente de résoudre le prix
   **Then** le résultat est null (comportement inchangé par rapport à 3.1)

3. **Given** une grille contenant à la fois "A" et "AB"
   **When** le code est "AB12"
   **Then** la catégorie résolue est "AB" (longest match prioritaire), pas "A"

## Tasks / Subtasks

- [x] Task 1 : Règle de résolution catégorie (AC: #1, #3)
  - [x] Définir et documenter la règle : **longest match** depuis le début du code normalisé (trim + uppercase) contre les `categoryLetter` du tenant. Ordre de tentative : catégories triées par longueur décroissante pour matcher d’abord les plus longues (ex. Premium avant P).
  - [x] Si aucun match : retourner null (comportement actuel). Cas code vide / invalide : null.
  - [x] Documenter dans le code (JSDoc) et en tête du module : règle utilisée, exemples (A12→A, AB12→AB, Premium1→Premium).

- [x] Task 2 : Adapter le module pricing (AC: #1, #2)
  - [x] Remplacer ou étendre `extractCategoryLetter(code)` par une fonction qui résout la catégorie à partir du code **et** des catégories configurées pour le tenant (ex. `resolveCategoryFromCode(tenantId, code)` ou garder `extractCategoryLetter` avec signature enrichie). Nécessité de charger les categoryLetter du tenant (liste) pour faire le longest match.
  - [x] `getPriceFromCode(tenantId, code)` doit utiliser cette résolution : résoudre la catégorie, puis lookup CategoryPrice par (tenantId, categoryLetter). Pas de changement de schéma DB (category_letter accepte déjà des chaînes 1–50 caractères).
  - [x] Conserver l’isolation tenant (toutes les requêtes filtrées par tenantId).

- [x] Task 3 : Performance et edge cases (AC: #1, #3)
  - [x] Éviter N+1 : récupérer les catégories du tenant une fois (ex. liste des categoryLetter pour ce tenant), puis faire le match en mémoire. Pas d’appel DB par tentative de préfixe.
  - [x] Gérer les grilles vides (aucune catégorie) → null. Gérer les catégories de même longueur (ordre stable, ex. alphabétique) pour un comportement déterministe.

- [x] Task 4 : Tests (AC: #1, #2, #3)
  - [x] Non-régression : grille A=5000, B=10000 ; code "A12" → 5000, "B7" → 10000 ; code inconnu → null ; code vide → null (réutiliser ou étendre getPriceFromCode.test.ts).
  - [x] Nouveaux scénarios : grille avec A, AB, Premium ; code "AB12" → prix de AB ; "Premium1" → prix de Premium ; "A99" → prix de A.
  - [x] Edge : grille avec uniquement "AB" ; code "A1" → null (pas de catégorie "A"). Code "AB" ou "AB1" → prix de AB.

## Dev Notes

- **Source :** Rétrospective Epic 3 (2026-02-07) — chemin critique avant Epic 4. Le besoin métier est que les catégories puissent être des **lettres**, des **groupes de lettres** ou des **mots**, pas seulement la première lettre du code.
- **État actuel :** Story 3.1 a livré `extractCategoryLetter(code)` → première lettre uniquement ; `getPriceFromCode(tenantId, code)` utilise cette lettre pour le lookup. Le schéma Prisma `CategoryPrice.categoryLetter` et la config (Story 1.4, settings.schema.ts) acceptent déjà 1–50 caractères ; seul le module pricing restreint à une lettre.
- **Piège :** Ne pas casser les appels existants à `getPriceFromCode` (signature inchangée : `(tenantId, code) => Promise<number | null>`). Les consommateurs (createLiveItem, resolveOrCreateLiveItem, etc.) ne changent pas. Seule la logique interne de résolution de catégorie change.

### Project Structure Notes

- **Fichiers concernés :** `src/server/pricing/getPriceFromCode.ts` (et éventuellement `getPriceFromCode.test.ts`). Option : extraire `resolveCategoryFromCode(tenantId, code)` ou équivalent qui fait (1) load categoryLetters pour tenant, (2) longest match sur code normalisé, (3) return categoryLetter ou null. `getPriceFromCode` appelle cette résolution puis findUnique comme aujourd’hui.
- **Références :** [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-02-07.md] — décision et périmètre ; [Source: _bmad-output/implementation-artifacts/3-1-appliquer-le-prix-au-code-via-la-grille-categorie-prix.md] — contexte 3.1 ; [Source: prisma/schema.prisma] — CategoryPrice ; [Source: src/server/api/routers/settings.schema.ts] — categoryCodeSchema 1–50 car.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- En live, les codes peuvent être préfixés par une **catégorie** qui n’est plus limitée à une lettre : ex. A12 (catégorie A), AB7 (catégorie AB), Premium42 (catégorie Premium). La grille du tenant (Story 1.4) peut contenir A, B, AB, Premium, etc. Le système doit résoudre la catégorie à partir du **début du code** en priorisant le **longest match** pour éviter que "AB12" ne matche "A" au lieu de "AB".

### Technical Requirements

- **Entrée :** `tenantId: string`, `code: string`. **Sortie :** `amountCents: number | null` (inchangé). Pas de changement de signature publique de `getPriceFromCode`.
- **Règle de résolution :** (1) Normaliser le code (trim + uppercase). (2) Charger toutes les catégories du tenant (categoryLetter) pour ce tenantId. (3) Trier les catégories par longueur décroissante (puis ordre stable si même longueur). (4) Pour chaque catégorie, vérifier si le code normalisé commence par cette catégorie (sensible à la casse après uppercase). (5) Première correspondance = catégorie résolue. (6) Lookup CategoryPrice(tenantId, categoryLetter) → amountCents ou null.
- **DB :** Lecture : liste des categoryLetter par tenant (ex. `db.categoryPrice.findMany({ where: { tenantId }, select: { categoryLetter: true } })`), puis findUnique pour le prix. Pas de migration.

### Architecture Compliance

- **Stack :** Prisma (Neon), pas de cache. Conformité architecture §6, §8. Isolation tenant stricte.
- **Naming :** Conserver les noms de fichiers et exports existants pour ne pas casser les imports (createLiveItem, resolveOrCreateLiveItem, webhook-processor, etc.).

### Library / Framework Requirements

- **Prisma :** findMany + findUnique. Aucune nouvelle dépendance.
- **Zod :** Pas de changement requis pour cette story (config déjà validée côté settings).

### File Structure Requirements

- **Module pricing :** `src/server/pricing/getPriceFromCode.ts` — remplacer ou compléter `extractCategoryLetter` par une résolution basée sur la grille (ex. fonction interne `resolveCategoryFromCode(tenantId, code)` qui charge les catégories et fait le longest match). Exporter `getPriceFromCode` inchangé ; exporter éventuellement une fonction de résolution catégorie si utile pour tests ou réutilisation.
- **Tests :** `src/server/pricing/getPriceFromCode.test.ts` — étendre avec les cas multi-lettres / mots ; conserver tous les tests existants (non-régression).

### Testing Requirements

- Réutiliser les tests actuels : A12→5000, B7→10000, inconnu→null, vide→null.
- Nouveaux tests : grille avec A, AB ; code "AB7" → prix de AB ; "A7" → prix de A. Grille avec Premium ; "Premium1" → prix de Premium. Grille AB seul ; "A1" → null.
- Pas d’e2e requis (logique pure + DB read).

### Previous Story Intelligence (Story 3.1)

- **Story 3.1 :** `extractCategoryLetter(code)` retourne la première lettre A–Z ; `getPriceFromCode` appelle findUnique sur (tenantId, categoryLetter). Les tests mockent la DB. Pour 3.7 : soit on garde `extractCategoryLetter` pour le cas « une seule lettre en grille » et on ajoute un chemin « multi-catégories », soit on remplace par une seule résolution longest match (recommandé pour un seul comportement clair).

### Git Intelligence Summary

- Fichiers concernés : `src/server/pricing/getPriceFromCode.ts`, `getPriceFromCode.test.ts`. Aucun autre fichier ne doit être modifié pour cette story (createLiveItem, resolveOrCreateLiveItem, webhook-processor appellent déjà getPriceFromCode sans changement).

### Latest Tech Information

- Aucune mise à jour de librairie requise. Prisma et stack T3 inchangés.

### Project Context Reference

- Structure T3 ; conventions du repo (tests à côté du module ou dans tests/unit). Architecture §8 (Data) : category_prices, pas de cache.

### Story Completion Status

- **Status :** ready-for-dev
- **Completion note :** Contexte story 3.7 complété — extension catégories (lettres / groupes / mots) avec longest match, non-régression 3.1, prêt pour implémentation par l’agent Dev.

---

## Dev Agent Record

### Agent Model Used

Dev: (implémentation story). CR: Adversarial Code Review (workflow code-review).

### Debug Log References

### Completion Notes List

- **Task 1–3 :** Règle longest match documentée en JSDoc (en-tête module + resolveCategoryFromCode). Résolution : code normalisé (trim + uppercase), catégories triées par longueur décroissante puis alphabétique, première correspondance prefix = catégorie résolue ; grille vide / code vide → null.
- **Task 2 :** `extractCategoryLetter(code)` supprimée. Nouvelle `resolveCategoryFromCode(tenantId, code)` : findMany des categoryLetter du tenant, tri longest-first, match en mémoire. `getPriceFromCode` appelle resolveCategoryFromCode puis findUnique ; signature inchangée (tenantId, code) → Promise<number | null>. Export index : resolveCategoryFromCode + getPriceFromCode.
- **Task 3 :** Un seul findMany par appel, pas de N+1. Grille vide → null. Même longueur : tri alphabétique (localeCompare) pour ordre stable.
- **Task 4 :** Tests getPriceFromCode étendus : mock findMany + findUnique ; non-régression A12/B7/null/invalid/empty tenant ; nouveaux cas AB12→AB, Premium1→Premium, A99→A ; edge A1 avec grille [AB]→null, AB/AB1→AB, grille vide→null. Suite complète 183 tests passent.
- **Code Review (CR):** 2 MEDIUM corrigés : (1) tri sans mutation — `const sorted = [...categories].sort(...)` dans getPriceFromCode.ts ; (2) test tenantId vide — assertion `findMany` non appelé ajoutée dans getPriceFromCode.test.ts. 4 LOW documentés (placeholder Dev Record, pas de test unitaire direct resolveCategoryFromCode, etc.) — non bloquants.

### File List

- src/server/pricing/getPriceFromCode.ts (réécrit : resolveCategoryFromCode + getPriceFromCode, JSDoc)
- src/server/pricing/getPriceFromCode.test.ts (étendu : findMany mock, 11 tests dont longest match et edge)
- src/server/pricing/index.ts (export resolveCategoryFromCode à la place de extractCategoryLetter)
