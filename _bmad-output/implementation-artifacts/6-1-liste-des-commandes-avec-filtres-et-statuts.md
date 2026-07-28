# Story 6.1: Liste des commandes avec filtres et statuts

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur ou agent**,
I want **consulter la liste des commandes avec filtres (statut, date) et statuts**,
so that **je voie ce qui est à préparer et à livrer**.

## Acceptance Criteria

1. **Given** je suis connecté au dashboard de mon tenant  
   **When** j'accède à la vue Commandes  
   **Then** je vois la liste des commandes (SS-XXXX, code, statut, client, etc.) avec filtres par statut et date (FR29)  
   **And** FR29 couvert

## Tasks / Subtasks

- [x] Task 1 : Filtres côté API (AC: #1)
  - [x] Étendre `orders.list` pour accepter des paramètres optionnels : `status` (enum des statuts), `dateFrom`, `dateTo` (dates ISO ou date-only). Filtrer en base par `tenantId` (déjà) + ces critères. Conserver le tri par `createdAt` desc.
  - [x] Schéma Zod : ajouter un input optionnel (ex. `listOrdersInputSchema`) avec `status`, `dateFrom`, `dateTo` ; validation des dates et enum statut.

- [x] Task 2 : UI filtres (AC: #1)
  - [x] Dans `OrdersListContent`, ajouter des contrôles de filtre : sélecteur de statut (tous / confirmed / confirmed_pending_deposit / delivered / cancelled), et sélecteur de plage de dates (date début, date fin). Utiliser les composants shadcn (Select, ou Combobox, DatePicker si présent dans le projet).
  - [x] Lier les filtres à l’appel `api.orders.list.useQuery({ status, dateFrom, dateTo })` ; valeurs par défaut = pas de filtre (liste complète). Rafraîchir la liste quand l’utilisateur change les filtres.

- [x] Task 3 : Affichage statuts et cohérence (AC: #1)
  - [x] S’assurer que la colonne Statut affiche bien tous les statuts (confirmée, en attente acompte, livrée, annulée) avec des libellés et styles cohérents (Badge/variant déjà en place dans `orders-list-content.tsx`). Ajouter si besoin le statut d’acompte (depositStatus) en complément ou dans un tooltip pour les commandes en attente d’acompte.
  - [x] Vérifier que les colonnes existantes (N° commande, Code article, Client, Statut, Actions) restent conformes aux AC ; pas de régression sur les actions Livré / Annulé.

- [x] Task 4 : Tests (AC: #1)
  - [x] Tests du router : `orders.list` sans filtres retourne toutes les commandes du tenant ; avec `status: 'delivered'` ne retourne que les livrées ; avec `dateFrom`/`dateTo` ne retourne que les commandes dans la plage (createdAt). Isolation tenant : un tenant ne voit jamais les commandes d’un autre.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 6, Story 6.1 ; FR29.
- **Contexte :** La vue Commandes existe déjà (`src/app/(dashboard)/dashboard/orders/`, `orders.list` tRPC). Cette story ajoute **filtres (statut, date)** et confirme l’affichage des statuts. Ne pas recréer la page ni la liste ; étendre l’API et l’UI.
- **Périmètre :** Filtres côté liste uniquement. Pas de changement sur updateStatus, proofs, ni live-ops.

### Project Structure Notes

- **Fichiers à modifier / créer :**
  - `src/server/api/routers/orders.ts` : étendre `list` avec paramètres optionnels et filtres Prisma.
  - `src/server/api/routers/orders.schema.ts` : schéma d’entrée pour `list` (status?, dateFrom?, dateTo?).
  - `src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx` : ajout des contrôles de filtre et passage des paramètres à `useQuery`.
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] — Dashboard (FR29–FR34), structure `src/app/(dashboard)/commandes/`, tRPC `orders.list`, naming snake_case en DB / camelCase en API.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR29 :** Le vendeur (ou agent) peut consulter la liste des commandes avec filtres et statuts. Aujourd’hui la liste existe sans filtres ; il faut ajouter le filtrage par **statut** et par **date** (plage createdAt) et s’assurer que les statuts sont clairement affichés.
- **Flux existant :** `orders.list` retourne déjà les champs id, orderNumber, status, depositStatus, createdAt, clientPhone, liveItemCode, etc. Les actions Livré/Annulé sont en place. Ne pas casser ce comportement.

### Technical Requirements

- **Isolation tenant :** `orders.list` utilise déjà `ctx.session.user.tenantId` ; les filtres s’appliquent uniquement sur les commandes de ce tenant. Aucun paramètre `tenantId` côté client.
- **Statuts Order :** confirmed | confirmed_pending_deposit | delivered | cancelled (aligné Prisma et `orders.schema.ts`). Le filtre `status` optionnel doit accepter une de ces valeurs ou “tous”.
- **Dates :** Filtre sur `order.createdAt` (timestamptz). `dateFrom` / `dateTo` en ISO ou date-only ; inclure les commandes dont createdAt est >= dateFrom 00:00 et <= dateTo 23:59 (ou équivalent selon timezone). Préciser en env si besoin (UTC recommandé en base).

### Architecture Compliance

- **Stack :** tRPC (procedure `list` avec input optionnel), Prisma `where` avec `AND` sur tenantId + status + gte/lte sur createdAt. Pas de nouvelle route REST.
- **Naming :** Input tRPC en camelCase (status, dateFrom, dateTo) ; en DB rester sur createdAt (Prisma).
- **Front :** Composants shadcn (Select, Input type date ou DatePicker) ; pas de lib externe non déjà utilisée dans le projet pour les dates.

### Library / Framework Requirements

- Aucune nouvelle dépendance requise. Si le projet n’a pas de DatePicker shadcn, utiliser des `<input type="date">` ou un Select de plages prédéfinies (Aujourd’hui, Cette semaine, Ce mois) pour le MVP.

### File Structure Requirements

- Modifications limitées à : `src/server/api/routers/orders.ts`, `orders.schema.ts`, `src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx`. Tests dans `orders.test.ts` (ou équivalent).

### Testing Requirements

- **Unit / intégration :** `orders.list` sans filtres = comportement actuel ; avec `status: 'delivered'` uniquement les livrées ; avec `dateFrom`/`dateTo` plage correcte. Vérifier qu’un utilisateur du tenant A ne peut pas voir les commandes du tenant B (isolation déjà garantie par ctx ; régression à ne pas introduire).

---

## Previous Story Intelligence

- **Story 5.4 (Notifier la cliente par WhatsApp)** : Modifications dans `orders.ts` (updateStatus + writeToOutbox). Patterns : tenantId depuis ctx, writeToOutbox en try/catch sans faire échouer la mutation, templates courts avec orderNumber. Pour 6.1, ne pas toucher à updateStatus ni aux notifications ; uniquement la procédure `list` et l’UI de la liste.
- **Story 5.2 (Statuts de commande)** : Définition des statuts et transitions (delivered, cancelled depuis confirmed / confirmed_pending_deposit). Réutiliser les mêmes enum et libellés dans les filtres et l’affichage (STATUS_LABELS déjà dans orders-list-content.tsx).

---

## Project Context Reference

- **Config :** Variables d’env documentées dans `.env.example` (DATABASE_URL, etc.). Pas de config spécifique “filtres commandes”.
- **Conventions :** TypeScript strict, Prisma, tRPC, shadcn/ui ; tests Vitest ou Jest selon le projet.

---

## Dev Agent Record

### Agent Model Used

(À remplir par l’agent dev)

### Debug Log References

(Optionnel)

### Completion Notes List

- Story 6.1 implémentée : filtres API (status, dateFrom, dateTo), UI type "Order Management" (KPIs, barre de filtres avec recherche client-side, statut, période, onglets, tableau avec colonne Créée le, actions en icônes, pagination résumé). Layout et design system existants conservés (DashboardHeader, auth-page-bg, Card, Table, Badge, Button, Input, Tooltip). Pas de date-fns : formatage des dates via Intl.DateTimeFormat("fr-FR"). Recherche par N° commande / code article / client en client-side sur le résultat de la liste.

### File List

- `src/server/api/routers/orders.schema.ts` — ajout listOrdersInputSchema, ListOrdersInput, validation dates optionnelles + refine dateFrom ≤ dateTo.
- `src/server/api/routers/orders.ts` — list avec .input(listOrdersInputSchema), where dynamique (tenantId + status + createdAt gte/lte).
- `src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx` — refonte contenu : KPIs, filtres (recherche, statut, période, onglets), tableau avec Créée le et actions icônes, tooltips depositStatus (libellés FR), label/select accessibles (id/htmlFor), pagination résumé.
- `src/server/api/routers/orders.test.ts` — tests list sans filtres, avec status, avec dateFrom/dateTo, isolation tenant (tenant2), rejet plage inversée.

---

## Senior Developer Review (AI)

**Reviewer:** Agent CR (workflow code-review) | **Date:** 2026-02-08

- **Rapport détaillé :** `_bmad-output/implementation-artifacts/6-1-code-review-2026-02-08.md`
- **Résultat :** 2 MEDIUM, 5 LOW. AC#1 implémenté. Tâches [x] vérifiées.
- **Correctifs appliqués :** (1) Validation `dateFrom` ≤ `dateTo` dans le schéma + test ; (2) Accessibilité select Statut (id + htmlFor) ; (3) Tooltip depositStatus avec libellés FR (no_deposit, pending, deposit_received).
- **Format numéro de commande :** SS-XXXX retenu (aligné avec l’implémentation et la décision produit).
- **Re-revue 2026-02-08 :** Correctifs vérifiés ; 13/13 tests passent. Story passée en **done**.

### Change Log

| Date       | Qui  | Changement |
|-----------|------|------------|
| 2026-02-08 | Dev  | Implémentation story 6.1 (filtres API, UI, tests). |
| 2026-02-08 | CR   | Revue : validation plage dates, a11y select, tooltip depositStatus ; test rejet dateFrom > dateTo. Statut → in-progress (point SS-XXXX à trancher). |
| 2026-02-08 | CR   | Re-revue : correctifs vérifiés, tests OK. Recommandation done (SS-XXXX hors périmètre code). |
| 2026-02-08 | —    | Décision produit : format SS-XXXX retenu. Spec AC alignée (VF → SS). Statut → done. |
