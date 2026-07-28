# Story 6.3: Mettre à jour le statut d'une commande (prépa, livraison, livré, annulé)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur ou agent**,
I want **mettre à jour le statut d'une commande (prépa, livraison, livré, annulé)**,
so that **la commande progresse jusqu'à livraison**.

## Acceptance Criteria

1. **Given** une commande dans la liste  
   **When** je sélectionne un nouveau statut (prépa, livraison, livré, annulé)  
   **Then** le statut est mis à jour en base et la cliente est notifiée si configuré (FR31)  
   **And** FR31 couvert

## Tasks / Subtasks

- [x] Task 1 : Schéma et transitions de statut (AC: #1)
  - [x] Étendre l'enum `OrderStatus` (Prisma) avec les statuts de fulfillment : `preparing` (prépa), `in_delivery` (livraison), en plus de `delivered` (livré) et `cancelled` (annulé). Conserver `confirmed` et `confirmed_pending_deposit` pour les états « paiement / acompte ». Définir les transitions autorisées : confirmed / confirmed_pending_deposit → preparing → in_delivery → delivered ; cancelled autorisé depuis confirmed, confirmed_pending_deposit, preparing, in_delivery. Créer une migration Prisma.
  - [x] Mettre à jour `orders.schema.ts` (orderStatusSchema Zod) et `orders.ts` (ALLOWED_TRANSITIONS, isTransitionAllowed) pour refléter les nouveaux statuts et transitions. Gestion d'erreur claire (transition non autorisée).

- [x] Task 2 : API et event log (AC: #1)
  - [x] S'assurer que `orders.updateStatus` applique les nouvelles transitions, met à jour l'ordre en base, appelle `logOrderStatusChanged` (event_log) avec from/to, et écrit en outbox pour notification cliente sur delivered, cancelled et optionnellement in_delivery (« Ta commande SS-XXXX est en cours de livraison »). Pas de notification pour « prépa » (preparing).
  - [x] Isolation tenant : orderId + tenantId depuis la session ; aucune donnée cross-tenant.

- [x] Task 3 : UI liste commandes — choix du statut (AC: #1)
  - [x] Dans la vue Commandes (`orders-list-content.tsx`), remplacer ou compléter les boutons « Marquer livrée » / « Annuler » par un moyen explicite de choisir le nouveau statut : soit un Select (dropdown) « Nouveau statut » avec les options Prépa, En livraison, Livrée, Annulée (selon les transitions autorisées depuis le statut courant), soit des boutons d'action par statut cible. Afficher uniquement les options valides (transitions autorisées).
  - [x] Labels FR : Prépa (preparing), En livraison (in_delivery), Livrée (delivered), Annulée (cancelled). Mise à jour des constantes STATUS_LABELS et des filtres (STATUS_FILTER_OPTIONS, KPIs si besoin). Accessibilité : aria-label sur le contrôle de changement de statut, message de succès/erreur lisible (role="alert" si erreur).

- [x] Task 4 : Tests (AC: #1)
  - [x] Tests du router orders : updateStatus avec toutes les transitions autorisées (confirmed → preparing → in_delivery → delivered ; cancelled depuis chaque état autorisé). Rejet des transitions non autorisées (BAD_REQUEST). Vérifier event_log et outbox (delivered, cancelled, optionnellement in_delivery). Isolation tenant : un tenant ne peut pas mettre à jour une commande d'un autre tenant.

- **Review Follow-ups (AI)**
  - [x] [AI-Review][MEDIUM] Ajouter tests updateStatus → cancelled depuis confirmed, confirmed_pending_deposit, in_delivery (orders.test.ts)
  - [x] [AI-Review][MEDIUM] Documenter ou centraliser la matrice des transitions (éviter duplication serveur / client) (orders.ts, orders-list-content.tsx)
  - [x] [AI-Review][LOW] Simplifier canChangeStatus : retirer le `?? false` redondant (orders-list-content.tsx:154-155)
  - [x] [AI-Review][LOW] Optionnel : test list/getById avec statuts preparing ou in_delivery (orders.test.ts)

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 6, Story 6.3 ; FR31.
- **Contexte :** La procédure `orders.updateStatus` et l'UI (boutons Livrée / Annuler) existent déjà (Stories 5.2, 5.4, 6.1). Cette story étend le modèle pour les quatre états métier « prépa, livraison, livré, annulé » : ajout des statuts `preparing` et `in_delivery`, mise à jour des transitions, et UI pour sélectionner explicitement le nouveau statut. Les notifications WhatsApp (livré, annulé) sont déjà en place ; ajouter si souhaité une notification « en livraison ».

### Project Structure Notes

- **Fichiers à modifier / créer :**
  - `prisma/schema.prisma` : enum OrderStatus (ajout preparing, in_delivery) ; migration.
  - `src/server/api/routers/orders.schema.ts` : orderStatusSchema (preparing, in_delivery).
  - `src/server/api/routers/orders.ts` : ALLOWED_TRANSITIONS, logique updateStatus, notifications (in_delivery optionnel).
  - `src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx` : UI choix de statut (Select ou boutons), STATUS_LABELS, STATUS_FILTER_OPTIONS, canChangeStatus / transitions affichées.
  - `src/server/events/eventLog.ts` : aucun changement attendu (logOrderStatusChanged déjà générique).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] — Commandes (FR25, FR31), event_log, outbox ; [Source: _bmad-output/implementation-artifacts/6-2-proofs-inbox-preuves-a-valider-dans-le-flux.md] pour patterns UI (Select, aria-label, role="alert").

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR31 :** Le vendeur (ou agent) peut mettre à jour le statut d'une commande avec les quatre états : prépa (en préparation), livraison (en cours de livraison), livré, annulé. Chaque changement doit être persisté et, pour livré/annulé (et optionnellement en livraison), la cliente doit être notifiée par WhatsApp (outbox).
- **État actuel :** Le schéma n'a que confirmed, confirmed_pending_deposit, delivered, cancelled. Les transitions autorisées sont uniquement confirmed/confirmed_pending_deposit → delivered | cancelled. L'UI affiche deux boutons (Livrée, Annuler). Il faut introduire les statuts intermédiaires « prépa » et « livraison » pour un flux complet et une traçabilité claire.

### Technical Requirements

- **Transitions :** Définir une matrice explicite (ALLOWED_TRANSITIONS) : confirmed, confirmed_pending_deposit → preparing ; preparing → in_delivery ; in_delivery → delivered ; cancelled autorisé depuis confirmed, confirmed_pending_deposit, preparing, in_delivery. delivered et cancelled sont terminaux (aucune transition sortante).
- **Event log :** Conserver l'appel à `logOrderStatusChanged(tenantId, orderId, correlationId, { from, to })` pour chaque mise à jour de statut.
- **Outbox :** Pour delivered et cancelled, le code existant écrit déjà en outbox. Pour in_delivery, ajouter un message type « Ta commande SS-XXXX est en cours de livraison » si le produit le souhaite (à confirmer ; peut être inclus dans cette story pour cohérence).

### Architecture Compliance

- **Stack :** tRPC (orders.updateStatus), Prisma, Next.js App Router, shadcn/ui. Pas de nouvelle route REST. Migrations Prisma pour tout changement de schéma.
- **Naming :** DB snake_case (Prisma @map) ; API et front en camelCase (orderId, status). Enum Prisma : preparing, in_delivery, delivered, cancelled.
- **Front :** Composants shadcn (Select, Button, Badge, Tooltip). Libellés en français ; accessibilité (aria-label, role="alert" pour erreurs).

### Library / Framework Requirements

- Aucune nouvelle dépendance. Réutiliser Zod (orders.schema.ts), tRPC, Prisma, writeToOutbox, logOrderStatusChanged.

### File Structure Requirements

- Modifications limitées à : prisma/schema.prisma, orders.schema.ts, orders.ts, orders-list-content.tsx. Tests dans orders.test.ts. Migration dans prisma/migrations/.

### Testing Requirements

- **Orders :** updateStatus accepte toutes les transitions définies ; rejette les transitions invalides (BAD_REQUEST) ; vérifier que event_log reçoit from/to et que l'outbox est écrite pour delivered, cancelled (et in_delivery si implémenté). getById et list retournent les nouveaux statuts.
- **Isolation :** Un tenant ne peut pas modifier une commande d'un autre tenant (déjà garanti par findFirst where tenantId ; ajouter un test explicite si absent).

---

## Previous Story Intelligence

- **Story 6.2 (Proofs inbox) :** Page Proofs, orders-list avec lien « X preuve(s) à valider », proofs.listPending, proofs.approve/reject, pendingCount. Patterns : Select, Badge, aria-label, role="alert" pour erreurs. Pour 6.3 : réutiliser la même page commandes et le même pattern de mutation (updateStatus) ; ajouter un Select ou des boutons pour les 4 statuts avec transitions correctes.
- **Story 6.1 (Liste des commandes) :** Filtres status/date, KPIs, StatusBadge, tableau. updateStatus déjà utilisé avec deux boutons (Livrée, Annuler). Pour 6.3 : étendre les statuts affichés (STATUS_LABELS, filtres) et le mécanisme de changement (4 options au lieu de 2 boutons fixes).
- **Story 5.2 / 5.4 :** orders.updateStatus, logOrderStatusChanged, writeToOutbox pour delivered/cancelled. Pour 6.3 : conserver cette logique et l'étendre aux nouvelles transitions et à la notification « en livraison » si applicable.

---

## Project Context Reference

- **Config :** Variables d'env dans `.env.example` (DATABASE_URL, etc.). Pas de config spécifique pour les statuts.
- **Conventions :** TypeScript strict, Prisma, tRPC, shadcn/ui ; tests Vitest (orders.test.ts).

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

(Optionnel)

### Completion Notes List

- Task 1: Enum OrderStatus étendu (preparing, in_delivery) dans prisma/schema.prisma ; migration 20260209290000 ; orderStatusSchema et ALLOWED_TRANSITIONS dans orders.schema.ts / orders.ts.
- Task 2: updateStatus applique les transitions, logOrderStatusChanged inchangé, outbox pour delivered/cancelled/in_delivery (« Ta commande SS-XXXX est en cours de livraison »).
- Task 3: Select « Nouveau statut » avec ALLOWED_NEXT_STATUSES côté client ; STATUS_LABELS, STATUS_FILTER_OPTIONS, onglets et KPI « À livrer » incluent preparing/in_delivery ; aria-label sur le Select ; role="alert" sur le message d’erreur.
- Task 4: Tests updateStatus (confirmed → preparing, preparing → in_delivery + outbox, in_delivery → delivered, cancelled depuis preparing ; rejets confirmed → delivered et in_delivery → preparing ; isolation tenant). Anciens tests adaptés (transition directe confirmed → delivered supprimée).

### File List

- prisma/schema.prisma
- prisma/migrations/20260209290000_add_order_status_preparing_in_delivery_story_6_3/migration.sql
- src/lib/order-status-transitions.ts
- src/server/api/routers/orders.schema.ts
- src/server/api/routers/orders.ts
- src/server/api/routers/orders.test.ts
- src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml

---

## Senior Developer Review (AI)

**Date:** 2026-02-09  
**Story file:** 6-3-mettre-a-jour-le-statut-dune-commande-prepa-livraison-livre-annule.md  
**Git vs story:** Fichiers de la story cohérents avec les changements (prisma/schema.prisma modifié ; migration et orders/* non suivis ou nouveaux dans le repo).

### Verdict

**AC #1** : Implémenté — mise à jour du statut en base, notifications outbox (delivered, cancelled, in_delivery), event_log.  
**Tasks [x]** : Toutes les tâches sont réalisées (preuves dans les fichiers listés).

### Findings

| Sévérité | Description | Fichier / zone |
|----------|-------------|----------------|
| MEDIUM | Couverture de tests partielle : la story exige « cancelled depuis chaque état autorisé ». Un seul test couvre cancelled (depuis preparing). Pas de test explicite pour cancelled depuis confirmed, confirmed_pending_deposit ou in_delivery. | orders.test.ts |
| MEDIUM | Duplication de la matrice des transitions : ALLOWED_TRANSITIONS (orders.ts) et ALLOWED_NEXT_STATUSES (orders-list-content.tsx). Risque de désynchronisation si une transition est modifiée à un seul endroit. | orders.ts, orders-list-content.tsx |
| LOW | `canChangeStatus` : l’expression `ALLOWED_NEXT_STATUSES[s]?.length > 0 ?? false` est correcte mais le `?? false` est redondant. | orders-list-content.tsx:154-155 |
| LOW | Message d’erreur updateStatus (role="alert") est rendu en bas de la page ; sur une longue liste il peut être hors écran. | orders-list-content.tsx |
| LOW | Pas de test explicite list({ status: "preparing" }) ou getById avec order.status preparing/in_delivery pour valider que l’API accepte et retourne les nouveaux statuts. | orders.test.ts |

### Action Items

- [x] [AI-Review][MEDIUM] Ajouter tests updateStatus → cancelled depuis confirmed, confirmed_pending_deposit, in_delivery (orders.test.ts)
- [x] [AI-Review][MEDIUM] Documenter ou centraliser la matrice des transitions (éviter duplication serveur / client) (orders.ts, orders-list-content.tsx)
- [x] [AI-Review][LOW] Simplifier canChangeStatus : retirer le `?? false` redondant (orders-list-content.tsx:154-155)
- [x] [AI-Review][LOW] Optionnel : test list/getById avec statuts preparing ou in_delivery (orders.test.ts)

### Corrections appliquées (post-review)

- Source unique des transitions : `src/lib/order-status-transitions.ts` (ORDER_STATUS_TRANSITIONS, getAllowedNextStatuses, canTransitionFrom). orders.ts utilise canTransitionFrom ; orders-list-content.tsx utilise getAllowedNextStatuses. Plus de duplication.
- Tests ajoutés : cancelled depuis confirmed, confirmed_pending_deposit, in_delivery ; list({ status: "preparing" }) ; getById avec order.status preparing.
- canChangeStatus simplifié : `getAllowedNextStatuses(...).length > 0` sans `?? false`.

### Review #2 (post-corrections) — 2026-02-09

**Vérification :** Tous les points MEDIUM et LOW de la Review #1 ont été traités.  
**AC #1** : Confirmé implémenté (statut en base, event_log, outbox delivered/cancelled/in_delivery).  
**Tasks / Review Follow-ups** : Tous [x].  
**Code :** `~/lib/order-status-transitions.ts` bien utilisé côté serveur et client ; tests updateStatus (dont cancelled depuis les 4 états), list(getById) avec statut preparing.  
**Reste éventuel (non bloquant) :** Message d’erreur updateStatus (role="alert") toujours en bas de page — amélioration UX possible plus tard.  
**Verdict :** **Approuvé.** Story prête pour statut *done*.
