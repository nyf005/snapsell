# Story 1.4: Configurer la grille catégories→prix

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur ou manager**,
I want **configurer une grille catégories→prix (ex. A, B, C → montants)**,
so that **le prix soit appliqué automatiquement à partir de la lettre du code**.

## Acceptance Criteria

1. **Given** je suis connecté au dashboard de mon tenant  
   **When** j'accède à la configuration et je saisis les montants par catégorie (ex. A = 5000, B = 10000, C = 15000)  
   **Then** la grille est enregistrée pour mon tenant et utilisée pour le calcul du prix à partir du code (FR11)  
   **And** FR2 couvert

## Tasks / Subtasks

- [x] Task 1 : Modèle de données grille catégories→prix (AC: #1)
  - [x] Définir le schéma Prisma pour stocker la grille par tenant (ex. table `category_prices` : tenant_id, category_letter, amount_cents ou amount) ; respecter snake_case en DB et @map
  - [x] Migration Prisma + contrainte d'unicité (tenant_id, category_letter) pour éviter doublons par catégorie
  - [ ] Optionnel : prévoir seed avec catégories A/B/C + montants par défaut pour tenant demo (aligné architecture § Migrations)
- [x] Task 2 : API tRPC pour la grille (AC: #1)
  - [x] Router tRPC protégé (protectedProcedure) : getCategoryPrices (lecture grille du tenant), setCategoryPrices ou upsert (écriture) ; tenantId uniquement depuis ctx.session.user.tenantId
  - [x] Validation Zod des entrées (catégorie : lettre, mot ou libellé composé ; pas de doublons ; montant ≥ 0) ; TRPCError en cas d'erreur
- [x] Task 3 : Page Paramètres / Grille dans le dashboard (AC: #1)
  - [x] Créer la route `src/app/(dashboard)/parametres/` (ou `settings/`) avec une section ou page « Grille catégories→prix »
  - [x] Formulaire : saisie des montants par catégorie (ex. A, B, C ou libellés) ; chargement grille existante via tRPC, enregistrement via mutation
  - [x] UI : shadcn/ui + Tailwind (Input, Button, Label, Card) ; cohérence avec login/signup et layout dashboard
- [x] Task 4 : Intégration navigation dashboard (AC: #1)
  - [x] Lien ou onglet « Paramètres » / « Configuration » dans le layout dashboard pour accéder à la grille ; accès réservé aux rôles autorisés (Owner, Manager — pas Agent si scope limité commandes/preuves)

## Dev Notes

- **FR couvert** : FR2 — Le vendeur (ou manager) peut configurer une grille catégories→prix (ex. A, B, C → montants). Cette grille sera utilisée en Epic 3 (FR11) pour appliquer le prix au code à partir de la lettre du code.
- **Stack (archi §11)** : T3 sur Vercel ; pas de workers dans cette story. Données en Postgres (Neon) via Prisma ; API dashboard via tRPC protégée par session.
- **Modèle de domaine** : Un tenant a une grille de prix par catégorie (lettre → montant). Les codes en live (ex. A12, B7) utiliseront la première lettre pour résoudre le prix via cette grille (implémenté en story 3.1).
- **Sécurité (archi §10)** : Isolation tenant stricte ; toutes les requêtes grille filtrées par tenant_id depuis la session ; pas d'API publique.
- **UI :** Pour toute story avec interface utilisateur (formulaires, pages, dashboard), utiliser **shadcn/ui + Tailwind** comme base (composants Input, Button, Label, Card, etc.) pour cohérence et accessibilité.

### Project Structure Notes

- **Stories 1.1–1.3** : `src/app/(auth)/`, `src/app/(dashboard)/dashboard/`, `src/server/auth.ts`, `src/server/api/trpc.ts` (protectedProcedure), routers auth. Pas de route `parametres` ni de modèle category_prices.
- **Cette story** : ajouter `prisma/schema` (CategoryPrice ou équivalent), `src/server/api/routers/` (ex. `settings.ts` ou `categoryPrices.ts`), `src/app/(dashboard)/parametres/` (page grille). Référence : [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries], mapping FR → `parametres` (grille catégories).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1, Story 1.4] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#8. Data Storage] — Schéma DB, contraintes
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — Naming snake_case, Zod, tRPC, TRPCError
- [Source: _bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping] — Pricing / codes (FR11–FR13) → Prisma (live_items, category_prices)

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif** : Un vendeur ou manager connecté au dashboard peut **configurer une grille** qui associe des lettres de catégorie (ex. A, B, C) à des montants (ex. 5000, 10000, 15000). Cette grille est stockée par tenant et servira plus tard (Epic 3) à dériver le prix d'un code à partir de sa première lettre (ex. A12 → prix de A).
- **Valeur** : FR2 couvert ; base pour FR11 (calcul automatique du prix en live sans saisie manuelle).

### Ce qui existe déjà (Stories 1.1–1.3)

- **Auth** : NextAuth Credentials + JWT ; session avec `tenantId` et `role` (Owner, Manager, Vendeur, Agent). Page login, signup, dashboard protégé.
- **tRPC** : `createTRPCContext` avec session ; `protectedProcedure` qui exige une session et permet d'utiliser `ctx.session.user.tenantId`. Aucun router « paramètres » ou « grille » pour l’instant.
- **Prisma** : Modèles Tenant, User (avec tenantId, role), Account, Session, VerificationToken. Aucune table pour la grille catégories→prix.
- **Dashboard** : Layout avec header et bouton Déconnexion ; page dashboard basique. Pas encore de sous-route `parametres` ou `settings`.

### Pièges à éviter

- **Ne pas** accepter `tenantId` depuis le body ou les query params : uniquement depuis `ctx.session.user.tenantId` (isolation tenant).
- **Ne pas** créer une page paramètres sans la protéger (auth + vérification session).
- **Ne pas** inventer un autre pattern de stockage (ex. JSON brut sur Tenant) si l’architecture mentionne une table dédiée (category_prices) ; une table normalisée permet évolution et contraintes (unicité par tenant + catégorie).
- **Ne pas** oublier les rôles : seuls Owner/Manager (et éventuellement Vendeur selon produit) doivent pouvoir modifier la grille ; Agent = accès limité commandes/preuves (voir epics).

### Dépendances techniques

- **Prisma** : Nouveau modèle (ex. `CategoryPrice` avec `tenantId`, `categoryLetter`, `amountCents` ou `amount`) ; relation Tenant → CategoryPrice. Migrations avec `prisma migrate dev`.
- **tRPC** : Nouveau router (ex. `settings` ou `categoryPrices`) avec procedures en `protectedProcedure` ; lecture/écriture filtrées par `ctx.session.user.tenantId`.
- **Zod** : Schémas pour les entrées (liste de { categoryLetter, amount } ou équivalent) ; montants en centimes ou unité fixe pour éviter erreurs flottant.

### Fichiers à créer / modifier (indicatif)

- **Créer** : `prisma/schema.prisma` — ajout modèle CategoryPrice (ou category_prices en snake_case avec @map). Migration associée.
- **Créer** : `src/server/api/routers/settings.ts` (ou `categoryPrices.ts`) — getCategoryPrices, setCategoryPrices ; enregistrer le router dans `root.ts`.
- **Créer** : `src/app/(dashboard)/parametres/page.tsx` (ou `settings/page.tsx`) — page avec formulaire grille ; useQuery pour charger, useMutation pour sauvegarder.
- **Modifier** : `src/server/api/root.ts` — ajouter le router settings/categoryPrices.
- **Modifier** : `src/app/(dashboard)/layout.tsx` — ajouter lien navigation vers Paramètres (sidebar ou header), si pas déjà prévu.
- **Optionnel** : `prisma/seed.ts` — ajouter des lignes A/B/C par défaut pour un tenant demo (aligné architecture : « tenant demo + catégories A/B/C + frais par défaut »).

### Conformité architecture

- **Stack** : Vercel, Neon, Prisma, tRPC, Zod. Pas de workers ni webhook dans cette story.
- **Sécurité** : Isolation tenant sur toutes les requêtes ; RBAC (Owner/Manager peuvent configurer la grille).
- **Patterns** : DB snake_case ; Prisma @map ; Zod pour validation ; TRPCError pour erreurs (BAD_REQUEST, UNAUTHORIZED si accès refusé).

### Exigences librairies / frameworks

- **Prisma** : déjà utilisé ; pas de nouvelle dépendance pour le schéma.
- **Zod** : déjà utilisé (auth) ; réutiliser pour les schémas de la grille.
- **UI** : shadcn/ui + Tailwind (Input, Button, Label, Card) pour la page Paramètres / Grille, cohérent avec login et signup.

### Structure des fichiers (rappel)

- `src/app/(dashboard)/parametres/` — page(s) de configuration (grille catégories ; plus tard livraison, WhatsApp).
- `src/server/api/routers/` — nouveau router pour paramètres/grille ; toutes les procedures en protectedProcedure avec tenantId depuis la session.
- `prisma/schema.prisma` — nouveau modèle pour la grille ; migrations dans `prisma/migrations/`.

### Tests (optionnel MVP)

- Test unitaire sur le schéma Zod de la grille (montants positifs, catégories valides). Test d’intégration tRPC : get/set avec tenantId depuis contexte. Optionnel : test e2e « ouvrir Paramètres, modifier une catégorie, sauvegarder ».

---

## Technical Requirements (Dev Agent Guardrails)

- **Isolation tenant** : Toute procédure tRPC qui lit/écrit la grille doit être protégée et utiliser `ctx.session.user.tenantId` dans les clauses `where` / `data`. Ne jamais faire confiance au client pour tenantId.
- **Modèle de données** : Stocker la grille de façon normalisée (une ligne par tenant + catégorie) avec contrainte d’unicité (tenant_id, category_letter). Montants : préférer entier (centimes) pour éviter problèmes de précision.
- **Page Paramètres** : Accessible uniquement aux utilisateurs connectés (layout dashboard déjà protégé). Formulaire avec champs par catégorie (ex. A, B, C) et montant ; chargement initial via tRPC getCategoryPrices ; sauvegarde via setCategoryPrices.
- **Navigation** : Lien « Paramètres » ou « Configuration » dans le layout dashboard pour accéder à la grille (sidebar ou header).

---

## Architecture Compliance

- **§10 Security** : Isolation tenant + RBAC ; pas d’API publique ; accès grille réservé aux rôles autorisés (Owner, Manager).
- **Implementation Patterns** : Contexte tRPC avec session ; tenantId uniquement depuis session ; naming DB snake_case, Prisma @map ; Zod pour validation ; TRPCError pour erreurs.
- **§11 Stack** : Vercel (web), Prisma, tRPC ; pas de workers dans cette story.
- **§8 Data Storage** : Nouvelle table (ex. category_prices) avec index sur tenant_id et contrainte unique (tenant_id, category_letter).

---

## Library & Framework Requirements

- Prisma (existant), Zod (existant), tRPC (existant). Aucune nouvelle dépendance requise pour la grille.
- UI : shadcn/ui + Tailwind (Input, Button, Label, Card) pour la page Paramètres / Grille, cohérent avec le reste du dashboard.

---

## File Structure Requirements

- **Nouveaux fichiers** : `prisma/migrations/...` (migration pour category_prices), `src/server/api/routers/settings.ts` (ou `categoryPrices.ts`), `src/app/(dashboard)/parametres/page.tsx`.
- **Modifications** : `prisma/schema.prisma` (modèle CategoryPrice), `src/server/api/root.ts` (enregistrement du router), `src/app/(dashboard)/layout.tsx` (lien Paramètres si pas déjà présent).
- Ne pas déplacer ni renommer les routes (auth) ou (dashboard)/dashboard ; ajouter uniquement la branche parametres sous (dashboard).

---

## Testing Requirements

- Optionnel : tests sur le schéma Zod de la grille (validation entrées). Optionnel : test d’intégration tRPC (get/set avec session mockée). Pas de régression sur login/signup ou isolation tenant.

---

## Previous Story Intelligence

- **Story 1.3** : Page login, session dans tRPC, `protectedProcedure`, bouton Déconnexion dans le layout dashboard. Fichiers créés : `login/page.tsx`, `layout.tsx`, `sign-out-button.tsx`, validations login. Pour 1.4 : réutiliser `protectedProcedure` pour tout nouveau router (settings/categoryPrices) ; ne jamais dériver tenantId du body. Layout dashboard : idéal pour ajouter un lien « Paramètres » vers `/parametres`.
- **Story 1.2** : NextAuth, signup, création tenant+user, callbacks JWT avec tenantId et role. Schéma Prisma Tenant, User. Pour 1.4 : la grille est une donnée du tenant ; relation Tenant → CategoryPrice (one-to-many).
- **Review 1.3** : Open redirect corrigé ; validation Zod côté serveur dans authorize ; log tRPC limité au dev. Pour 1.4 : appliquer les mêmes bonnes pratiques (validation Zod sur les entrées grille, pas de données sensibles exposées).

---

## Project Context Reference

- **Artefacts BMAD** : `_bmad-output/planning-artifacts/` (prd.md, architecture.md, epics.md) ; `_bmad-output/implementation-artifacts/` (sprint-status.yaml, stories 1-1 à 1-4).
- **Conventions** : document_output_language French ; stack T3 + NextAuth + Prisma ; UI shadcn/ui + Tailwind.

---

## Story Completion Status

- **Status** : ready-for-dev
- **Completion note** : Ultimate context engine analysis completed — comprehensive developer guide created for story 1.4 (Configurer la grille catégories→prix).

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Implémentation initiale : modèle CategoryPrice, API settings, page Paramètres, navigation et RBAC (Owner/Manager).
- Post-CR (2026-02-05) : Zod unicité des catégories (pas de doublons) ; catégories = lettres, mots ou libellés (1–50 car.) ; message montant « ne peut pas être négatif » ; RBAC centralisé dans `~/lib/rbac` (canManageGrid) ; File List et tâches complétées dans la story.

### File List

- `prisma/schema.prisma` — modèle CategoryPrice, relation Tenant
- `prisma/migrations/20260204180000_add_category_prices/migration.sql` — table category_prices, unique(tenant_id, category_letter)
- `src/server/api/routers/settings.ts` — getCategoryPrices, setCategoryPrices (protectedProcedure, RBAC)
- `src/server/api/routers/settings.schema.ts` — Zod (catégorie libre, unicité des catégories, montant ≥ 0)
- `src/server/api/root.ts` — enregistrement settingsRouter
- `src/lib/rbac.ts` — canManageGrid, GRID_MANAGER_ROLES (partagé layout / page / router)
- `src/app/(dashboard)/parametres/page.tsx` — page grille, auth + canManageGrid, redirect
- `src/app/(dashboard)/parametres/_components/pricing-grid-content.tsx` — formulaire grille, tRPC, shadcn/ui
- `src/app/(dashboard)/layout.tsx` — canManageGrid, AppSidebar canManageGrid
- `src/app/(dashboard)/_components/app-sidebar.tsx` — lien « Grille de prix » vers /parametres, requiresGridRole

---

## Senior Developer Review (AI)

**Reviewer:** Fabrice (CR workflow)  
**Date:** 2026-02-05  
**Story:** 1-4-configurer-la-grille-categories-prix

### Git vs Story Discrepancies

- **Fichiers modifiés/créés pour la story mais absents du File List :** migration `prisma/migrations/20260204180000_add_category_prices/`, `prisma/schema.prisma` (modèle CategoryPrice), `src/server/api/routers/settings.ts`, `src/server/api/routers/settings.schema.ts`, `src/server/api/root.ts`, `src/app/(dashboard)/parametres/page.tsx`, `src/app/(dashboard)/parametres/_components/pricing-grid-content.tsx`, `src/app/(dashboard)/layout.tsx` (canManageGrid), `src/app/(dashboard)/_components/app-sidebar.tsx` (lien Grille de prix / Paramètres).
- **Tâches toutes [ ] dans la story alors que l’implémentation est faite** → statut de complétion incohérent.

### Issues trouvées

| Sévérité | Description | Fichier / preuve |
|----------|-------------|-------------------|
| **CRITICAL** | Toutes les tâches restent [ ] et le File List est vide alors que l’implémentation existe (modèle, API, page, navigation, RBAC). | Story file § Tasks, § Dev Agent Record → File List |
| **MEDIUM** | `setCategoryPrices` accepte un tableau avec `categoryLetter` en doublon (ex. deux "B") ; comportement « last wins » sans erreur métier. Pas de `.refine()` pour unicité des lettres. | `src/server/api/routers/settings.schema.ts` |
| **MEDIUM** | Aucun test unitaire ou d’intégration pour le router `settings` ou les schémas Zod (optionnel en story mais recommandé). | Pas de `settings.test.ts` / `settings.schema.test.ts` |
| **MEDIUM** | Fichiers réellement modifiés/créés pour 1-4 non documentés dans le Dev Agent Record. | Story § File List vide |
| **LOW** | Zod : `amountCents` avec `min(0)` alors que le message dit « Le montant doit être positif » ; 0 autorisé = message trompeur ou règle métier à clarifier. | `settings.schema.ts` L12 |
| **LOW** | Seed optionnel (A/B/C + montants par défaut pour tenant demo) non implémenté. | Story Task 1 optionnel |
| **LOW** | Vérification du rôle (Owner/Manager) dupliquée : `layout.tsx`, `parametres/page.tsx`, `settings.ts`. Possible extraction dans une constante partagée. | layout.tsx L23–24, page.tsx L19–20, settings.ts L11–14 |

### Validation AC

- **AC#1** (grille enregistrée par tenant, saisie montants par catégorie) : **IMPLEMENTED** — page Paramètres, formulaire catégorie + montant, tRPC get/set, `tenantId` uniquement depuis la session, contrainte unique (tenant_id, category_letter).

### Décision

- **Done** (post-CR) : corrections appliquées — unicité Zod (pas de doublons), catégories libres (lettres/mots/libellés), message montant corrigé, RBAC partagé (`~/lib/rbac`), File List et tâches complétées.
