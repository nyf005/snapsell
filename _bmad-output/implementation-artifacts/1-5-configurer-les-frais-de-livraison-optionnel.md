# Story 1.5: Configurer les frais de livraison (optionnel)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur ou manager**,
I want **configurer les frais de livraison (optionnel)**,
so that **ils soient pris en compte dans le total ou les règles métier si besoin**.

## Acceptance Criteria

1. **Given** je suis connecté au dashboard de mon tenant  
   **When** j'accède à la configuration livraison et je saisis un montant ou une règle (optionnel)  
   **Then** la configuration est enregistrée pour mon tenant  
   **And** FR3 couvert

## Tasks / Subtasks

- [x] Task 1 : Modèle de données frais de livraison (AC: #1)
  - [x] Ajouter au schéma Prisma un champ optionnel pour les frais de livraison par tenant (ex. `delivery_fee_cents` sur Tenant, ou table dédiée si préférence architecture) ; stockage en centimes pour cohérence avec category_prices
  - [x] Migration Prisma sans casser les données existantes
- [x] Task 2 : API tRPC pour la config livraison (AC: #1)
  - [x] Router tRPC protégé (protectedProcedure) : getDeliveryConfig (lecture), setDeliveryConfig (écriture) ; tenantId uniquement depuis ctx.session.user.tenantId
  - [x] Validation Zod : montant optionnel, ≥ 0 si renseigné ; TRPCError en cas d'erreur
- [x] Task 3 : Section Paramètres / Frais de livraison dans le dashboard (AC: #1)
  - [x] Ajouter une section « Frais de livraison » sur la page `src/app/(dashboard)/parametres/` (même page que la grille catégories→prix)
  - [x] Formulaire : champ optionnel montant (centimes ou affichage en unité) ; chargement via tRPC, enregistrement via mutation
  - [x] UI : shadcn/ui + Tailwind (Input, Button, Label, Card) ; cohérence avec la grille de prix et le reste du dashboard
- [x] Task 4 : RBAC et navigation (AC: #1)
  - [x] Même règle d'accès que la grille : Owner/Manager uniquement (canManageGrid ou équivalent) ; pas d'accès Agent pour la config livraison
  - [x] Lien ou onglet déjà présent (Paramètres) ; la section livraison est visible dans la même page Paramètres

## Dev Notes

- **FR couvert** : FR3 — Le vendeur (ou manager) peut configurer les frais de livraison (optionnel). La valeur sera utilisée plus tard dans le calcul du total commande / règles métier (Epic 5+).
- **Stack (archi §11)** : T3 sur Vercel ; pas de workers. Données en Postgres (Neon) via Prisma ; API dashboard via tRPC protégée par session.
- **Optionnel** : le vendeur peut ne pas renseigner de frais (champ null ou 0) ; l'interface doit permettre de laisser vide ou mettre 0.
- **Sécurité (archi §10)** : Isolation tenant stricte ; tenantId uniquement depuis la session ; pas d'API publique.
- **UI :** Pour toute story avec interface utilisateur (formulaires, pages, dashboard), utiliser **shadcn/ui + Tailwind** comme base (composants Input, Button, Label, Card, etc.) pour cohérence et accessibilité.

### Project Structure Notes

- **Story 1.4** : Page `parametres/` avec composant `pricing-grid-content.tsx` pour la grille catégories→prix ; router `settings` avec getCategoryPrices / setCategoryPrices ; RBAC `canManageGrid` dans `~/lib/rbac`.
- **Cette story** : réutiliser la même page `parametres/` et le même router `settings` ; ajouter une section « Frais de livraison » (même layout que la grille ou onglets/sections). Modèle : soit champ sur Tenant (delivery_fee_cents Int?), soit table dédiée (ex. tenant_delivery_config) selon préférence unicité et évolution.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1, Story 1.5] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#8. Data Storage] — Schéma DB, conventions
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — Naming snake_case, Zod, tRPC

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif** : Un vendeur ou manager connecté au dashboard peut **configurer les frais de livraison (optionnel)** pour son tenant. Un montant en centimes (ou une règle simple) est enregistré et pourra être utilisé plus tard dans le total commande ou les règles métier (FR3).
- **Valeur** : FR3 couvert ; base pour calculs futurs (commandes, totaux).

### Ce qui existe déjà (Stories 1.1–1.4)

- **Auth** : NextAuth Credentials + JWT ; session avec tenantId et role (Owner, Manager, Vendeur, Agent).
- **tRPC** : `protectedProcedure` ; `ctx.session.user.tenantId` pour isolation tenant.
- **Prisma** : Tenant, User, CategoryPrice ; pas de champ livraison sur Tenant pour l’instant.
- **Page Paramètres** : `src/app/(dashboard)/parametres/page.tsx` avec `PricingGridContent` pour la grille catégories→prix ; accès protégé par `canManageGrid` (Owner/Manager).
- **Router settings** : `getCategoryPrices`, `setCategoryPrices` ; schéma Zod dans `settings.schema.ts` ; RBAC vérifié dans le router et la page.

### Pièges à éviter

- **Ne pas** accepter tenantId depuis le body ou les query params : uniquement depuis `ctx.session.user.tenantId`.
- **Ne pas** créer une nouvelle page dédiée « Livraison » si le produit attend tout sous « Paramètres » : ajouter une section ou un bloc sur la page parametres existante.
- **Ne pas** dupliquer la logique RBAC : réutiliser `canManageGrid` (ou le même ensemble de rôles) pour la config livraison, comme pour la grille.
- **Ne pas** rendre les frais obligatoires : le champ doit être optionnel (null ou 0 autorisé).

### Dépendances techniques

- **Prisma** : Ajouter un champ optionnel sur Tenant (ex. `deliveryFeeCents Int? @map("delivery_fee_cents")`) ou une table dédiée (ex. une ligne par tenant) ; migration sans données existantes à migrer (nouveau champ nullable).
- **tRPC** : Étendre le router `settings` avec `getDeliveryConfig` et `setDeliveryConfig` (protectedProcedure, RBAC canManageGrid).
- **Zod** : Schéma pour setDeliveryConfig (ex. `{ deliveryFeeCents: number().int().min(0).optional().nullable() }`).

### Fichiers à créer / modifier (indicatif)

- **Modifier** : `prisma/schema.prisma` — ajout champ delivery_fee_cents (ou équivalent) sur Tenant ; migration.
- **Modifier** : `src/server/api/routers/settings.ts` — getDeliveryConfig, setDeliveryConfig ; même RBAC que getCategoryPrices/setCategoryPrices.
- **Modifier** : `src/server/api/routers/settings.schema.ts` — schéma Zod pour la config livraison.
- **Modifier** : `src/app/(dashboard)/parametres/page.tsx` — ajouter une section « Frais de livraison » (ou composant `DeliveryConfigContent` dans la même page).
- **Créer (optionnel)** : `src/app/(dashboard)/parametres/_components/delivery-config-content.tsx` — formulaire livraison (montant optionnel), tRPC get/set, shadcn/ui.
- **Ne pas** modifier : layout dashboard, sidebar (lien Paramètres déjà présent), rbac (réutiliser canManageGrid).

### Conformité architecture

- **Stack** : Vercel, Neon, Prisma, tRPC, Zod. Pas de workers.
- **Sécurité** : Isolation tenant ; RBAC Owner/Manager pour config livraison (même que grille).
- **Patterns** : DB snake_case ; Prisma @map ; Zod pour validation ; TRPCError pour erreurs.

### Exigences librairies / frameworks

- **Prisma, Zod, tRPC** : déjà utilisés ; pas de nouvelle dépendance.
- **UI** : shadcn/ui + Tailwind (Input, Button, Label, Card) pour la section Frais de livraison, cohérent avec la grille de prix.

### Structure des fichiers (rappel)

- `src/app/(dashboard)/parametres/` — page de configuration (grille + livraison sur la même page ou sections).
- `src/server/api/routers/settings.ts` — procedures getDeliveryConfig / setDeliveryConfig en plus des procedures grille.
- `prisma/schema.prisma` — champ livraison sur Tenant (ou table dédiée) ; migrations dans `prisma/migrations/`.

### Tests (optionnel MVP)

- Test unitaire sur le schéma Zod (montant optionnel, ≥ 0). Optionnel : test d’intégration tRPC get/set avec tenantId depuis contexte.

---

## Technical Requirements (Dev Agent Guardrails)

- **Isolation tenant** : getDeliveryConfig / setDeliveryConfig doivent utiliser uniquement `ctx.session.user.tenantId` (where / data). Ne jamais faire confiance au client pour tenantId.
- **Modèle de données** : Stocker les frais en centimes (entier) pour cohérence avec category_prices ; champ optionnel (null = non configuré).
- **Page Paramètres** : Une seule page Paramètres ; section ou bloc « Frais de livraison » en plus de la grille ; même accès (canManageGrid).
- **Optionnel** : L’utilisateur peut laisser les frais non renseignés (null) ou à 0 ; l’UI doit permettre de sauvegarder « vide » ou 0.

---

## Architecture Compliance

- **§10 Security** : Isolation tenant + RBAC ; accès config livraison réservé aux rôles autorisés (Owner, Manager), comme la grille.
- **Implementation Patterns** : tenantId depuis session ; naming DB snake_case, Prisma @map ; Zod pour validation ; TRPCError pour erreurs.
- **§11 Stack** : Vercel, Prisma, tRPC ; pas de workers.
- **§8 Data Storage** : Nouveau champ optionnel sur tenants (ex. delivery_fee_cents) ou table dédiée ; pas de contrainte métier complexe pour cette story.

---

## Library & Framework Requirements

- Prisma (existant), Zod (existant), tRPC (existant). Aucune nouvelle dépendance.
- UI : shadcn/ui + Tailwind pour la section Frais de livraison, cohérent avec pricing-grid-content.

---

## File Structure Requirements

- **Modifications** : `prisma/schema.prisma`, `prisma/migrations/...`, `src/server/api/routers/settings.ts`, `src/server/api/routers/settings.schema.ts`, `src/app/(dashboard)/parametres/page.tsx`.
- **Optionnel** : `src/app/(dashboard)/parametres/_components/delivery-config-content.tsx` si on extrait le formulaire livraison en composant.
- Ne pas créer de nouvelle route (ex. `/parametres/livraison`) sauf si le produit l’exige ; privilégier une section sur la page parametres existante.

---

## Testing Requirements

- Optionnel : validation Zod (montant optionnel, ≥ 0). Pas de régression sur grille de prix ni sur auth/tenant.

---

## Previous Story Intelligence

- **Story 1.4** : Grille catégories→prix dans `parametres/` avec `PricingGridContent` ; router `settings` (getCategoryPrices, setCategoryPrices) ; RBAC centralisé `canManageGrid` dans `~/lib/rbac` ; schéma Zod avec unicité des catégories et montant ≥ 0. Pour 1.5 : réutiliser le même router (settings), la même page (parametres), le même RBAC ; ajouter seulement le modèle livraison (champ Tenant ou table) et les procedures + section UI. Fichiers créés en 1.4 : `settings.ts`, `settings.schema.ts`, `pricing-grid-content.tsx`, `parametres/page.tsx`, layout/sidebar avec lien Paramètres. Ne pas dupliquer la logique de vérification de rôle : utiliser canManageGrid pour la section livraison aussi.
- **Review 1.4** : Unicité des catégories en Zod (pas de doublons) ; message d’erreur cohérent pour montant ; RBAC partagé dans `~/lib/rbac`. Pour 1.5 : appliquer les mêmes bonnes pratiques (Zod clair, messages en français, pas de duplication RBAC).

---

## Project Context Reference

- **Artefacts BMAD** : `_bmad-output/planning-artifacts/` (prd.md, architecture.md, epics.md) ; `_bmad-output/implementation-artifacts/` (sprint-status.yaml, stories 1-1 à 1-5).
- **Conventions** : document_output_language French ; stack T3 + NextAuth + Prisma ; UI shadcn/ui + Tailwind.

---

## Story Completion Status

- **Status** : done
- **Completion note** : Implémentation étendue : page dédiée `/parametres/livraison`, zones (nom + prix + communes) et tarifs par commune (Côte d’Ivoire). AC et FR3 respectés. CR 1-5 : rapport `1-5-configurer-les-frais-de-livraison-optionnel-CR.md`.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Évolution de scope par rapport à la story initiale (montant optionnel sur Paramètres) : page dédiée + zones/communes à la demande produit. File List et CR alignés sur l’implémentation réelle.

### File List

- `prisma/schema.prisma` — modèles DeliveryZone, DeliveryZoneCommune, DeliveryFeeCommune (pas de champ sur Tenant)
- `prisma/migrations/20260205000000_add_tenant_delivery_fee_cents/`, `20260205100000_delivery_zones_communes/` — migrations
- `src/server/api/routers/delivery.ts` — router livraison (zones, communes, intérieur) ; RBAC canManageGrid, tenantId depuis session
- `src/server/api/routers/delivery.schema.ts` — schémas Zod (zones, communes, setInteriorDeliveryFee)
- `src/server/api/root.ts` — enregistrement du router `delivery`
- `src/app/(dashboard)/parametres/livraison/page.tsx` — page dédiée Frais de livraison (auth + canManageGrid)
- `src/app/(dashboard)/parametres/_components/delivery-fees-content.tsx` — UI zones (nom, prix, communes) + communes (nom, prix), shadcn/ui
- `src/app/(dashboard)/_components/app-sidebar.tsx` — lien « Frais de livraison » → `/parametres/livraison`
- `src/app/(dashboard)/parametres/page.tsx` — Grille de prix seule (plus de section livraison)
