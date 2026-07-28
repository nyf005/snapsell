# Story 5.1: Créer une commande (SS-XXXX) à partir d'une réservation confirmée

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **créer une commande avec un numéro unique (ex. SS-XXXX pour SnapSell) à partir d'une réservation confirmée (OUI + adresse)**,
so that **chaque vente soit tracée**.

## Acceptance Criteria

1. **Given** une réservation confirmée (client a envoyé OUI + adresse)  
   **When** le worker traite la confirmation  
   **Then** une commande est créée avec numéro unique (SS-XXXX), statut `confirmed` ou `confirmed_pending_deposit` selon config acompte (FR24)  
   **And** FR24 couvert

## Tasks / Subtasks

- [x] Task 1 : Vérifier couverture par Story 4.5 (AC: #1)
  - [x] Confirmer que `createOrderFromReservation` (src/server/order/) crée bien une commande à partir d'une réservation en `address_collected` lorsque le client envoie OUI.
  - [x] Confirmer génération SS-XXXX (getNextOrderNumber, unicité tenant_id + order_number), statut `confirmed` ou `confirmed_pending_deposit` selon tenant.requireDeposit.
  - [x] Vérifier que l'intent OUI dans webhook-processor appelle createOrderFromReservation et que l'idempotence (une seule commande par réservation) est garantie.

- [x] Task 2 : Alignement PRD / FR24 (AC: #1)
  - [x] Vérifier que les champs Order (tenantId, reservationId, orderNumber, status, depositStatus, depositExpiresAt) et les events order_created / deposit_requested couvrent FR24.
  - [x] Documenter dans la story ou en commentaire que 5.1 est satisfaite par l'implémentation 4.5 ; pas de double implémentation.

- [x] Task 3 : Tests et non-régression (AC: #1)
  - [x] S'assurer que les tests existants (createOrderFromReservation.test.ts, webhook-processor OUI/idempotence) couvrent explicitement les AC 5.1.
  - [x] Si besoin : ajouter un test ou une section de tests dédiée « Story 5.1 » pour traçabilité.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 5, Story 5.1 ; FR24.
- **Contexte critique :** La **Story 4.5** a déjà implémenté la création de commande à partir d'une réservation confirmée (OUI + adresse) : modèle Order, `createOrderFromReservation`, intent OUI dans webhook-processor, numéro SS-XXXX, statuts selon acompte. La présente story 5.1 correspond donc à une **vérification de couverture** et à un **alignement formel** avec le PRD/Epic 5, pas à une réimplémentation.
- **Périmètre 5.1 :** S'assurer que tout ce qui est décrit en 5.1 (commande SS-XXXX, statut confirmed / confirmed_pending_deposit selon config acompte) est bien en place et documenté ; corriger ou compléter uniquement en cas d'écart identifié.

### Project Structure Notes

- **Fichiers concernés :** `src/server/order/createOrderFromReservation.ts`, `src/server/workers/webhook-processor.ts` (bloc intent OUI), `prisma/schema.prisma` (Order, Reservation.order), `src/server/events/eventLog.ts` (order_created, deposit_requested). Aucune nouvelle structure requise si 4.5 est complet.
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.3 Confirm → create order → acompte state ; §3 Order + PaymentProof.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR24 :** Le système peut créer une commande avec un numéro unique (ex. SS-XXXX) à partir d'une réservation confirmée. Une réservation est « confirmée » lorsque le client a envoyé OUI (et l'adresse a déjà été collectée) ; le worker traite ce message, appelle `confirmReservation` (décrément stock), crée l'Order et envoie éventuellement la demande de preuve d'acompte.
- **Statuts commande :** new | confirmed | confirmed_pending_deposit | delivered | cancelled (OrderStatus) ; no_deposit | deposit_pending | deposit_approved | deposit_rejected (DepositStatus). Pour 5.1, la création produit soit `confirmed` + `no_deposit` (sans acompte), soit `confirmed_pending_deposit` + `deposit_pending` (avec acompte).

### Technical Requirements

- Ne pas dupliquer la logique de création de commande : elle vit dans `createOrderFromReservation` et est appelée depuis le webhook-processor (intent OUI, réservation en address_collected).
- Vérifier idempotence : une seule Order par reservationId (déjà géré par createOrderFromReservation).
- Vérifier que order_number (SS-XXXX) est unique par tenant (contrainte @@unique([tenantId, orderNumber]) + retry P2002 si besoin).

### Architecture Compliance

- **Stack :** Prisma, workers (webhook-processor), outbox (writeToOutbox). Pas de logique dans le webhook Vercel.
- **Event Log :** order_created, deposit_requested avec correlationId.
- **DB :** snake_case ; relation Reservation → Order 1:1.

### Library / Framework Requirements

- Aucune nouvelle dépendance. Réutiliser Prisma, writeToOutbox, eventLog existants.

### File Structure Requirements

- Pas de nouveau fichier requis si 4.5 est complet. Vérification et tests uniquement dans les fichiers existants (order/, webhook-processor, eventLog).

### Testing Requirements

- Les tests existants (createOrderFromReservation, webhook-processor OUI avec/sans acompte, idempotence) doivent couvrir les AC 5.1. Ajouter si besoin un test ou une description « Story 5.1 » pour traçabilité.

### Previous Story Intelligence (Story 4.5)

- **Story 4.5 :** Règle acompte (TTL soft/locked), traitement OUI → confirmReservation + création Order via `createOrderFromReservation`. Modèle Order (OrderStatus, DepositStatus), génération SS-XXXX (getNextOrderNumber avec unicité tenant_id + order_number, retry P2002). Intent OUI dans webhook-processor (isConfirmOui), idempotence par reservationId. Event log : order_created, deposit_requested. Fichiers : `src/server/order/createOrderFromReservation.ts`, webhook-processor (bloc OUI), prisma schema (Order, Reservation.order), eventLog.
- **Revue 4.5 :** Race order_number corrigée (unique + retry) ; .env.example et File List à jour. Ne pas réimplémenter la création de commande ; uniquement vérifier et documenter la couverture 5.1.

### Git Intelligence Summary

- Patterns récents : correlationId partout, writeToOutbox(tenantId, to, body, correlationId), transactions Prisma, contraintes uniques + retry sur P2002. Conserver ces patterns pour toute évolution mineure.

### Latest Tech Information

- Aucune mise à jour de librairie requise. Stack T3, Prisma, BullMQ inchangés.

### Project Context Reference

- Pipeline webhook < 1 s ; métier dans workers ; outbox pour tout envoi ; event_log avec correlationId. [Source: _bmad-output/planning-artifacts/architecture.md] §4.3, §3. Story 5.1 = vérification que la création de commande (déjà livrée en 4.5) couvre FR24 ; pas de nouveau développement sauf écart.

### Story Completion Status

- **Status :** review (aligné avec champ Status en tête de story)
- **Completion note :** Ultimate context engine analysis completed - comprehensive developer guide created. Story 5.1 framed as verification/alignment with 4.5 implementation; no duplicate implementation.

---

## Senior Developer Review (AI)

**Date :** 2026-02-08  
**Outcome :** Approve (après correction 1 HIGH en revue)

### Git vs File List

- Aucune incohérence : les 4 fichiers de la File List correspondent aux changements (story, sprint-status, 2 fichiers de tests). Fichiers source modifiés pour 5.1 uniquement : les 2 tests.

### Findings

| Sévérité | Description | Fichier / preuve |
|----------|-------------|-------------------|
| ~~HIGH~~ **FIXÉ** | Double OUI concurrent : P2002 sur `reservation_id` (ordre déjà créé par un autre worker) faisait throw au lieu de retourner la commande existante. Idempotence incomplète. | `createOrderFromReservation.ts` L97–110 : retry uniquement pour `order_number`, pas de cas reservation_id. |
| ~~LOW~~ **FIXÉ** | AC #1 aligné sur statuts confirmed / confirmed_pending_deposit ; l'implémentation utilise `confirmed` \| `confirmed_pending_deposit`. Alignement terminologique (OrderStatus n'a pas `new`). | AC #1 + Dev Notes Périmètre 5.1 |
| ~~LOW~~ **FIXÉ** | Traçabilité 5.1 : describe Story 5.1 AC#1 ajouté dans les deux fichiers de tests. | createOrderFromReservation.test.ts, webhook-processor.test.ts |

### Action Items

- [x] **[HIGH]** Gérer P2002 sur `reservation_id` : si conflit unique sur reservation_id, faire findUnique par reservationId et retourner la commande existante au lieu de throw. (Corrigé en revue.)
- [x] [LOW] Aligner libellé AC #1 avec les statuts réels (confirmed / confirmed_pending_deposit) ou documenter que « new » = premier état logique.
- [x] [LOW] Optionnel : ajouter un describe("Story 5.1") ou un test nommé explicitement pour la traçabilité.

### Completion Notes (review)

- Correction appliquée : dans `createOrderFromReservation`, en cas de P2002, détection de `meta.target` contenant `reservation_id` / `reservationId` → findUnique par reservationId et return de la commande existante. Sinon, comportement inchangé (retry pour order_number). Test ajouté : P2002 sur reservation_id retourne la commande existante.
- Corrections LOW : AC #1 et Dev Notes alignés sur statuts `confirmed` / `confirmed_pending_deposit` ; describe « Story 5.1 AC#1 » ajouté dans createOrderFromReservation.test.ts et webhook-processor.test.ts.

### Change Log

- 2026-02-08 : Code review (AI) — 1 HIGH corrigé (idempotence P2002 reservation_id), 2 LOW restants (alignement AC wording, traçabilité 5.1). Statut → done.
- 2026-02-08 : Correction des 2 LOW — AC #1 libellé aligné sur `confirmed` / `confirmed_pending_deposit` ; describe « Story 5.1 AC#1 » ajouté dans createOrderFromReservation.test.ts et webhook-processor.test.ts pour traçabilité.
- 2026-02-08 : Préfixe numéro de commande VF → SS (SnapSell) : getNextOrderNumber retourne SS-0001, SS-0002… ; prisma/schema comment ; story et tests mis à jour.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- **Task 1:** Vérifié : `createOrderFromReservation` crée la commande depuis réservation `address_collected` ; intent OUI (isConfirmOui) dans webhook-processor appelle createOrderFromReservation ; idempotence par reservationId (findUnique avant create) ; SS-XXXX via getNextOrderNumber ; @@unique([tenantId, orderNumber]) + retry P2002.
- **Task 2:** Order (tenantId, reservationId, orderNumber, status, depositStatus, depositExpiresAt) et events order_created, deposit_requested présents. Story 5.1 satisfaite par l'implémentation 4.5 ; aucune réimplémentation.
- **Task 3:** Traçabilité Story 5.1 ajoutée dans createOrderFromReservation.test.ts et webhook-processor.test.ts ; tests existants couvrent AC 5.1.

### File List

- _bmad-output/implementation-artifacts/5-1-creer-une-commande-ss-xxxx-a-partir-dune-reservation-confirmee.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/server/order/createOrderFromReservation.ts
- src/server/order/createOrderFromReservation.test.ts
- src/server/workers/webhook-processor.test.ts
