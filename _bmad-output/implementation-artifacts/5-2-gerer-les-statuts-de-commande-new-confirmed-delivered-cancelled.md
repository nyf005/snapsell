# Story 5.2: Gérer les statuts de commande (new → confirmed → delivered/cancelled)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **gérer les statuts de commande (new → confirmed → delivered/cancelled)**,
so that **le vendeur et la cliente voient l'état de la commande**.

## Acceptance Criteria

1. **Given** une commande créée  
   **When** le vendeur/agent met à jour le statut (prépa, livraison, livré, annulé)  
   **Then** le statut est persisté et reflété côté dashboard et (si notif activée) côté cliente (FR25)  
   **And** FR25 couvert

## Tasks / Subtasks

- [x] Task 1 : API et persistance (AC: #1)
  - [x] Créer ou étendre le router tRPC `orders` : procédures `list` (par tenant), `getById`, `updateStatus`.
  - [x] Implémenter la mise à jour du statut (OrderStatus) avec validation des transitions autorisées (confirmed → delivered | cancelled ; confirmed_pending_deposit idem après approbation).
  - [x] Persister en base via Prisma ; filtrer toutes les requêtes par `tenantId` (contexte auth).

- [x] Task 2 : Audit et event log (AC: #1)
  - [x] Enregistrer dans event_log un événement type `order.status_changed` (entity_type: order, entity_id, correlation_id, payload: { from, to }) à chaque changement de statut.
  - [x] Aligner avec FR45 (audit trail minimal horodaté pour changements de statuts).

- [x] Task 3 : Dashboard (AC: #1)
  - [x] Afficher la liste des commandes sur la page `/dashboard/orders` (données via tRPC orders.list).
  - [x] Permettre au vendeur/agent de changer le statut (sélecteur ou boutons : livré / annulé ; prépa/livraison si statuts ajoutés).
  - [x] Refléter immédiatement le nouveau statut après mutation (invalidation cache / refetch).

- [x] Task 4 : Tests (AC: #1)
  - [x] Tests unitaires ou d’intégration pour updateStatus (transitions valides, refus des transitions invalides, isolation tenant).
  - [x] Vérifier que event_log reçoit bien order.status_changed.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 5, Story 5.2 ; FR25.
- **Contexte :** Les commandes sont créées en 5.1 avec statut `confirmed` ou `confirmed_pending_deposit`. Cette story ajoute la **gestion des transitions** vers `delivered` et `cancelled`, et l’affichage/mise à jour côté dashboard.
- **Statuts actuels (Prisma) :** `OrderStatus` = confirmed | confirmed_pending_deposit | delivered | cancelled. Pas de valeur « new » (la commande est créée déjà confirmée). Si le produit souhaite des étapes « prépa » / « en livraison », envisager d’ajouter des valeurs au enum (ex. preparing, shipped) ou documenter que « confirmed » couvre prépa jusqu’à livraison/annulation.

### Project Structure Notes

- **Fichiers à créer/modifier :**  
  - `src/server/api/routers/orders.ts` (nouveau router tRPC : list, getById, updateStatus).  
  - `src/server/api/root.ts` (enregistrer ordersRouter).  
  - `src/server/events/eventLog.ts` (ajouter logOrderStatusChanged ou équivalent si absent).  
  - `src/app/(dashboard)/dashboard/orders/page.tsx` (remplacer le placeholder : liste + mise à jour statut).  
  - Composants optionnels : `StatusBadge`, sélecteur de statut (réutiliser shadcn/ui).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] §3 Order + PaymentProof, §4.3 Confirm → create order ; §Requirements to Structure Mapping — Commandes (FR24–FR27) → orders.ts, proofs.ts.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR25 :** Le système peut gérer les statuts de commande (ex. new → confirmed → delivered/cancelled). En pratique : la commande est créée en confirmed ou confirmed_pending_deposit (5.1) ; le vendeur/agent peut la faire passer à delivered ou cancelled, et optionnellement à des états intermédiaires (prépa, en livraison) si l’enum est étendu.
- **Notification cliente (FR27) :** prévue en Story 5.4 ; en 5.2, se concentrer sur persistance + dashboard. Si une notif « si activée » est demandée dès 5.2, écrire en outbox un message de notification après changement de statut (template type « Ta commande SS-XXXX est livrée ») — sinon laisser à 5.4.

### Technical Requirements

- **Isolation tenant :** toutes les procédures tRPC doivent utiliser le `tenantId` du contexte (session auth), jamais depuis le body.
- **Transitions :** définir quelles transitions sont autorisées (ex. confirmed → delivered, cancelled ; confirmed_pending_deposit → idem après approbation dépôt). Refuser les transitions invalides avec TRPCError (BAD_REQUEST).
- **Order model existant :** prisma/schema.prisma — Order (id, tenantId, reservationId, orderNumber, status, depositStatus, depositExpiresAt, createdAt, updatedAt). Pas de modification de schéma nécessaire sauf ajout de valeurs à OrderStatus.

### Architecture Compliance

- **Stack :** tRPC (orders router), Prisma, event_log. Pas de logique dans le webhook.
- **Event Log :** nouvel event_type `order.status_changed` (ou équivalent) avec correlationId, entity_type: order, entity_id, payload { previousStatus, newStatus }.
- **DB :** snake_case ; pas de nouveau modèle ; contraintes existantes sur Order.

### Library / Framework Requirements

- Aucune nouvelle dépendance. Utiliser tRPC, Prisma, eventLog existants ; UI avec shadcn/ui + Tailwind (déjà en place).

### File Structure Requirements

- Router : `src/server/api/routers/orders.ts`.  
- Page dashboard : `src/app/(dashboard)/dashboard/orders/page.tsx`.  
- Event log : étendre `src/server/events/eventLog.ts` avec une fonction logOrderStatusChanged si pas déjà présente.

### Testing Requirements

- Tester updateStatus : transition valide (confirmed → delivered), transition invalide (delivered → confirmed) refusée, isolation tenant (un tenant ne peut pas modifier la commande d’un autre).
- Tester que l’event_log contient bien l’événement de changement de statut.

### Previous Story Intelligence (Story 5.1)

- **5.1 :** Création de commande via createOrderFromReservation (SS-XXXX, statut confirmed ou confirmed_pending_deposit). Fichiers : `src/server/order/createOrderFromReservation.ts`, webhook-processor (intent OUI), prisma Order, eventLog (order_created, deposit_requested). Idempotence sur reservation_id et order_number.
- **Ne pas dupliquer :** la création de commande reste dans 5.1 ; 5.2 n’ajoute que la mise à jour du statut et l’affichage/édition côté dashboard.

### Git Intelligence Summary

- Patterns : tenantId depuis contexte tRPC, TRPCError pour erreurs métier, Prisma transactions pour cohérence, event_log avec correlationId. Réutiliser les mêmes patterns pour orders router et updateStatus.

### Latest Tech Information

- Aucune mise à jour de librairie requise. Stack T3, Prisma, tRPC inchangés.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/architecture.md] §3 Order + PaymentProof ; §4.3 Confirm → create order ; §Requirements to Structure Mapping — Commandes (FR24–FR27). Page orders actuelle : placeholder « Liste des commandes — à venir » à remplacer par liste + mise à jour statut.

### Story Completion Status

- **Status :** ready-for-dev  
- **Completion note :** Ultimate context engine analysis completed - comprehensive developer guide created for order status management (persist, dashboard, event log).

---

## Senior Developer Review (AI)

**Date :** 2026-02-08  
**Reviewer :** Code Review (CR 5-2)  
**Outcome :** Approve (après corrections)

### Résumé

- **AC validés :** AC#1 implémenté (persistance statut, dashboard, event log).
- **Tâches :** Toutes les tâches marquées [x] sont effectivement réalisées (vérification fichiers + tests).
- **Git vs File List :** Fichiers 5-2 cohérents avec le File List (hors _bmad-output exclus du diff applicatif).

### Problèmes identifiés et traités

| Sévérité | Description | Fichier | Action |
|----------|-------------|---------|--------|
| MEDIUM | Erreur de mutation (updateStatus) restait affichée après un nouveau clic ou une autre commande | orders-list-content.tsx | Ajout `onMutate` appelant `updateStatus.reset()` pour réinitialiser l’erreur avant chaque nouvelle tentative. |
| MEDIUM | Boutons Livré/Annulé sans aria-label par commande pour l’accessibilité | orders-list-content.tsx | Ajout `aria-label` avec numéro de commande (ex. « Marquer la commande SS-0001 comme livrée »). |
| LOW | getById sélectionnait `reservation.id` sans l’utiliser dans le retour | orders.ts | Retrait de `id: true` dans le select reservation. |

### Points restants (non bloquants)

- **LOW :** Pas de test explicite pour la transition `confirmed_pending_deposit` → `cancelled` (une seule transition couverte en détail : confirmed → delivered). Couverture actuelle acceptable.
- **LOW :** Pas de dialogue de confirmation avant « Annulé » (amélioration UX possible en story ultérieure).
- **LOW :** Pas de pagination sur la liste commandes (hors scope 5.2).

### Action Items

- Aucun (corrections MEDIUM et LOW ciblée appliquées).

---

## Change Log

- 2026-02-08 : Code review (CR 5-2) — 2 MEDIUM et 1 LOW corrigés (UX erreur mutation, aria-labels, select getById). Statut → done.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1: Router tRPC `orders` créé avec `list`, `getById`, `updateStatus`. Schéma `orders.schema.ts` pour les inputs. Transitions autorisées : confirmed | confirmed_pending_deposit → delivered | cancelled ; refus BAD_REQUEST pour transitions invalides. tenantId depuis ctx.session.user.tenantId.
- Task 2: EventType `order.status_changed` et helper `logOrderStatusChanged` ajoutés dans eventLog.ts ; appelés dans updateStatus après mise à jour en transaction.
- Task 3: Page `/dashboard/orders` avec composant client `OrdersListContent` : liste via orders.list, boutons Livré/Annulé pour commandes confirmées, refetch après mutation.
- Task 4: orders.test.ts — list (tenant), getById (OK / NOT_FOUND), updateStatus (transition valide + logOrderStatusChanged, transition invalide refusée, isolation tenant). eventLog.test.ts — logOrderStatusChanged écrit bien order.status_changed.

### File List

- src/server/api/routers/orders.ts (nouveau)
- src/server/api/routers/orders.schema.ts (nouveau)
- src/server/api/routers/orders.test.ts (nouveau)
- src/server/api/root.ts (modifié — enregistrement ordersRouter)
- src/server/events/eventLog.ts (modifié — order.status_changed, logOrderStatusChanged)
- src/server/events/eventLog.test.ts (modifié — test logOrderStatusChanged)
- src/app/(dashboard)/dashboard/orders/page.tsx (modifié — utilise OrdersListContent)
- src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx (nouveau)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modifié — 5-2 in-progress → review)
