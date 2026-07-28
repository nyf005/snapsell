# Story 3.6 : Blocage à la réservation (reserved_qty), décrément à la confirmation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **bloquer une unité à la réservation (reserved_qty += 1) et décrémenter à la confirmation (reserved_qty -= 1, available_qty -= 1)**,
so that **il n'y ait pas de surbooking ni de décrément avant confirmation**.

## Acceptance Criteria

1. **Given** un item en stock préparé avec available_qty > 0  
   **When** un client réserve → reserved_qty += 1 ; quand il confirme (OUI + adresse) → reserved_qty -= 1, available_qty -= 1 ; si la réservation expire → reserved_qty -= 1 uniquement (FR16, FR17)  
   **Then** les contraintes available_qty >= 0 et cohérence reserved_qty sont respectées ; en cas de concurrence sur le dernier stock, une seule confirmation gagne (transaction atomique)  
   **And** FR16, FR17 couverts

## Tasks / Subtasks

- [x] Task 1 : Réserver une unité (reserved_qty += 1) (AC: #1)
  - [x] Dans une transaction : SELECT FOR UPDATE sur le LiveItem concerné ; vérifier (availableQty - reservedQty) >= 1 ; incrémenter reservedQty de 1 ; commit.
  - [x] Exposer une fonction (ex. reserveOneUnit(tenantId, liveItemId) ou dans un module réservation) utilisable par le worker lors du traitement « client envoie code » (Epic 4). Retourner succès ou raison d'échec (épuisé, item inexistant).
- [x] Task 2 : Libérer à l'expiration (reserved_qty -= 1) (AC: #1)
  - [x] Dans une transaction : SELECT FOR UPDATE ; vérifier reservedQty >= 1 ; décrémenter reservedQty de 1 ; commit.
  - [x] Exposer une fonction releaseReservation(tenantId, liveItemId) ou équivalent, appelée par le job TTL expiration (Epic 4).
- [x] Task 3 : Confirmer (reserved_qty -= 1, available_qty -= 1) (AC: #1)
  - [x] Dans une transaction : SELECT FOR UPDATE ; vérifier reservedQty >= 1 ; reservedQty -= 1, availableQty -= 1 ; vérifier availableQty >= 0 après mise à jour ; commit.
  - [x] En cas de concurrence sur le dernier stock, une seule confirmation gagne (transaction atomique + verrou).
  - [x] Exposer une fonction confirmReservation(tenantId, liveItemId) utilisable par le worker lors du traitement « OUI + adresse » (Epic 4).
- [x] Task 4 : Contraintes et cohérence (AC: #1)
  - [x] S'assurer que les mises à jour respectent toujours availableQty >= 0. Option : contrainte CHECK en base si supportée, sinon vérifications dans le code avant update.
  - [x] Ne pas décrémenter availableQty à la réservation (blocage uniquement) ; décrémenter uniquement à la confirmation.
- [x] Task 5 : Event log (AC: #1)
  - [x] Enregistrer les événements pertinents (ex. reservation_hold, reservation_released, reservation_confirmed) avec correlationId pour traçabilité (aligné Epic 2/4).
- [x] Task 6 : Tests (AC: #1)
  - [x] Tests unitaires : reserveOneUnit (succès, épuisé, item inexistant), releaseReservation, confirmReservation (succès, concurrence dernier stock), expiration.
  - [x] Test de concurrence : deux confirmations simultanées sur le dernier stock → une seule réussit.

## Senior Developer Review (AI)

- **Date :** 2026-02-07
- **Outcome :** Approve (corrections appliquées)
- **Action items :** 2 MEDIUM + 3 LOW identifiés ; tous corrigés automatiquement (option 1).

## Dev Notes

- **FR couvert :** FR16 — Le système décrémente le stock préparé uniquement à la confirmation de commande (pas à la réservation) ; pendant la réservation, « blocage » sans consommer le stock. FR17 — Le système empêche la confirmation si le stock est épuisé et gère la concurrence (transaction atomique, waitlist si dispo).
- **Source épics :** Epic 3, Story 3.6 ; architecture §4.4, §5, §8 (Stock préparé : reserved_qty / available_qty ; réservation = reserved_qty += 1 ; confirmation = reserved_qty -= 1, available_qty -= 1 ; expiration = reserved_qty -= 1).
- **Distinction réservation vs confirmation :** La réservation « tient » une unité (reservedQty += 1) sans toucher à availableQty. La confirmation consomme définitivement l'unité (reservedQty -= 1, availableQty -= 1). L'expiration libère le blocage (reservedQty -= 1).

### Project Structure Notes

- **Architecture §Requirements to Structure :** Stock préparé (FR16, FR17) → live-item (opérations reserve/release/confirm), appelé depuis webhook-processor (Epic 4) ou job reservation-ttl. Pas de table Reservation en scope 3.6 si non encore créée ; focus sur les opérations sur LiveItem (reservedQty, availableQty).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.6] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#4.4 Stock decrement at confirmation] — Réservation : reserved_qty += 1 ; Confirmation : reserved_qty -= 1, available_qty -= 1 ; Expiration : reserved_qty -= 1
- [Source: _bmad-output/planning-artifacts/architecture.md#5 Consistency & Concurrency] — SELECT FOR UPDATE sur live_item, transaction atomique
- [Source: _bmad-output/implementation-artifacts/3-4-enregistrer-du-stock-prepare-via-whatsapp-code-xqte-photo-optionnelle.md] — Champs availableQty, reservedQty sur LiveItem (migration 20260209220000)

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Réservation** = blocage d'une unité sans consommer le stock : `reservedQty += 1`. La quantité « disponible pour réservation » est `availableQty - reservedQty` ; tant qu'elle est >= 1, on peut réserver.
- **Confirmation** (OUI + adresse, Epic 4) = consommation définitive : `reservedQty -= 1`, `availableQty -= 1`. Une seule confirmation doit gagner en cas de concurrence sur la dernière unité (transaction + verrou).
- **Expiration** (TTL réservation, Epic 4) = libération du blocage uniquement : `reservedQty -= 1` ; pas de décrément de availableQty.

### Technical Requirements

- **Prisma :** Utiliser des transactions (`db.$transaction`) et `findFirstOrThrow` + mise à jour avec verrou. Pour SELECT FOR UPDATE en Prisma : `db.$transaction` avec à l'intérieur un `findFirst` avec lock (Prisma supporte `{ lock: 'ForUpdate' }` dans certains contextes ; sinon utiliser `$queryRaw` avec `SELECT ... FOR UPDATE` pour le row, puis update).
- **Vérifications :** Avant reserve : `(availableQty - reservedQty) >= 1`. Avant confirm : `reservedQty >= 1` puis après update `availableQty >= 0`. Avant release (expiration) : `reservedQty >= 1`.
- **Idempotence :** Les opérations reserve/confirm seront appelées avec des clés idempotentes côté Epic 4 (reservation_attempt_key, confirmation_key) ; en 3.6 on fournit les opérations atomiques sur le stock.

### Architecture Compliance

- **Décision D (Stock) :** Réservation : reserved_qty += 1 (pas de décrément available). Confirmation : reserved_qty -= 1, available_qty -= 1. Expiration : reserved_qty -= 1.
- **Décision C (Concurrence) :** Transaction + SELECT FOR UPDATE sur live_item ; une seule confirmation gagne sur le dernier stock.
- **Stack :** Prisma (Neon), workers Railway. Pas de logique dans le webhook Vercel ; les appels reserve/confirm/expire se feront depuis le worker (Epic 4) ou jobs TTL.

### Library / Framework Requirements

- **Prisma :** `db.$transaction`, `db.liveItem.update` avec `where` incluant `tenantId` (isolation tenant). Vérifier la syntaxe pour row-level lock (Prisma 5 : `findFirst` avec option de lock si disponible, ou `$queryRaw` + `UPDATE` dans la même transaction).
- **Zod :** Pas de nouveau schéma requis pour 3.6 ; les payloads appelants (Epic 4) seront validés côté worker.

### File Structure Requirements

- **Module live-item :** `src/server/live-item/` — ajouter (ou fichier dédié) : `reserveOneUnit`, `releaseReservation` (expiration), `confirmReservation`. Chacune reçoit au minimum `tenantId`, identifiant du LiveItem (et optionnellement correlationId pour event log).
- **Event log :** `src/server/events/eventLog.ts` — ajouter ou réutiliser des types d'événements (ex. `reservation_hold`, `reservation_released`, `reservation_confirmed`) avec payload minimal (liveItemId, correlationId) ; pas de PII.
- **Worker :** En 3.6 on n'implémente pas encore le flux client « envoie code » / « OUI + adresse » ; on livre les **fonctions** que le worker Epic 4 appellera. Si un chemin client existe déjà (ex. resolveOrCreateLiveItem), ne pas le modifier pour la logique stock ; ajouter les appels aux nouvelles fonctions aux bons endroits si un squelette de réservation existe.

### Testing Requirements

- Test : reserveOneUnit sur item avec availableQty 2, reservedQty 0 → reservedQty devient 1.
- Test : reserveOneUnit sur item avec availableQty 1, reservedQty 1 (déjà réservé) → échec (pas de stock libre).
- Test : confirmReservation après une réserve → reservedQty et availableQty décrémentés de 1.
- Test : confirmReservation sans réserve préalable ou reservedQty 0 → échec ou comportement défini (ne pas aller en négatif).
- Test : releaseReservation (expiration) → reservedQty -= 1, availableQty inchangé.
- Test concurrence : deux appels confirmReservation en parallèle sur le même item avec reservedQty 1, availableQty 1 → un seul succès, l'autre échoue ou ne modifie pas (availableQty >= 0).

### Previous Story Intelligence (Story 3.4, 3.5)

- **Story 3.4 :** LiveItem a déjà `availableQty`, `reservedQty` (migration 20260209220000). À la création (vendeur CODE xQTE), availableQty = quantity, reservedQty = 0. createLiveItemRecord et createLiveItem déjà en place.
- **Story 3.5 :** Flux vendeur (photo seule, dernier code) dans webhook-processor ; pas d'impact sur stock. getOrCreateCurrentSession, resolveOrCreateLiveItem utilisés pour le chemin client (code → item). Pour 3.6, on ajoute les opérations de blocage/décrément sans changer createLiveItem ni resolveOrCreateLiveItem.

### Git Intelligence Summary

- Derniers commits : createLiveItem (quantity, availableQty, reservedQty), uploadMediaAndLinkToLiveItem, webhook-processor (vendeur + photo 3.4, 3.5). Schéma : LiveItem.availableQty, LiveItem.reservedQty déjà présents. À ajouter : fonctions reserve/release/confirm avec transaction + lock.

### Latest Tech Information

- Prisma : pour un row-level lock dans une transaction, utiliser une transaction interactive avec `tx.$queryRaw` et `SELECT ... FOR UPDATE` sur le row live_item, puis `tx.liveItem.update` dans la même transaction ; ou l'API Prisma équivalente (selon version). Vérifier la doc Prisma pour « interactive transactions » et FOR UPDATE.

### Project Context Reference

- Structure T3 ; conventions du repo (tests à côté des modules). Isolation tenant sur toutes les requêtes (tenantId dans where). Event log : event_type, correlation_id, payload minimal.

### Story Completion Status

- **Status :** review
- **Note :** Contexte complet préparé pour l'agent dev ; analyse épics, architecture, stories 3.4 et 3.5. Les entités Reservation/Waitlist (Epic 4) peuvent être introduites plus tard ; 3.6 livre les opérations stock sur LiveItem (reserve, release, confirm) avec concurrence et contraintes.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Story 3.6 implémentée : module `src/server/live-item/reservation.ts` avec reserveOneUnit, releaseReservation, confirmReservation. Transactions avec SELECT FOR UPDATE via Prisma $queryRaw / $executeRaw. Event log : reservation_hold, reservation_released, reservation_confirmed ajoutés dans eventLog.ts. Contraintes : vérification (availableQty - reservedQty) >= 1 avant reserve ; reservedQty >= 1 avant release/confirm ; après confirm, relecture available_qty et rollback si < 0 (concurrency). Tests unitaires dans reservation.test.ts (10 tests, dont concurrency simulée).
- **Code review (2026-02-07) :** 2 MEDIUM + 3 LOW corrigés : (1) logEvent en échec désormais loggé via workerLogger.warn au lieu d’être avalé ; (2) tests ajoutés pour vérifier les appels à logEvent (reservation_hold, reservation_released, reservation_confirmed) ; (3) confirmReservation gère after.length === 0 ; (4) commentaire dans le test concurrence (simulation vs intégration) ; (5) Story Completion Status aligné sur « review » puis « done ».

### File List

- src/server/live-item/reservation.ts (new)
- src/server/live-item/reservation.test.ts (new)
- src/server/events/eventLog.ts (event types + schema)
- _bmad-output/implementation-artifacts/sprint-status.yaml (3-6 → in-progress puis review)
