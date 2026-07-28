# Story 3.1: Appliquer le prix au code via la grille catégorie→prix

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **appliquer un prix à un code à partir de la lettre du code et de la grille catégories→prix du tenant**,
so that **le prix soit dérivé automatiquement sans saisie en live**.

## Acceptance Criteria

1. **Given** un code (ex. A12) et la grille du tenant (ex. A = 5000, B = 10000)
   **When** le système calcule le prix du code
   **Then** le prix retourné est celui de la catégorie A (FR11)
   **And** FR11 couvert

## Tasks / Subtasks

- [x] Task 1 : Extraire la catégorie à partir du code (AC: #1)
  - [x] Définir la règle d’extraction : pour le MVP, première lettre du code (ex. A12 → A, B7 → B). Normaliser : trim, uppercase avant extraction.
  - [x] Gérer les codes multi-lettres si la grille du tenant en contient (ex. AB, Premium) : option « longest match » sur les categoryLetter existants pour le tenant, ou first-char uniquement — documenter le choix MVP.
- [x] Task 2 : Service de résolution prix (AC: #1)
  - [x] Créer une fonction/service : `getPriceFromCode(tenantId, code)` → lookup CategoryPrice par (tenantId, categoryLetter) ; retourner amountCents ou null si catégorie absente de la grille.
  - [x] Utiliser uniquement Prisma + table `category_prices` existante (Story 1.4) ; pas de nouveau modèle.
- [x] Task 3 : Intégration et tests (AC: #1)
  - [x] Exposer le service depuis un module réutilisable (ex. `src/server/pricing/` ou `src/lib/pricing.ts`) pour usage futur par intents WhatsApp et création d’items (stories 3.2+).
  - [x] Test unitaire : code A12 + grille A=5000 → 5000 ; code inconnu → null ; code vide/invalide → comportement défini (null ou erreur).

## Dev Notes

- **FR couvert :** FR11 — Le système peut appliquer un prix à un code à partir de la lettre du code et de la grille catégories→prix du tenant.
- **Source grille :** Story 1.4 — grille stockée dans `CategoryPrice` (tenantId, categoryLetter, amountCents). Pas de changement de schéma pour cette story.
- **Piège :** Ne pas réinventer la grille ; elle existe déjà. Ne pas ajouter de champ `price` sur une table qui n’existe pas encore (LiveItem viendra en 3.2/3.3) ; cette story ne fait que le **calcul** prix à partir du code.

### Project Structure Notes

- **Architecture §Requirements to Structure :** Pricing / codes (FR11–FR13) → `src/server/whatsapp/intents.ts`, Prisma (live_items, category_prices). Pour 3.1 : uniquement logique prix + category_prices.
- Nouveau module recommandé : `src/server/pricing/` avec `getPriceFromCode.ts` (ou `resolvePriceFromCode.ts`) et tests dans `tests/unit/pricing/` ou à côté du module.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.1] — User story et critères d’acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#8 Data Storage] — category_prices, pas de cache applicatif MVP
- [Source: prisma/schema.prisma] — Modèle CategoryPrice (tenantId, categoryLetter, amountCents)

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- En live, le vendeur annonce des codes (ex. A12, B7). Le prix doit être dérivé automatiquement à partir de la **lettre de catégorie** (A, B, …) et de la grille configurée par le tenant (Story 1.4). Aucune saisie manuelle du prix en live.
- Cette story ne crée pas encore d’items ni de réservations ; elle fournit uniquement la **fonction de calcul du prix** qui sera utilisée par les stories suivantes (création item, réservation, etc.).

### Technical Requirements

- **Entrée :** `tenantId: string`, `code: string` (ex. "A12", "B7"). **Sortie :** `amountCents: number | null` (null si catégorie absente ou code invalide).
- **DB :** Lecture seule sur `category_prices` (Prisma). Pas d’écriture, pas de migration.
- **Règle d’extraction MVP :** première lettre du code après normalisation (trim + uppercase). Si la grille contient des catégories multi-lettres (ex. AB), documenter si on fait « première lettre » uniquement ou « longest match » ; pour éviter la complexité, MVP = première lettre recommandé.
- **Isolation tenant :** toute requête filtrée par `tenantId` ; pas de cross-tenant.

### Architecture Compliance

- **Stack :** Prisma (Neon), pas de cache (Redis = queue only). Architecture §6, §8.
- **Naming :** DB snake_case (déjà en place), code TypeScript camelCase. Fichiers : camelCase ou kebab-case selon le dossier (ex. `getPriceFromCode.ts`).
- **Validation :** si le code est fourni par un job ou une API plus tard, valider avec Zod ; pour cette story, la fonction peut accepter une string et gérer les cas vides/invalides en retournant null.

### Library / Framework Requirements

- **Prisma :** client existant (`src/server/db.ts`). Utiliser `prisma.categoryPrice.findUnique` ou `findFirst` avec `where: { tenantId, categoryLetter }`.
- Aucune nouvelle dépendance npm pour cette story.

### File Structure Requirements

- **Service prix :** `src/server/pricing/getPriceFromCode.ts` (ou `resolvePriceFromCode.ts`) — fonction pure + appel Prisma. Option : `src/server/pricing/index.ts` qui exporte la fonction.
- **Tests :** `tests/unit/pricing/getPriceFromCode.test.ts` ou `src/server/pricing/getPriceFromCode.test.ts` selon convention du projet.
- Ne pas mettre la logique dans `intents.ts` pour l’instant ; l’intent l’appellera plus tard (story 3.3/3.4).

### Testing Requirements

- Test : grille tenant avec A=5000, B=10000 ; code "A12" → 5000 ; "B7" → 10000.
- Test : code dont la catégorie n’existe pas dans la grille → null.
- Test : code vide ou après trim vide → null (ou erreur claire selon choix).
- Pas d’e2e requis pour cette story (logique pure + DB read).

### Previous Story Intelligence (Epic 2)

- **Story 2.6 (Live session) :** Création/fermeture de session ; pas de LiveItem encore. La résolution du prix sera utilisée quand on créera des items en session (3.3, 3.4) et pour les réponses client (réservation). Garder la fonction sans side-effect (pas de création de session ni d’item dans cette story).
- **Patterns utiles :** Prisma via `src/server/db.ts` ; Zod pour les inputs quand ils viennent du webhook/job ; pas de logique métier dans la route webhook.

### Git Intelligence Summary

- Dernières stories : 2.6 (live session), 2.5 (STOP), 2.4 (outbox). Fichiers récurrents : `prisma/schema.prisma`, `src/server/workers/`, `src/server/api/routers/`. Nouveau module `src/server/pricing/` s’aligne avec la structure existante.

### Latest Tech Information

- Prisma et stack T3 inchangés ; pas de recherche web nécessaire pour cette story (logique métier simple + schéma existant).

### Project Context Reference

- **project-context :** Si présent sous `**/project-context.md`, le consulter pour conventions de test (Vitest/Jest) et emplacement des modules. Sinon, suivre la structure T3 + architecture.md.

### Story Completion Status

- **Status :** ready-for-dev
- **Completion note :** Contexte story 3.1 complété — calcul du prix à partir du code et de la grille catégories→prix ; service réutilisable pour les stories suivantes (FR11 couvert).

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

- Sprint 3.1 marqué in-progress puis review. Module `src/server/pricing/` créé avec extraction catégorie (première lettre, trim + uppercase) et `getPriceFromCode(tenantId, code)` via Prisma category_prices. MVP : première lettre uniquement (documenté en en-tête de `extractCategoryLetter`).

### Completion Notes List

- Task 1 : `extractCategoryLetter(code)` — première lettre après trim/uppercase ; retourne null si vide ou premier caractère non lettre A–Z. Choix MVP : première lettre uniquement (pas de longest match multi-lettres).
- Task 2 : `getPriceFromCode(tenantId, code)` — appelle extractCategoryLetter puis `db.categoryPrice.findFirst({ where: { tenantId, categoryLetter }, select: { amountCents: true } })` ; retourne amountCents ou null.
- Task 3 : Module `src/server/pricing/` avec index.ts exportant les deux fonctions ; tests unitaires dans `getPriceFromCode.test.ts` (10 tests, db mocké). Tous les tests passent ; suite complète OK.

### File List

- src/server/pricing/getPriceFromCode.ts (new)
- src/server/pricing/getPriceFromCode.test.ts (new)
- src/server/pricing/index.ts (new)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified)
- _bmad-output/implementation-artifacts/3-1-appliquer-le-prix-au-code-via-la-grille-categorie-prix.md (modified)

---

## Senior Developer Review (AI)

**Date :** 2026-02-07  
**Outcome :** Changes Requested → corrections appliquées (findUnique + JSDoc)

**Résumé :** AC #1 et toutes les tâches sont implémentées. Fichiers revus : `src/server/pricing/*`. Aucun fichier _bmad/_bmad-output inclus dans la revue code.

**Git vs File List :** Le module `src/server/pricing/` est non commité (untracked). La File List de la story est cohérente avec les fichiers créés/modifiés. **Recommandation :** commiter le module pour traçabilité.

**Corrections appliquées pendant la revue :**
- **MEDIUM** — Utilisation de `findUnique` au lieu de `findFirst` pour la clé unique `(tenantId, categoryLetter)` : alignement schéma Prisma, sémantique plus claire. [getPriceFromCode.ts]
- **LOW** — JSDoc `extractCategoryLetter` : précision « A–Z ASCII uniquement (pas de lettres accentuées en MVP) ». [getPriceFromCode.ts]

**Action items restants (optionnels) :**
- ~~**MEDIUM (process)** — Commiter `src/server/pricing/`~~ → fait (commit 4fef8bc).
- ~~**LOW** — Validation de `tenantId` (chaîne vide)~~ → fait (guard `!tenantId?.trim()` + test).

**Re-review (2026-02-07) :** Module commité, guard tenantId + tests en place. 11 tests passent. **Outcome : Approve.** Aucun point bloquant restant.

**Change Log**

- 2026-02-07 : Code review (AI) — findUnique + JSDoc appliqués ; statut in-progress en attente de commit.
- 2026-02-07 : Re-review après commit + guard tenantId → story approuvée, statut → done.
