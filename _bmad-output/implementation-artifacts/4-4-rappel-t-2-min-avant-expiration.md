# Story 4.4: Rappel T-2 min avant expiration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **envoyer un rappel au client T-2 min avant l'expiration de sa réservation**,
so that **il ait le temps de confirmer ou de fournir son adresse**.

## Acceptance Criteria

1. **Given** une réservation active avec TTL (ex. 10 min)  
   **When** il reste 2 min avant expiration  
   **Then** le bot envoie un rappel au client (via outbox)  
   **And** cohérent avec FR21

## Tasks / Subtasks

- [x] Task 1 : Détecter réservations à T-2 min (AC: #1)
  - [x] Dans le job TTL (ou job dédié) : sélectionner les réservations où status in (reserved, address_collected) et expiresAt entre now+2min et now+2min+fenêtre (ex. 1 min), sans rappel déjà envoyé.
  - [x] Marquer que le rappel a été envoyé (champ dédié ou table sent_reminders / reservation_reminder_sent_at) pour éviter doublons.

- [x] Task 2 : Envoyer le message rappel via outbox (AC: #1)
  - [x] Pour chaque réservation éligible : récupérer client_phone (Reservation), tenantId, correlationId ; construire corps du message (template type « Il te reste 2 min pour confirmer. Réponds OUI ou envoie ton adresse. »).
  - [x] Appeler writeToOutbox(tenantId, to: clientPhone, body, correlationId). Pas d'envoi direct ; outbox-sender envoie via Twilio.

- [x] Task 3 : Idempotence et non-double envoi (AC: #1)
  - [x] Une seule fois par réservation : soit champ reservation.reminder_sent_at (ou équivalent), soit table reminder_sent(reservation_id) ; vérifier avant envoi.

- [x] Task 4 : Tests (AC: #1)
  - [x] Test : réservation avec expiresAt = now+2min → rappel envoyé (outbox contient message), reminder_sent enregistré.
  - [x] Test : même réservation relue au prochain run → pas de second rappel.
  - [x] Test : réservation expiresAt = now+5min → pas de rappel.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 4, Story 4.4 ; FR21.
- **Architecture :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.2 « TTL sur réservation ; rappel T-2 min ; à expiration : promotion automatique du premier en file » ; §4.5 outbox pour tout envoi ; §11.2 Railway cron/jobs.
- **Contexte :** Story 4.3 a mis en place le job reservation-ttl (expiration T=0 + promotion). La story 4.4 ajoute une passe « rappel T-2 min » : soit dans le même job (une requête pour réservations dont expiresAt dans la fenêtre T-2), soit un job séparé appelé avec la même fréquence (ex. 1 min). Réutiliser writeToOutbox, correlationId, isolation tenant.

### Project Structure Notes

- **Fichiers concernés :** `prisma/schema.prisma` (champ reminder_sent_at sur Reservation ou table dédiée si préféré), `src/server/workers/reservation-ttl.ts` (étendre avec passe rappel T-2) ou nouveau fichier `reservation-reminder.ts` ; `src/server/messaging/outbox.ts` (writeToOutbox existant). Config : REMINDER_WINDOW_MINUTES = 2 (constant ou env).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.2, §4.5, §11.2.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Rappel T-2 min :** pour chaque réservation active (reserved, address_collected) avec expiresAt renseigné, quand il reste environ 2 min avant expiration (ex. expiresAt entre now+2min et now+2min+1min), le système envoie **un seul** message WhatsApp au client pour le rappeler (ex. « Il te reste 2 min pour confirmer. Envoie ton adresse ou réponds OUI. »). Envoi **via outbox** (pas d'appel Twilio direct). Après envoi, marquer la réservation pour ne plus renvoyer de rappel (idempotence).
- **Lien avec 4.3 :** le job 4.3 gère déjà T=0 (expiration + promotion). 4.4 ajoute une étape « avant expiration » : sélectionner les réservations dont expiresAt est dans la fenêtre [now+2min, now+2min+delta] (delta = fenêtre du cron, ex. 1 min), envoyer rappel, persister reminder_sent_at (ou équivalent).

### Technical Requirements

- **Détection T-2 :** requête type : reservations où status in ('reserved','address_collected'), expiresAt BETWEEN now() + interval '2 minutes' AND now() + interval '3 minutes' (ou équivalent), et (reminder_sent_at IS NULL ou pas encore envoyé). Limiter le batch (ex. 50) pour éviter surcharge.
- **Envoi :** writeToOutbox({ tenantId, to: reservation.clientPhone (ou champ équivalent), body: message rappel, correlationId: reservation.correlationId }). Le corps du message peut être une constante ou un template tenant (MVP = constante).
- **Marquage :** après envoi réussi (writeToOutbox retourne), mettre à jour reservation.reminder_sent_at = now() (ou insérer dans une table reminder_sent). Faire cela dans la même logique que la sélection pour éviter race (UPDATE ... WHERE id IN (...) AND reminder_sent_at IS NULL RETURNING id, puis pour chaque id écrire outbox + mettre à jour).
- **Ordre d'exécution :** dans le même worker que reservation-ttl, exécuter d'abord la passe « rappels T-2 min », puis la passe « expiration T=0 » (pour que les rappels soient envoyés avant d'expirer les réservations).

### Architecture Compliance

- **Stack :** inchangé — Prisma, workers Railway, outbox (writeToOutbox). Pas de réponse depuis le webhook.
- **Outbox :** tout envoi sortant via writeToOutbox ; outbox-sender envoie via Twilio (FR9, NFR-I2).
- **Event Log (optionnel) :** pour traçabilité, on peut ajouter un événement reservation_reminder_sent(tenantId, reservationId, correlationId) dans eventLog.ts et l'appeler après writeToOutbox. Pas obligatoire pour AC ; recommandé pour cohérence avec reservation_expired / waitlist_promoted.
- **Naming :** DB snake_case (reminder_sent_at sur reservations ou table dédiée).

### Library / Framework Requirements

- Aucune nouvelle dépendance. Prisma pour nouveau champ ou table ; writeToOutbox existant.

### File Structure Requirements

- **Schema :** `prisma/schema.prisma` — ajout Reservation.reminder_sent_at (DateTime?, optionnel) ou table reservation_reminders(reservation_id, sent_at) avec contrainte unique sur reservation_id. Migration dédiée.
- **Worker :** soit étendre `src/server/workers/reservation-ttl.ts` avec une fonction runReservationReminderJob() appelée avant runReservationTtlJob() dans la boucle du worker, soit nouveau fichier `src/server/workers/reservation-reminder.ts` et appel depuis le même cron/setInterval que le TTL.
- **Events (optionnel) :** `src/server/events/eventLog.ts` — ajouter reservation_reminder_sent si souhaité (EventType + logReservationReminderSent).

### Testing Requirements

- Test unitaire ou intégration : réservation avec expiresAt = now+2min → rappel envoyé (mock ou vraie outbox), reminder_sent_at renseigné.
- Test : même réservation rejouée → pas de second envoi (idempotence).
- Test : expiresAt = now+5min → pas de rappel.
- Pas d'e2e obligatoire.

### Previous Story Intelligence (Story 4.3)

- **Story 4.3 :** Job reservation-ttl.ts : runReservationTtlJob() sélectionne réservations expiresAt <= now, les expire, release reserved_qty, promeut le premier en file, writeToOutbox pour le client promu. Worker lancé toutes les 1 min (start-worker.ts). Réutiliser le même pattern : une fonction runReservationReminderJob() qui sélectionne réservations « T-2 min », appelle writeToOutbox, met à jour reminder_sent_at ; appeler cette fonction avant runReservationTtlJob() dans le worker.
- **Fichiers récents :** reservation-ttl.ts, writeToOutbox (outbox.ts), eventLog (reservation_expired, waitlist_promoted). Ne pas casser le flux expiration/promotion ; ajouter la passe rappel en amont.

### Git Intelligence Summary

- Fichiers pertinents : `src/server/workers/reservation-ttl.ts`, `src/server/messaging/outbox.ts`, `src/server/events/eventLog.ts`, `scripts/start-worker.ts`. Patterns : correlationId, tenantId, writeToOutbox(tenantId, to, body, correlationId). Conserver les mêmes patterns pour le rappel.

### Latest Tech Information

- Aucune mise à jour de librairie requise. Stack T3, Prisma, BullMQ inchangés.

### Project Context Reference

- Pipeline webhook < 1 s ; métier dans workers ; outbox pour tout envoi ; event_log avec correlationId. [Source: _bmad-output/planning-artifacts/architecture.md] §4.2, §4.5, §11.2. Story 4.4 = rappel T-2 min uniquement ; pas de changement au TTL ni à la promotion (4.3).

### Story Completion Status

- **Status :** review
- **Completion note :** Story 4.4 implémentée (rappel T-2 min, outbox, reminder_sent_at, tests).

---

## Change Log

- 2026-02-08 : Implémentation complète — runReservationReminderJob, champ reminder_sent_at, event reservation_reminder_sent, 3 tests (fenêtre T-2, idempotence, hors fenêtre).
- 2026-02-08 : Code review — 4 findings (2 MEDIUM, 2 LOW). Tous corrigés : try/catch + rollback reminder_sent_at si writeToOutbox échoue ; constantes REMINDER_WINDOW_* ; worker exécute TTL même si reminder job rejette ; test rollback.

---

## Senior Developer Review (AI)

**Date :** 2026-02-08  
**Outcome :** Approve (après corrections)

**Action Items :** Tous traités en correctifs automatiques.

- [x] [MEDIUM] Ordre claim puis envoi : rollback de `reminder_sent_at` si `writeToOutbox` échoue (retry au prochain run).
- [x] [MEDIUM] try/catch dans la boucle rappel pour ne pas interrompre le batch.
- [x] [LOW] Constantes `REMINDER_WINDOW_MINUTES` et `REMINDER_WINDOW_END_OFFSET_MINUTES`.
- [x] [LOW] Worker : `.catch()` sur `runReservationReminderJob()` pour exécuter `runReservationTtlJob()` même en cas d’échec du rappel.

**Fichiers modifiés (correctifs) :** `src/server/workers/reservation-ttl.ts`, `src/server/workers/reservation-ttl.test.ts` (test rollback).

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Story 4.4 implémentée : rappel T-2 min dans `runReservationReminderJob()` (réservations avec expiresAt entre now+2min et now+3min, status reserved/address_collected, reminderSentAt null). Envoi via writeToOutbox, marquage reminder_sent_at, logReservationReminderSent. Worker exécute rappel puis TTL (ordre demandé). Tests : rappel envoyé en fenêtre T-2, idempotence (updateMany 0 → pas de second envoi), pas de rappel si hors fenêtre.
- Code review 2026-02-08 : correctifs appliqués — try/catch + rollback reminder_sent_at si writeToOutbox échoue ; constantes REMINDER_WINDOW_* ; worker .catch() pour exécuter TTL même si reminder rejette ; test rollback ajouté.

### File List

- prisma/schema.prisma (Reservation.reminderSentAt)
- prisma/migrations/20260209250000_add_reservation_reminder_sent_at_story_4_4/migration.sql
- src/server/workers/reservation-ttl.ts (runReservationReminderJob, ordre worker, try/catch+rollback, constantes, .catch worker)
- src/server/events/eventLog.ts (EventType reservation_reminder_sent, logReservationReminderSent)
- src/server/workers/reservation-ttl.test.ts (4 tests Story 4.4 dont rollback writeToOutbox)
