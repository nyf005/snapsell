# Story 6.2: Proofs inbox (preuves à valider dans le flux)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur ou agent**,
I want **consulter l'espace preuves (Proofs inbox) et valider/refuser les preuves d'acompte**,
so that **les preuves soient traitées au même endroit que les commandes**.

## Acceptance Criteria

1. **Given** des commandes avec preuve en attente  
   **When** j'accède à la liste commandes (ou filtre « Preuve en attente »)  
   **Then** je vois les lignes avec preuve à valider et je peux cliquer Valider / Refuser (FR30)  
   **And** FR30 couvert

## Tasks / Subtasks

- [x] Task 1 : Proofs inbox production-ready (AC: #1)
  - [x] Vérifier que la page `/dashboard/proofs` affiche toutes les preuves en attente (proofs.listPending) avec N° commande, client, preuve (image via `/api/proofs/[proofId]/media` ou texte), boutons Valider / Refuser. Corriger si besoin le filtre côté API (preuves status=pending ; ordre cohérent, ex. createdAt desc).
  - [x] Accessibilité : labels explicites (aria-label sur boutons), libellés de colonnes, état vide clair (« Aucune preuve en attente »). Cohérence avec design system (Badge, Button, Table) et vocabulaire FR (Preuve, Valider, Refuser).
  - [x] Navigation : s’assurer que l’entrée « Preuves » (Proofs inbox) est visible et accessible depuis la sidebar du dashboard (même niveau que Commandes).

- [x] Task 2 : Accès « Preuve en attente » depuis la liste commandes (AC: #1)
  - [x] Dans la vue Commandes (`orders-list-content` ou équivalent), ajouter un moyen d’accéder aux preuves en attente : soit un filtre/onglet « Preuve en attente » qui affiche uniquement les commandes ayant une preuve pending, soit un lien/CTA visible (ex. badge ou lien « X preuve(s) à valider ») pointant vers `/dashboard/proofs`. L’AC autorise « liste commandes (ou filtre « Preuve en attente ») » — au moins une de ces options doit être implémentée.
  - [x] Si filtre : étendre `orders.list` (ou réutiliser) pour accepter un paramètre optionnel type `proofPendingOnly: true` et filtrer les commandes qui ont au moins une PaymentProof en status pending. Afficher les mêmes colonnes + actions ; depuis une ligne, permettre d’ouvrir la preuve ou rediriger vers Proofs inbox pour Valider/Refuser.
  - [x] Si lien/badge uniquement : compter les preuves en attente (proofs.listPending ou count) et afficher un lien vers `/dashboard/proofs` avec le nombre (ex. « 3 preuve(s) à valider »). Pas de duplication de la logique Valider/Refuser — elle reste sur la page Proofs.

- [x] Task 3 : Pas de régression sur Valider/Refuser (AC: #1)
  - [x] S’assurer que les mutations `proofs.approve` et `proofs.reject` restent fonctionnelles (mise à jour preuve + ordre, event log, notification WhatsApp). Aucun changement requis si déjà conformes à 5.3 ; sinon corrections mineures.
  - [x] Gestion d’erreur : afficher un message clair en cas d’échec (preuve déjà traitée, commande pas en attente d’acompte, etc.) sans casser l’UI.

- [x] Task 4 : Tests (AC: #1)
  - [x] Tests du router proofs : listPending retourne uniquement les preuves du tenant avec status pending ; ordre cohérent. Si filtre orders « Preuve en attente » : liste filtrée correctement, isolation tenant.
  - [x] Tests d’isolation : un tenant ne voit jamais les preuves ou commandes d’un autre.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 6, Story 6.2 ; FR30.
- **Contexte :** La page Proofs et les procédures approve/reject existent déjà (Story 5.3). Cette story vise à finaliser l’« espace preuves » (Proofs inbox) et à l’intégrer « dans le flux » : soit via un filtre/onglet « Preuve en attente » sur la liste commandes, soit via un lien/badge depuis la vue Commandes vers Proofs. Ne pas recréer la logique de validation/refus ; réutiliser `proofs.listPending`, `proofs.approve`, `proofs.reject` et la page `/dashboard/proofs`.
- **Périmètre :** UX et intégration (navigation, filtre ou lien depuis commandes, accessibilité, états vides). Pas de changement du modèle PaymentProof ni des règles métier de validation (déjà en 5.3).

### Project Structure Notes

- **Fichiers à modifier / créer :**
  - `src/app/(dashboard)/dashboard/proofs/_components/proofs-list-content.tsx` : renforcer accessibilité, états vides, cohérence libellés.
  - `src/app/(dashboard)/_components/app-sidebar.tsx` : confirmer lien « Preuves » vers `/dashboard/proofs`.
  - Si filtre commandes : `src/server/api/routers/orders.ts` et `orders.schema.ts` (paramètre optionnel proofPendingOnly) ; `src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx` (filtre ou onglet + lien vers proofs).
  - Si lien/badge uniquement : `orders-list-content.tsx` (ou layout) pour afficher le count + lien vers `/dashboard/proofs` (count via proofs.listPending.length ou une procédure proofs.pendingCount).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] — Dashboard (FR29–FR34), structure `src/app/(dashboard)/`, tRPC proofs + orders ; [Source: _bmad-output/implementation-artifacts/5-3-valider-ou-refuser-une-preuve-dacompte.md] pour patterns approve/reject.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR30 :** Le vendeur (ou agent) peut consulter l’espace « preuves » (Proofs inbox) et valider/refuser les preuves. L’AC autorise deux façons d’y accéder : (1) liste commandes avec filtre « Preuve en attente », ou (2) espace dédié (page Proofs). La page Proofs existe déjà ; il faut la rendre clairement accessible et, au choix, ajouter un filtre « Preuve en attente » sur la liste commandes ou un lien/badge « X preuve(s) à valider » depuis la vue Commandes.
- **Flux existant :** `proofs.listPending` retourne les preuves (tenantId, status pending) avec orderNumber, clientPhone, mediaStorageKey, textPayload. `proofs.approve` / `proofs.reject` mettent à jour la preuve et l’ordre, écrivent en event_log et outbox. Route média : `GET /api/proofs/[proofId]/media` (sécurisée par session/tenant). Ne pas dupliquer cette logique.

### Technical Requirements

- **Isolation tenant :** Toutes les données (proofs, orders) sont déjà filtrées par `ctx.session.user.tenantId`. Conserver ce comportement ; aucun paramètre tenantId côté client.
- **Proofs inbox :** Liste uniquement les preuves avec `status: "pending"`. Optionnellement filtrer aussi par ordre en `deposit_pending` pour cohérence (déjà le cas si la logique 5.3 le fait). Tri recommandé : `createdAt` desc.
- **Filtre « Preuve en attente » (si implémenté) :** Soit une procédure dédiée (ex. orders.list avec `proofPendingOnly: true` → jointure ou sous-requête sur PaymentProof status pending), soit réutiliser la liste commandes et afficher un indicateur + lien vers Proofs. Éviter de dupliquer la liste des preuves : l’action Valider/Refuser reste sur la page Proofs.

### Architecture Compliance

- **Stack :** tRPC (proofs.listPending, proofs.approve, proofs.reject ; orders.list optionnellement étendu), Prisma, Next.js App Router, shadcn/ui. Pas de nouvelle route REST pour cette story.
- **Naming :** camelCase en API (proofId, orderNumber, proofPendingOnly) ; DB reste snake_case (Prisma @map).
- **Front :** Composants shadcn (Button, Badge, Table, Skeleton). Accessibilité : aria-label sur actions, libellés en français.

### Library / Framework Requirements

- Aucune nouvelle dépendance. Réutiliser tRPC, Prisma, patterns existants (orders-list-content, proofs-list-content). Si count pour badge : utiliser `proofs.listPending.useQuery()` et `data?.length` ou ajouter une procédure légère `proofs.pendingCount` (optionnel).

### File Structure Requirements

- Modifications limitées à : dashboard proofs (proofs-list-content.tsx), sidebar (app-sidebar.tsx), et éventuellement orders (orders-list-content.tsx, orders.ts / orders.schema.ts si filtre ou lien). Tests dans proofs.test.ts et/ou orders.test.ts.

### Testing Requirements

- **Proofs :** listPending ne retourne que les preuves du tenant avec status pending ; ordre cohérent. Approve/reject inchangés (tests existants 5.3).
- **Isolation :** Un tenant ne voit jamais les preuves ou commandes d’un autre. Si filtre orders « Preuve en attente » : le filtre respecte le tenant.

---

## Previous Story Intelligence

- **Story 6.1 (Liste des commandes avec filtres et statuts) :** Filtres API (status, dateFrom, dateTo), UI avec KPIs, barre de filtres, tableau avec colonne Créée le, pagination. Patterns : listOrdersInputSchema, where dynamique (tenantId + status + gte/lte createdAt), composants shadcn (Select, Input, Tooltip). Pour 6.2 : réutiliser la même page commandes pour ajouter un filtre/onglet « Preuve en attente » ou un lien vers Proofs, sans casser les filtres existants.
- **Story 5.3 (Valider ou refuser une preuve) :** Router proofs (listPending, approve, reject), page /dashboard/proofs, route média /api/proofs/[proofId]/media, event_log deposit_approved/deposit_rejected, writeToOutbox après validation/refus. Pour 6.2 : ne pas réécrire approve/reject ; compléter l’UX (navigation, filtre ou lien depuis commandes, accessibilité).

---

## Project Context Reference

- **Config :** Variables d’env dans `.env.example` (DATABASE_URL, R2_*, etc.). Pas de config spécifique « Proofs inbox ».
- **Conventions :** TypeScript strict, Prisma, tRPC, shadcn/ui ; tests Vitest (proofs.test.ts, orders.test.ts).

---

## Dev Agent Record

### Agent Model Used

(À remplir par l'agent dev)

### Debug Log References

(Optionnel)

### Completion Notes List

- **Task 1 :** Page `/dashboard/proofs` déjà conforme (listPending, N° commande, client, preuve image/texte, Valider/Refuser). État vide harmonisé en « Aucune preuve en attente ». Table avec `aria-label`. Sidebar : entrée renommée en « Preuves » (même niveau que Commandes).
- **Task 2 :** Lien/CTA « X preuve(s) à valider » ajouté dans la vue Commandes (orders-list-content) : appel à `proofs.pendingCount`, affichage du lien vers `/dashboard/proofs` avec le nombre lorsque count > 0. Pas de filtre orders `proofPendingOnly` (option lien/badge choisie).
- **Task 3 :** approve/reject inchangés (conformes 5.3). Gestion d'erreur déjà en place (message `approve.error?.message ?? reject.error?.message` en text-destructive).
- **Task 4 :** Tests proofs : listPending (tenant + status pending, orderBy createdAt desc, isolation tenant), pendingCount (count + isolation tenant), approve/reject existants conservés. Aucun test orders car filtre « Preuve en attente » non implémenté (lien uniquement).
- **CR (2026-02-09) :** Corrections appliquées : boutons Valider/Refuser toujours visibles (suppression opacity-0 / group-hover) ; message d’erreur avec `role="alert"` et `aria-live="polite"` ; procédure `proofs.pendingCount` ajoutée et utilisée dans orders-list pour le badge ; File List complété (page.tsx, proofs.ts) ; tests pendingCount ajoutés (13 tests).

### File List

- `src/app/(dashboard)/dashboard/proofs/page.tsx` (créé / existant)
- `src/app/(dashboard)/dashboard/proofs/_components/proofs-list-content.tsx` (modifié)
- `src/app/(dashboard)/_components/app-sidebar.tsx` (modifié)
- `src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx` (modifié)
- `src/server/api/routers/proofs.ts` (modifié — pendingCount)
- `src/server/api/routers/proofs.test.ts` (modifié)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)

---

## Senior Developer Review (AI)

**Reviewer:** Fabrice (CR workflow)  
**Date:** 2026-02-09  
**Story file:** 6-2-proofs-inbox-preuves-a-valider-dans-le-flux.md

### Git vs Story

- Fichiers du File List : tous concernés par des changements (modifiés ou untracked dans le dépôt). Aucune incohérence « fichier listé sans changement ».
- Fichiers créés pour 6.2 (dossier `dashboard/proofs/`, dont `page.tsx`) : non listés explicitement dans le File List ; optionnel d’ajouter `src/app/(dashboard)/dashboard/proofs/page.tsx` pour traçabilité.

### AC & Tasks

- **AC #1** : Implémenté. Liste commandes avec lien « X preuve(s) à valider » vers `/dashboard/proofs` ; page Proofs avec listPending, N° commande, client, preuve (image/texte), boutons Valider/Refuser. FR30 couvert.
- **Tasks 1–4** : Réalisés et cohérents avec le code (sidebar, proofs-list-content, orders-list-content, tests proofs).

### Synthèse des findings

| Sévérité | Description | Fichier:Ligne |
|----------|-------------|----------------|
| MEDIUM   | Boutons Valider/Refuser masqués par défaut (`opacity-0`), visibles au hover uniquement : risque pour accessibilité clavier / mobile / lecteurs d’écran. | proofs-list-content.tsx:191 |
| MEDIUM   | Même point : sur mobile/touch, « group-hover » peut ne pas révéler les actions ; UX dégradée. | proofs-list-content.tsx:191 |
| LOW      | Message d’erreur approve/reject sans `role="alert"` ni `aria-live="polite"` pour annonce aux lecteurs d’écran. | proofs-list-content.tsx:235-239 |
| LOW      | File List : `proofs/page.tsx` (page /dashboard/proofs) pourrait être ajouté pour exhaustivité. | — |
| LOW      | Optionnel : procédure `proofs.pendingCount` pour éviter de charger toute la liste des preuves sur la page Commandes (actuellement `listPending` utilisé pour le count). | orders-list-content.tsx:156 |

### Tests

- `proofs.test.ts` : 13 tests passent. listPending, pendingCount (count + isolation tenant), approve/reject (NOT_FOUND, BAD_REQUEST déjà traité / ordre pas en attente).

### Corrections appliquées (CR)

- Boutons Valider/Refuser : suppression de `opacity-0 group-hover:opacity-100` → actions toujours visibles (accessibilité clavier / mobile).
- Message d’erreur : `role="alert"` et `aria-live="polite"` ajoutés.
- `proofs.pendingCount` : procédure ajoutée ; orders-list utilise pendingCount pour le badge (évite de charger la liste complète).
- File List : ajout de `proofs/page.tsx` et `proofs.ts`. Tests pendingCount ajoutés.
