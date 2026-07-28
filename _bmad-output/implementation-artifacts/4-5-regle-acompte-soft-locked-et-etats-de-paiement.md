# Story 4.5: Règle acompte (soft/locked) et états de paiement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **appliquer la règle acompte : sans acompte = réservation « soft » TTL court ; avec acompte = réservation « locked » TTL normal**,
so that **réduire les réservations fantômes**.

## Acceptance Criteria

1. **Given** une configuration tenant (acompte activé ou non)  
   **When** un client réserve un article  
   **Then** le TTL de la réservation est « soft » (court, ex. 5 min) si acompte désactivé, « locked » (normal, ex. 10–15 min) si acompte activé (FR44, FR23)

2. **Given** une réservation confirmée (OUI + adresse)  
   **When** l'acompte est activé pour le tenant  
   **Then** le système demande la preuve d'acompte au client (message WhatsApp via outbox) ; états no_deposit / deposit_pending / deposit_approved / deposit_rejected (FR23, FR43)

3. **Given** une réservation confirmée et acompte activé  
   **When** la commande est créée  
   **Then** la commande reste en « confirmed_pending_deposit » jusqu'à validation ou refus de la preuve ; un TTL acompte (ex. 15–30 min) s'applique pour l'envoi de la preuve (FR23, FR44, FR43)

## Tasks / Subtasks

- [x] Task 1 : Config tenant acompte et TTL réservation (AC: #1)
  - [x] Ajouter paramètre tenant (ex. `requireDeposit` ou `acompteActif`) — settings/grille ou table dédiée ; lecture dans le worker.
  - [x] Définir deux TTL : SOFT (ex. 5 min), LOCKED (ex. 10–15 min). À la création de réservation (`createReservation`), calculer `expiresAt` selon config : si pas d'acompte → TTL soft, sinon TTL locked.
  - [x] Env ou constantes : RESERVATION_TTL_SOFT_MINUTES, RESERVATION_TTL_LOCKED_MINUTES (ou un seul env + ratio). Ne pas casser le flux existant (RESERVATION_TTL_MINUTES actuel = 10).

- [x] Task 2 : Traitement « OUI » (confirmation) et création commande minimale (AC: #2, #3)
  - [x] Dans webhook-processor : détecter intent client « OUI » (ou équivalent) lorsque la réservation est en `address_collected` ; idempotence sur (tenant_id, reservation_id) pour confirmation.
  - [x] Appeler `confirmReservation` (décrément stock) et passer la réservation en statut `confirmed` (ajouter `confirmed` à l’enum ReservationStatus si absent).
  - [x] Créer le modèle Order (minimal) : id, tenantId, reservationId, orderNumber (SS-XXXX), status (new | confirmed | confirmed_pending_deposit | delivered | cancelled), depositStatus (no_deposit | deposit_pending | deposit_approved | deposit_rejected), depositExpiresAt (optionnel). Lien Reservation → Order (1:1 après confirmation).
  - [x] Si tenant requireDeposit : créer Order avec status `confirmed_pending_deposit`, depositStatus `deposit_pending`, depositExpiresAt = now + TTL acompte (ex. 15–30 min), envoyer message type « Envoyez votre preuve d'acompte (photo ou message) dans les X min » via writeToOutbox.
  - [x] Si tenant sans acompte : créer Order avec status `confirmed`, depositStatus `no_deposit`.

- [x] Task 3 : Persistance et Event Log (AC: #2, #3)
  - [x] Migration Prisma : Order (+ champs ci-dessus), relation Reservation → Order. Optionnel : PaymentProof (id, orderId, status, mediaStorageKey?) pour Story 5.3 ; en 4.5 on peut ne stocker que les états sur Order.
  - [x] Event Log : order_created (ou reservation_confirmed avec payload order_id) ; optionnel deposit_requested.

- [x] Task 4 : Tests (AC: #1, #2, #3)
  - [x] Test : création réservation avec acompte désactivé → expiresAt = now + TTL soft.
  - [x] Test : création réservation avec acompte activé → expiresAt = now + TTL locked.
  - [x] Test : confirmation (OUI) avec acompte activé → Order créé en confirmed_pending_deposit, message « preuve » envoyé (outbox), depositExpiresAt renseigné.
  - [x] Test : confirmation (OUI) sans acompte → Order créé en confirmed, depositStatus no_deposit.
  - [x] Test idempotence : double OUI même réservation → une seule commande.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 4, Story 4.5 ; FR23, FR44, FR43.
- **Architecture :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.3 « Confirm (OUI + address) → create order → acompte state » ; §F « Acompte recommandé » (états confirmed_pending_deposit, confirmed, deposit_received ; TTL acompte 15–30 min ; payment_proofs pending/approved/rejected).
- **Contexte :** Aujourd’hui le bot envoie « Réponds OUI pour confirmer » après collecte d’adresse (4.1) mais le traitement du message « OUI » n’est pas implémenté (ou pas branché). La story 4.5 introduit : (1) TTL réservation soft vs locked selon config acompte ; (2) gestion du OUI → confirmation + création Order + demande preuve si acompte activé.

### Project Structure Notes

- **Fichiers concernés :** `prisma/schema.prisma` (Tenant ou settings pour requireDeposit ; Reservation.status + confirmed ; Order, optionnel PaymentProof) ; `src/server/reservation/service.ts` (createReservation : TTL soft/locked) ; `src/server/workers/webhook-processor.ts` (intent OUI, création Order, envoi message preuve) ; `src/env.js` (RESERVATION_TTL_SOFT_MINUTES, RESERVATION_TTL_LOCKED_MINUTES et/ou DEPOSIT_TTL_MINUTES) ; `src/server/events/eventLog.ts` (order_created, deposit_requested si besoin).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.3, §F, §8 (Data Storage : orders, payment_proofs).

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Soft vs locked :** Sans acompte = réservation « soft » avec TTL court (ex. 5 min) pour limiter les réservations fantômes ; avec acompte = réservation « locked » avec TTL normal (ex. 10–15 min). La config est au niveau tenant (ex. « exiger acompte » activé/désactivé).
- **Après OUI + adresse :** Création d’une commande (Order) avec numéro SS-XXXX (génération séquentielle ou par tenant). Si acompte activé : statut `confirmed_pending_deposit`, demande de preuve au client (WhatsApp), TTL pour envoyer la preuve (ex. 15–30 min). États de paiement : no_deposit, deposit_pending, deposit_approved, deposit_rejected (FR43). La validation/refus de la preuve dans le dashboard est Story 5.3 ; en 4.5 on met en place les états et la demande de preuve.

### Technical Requirements

- **TTL réservation :** Dans `createReservation`, récupérer la config tenant (requireDeposit). Si false → expiresAt = now + RESERVATION_TTL_SOFT_MINUTES ; si true → expiresAt = now + RESERVATION_TTL_LOCKED_MINUTES. Ne pas modifier l’API existante de createReservation sans nécessité (ajouter un paramètre optionnel ou lire la config à l’intérieur).
- **Intent OUI :** Détection robuste (trim, lowercase) : body === "oui" ou body normalisé équivalent. Exécuter uniquement si réservation active en `address_collected` pour ce client/session. Idempotence : une seule confirmation par réservation (clé idempotente ou vérification Order existant pour cette réservation).
- **Order :** Génération SS-XXXX (ex. séquence par tenant ou timestamp court). Champs minimaux : tenantId, reservationId, orderNumber, status, depositStatus, depositExpiresAt (nullable). Relation Reservation 1:1 Order (orderId optionnel sur Reservation ou Order.reservationId).
- **Message preuve :** Template type « Envoyez votre preuve d’acompte (photo ou message) dans les 15 min. » (durée = DEPOSIT_TTL_MINUTES). Envoi via writeToOutbox ; pas d’appel Twilio direct.

### Architecture Compliance

- **Stack :** Prisma, workers (webhook-processor), outbox (writeToOutbox). Pas de logique lourde sur le webhook Vercel ; confirmation et création Order dans le worker.
- **Outbox :** Tout envoi sortant via writeToOutbox (FR9, NFR-I2).
- **Event Log :** order_created (tenantId, orderId, reservationId, correlationId) ; optionnel deposit_requested.
- **DB :** snake_case pour colonnes ; contraintes FK et index sur (tenant_id), (reservation_id) pour Order.

### Library / Framework Requirements

- Aucune nouvelle dépendance. Prisma pour nouveaux modèles/champs ; writeToOutbox existant.

### File Structure Requirements

- **Schema :** `prisma/schema.prisma` — Tenant : champ optionnel requireDeposit (Boolean, défaut false) ou table settings tenant avec clé/valeur ; Reservation : statut `confirmed` ajouté à l’enum ; Order (tenantId, reservationId, orderNumber, status, depositStatus, depositExpiresAt, createdAt, updatedAt) ; optionnel PaymentProof (orderId, status, mediaStorageKey) pour 5.3. Migrations dédiées.
- **Réservation :** `src/server/reservation/service.ts` — createReservation : lecture config tenant, calcul expiresAt selon TTL soft/locked.
- **Worker :** `src/server/workers/webhook-processor.ts` — branche intent OUI (réservation address_collected) → confirmReservation + update reservation status confirmed + create Order + message preuve si requireDeposit.
- **Order :** Nouveau module ou sous-dossier (ex. `src/server/order/`) pour createOrderFromReservation (tenantId, reservationId, requireDeposit, correlationId) → génération SS-XXXX, création Order, envoi message preuve si besoin.
- **Env :** `src/env.js` — RESERVATION_TTL_SOFT_MINUTES, RESERVATION_TTL_LOCKED_MINUTES (ex. 5 et 12), DEPOSIT_TTL_MINUTES (ex. 15 ou 30). Rétrocompatibilité : si seul RESERVATION_TTL_MINUTES est défini, l’utiliser pour locked et dériver soft (ex. moitié).

### Testing Requirements

- Tests unitaires ou intégration : createReservation avec requireDeposit false → expiresAt court ; requireDeposit true → expiresAt long.
- Tests : traitement OUI → Order créé, statut et depositStatus corrects, message outbox si acompte activé.
- Test idempotence : deux OUI pour même réservation → une seule Order.
- Pas d’e2e obligatoire.

### Previous Story Intelligence (Story 4.4)

- **Story 4.4 :** Rappel T-2 min (reminder_sent_at), job reservation-ttl (runReservationReminderJob avant runReservationTtlJob). writeToOutbox, correlationId, eventLog (reservation_reminder_sent). Ne pas modifier le job TTL pour les expirations ; uniquement ajouter la logique TTL soft/locked à la **création** de réservation (service).
- **Fichiers récents :** reservation/service.ts (createReservation, collectAddress), webhook-processor.ts (collectAddress, récap OUI), live-item/reservation.ts (confirmReservation). Introduire la lecture config tenant (requireDeposit) et le bloc « intent OUI » dans webhook-processor.

### Git Intelligence Summary

- Patterns : correlationId partout, writeToOutbox(tenantId, to, body, correlationId), transactions Prisma pour cohérence, env dans src/env.js. Conserver les mêmes patterns pour Order et message preuve.

### Latest Tech Information

- Aucune mise à jour de librairie requise. Stack T3, Prisma, BullMQ inchangés.

### Project Context Reference

- Pipeline webhook < 1 s ; métier dans workers ; outbox pour tout envoi ; event_log avec correlationId. [Source: _bmad-output/planning-artifacts/architecture.md] §4.3, §F, §11.2. Story 4.5 = règle acompte (soft/locked TTL) + états de paiement + création Order à la confirmation + demande preuve si acompte ; validation/refus preuve = Story 5.3.

### Story Completion Status

- **Status :** ready-for-dev
- **Completion note :** Ultimate context engine analysis completed - comprehensive developer guide created.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1: Tenant.requireDeposit (Boolean) ajouté au schéma Prisma ; env RESERVATION_TTL_SOFT_MINUTES, RESERVATION_TTL_LOCKED_MINUTES, DEPOSIT_TTL_MINUTES. createReservation lit le tenant et calcule expiresAt via getReservationTtlMinutes(requireDeposit). Rétrocompat : locked = RESERVATION_TTL_MINUTES si non défini, soft = moitié.
- Task 2–3: Modèle Order (OrderStatus, DepositStatus), relation Reservation → Order 1:1. createOrderFromReservation dans src/server/order/ : idempotence par reservationId, confirmReservation + update reservation status confirmed, génération SS-XXXX, message preuve si requireDeposit. Intent OUI dans webhook-processor (isConfirmOui), appel createOrderFromReservation et ack outbox.
- Event Log : order_created, deposit_requested ; helpers logOrderCreated, logDepositRequested.
- Task 4: Tests reservation/service (TTL soft/locked), order/createOrderFromReservation (idempotence, avec/sans acompte, confirm_failed, reservation_not_found), webhook-processor (OUI avec/sans acompte, idempotence, isConfirmOui).
- **CR (2026-02-08) :** Correctifs appliqués : unicité (tenant_id, order_number) + retry P2002, .env.example, File List complétée.

### Senior Developer Review (AI)

- **Date :** 2026-02-08
- **Résultat :** Approve (après correctifs)
- **Problèmes traités :**
  - **[HIGH]** Race sur numéro de commande : `getNextOrderNumber` (count+1) non atomique → deux créations concurrentes pouvaient obtenir le même `order_number`. **Correctif :** `@@unique([tenantId, orderNumber])` + retry sur P2002 (jusqu’à 3 tentatives) dans `createOrderFromReservation`.
  - **[MEDIUM]** `.env.example` ne documentait pas les variables Story 4.5. **Correctif :** ajout de RESERVATION_TTL_SOFT_MINUTES, RESERVATION_TTL_LOCKED_MINUTES, DEPOSIT_TTL_MINUTES.
  - **[MEDIUM]** File List incomplète : `eventLog.test.ts` et `.env.example` modifiés mais non listés. **Correctif :** File List mise à jour.
- **Note :** Incohérence partielle possible (réservation confirmée + stock décrémenté mais création Order en échec) laissée en l’état ; à traiter en amont si besoin (transaction ou compensation).

### File List

- prisma/schema.prisma (Tenant.requireDeposit, Order + @@unique(tenantId, orderNumber), OrderStatus, DepositStatus, relation Reservation.order)
- prisma/migrations/20260209260000_add_require_deposit_and_orders_story_4_5/migration.sql
- src/env.js (RESERVATION_TTL_SOFT_MINUTES, RESERVATION_TTL_LOCKED_MINUTES, DEPOSIT_TTL_MINUTES)
- src/server/reservation/service.ts (getReservationTtlMinutes, lecture tenant requireDeposit, calcul expiresAt)
- src/server/reservation/service.test.ts (mock db.tenant + env, tests TTL soft/locked)
- src/server/order/createOrderFromReservation.ts (nouveau)
- src/server/order/createOrderFromReservation.test.ts (nouveau)
- src/server/workers/webhook-processor.ts (isConfirmOui, bloc intent OUI, createOrderFromReservation, db.tenant.findUnique)
- src/server/workers/webhook-processor.test.ts (mock db.tenant, createOrderFromReservation ; tests isConfirmOui, OUI sans/sans acompte, idempotence)
- src/server/events/eventLog.ts (order_created, deposit_requested, logOrderCreated, logDepositRequested)
- src/server/events/eventLog.test.ts (schéma zod des event types étendu)
- .env.example (variables Story 4.5 : RESERVATION_TTL_SOFT/LOCKED, DEPOSIT_TTL_MINUTES)
- prisma/migrations/20260209270000_add_order_tenant_order_number_unique/migration.sql (unicité order_number par tenant, CR)
