# Story 4.3: File d'attente et promotion automatique à l'expiration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **placer le client en file d'attente si l'article est déjà réservé, appliquer un TTL à la réservation, et promouvoir automatiquement le premier en file à l'expiration**,
so that **l'ordre soit respecté et qu'aucune place ne reste bloquée indéfiniment**.

## Acceptance Criteria

1. **Given** un item déjà réservé par un autre client  
   **When** un client envoie le code  
   **Then** il est placé en file (#N) ; quand la réservation en tête expire (T=0), le premier en file est promu automatiquement (FR19, FR20, FR21, FR22)

2. **And** les événements `reservation_started`, `reservation_expired`, `waitlist_promoted` sont enregistrés dans l'Event Log (correlationId)

3. **And** FR19, FR20, FR21, FR22 couverts

## Tasks / Subtasks

- [x] Task 1 : Modèle file d'attente et TTL (AC: #1, #2)
  - [x] Définir ou étendre le modèle pour la file : soit table Waitlist (tenant_id, live_session_id, live_item_id, client_phone, position, correlation_id, created_at) avec position = ordre d'arrivée, soit champ position/status sur Reservation (ex. status = 'waitlist' avec position). Architecture §5 : « Waitlist : insertion avec position = max(position)+1 sous lock ».
  - [x] S'assurer que Reservation.expiresAt est renseigné à la création (TTL configurable, ex. 5–15 min) pour les réservations actives (reserved, address_collected).
  - [x] Migration Prisma si nouveau modèle ou nouveaux champs ; index pour requêtes « premier en file par (live_item_id, live_session_id) ».

- [x] Task 2 : Flux client « code » → Réservé / File #N / Épuisé (AC: #1)
  - [x] Dans webhook-processor (flux client + code) : si item dispo (availableQty - reservedQty > 0 ou item unique non réservé) → créer réservation + reserved_qty += 1, répondre « Réservé. Envoie ton adresse. » + timer (expiresAt).
  - [x] Si plus de place (item déjà réservé à capacité) : insérer en file (position = max+1 sous lock), répondre « Tu es en file #N. On te prévient quand une place se libère. » (ou équivalent FR19).
  - [x] Idempotence : même client + même item + session → une seule entrée en file ; pas de doublon.

- [x] Task 3 : Job expiration T=0 et promotion du premier en file (AC: #1, #2)
  - [x] Job périodique (cron/scheduler sur Railway) : repérer les réservations dont expiresAt <= now et status in (reserved, address_collected).
  - [x] Pour chaque réservation expirée : (1) mettre status = expired, (2) reserved_qty -= 1 sur LiveItem (release), (3) écrire event_log reservation_expired (correlationId).
  - [x] Ensuite : pour le même (live_item_id, live_session_id), prendre le premier en file (min(position)), le « promouvoir » : créer une Reservation (reserved), reserved_qty += 1, définir expiresAt (TTL), supprimer/désactiver l'entrée file, écrire event_log waitlist_promoted, envoyer message outbox au client « Une place s'est libérée pour [code]. Tu es réservé. Envoie ton adresse. » (ou équivalent).
  - [x] Transaction + lock pour éviter race entre expiration et promotion.

- [x] Task 4 : Event Log reservation_expired et waitlist_promoted (AC: #2)
  - [x] Étendre eventLog.ts : logReservationExpired(tenantId, reservationId, correlationId, payload?), logWaitlistPromoted(tenantId, reservationId, clientPhone?, liveItemId, correlationId, payload?). Payload sans PII (ids uniquement).
  - [x] Appeler ces logs depuis le job d'expiration / promotion.

- [x] Task 5 : Tests (AC: #1, #2)
  - [x] Test : client envoie code alors qu'item déjà réservé (pas de place) → placé en file, message « File #N ».
  - [x] Test : expiration d'une réservation → status expired, reserved_qty -= 1, event reservation_expired ; premier en file promu → nouvelle réservation, event waitlist_promoted, message client.
  - [x] Test idempotence file (même client + item + session ne crée pas deux entrées file).

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 4, Story 4.3 ; FR19, FR20, FR21, FR22.
- **Architecture :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.2 Reserve → waitlist → promote ; §5 Waitlist position = max(position)+1 sous lock ; §8 tables reservations, waitlist ; Décision D (expiration : reserved_qty -= 1). Railway = cron (TTL, rappels, clôture live).
- **État actuel :** Story 4.1 : réservation créée avec status reserved/address_collected, reserved_qty += 1, pas de expiresAt renseigné, pas de file. Story 4.2 : code inconnu/typo géré. Pour 4.3 : introduire file d'attente (modèle + insertion), TTL sur réservation (expiresAt), job expiration T=0 + promotion premier en file + events reservation_expired et waitlist_promoted.

### Project Structure Notes

- **Fichiers concernés :** `prisma/schema.prisma` (Waitlist ou champs Reservation), `src/server/workers/webhook-processor.ts` (flux client code → réservé vs file #N), nouveau job `src/server/workers/reservation-ttl.ts` (ou cron dédié) pour expiration + promotion, `src/server/events/eventLog.ts` (reservation_expired, waitlist_promoted). Config TTL : constante ou paramètre tenant (ex. 10 min).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.2, §5, §8, §11.2 (Railway cron).

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **File d'attente :** si un client envoie un code et qu'il n'y a plus de place (item déjà réservé à capacité : availableQty - reservedQty <= 0 ou item unique déjà réservé), le client est placé en **file** avec un numéro d'ordre (#1, #2, …). Quand la réservation **en tête** expire (T=0), le **premier en file** est automatiquement **promu** : il obtient une réservation (reserved), un TTL, et reçoit un message type « Une place libérée, tu es réservé. Envoie ton adresse. ».
- **TTL :** chaque réservation active (reserved, address_collected) a un `expiresAt` (ex. now + 10 min). À T=0, un job marque la réservation comme expired, fait reserved_qty -= 1, puis promeut le premier en file s'il y en a un.
- **Ordre strict :** la file respecte l'ordre d'arrivée (position = max(position)+1 sous lock) pour éviter que deux clients soient promus pour la même place.

### Technical Requirements

- **Modèle file :** soit table dédiée Waitlist (tenant_id, live_session_id, live_item_id, client_phone, position, correlation_id, createdAt), soit statut/position sur Reservation (ex. status = 'in_waitlist' avec position). Contrainte d'unicité pour (tenant_id, live_session_id, client_phone, live_item_id) pour la file (une entrée par client/item/session).
- **TTL :** à la création d'une réservation (createReservation), calculer expiresAt = now + TTL_RESERVATION_MINUTES (configurable, ex. 10). Persister dans Reservation.expiresAt.
- **Job expiration :** worker/cron (BullMQ repeat ou cron Railway) : toutes les N secondes, sélectionner réservations où expiresAt <= now et status in ('reserved','address_collected') ; pour chacune : transaction (status = expired, releaseReservation), log reservation_expired, puis pour le même live_item_id + live_session_id : prendre premier en file (min position), créer réservation + reserveOneUnit, supprimer entrée file, log waitlist_promoted, writeToOutbox message au client.
- **Concurrence :** SELECT FOR UPDATE sur live_item (ou lock sur ligne file) lors de la promotion pour éviter double promotion.

### Architecture Compliance

- **Stack :** inchangé — Prisma, workers Railway, outbox, event_log. Pas de réponse depuis le webhook (< 1 s).
- **Stock :** expiration → reserved_qty -= 1 uniquement (pas de décrément available_qty). Promotion → reserved_qty += 1 (même logique que 4.1).
- **Event Log :** event_type reservation_expired, waitlist_promoted ; correlation_id propagé ; payload sans PII (ids uniquement).
- **Naming :** DB snake_case (waitlist ou champs reservation) ; Prisma @map si besoin.

### Library / Framework Requirements

- Prisma pour nouveau modèle / champs et transactions. BullMQ pour job répété (ou node-cron / Railway cron). Aucune nouvelle dépendance externe requise.

### File Structure Requirements

- **Schema :** `prisma/schema.prisma` — ajout modèle Waitlist (ou champs position/status sur Reservation) ; Reservation.expiresAt déjà présent, à renseigner à la création.
- **Worker :** `src/server/workers/webhook-processor.ts` — branche « client + code » : si dispo → réservation (existant 4.1) + set expiresAt ; si pas dispo → insertion file + réponse « File #N ».
- **Job :** `src/server/workers/reservation-ttl.ts` (ou nom équivalent) — expiration + promotion ; enregistrer le job en repeat dans queues.ts.
- **Events :** `src/server/events/eventLog.ts` — ajouter reservation_expired, waitlist_promoted dans EventType ; fonctions logReservationExpired, logWaitlistPromoted.

### Testing Requirements

- Test unitaire ou intégration : client envoie code, item déjà réservé → créé en file, message « File #N » ; pas de deuxième entrée pour même client+item+session.
- Test job : réservation expirée (expiresAt <= now) → status expired, reserved_qty -= 1, event reservation_expired ; si file non vide → premier promu, réservation créée, event waitlist_promoted, outbox contient message client.
- Pas d'e2e obligatoire ; couvrir les chemins critiques (file, expiration, promotion).

### Previous Story Intelligence (Story 4.2)

- **Story 4.2 :** Code inexistant/typo → lookup LiveItem sans création, message « Code inconnu » ou suggestion. Le flux client « code » utilise findLiveItemByCode puis soit réservation/file (4.1/4.3), soit « Code inconnu ». Pour 4.3, après findLiveItemByCode trouvé : vérifier dispo → réservation (4.1) avec expiresAt, sinon → file #N.
- **Fichiers récents :** webhook-processor.ts, findLiveItemByCode, reservation/service.ts. Réutiliser createReservation (en lui passant expiresAt si étendu), reserveOneUnit, releaseReservation ; ne pas casser le flux code inconnu.

### Git Intelligence Summary

- Fichiers récents : `src/server/workers/webhook-processor.ts`, `src/server/live-item/findLiveItemByCode.ts`, `src/server/reservation/service.ts`, `src/server/events/eventLog.ts`. Patterns : correlationId, writeToOutbox, isolation tenant, logReservationStarted. Conserver les mêmes patterns pour reservation_expired et waitlist_promoted.

### Latest Tech Information

- Aucune mise à jour de librairie requise. Stack T3, Prisma, BullMQ inchangés. Railway cron ou BullMQ repeat pour le job TTL.

### Project Context Reference

- Pipeline webhook < 1 s ; métier dans workers ; outbox pour tout envoi ; event_log avec correlationId. [Source: _bmad-output/planning-artifacts/architecture.md] §4.2, §5, §11.2. Rappel T-2 min (Story 4.4) à prévoir plus tard ; 4.3 se concentre sur file + TTL + expiration + promotion.

### Story Completion Status

- **Status :** ready-for-dev
- **Completion note :** Contexte story 4.3 complété — file d'attente, TTL, expiration, promotion automatique, events reservation_expired et waitlist_promoted, prêt pour implémentation par l'agent Dev.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1 : Modèle Waitlist (table dédiée), Reservation.expiresAt à la création via RESERVATION_TTL_MINUTES (env, 5–15 min défaut 10), migration 20260209240000, index (live_item_id, live_session_id) sur reservations et waitlist.
- Task 2 : addToWaitlist (position max+1 sous lock, idempotence), webhook-processor branche free <= 0 → addToWaitlist + message « Tu es en file #N. On te prévient quand une place se libère. »
- Task 3 : reservation-ttl.ts runReservationTtlJob (expiration + promotion en transaction), startReservationTtlWorker (1 min) dans start-worker.ts.
- Task 4 : logReservationExpired, logWaitlistPromoted dans eventLog.ts ; appelés depuis job.
- Task 5 : Tests addToWaitlist (idempotence, position max+1, not_found), reservation-ttl (0/0, expire seul, expire+promote), webhook File #N.

### Senior Developer Review (AI)

**Date :** 2026-02-08  
**Outcome :** Changes Requested → corrigé (fixes appliqués)

**Findings :**
- [x] **[HIGH]** Perte de place si `createReservation` échoue après promotion — waitlist supprimée dans la transaction avant l’appel à `createReservation`. **Fix :** suppression de la waitlist uniquement après succès de `createReservation` (retour de `waitlistId`, `db.waitlist.delete` après succès).
- [x] **[MEDIUM]** `.env.example` ne documentait pas `RESERVATION_TTL_MINUTES`. **Fix :** ligne commentée + entrée dans le tableau déploiement.
- [x] **[MEDIUM]** Race P2002 dans `addToWaitlist` non gérée. **Fix :** catch P2002, `findUnique` puis retour `{ ok: true, position, alreadyInWaitlist: true }`.
- [x] **[LOW]** Import inutilisé `reserveOneUnit` dans `reservation-ttl.ts`. **Fix :** import supprimé.
- [x] **[LOW]** Test manquant : échec `createReservation` → waitlist non supprimée. **Fix :** test ajouté dans `reservation-ttl.test.ts` ; test P2002 dans `addToWaitlist.test.ts`.

**Action Items :** Aucun (tous résolus).

### Change Log

- 2026-02-08 : Implémentation complète Story 4.3 — file d'attente (Waitlist), TTL réservation (expiresAt), job expiration + promotion, events reservation_expired / waitlist_promoted, tests.
- 2026-02-08 : Code review — corrections appliquées (waitlist supprimée après promotion réussie, P2002 addToWaitlist, .env.example, tests).

### File List

- prisma/schema.prisma (Waitlist, index reservations)
- prisma/migrations/20260209240000_add_waitlist_story_4_3/migration.sql
- src/env.js (RESERVATION_TTL_MINUTES)
- src/server/reservation/service.ts (expiresAt à la création)
- src/server/reservation/service.test.ts (expiresAt dans create)
- src/server/waitlist/addToWaitlist.ts
- src/server/waitlist/addToWaitlist.test.ts
- src/server/workers/webhook-processor.ts (addToWaitlist, message File #N)
- src/server/workers/webhook-processor.test.ts (mock addToWaitlist, test File #N)
- src/server/workers/reservation-ttl.ts
- src/server/workers/reservation-ttl.test.ts
- src/server/workers/queues.ts (inchangé ; job via setInterval dans start-worker)
- scripts/start-worker.ts (reservation TTL worker 1 min)
- src/server/events/eventLog.ts (reservation_expired, waitlist_promoted)
- .env.example (RESERVATION_TTL_MINUTES, tableau déploiement)
- _bmad-output/implementation-artifacts/4-3-code-review-findings.md (rapport CR)
