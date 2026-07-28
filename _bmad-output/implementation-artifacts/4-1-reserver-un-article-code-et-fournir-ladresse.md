# Story 4.1: Réserver un article (code) et fournir l'adresse

Status: done

<!-- Note: Validation optionnelle. Run validate-create-story pour contrôle qualité avant dev-story. -->

## Story

As a **cliente**,
I want **réserver un article en envoyant le code puis fournir mon adresse**,
so that **ma réservation soit enregistrée et que le système puisse me demander de confirmer (OUI)**.

## Acceptance Criteria

1. **Given** un code valide (item dispo ou en file)
   **When** j'envoie le code sur WhatsApp
   **Then** le système répond immédiatement (réservé / file #N / épuisé) avec timer (FR18)
   **And** si réservé, le bot me demande mon adresse ; quand j'envoie l'adresse, le bot envoie le récap prix + total + « Réponds OUI pour confirmer »
   **And** FR18 couvert

## Tasks / Subtasks

- [x] Task 1 : Modèle et persistance réservation (AC: #1)
  - [x] Définir modèle Prisma `Reservation` (tenant_id, live_item_id, client_phone, status, address, expires_at, etc.) et contraintes idempotence (archi §B : reservation_attempt_key).
  - [x] Migration Prisma + index (tenant_id, live_session_id, client_phone, live_item_id) pour unicité tentative réservation.
  - [x] États réservation : reserved | address_collected | confirmed | expired (confirmed/expired gérés en 4.1 minimal ou 5.1 selon périmètre).

- [x] Task 2 : Intent client « code » → réservation ou file ou épuisé (AC: #1)
  - [x] Dans webhook-processor : après resolveOrCreateLiveItem (ou à la place pour le flux client), déterminer dispo (availableQty - reservedQty > 0 ou item unique non réservé).
  - [x] Si dispo : créer Reservation (reserved), incrémenter reserved_qty sur LiveItem (Story 3.6), répondre « Réservé. Envoie ton adresse. » + timer.
  - [x] Si déjà réservé (pas de place) : placer en file (Story 4.3 peut venir après) ou répondre « Épuisé » selon spec ; pour 4.1 minimal : au moins « Réservé » ou « Épuisé » + message clair.
  - [x] Idempotence : même (tenant_id, client_phone, live_item_id, session) ne crée pas deux réservations actives.

- [x] Task 3 : Collecte adresse et récap (AC: #1)
  - [x] Détecter message client avec adresse (texte libre ou pattern) quand une réservation en état « reserved » existe pour ce client (et éventuellement ce live_item).
  - [x] Mettre à jour Reservation (address, status = address_collected), écrire outbox : récap (code, prix, total, livraison si config) + « Réponds OUI pour confirmer ».
  - [x] Gérer ordre des messages WhatsApp (state machine par client/session) : après code → attente adresse ; après adresse → attente OUI (confirmation = story 5.1 ou partie 4.1 selon découpe).

- [x] Task 4 : Event Log et outbox (AC: #1)
  - [x] Enregistrer reservation_started (correlationId) dans event_log à la création réservation (Epic 4 audit trail).
  - [x] Tous les messages bot vers le client via writeToOutbox (déjà en place) ; pas de réponse depuis la route webhook.

- [x] Task 5 : Tests (AC: #1)
  - [x] Tests unitaires ou intégration : création réservation, idempotence, reserved_qty incrémenté ; message « Réservé » / « Épuisé » selon dispo.
  - [x] Test collecte adresse → récap + « OUI pour confirmer » (mock outbox ou DB).

- **Review Follow-ups (AI)**
  - [x] [AI-Review][MEDIUM] Ajouter test createReservation : cas P2002 (race) → releaseReservation appelé puis retour already_reserved. [src/server/reservation/service.test.ts]
  - [x] [AI-Review][MEDIUM] Valider longueur adresse (optionnel) : min/max ou limite raisonnable pour éviter abus (Dev Notes Zod). [src/server/reservation/service.ts]
  - [x] [AI-Review][LOW] AC « avec timer (FR18) » : non implémenté en 4.1 ; prévu 4.3 (TTL). Documenter ou ajouter message timer minimal si requis.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 4, Story 4.1 ; FR18.
- **État actuel :** Le worker traite déjà le message client « code » via resolveOrCreateLiveItem (Story 3.3) et crée l’item si absent ; il ne crée pas de réservation ni ne répond « Réservé / file / épuisé » ni ne collecte l’adresse. Cette story introduit le tunnel réservation → adresse → récap + OUI.
- **Périmètre 4.1 :** Réservation + collecte adresse + récap + « Réponds OUI pour confirmer ». La confirmation (OUI) et la création de commande (SS-XXXX) sont en Story 5.1 ; le TTL et la file d’attente sont en 4.3/4.4. Pour 4.1 : au minimum réservation dispo → « Réservé », demande adresse, récap + OUI ; « file #N » peut être message fixe ou délégué à 4.3.
- **Piège :** Ne pas traiter un message vendeur comme client (routage déjà en place). Ne pas décrémenter available_qty à la réservation (reserved_qty += 1 uniquement, archi §D). Ordre des messages : utiliser l’état de la réservation (reserved vs address_collected) pour savoir quoi attendre du prochain message client.

### Project Structure Notes

- **Fichiers concernés :** `prisma/schema.prisma` (modèle Reservation, contraintes), `src/server/workers/webhook-processor.ts` (intent client code → réservation + intent adresse → récap), nouveau module optionnel `src/server/reservation/` (createReservation, getActiveReservationForClient, collectAddress) si souhaité pour clarté. Event log : `src/server/events/eventLog.ts` (ajouter reservation_started).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.2 Reserve → waitlist → promote, §5 Consistency (idempotence reservation_attempt_key), §D Stock ; [Source: _bmad-output/planning-artifacts/epics.md] Epic 4, FR18.

---

## Senior Developer Review (AI)

- **Date :** 2026-02-08
- **Outcome :** Approve (tous les points traités)
- **Résumé :** Fuite de `reserved_qty` corrigée. Test P2002 ajouté. Validation adresse (max 2000 car). FR18/timer documenté scope 4.3.

**Action Items :**
- [x] [HIGH] **Corrigé** — createReservation : en cas d’échec de `db.reservation.create()` (autre que P2002), appeler `releaseReservation` avant rethrow. [src/server/reservation/service.ts]
- [x] [MEDIUM] Test P2002 dans createReservation (releaseReservation appelé, retour already_reserved). [src/server/reservation/service.test.ts]
- [x] [MEDIUM] Validation longueur adresse : ADDRESS_MAX_LENGTH = 2000, raison address_too_long. [src/server/reservation/service.ts]
- [x] [LOW] FR18/timer : périmètre 4.1 sans timer ; TTL et message timer prévus en Story 4.3.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- La **cliente** envoie un **code** (ex. A12) sur WhatsApp. Le système doit répondre immédiatement : **Réservé** (si dispo), **File #N** (si déjà réservé, story 4.3), ou **Épuisé** (stock 0 ou plus de place). Si réservé, le bot demande l’**adresse** ; à réception de l’adresse, le bot envoie un **récap** (prix, total, livraison si config) et « Réponds OUI pour confirmer ». La confirmation (OUI) et la création de la commande SS-XXXX sont en Epic 5.
- **Réservation** = blocage d’une unité (reserved_qty += 1) sans consommer available_qty ; la consommation se fait à la confirmation (Story 3.6, 5.1).
- **Idempotence** : une même cliente ne doit pas pouvoir avoir deux réservations actives pour le même article (même tenant, session, live_item) ; clé idempotente recommandée (tenant_id, client_phone, live_item_id, live_session_id) pour la tentative de réservation.

### Technical Requirements

- **Modèle Reservation :** champs minimaux : tenantId, liveItemId, liveSessionId, clientPhone (E.164 normalisé), status (reserved | address_collected | confirmed | expired), address (texte libre ou null), expiresAt (pour TTL 4.3, optionnel en 4.1), correlationId. Contrainte unique ou index pour éviter double réservation active par (tenant_id, client_phone, live_item_id) ou par reservation_attempt_key.
- **Flux client :** (1) Message body = code (CLIENT_CODE_PATTERN) → lookup LiveItem (session courante), vérifier dispo → créer Reservation, reserved_qty += 1, outbox « Réservé. Envoie ton adresse. » (+ timer si TTL affiché). (2) Message body = adresse (client avec réservation en état reserved) → mettre à jour Reservation (address, address_collected), outbox récap + « Réponds OUI pour confirmer ». (3) Message OUI → traité en 5.1 (création commande) ou stub en 4.1.
- **Routage :** Réutiliser determineMessageType (vendeur vs client) ; ne traiter réservation que pour messageType === "client". Réutiliser getOrCreateCurrentSession, resolveOrCreateLiveItem selon besoin (résolution du code avant de décider réservé/file/épuisé).

### Architecture Compliance

- **Stack :** Prisma (Neon), workers (Railway), outbox (MessageOut), event_log (correlationId). Webhook reste < 1 s (persist + enqueue uniquement).
- **Idempotence :** reservation_attempt_key (archi §B) : (tenant_id, client_phone, live_item_id) ou inclure live_session_id ; refus silencieux ou message clair si doublon.
- **Stock :** Réservation = reserved_qty += 1 uniquement ; pas de décrément available_qty avant confirmation (archi §D).
- **Naming :** DB snake_case (reservations, client_phone, live_item_id, etc.) ; Prisma @map si camelCase en TS.

### Library / Framework Requirements

- **Prisma :** nouveau modèle Reservation, migration. Transactions pour création réservation + update live_item.reserved_qty (SELECT FOR UPDATE si besoin pour concurrence).
- **Zod :** valider payloads ou schémas pour adresse (texte libre min/max) si nécessaire.
- Aucune nouvelle dépendance externe requise.

### File Structure Requirements

- **Schema :** `prisma/schema.prisma` — ajout modèle Reservation, relation LiveItem → Reservation(s), index/unique selon idempotence.
- **Worker :** `src/server/workers/webhook-processor.ts` — après branche client + code : logique réservation (créer reservation, reserved_qty += 1, outbox) ; nouveau bloc « client + adresse » (réservation existante reserved → address_collected, outbox récap). Option : `src/server/reservation/createReservation.ts`, `collectAddress.ts` pour garder webhook-processor lisible.
- **Events :** `src/server/events/eventLog.ts` — ajouter `logReservationStarted(tenantId, reservationId, correlationId, payload?)`.
- **Templates / copy :** messages bot dans outbox (texte FR) : « Réservé. Envoie ton adresse. », « Récap : [code] — [prix] — Total : [X]. Réponds OUI pour confirmer. » — centraliser dans `src/server/messaging/templates.ts` ou équivalent si existant, sinon inline dans le worker.

### Testing Requirements

- Tests pour : création réservation quand dispo ; idempotence (même client + item + session ne crée pas 2 réservations) ; reserved_qty incrémenté ; message « Épuisé » quand availableQty - reservedQty <= 0 (ou item unique déjà réservé).
- Test collecte adresse : réservation en reserved → envoi adresse → Reservation.address rempli, status address_collected, outbox contient récap + OUI.
- Pas d’e2e obligatoire pour 4.1 ; unit ou intégration avec DB mock/real selon setup projet.

### Previous Story Intelligence (Story 3.7)

- **Story 3.7 :** Extension catégories (lettres, groupes, mots) dans `getPriceFromCode` ; longest match. Les codes peuvent être A12, AB7, Premium42. Réutiliser getPriceFromCode pour afficher le prix dans le récap (prix + total).
- **Story 3.6 :** reserved_qty += 1 à la réservation ; reserved_qty -= 1 et available_qty -= 1 à la confirmation. Ne pas décrémenter available_qty à la réservation.
- **Webhook-processor :** CLIENT_CODE_PATTERN pour détecter code client ; resolveOrCreateLiveItem pour obtenir/créer LiveItem. Pour 4.1, après resolveOrCreateLiveItem (ou en parallèle), décider réservé / file / épuisé et créer Reservation si réservé.

### Git Intelligence Summary

- Fichiers récents : `src/server/workers/webhook-processor.ts`, `src/server/live-item/createLiveItem.ts`, `src/server/pricing/getPriceFromCode.ts`, `src/server/events/eventLog.ts`, `prisma/schema.prisma`. Respecter les mêmes patterns (correlationId, writeToOutbox, isolation tenant).

### Latest Tech Information

- Aucune mise à jour de librairie requise pour cette story. Prisma, BullMQ, stack T3 inchangés.

### Project Context Reference

- Structure T3 ; webhook < 1 s ; métier dans workers ; outbox pour tout envoi sortant ; event_log avec correlationId (Epic 4 audit : reservation_started). [Source: _bmad-output/planning-artifacts/architecture.md] §4.2, §5, §D.

### Story Completion Status

- **Status :** review
- **Completion note :** Contexte story 4.1 complété — réservation (code → réservé/file/épuisé), collecte adresse, récap + « OUI pour confirmer », prêt pour implémentation par l’agent Dev.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1 : Modèle Prisma `Reservation` (reservations) avec enum ReservationStatus (reserved | address_collected | confirmed | expired), contrainte unique (tenant_id, live_session_id, client_phone, live_item_id). Migration 20260209230000_add_reservation_model_story_4_1.
- Task 2 : Module `src/server/reservation/service.ts` (createReservation, getActiveReservationForClient). Webhook-processor : après resolveOrCreateLiveItem, calcul free = availableQty - reservedQty ; si free <= 0 → outbox « Épuisé » ; sinon createReservation → « Réservé. Envoie ton adresse. » ou « Épuisé » si race exhausted. Idempotence via unique + createReservation retourne already_reserved.
- Task 3 : collectAddress dans reservation/service ; webhook-processor : message client non-code avec session → getActiveReservationForClient ; si status reserved → collectAddress, puis outbox récap (code, prix, total) + « Réponds OUI pour confirmer ». Session résolue pour tout message client non vide (clientNonEmpty) pour permettre lookup adresse.
- Task 4 : logReservationStarted dans eventLog.ts (event_type reservation_started), appelé à la création réservation. Tous les messages via writeToOutbox.
- Task 5 : Tests webhook-processor (Réservé/Épuisé, adresse → récap), reservation/service.test.ts (createReservation, getActiveReservationForClient, collectAddress), eventLog (logReservationStarted).
- **Code review (CR 4-1) :** Corrigé fuite reserved_qty ; test P2002 ajouté ; validation adresse max 2000 car (address_too_long) ; FR18/timer laissé en scope 4.3. Tous les follow-ups traités, story passée en done.

### File List

- prisma/schema.prisma
- prisma/migrations/20260209230000_add_reservation_model_story_4_1/migration.sql
- src/server/events/eventLog.ts
- src/server/events/eventLog.test.ts
- src/server/reservation/service.ts
- src/server/reservation/service.test.ts
- src/server/workers/webhook-processor.ts
- src/server/workers/webhook-processor.test.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/4-1-reserver-un-article-code-et-fournir-ladresse.md
