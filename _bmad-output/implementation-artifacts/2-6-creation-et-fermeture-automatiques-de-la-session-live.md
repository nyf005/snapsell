# Story 2.6: Création et fermeture automatiques de la session live

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **créer automatiquement une live_session active au premier signal « live » (création item vendeur ou 1ère réservation client) et la fermer après inactivité**,
so that **le vendeur n'ait pas à actionner LIVE ON/OFF**.

## Acceptance Criteria

1. **Given** un tenant sans session active  
   **When** le vendeur crée un item (code) ou un client envoie un code pour réserver  
   **Then** une live_session active est créée et last_activity_at est mis à jour à chaque message pertinent (FR39)  
   **And** un job périodique ferme les sessions dont last_activity_at < now - INACTIVITY_WINDOW (ex. 30–60 min)  
   **And** FR39 couvert

## Tasks / Subtasks

- [x] Task 1 : Modèle Prisma LiveSession (AC: #1)
  - [x] Créer modèle `LiveSession` avec : id, tenant_id, status (active | closed), last_activity_at, created_at, updated_at
  - [x] Contrainte : une seule session active par tenant à la fois (status = active) ; index sur (tenant_id, status)
  - [x] Relation Tenant → LiveSession ; migration Prisma
- [x] Task 2 : Création auto au premier signal « live » dans webhook-processor (AC: #1)
  - [x] Au traitement d’un message vendeur (création item/code) ou client (code pour réserver) : résoudre ou créer la session courante
  - [x] Règle : current_live_session(tenant) = session active avec last_activity_at > now - INACTIVITY_WINDOW ; si aucune → créer nouvelle LiveSession (status active)
  - [x] Après toute action « live » : mettre à jour last_activity_at de la session courante
  - [x] Ne pas créer de session sur messages hors « live » (ex. STOP, simple texte sans code)
- [x] Task 3 : Job périodique de fermeture des sessions inactives (AC: #1)
  - [x] Créer worker/cron (ex. close-inactive-live-sessions) exécuté périodiquement (ex. toutes les 5–15 min)
  - [x] Sélectionner les LiveSession où status = active ET last_activity_at < now - INACTIVITY_WINDOW
  - [x] Mettre status = closed pour ces sessions
  - [x] Logger événement live_session.closed dans EventLog (correlationId si dispo)
- [x] Task 4 : Config INACTIVITY_WINDOW (AC: #1)
  - [x] INACTIVITY_WINDOW en minutes (ex. 30–60) : constante ou config tenant (table/config existante) ; documenter valeur MVP
  - [x] Utiliser la même valeur pour « session courante » et pour le job de fermeture
- [x] Task 5 : Tests et validation (AC: #1)
  - [x] Test : premier message « live » crée LiveSession et last_activity_at mis à jour
  - [x] Test : message suivant réutilise la même session active (pas de doublon)
  - [x] Test : job ferme les sessions inactives au-delà de INACTIVITY_WINDOW

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] updateLastActivity jamais appelée ; supprimer ou documenter. `src/server/live-session/service.ts:61-66`
- [x] [AI-Review][MEDIUM] Job close-inactive : findMany sans limit ; batch/limit recommandé. `src/server/workers/close-inactive-live-sessions.ts:27-34`
- [x] [AI-Review][MEDIUM] README workers : section close-inactive-live-sessions + env LIVE_SESSION_INACTIVITY_WINDOW_MINUTES. `src/server/workers/README.md`
- [x] [AI-Review][LOW] Race condition getOrCreateCurrentSession ; documenter ou durcir. `src/server/live-session/service.ts:19-47`
- [x] [AI-Review][LOW] README webhook : ajouter liveSessionId dans Output. `src/server/workers/README.md`

## Dev Notes

- **FR couvert** : FR39 — Le système crée automatiquement une live_session active au premier signal « live » ; met à jour last_activity_at ; ferme la session après inactivité (T_inactive configurable).
- **Architecture §6 (Live Session Auto)** : Session courante = active + last_activity_at > now - INACTIVITY_WINDOW ; création au 1er code client ou 1ère action vendeur ; fermeture auto par job ; INACTIVITY_WINDOW MVP 30–60 min.
- **Architecture §11.2 (Railway)** : Cron / schedulers : clôture live session auto (inactivité) — le job de fermeture tourne sur Railway avec les autres workers.
- **Piège** : Ne pas créer de session sur des messages qui ne sont pas des signaux « live » (ex. STOP, messages hors contexte code/item). Déclencher création/mise à jour uniquement quand : vendeur crée/édite un code (item) ou client envoie un code (réservation).
- **Une seule session active par tenant** : avant de créer une nouvelle session, vérifier qu’il n’existe pas déjà une session active (status = active et last_activity_at dans la fenêtre). Sinon réutiliser celle-ci et mettre à jour last_activity_at.
- **Stack** : Prisma (Neon), workers (Railway), EventLog existant (Story 2.3). Pas d’UI pour cette story.

### Project Structure Notes

- **Modèle Prisma** : `prisma/schema.prisma` (LiveSession), migrations dans `prisma/migrations/`
- **Création / mise à jour session** : `src/server/workers/webhook-processor.ts` (ou module dédié `src/server/live-session/` appelé depuis le worker)
- **Job fermeture** : nouveau worker `src/server/workers/close-inactive-live-sessions.ts` (ou job BullMQ repeatable)
- **Event Log** : `src/server/events/eventLog.ts` — ajouter événement `live_session.closed` (et optionnellement `live_session.created`)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.6] — User story et critères d’acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#6 Live Session Auto] — Règles session courante, création auto, job fermeture, INACTIVITY_WINDOW
- [Source: _bmad-output/planning-artifacts/architecture.md#11.2] — Railway : cron clôture live session

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif** : Implémenter la création et la fermeture automatiques des sessions live (FR39). Le vendeur n’a pas à actionner LIVE ON/OFF : la session est créée au premier signal « live » (vendeur crée un code/item ou client envoie un code pour réserver) et fermée après une période d’inactivité (configurable, ex. 30–60 min).
- **Valeur** : Simplicité pour le vendeur, cohérence des données (une session = une fenêtre d’activité), prérequis pour les stories suivantes (Epic 3 : live_items liés à une live_session_id, réservations liées à une session).
- **Signaux « live »** : (1) Vendeur crée ou édite un item/code (message type seller + intent création item) ; (2) Client envoie un code pour réserver (message type client + intent réservation/code). Ne pas créer de session sur STOP, messages hors contexte, etc.

### Ce qui existe déjà (Epic 1 + Stories 2.1–2.5)

- **Prisma** : Tenant, User, MessageIn, MessageOut, DeadLetterJob, EventLog, SellerPhone, OptOut. **Pas encore** de modèle LiveSession ni LiveItem (LiveItem viendra en Epic 3 ; pour 2.6 on introduit uniquement LiveSession).
- **Worker webhook-processor** : `src/server/workers/webhook-processor.ts` — routing vendeur vs client (Story 2.2), STOP/OptOut (Story 2.5), enrichissement payload. Pour 2.6 : ajouter résolution/création de la session courante et mise à jour de last_activity_at lorsque le message est un signal « live ». Pour l’instant, le worker ne gère pas encore la création d’items ni la réservation (Epic 3/4) ; donc en 2.6 on peut considérer « signal live » = tout message vendeur (préparation future item) ou tout message client avec body ressemblant à un code (ex. regex code), selon décision produit. Documenter la règle exacte dans la story.
- **Event Log** : `src/server/events/eventLog.ts` — logWebhookReceived, logMessageSent, logIdempotentIgnored, logOptOutRecorded, logMessageBlockedOptOut. Pour 2.6 : ajouter logLiveSessionCreated, logLiveSessionClosed (ou équivalent).
- **Stack** : T3, Neon, Upstash (BullMQ), Railway (workers). Pas de cache applicatif ; Redis = queue only.
- **Workers existants** : webhook-processor, outbox-sender. Pour 2.6 : ajouter un worker (ou job BullMQ repeatable) pour fermer les sessions inactives.

### Règle « signal live » (décision implémentation 2.6)

En **Epic 2**, on n’a pas encore l’intent « création item » ni « réservation » (Epic 3/4). Pour livrer FR39 dès 2.6 sans bloquer sur le parsing d’intent complet :

- **Option A (recommandée)** : Tout message **vendeur** (messageType === 'seller') ou tout message **client** dont le body matche un pattern « code » (ex. lettre + chiffres : A12, B7) est considéré comme signal live. Ainsi, dès qu’un vendeur envoie un message ou qu’un client envoie un texte type code, on crée/réactive la session et on met à jour last_activity_at. Raffinement (intent réel) en Epic 3.
- **Option B** : Ne créer la session que lorsque l’intent sera implémenté (Epic 3). Pour 2.6, se limiter au modèle LiveSession + job de fermeture + helper getOrCreateCurrentSession(tenantId) appelé depuis le worker sans branchement métier encore. La session serait créée au premier message vendeur ou client (tous considérés comme potentiel live).

Documenter le choix (A ou B) dans le code ou les Dev Notes pour éviter confusion.

### Pièges à éviter

- **Une seule session active par tenant** : avant de créer une nouvelle LiveSession, vérifier qu’il n’existe pas une session avec status = 'active' et last_activity_at > now - INACTIVITY_WINDOW. Si oui, réutiliser cette session et mettre à jour last_activity_at uniquement.
- **Fenêtre cohérente** : Utiliser la même valeur INACTIVITY_WINDOW (ex. 30 ou 60 min) pour (1) déterminer la « session courante » et (2) le job de fermeture. Éviter une fenêtre pour la résolution et une autre pour la fermeture.
- **Job de fermeture** : Ne fermer que les sessions dont last_activity_at < now - INACTIVITY_WINDOW. Ne pas fermer des sessions actives récentes. Logger live_session.closed avec tenant_id et session id pour audit.
- **Pas de session sur messages non-live** : STOP, messages admin, ou tout message qui ne déclenche pas un « live » ne doivent pas créer ni mettre à jour de session. Réduire les faux positifs (ex. client envoie « salut » → pas de session).

### Dépendances techniques

- **Prisma** : Nouveau modèle `LiveSession` (id, tenant_id, status enum active|closed, last_activity_at, created_at, updated_at). Relation Tenant → LiveSession. Index sur (tenant_id, status) pour requête « session active pour tenant ». Pas de LiveItem en 2.6.
- **webhook-processor** : Après détermination messageType (vendeur/client), si message est un « signal live » : appeler getOrCreateCurrentSession(tenantId), mettre à jour last_activity_at. Exposer sessionId (ou null) dans le payload pour les futurs workers (Epic 3).
- **Nouveau worker** : close-inactive-live-sessions — job repeatable (ex. toutes les 10 min) ou cron ; SELECT LiveSession où status = active ET last_activity_at < now - INACTIVITY_WINDOW ; update status = closed ; log event_log live_session.closed.
- **Config** : INACTIVITY_WINDOW en minutes (constante ex. 45 ou variable par tenant si table config existante). Documenter dans .env.example ou config.

### Fichiers à créer / modifier (indicatif)

- **Créer** : `prisma/schema.prisma` — ajout modèle LiveSession ; migrations.
- **Créer** : `src/server/live-session/service.ts` (ou équivalent) — getOrCreateCurrentSession(tenantId), updateLastActivity(sessionId).
- **Modifier** : `src/server/workers/webhook-processor.ts` — appeler live-session service quand signal live.
- **Créer** : `src/server/workers/close-inactive-live-sessions.ts` — job fermeture + enregistrement dans queues (repeatable).
- **Modifier** : `src/server/events/eventLog.ts` — logLiveSessionCreated, logLiveSessionClosed.

### Conformité architecture

- **§6 Live Session Auto** : Session courante = active + last_activity_at > now - INACTIVITY_WINDOW ; création au 1er code client ou 1ère action vendeur ; job de fermeture ; fenêtre 30–60 min. Conforme.
- **§11.2 Railway** : Cron clôture live session auto. Conforme.
- **Implementation Patterns** : DB snake_case (@map), code camelCase ; correlationId propagé ; EventLog pour audit. Conforme.

### Exigences librairies / frameworks

- **Prisma** : Modèle LiveSession, enum status. Pas de nouvelle lib externe.
- **BullMQ** : Job repeatable pour close-inactive-live-sessions (ou équivalent cron Railway).
- **Event Log** : Réutiliser eventLog.ts ; ajouter types d’événements live_session.created, live_session.closed.

### Structure des fichiers (rappel)

- `prisma/schema.prisma` — modèle LiveSession
- `src/server/live-session/service.ts` — getOrCreateCurrentSession, updateLastActivity
- `src/server/workers/webhook-processor.ts` — intégration signal live
- `src/server/workers/close-inactive-live-sessions.ts` — job fermeture
- `src/server/events/eventLog.ts` — événements live_session

### Tests (recommandés)

- Premier message « live » (vendeur ou client code) crée une LiveSession et last_activity_at est mis à jour.
- Message suivant (même tenant, dans la fenêtre) réutilise la même session, pas de doublon.
- Job close-inactive-live-sessions ferme les sessions dont last_activity_at < now - INACTIVITY_WINDOW ; les sessions récentes restent active.

---

## Technical Requirements (Dev Agent Guardrails)

- **Modèle Prisma LiveSession** : id, tenant_id (FK Tenant), status (enum active | closed), last_activity_at (DateTime), created_at, updated_at. Index (tenant_id, status). Une seule session active par tenant à la fois : contrainte applicative ou unique partiel (status = active) selon support Prisma.
- **getOrCreateCurrentSession(tenantId)** : Retourner la session active du tenant si last_activity_at > now - INACTIVITY_WINDOW ; sinon créer une nouvelle LiveSession (status active) et la retourner. Mettre à jour last_activity_at à now lors de l’utilisation.
- **updateLastActivity(sessionId)** : Mettre à jour last_activity_at = now pour la session donnée. Appelé depuis webhook-processor à chaque message « signal live ».
- **Détection signal live** : Message vendeur (messageType === 'seller') OU message client dont body matche un pattern code (ex. /^[A-Za-z]\d+$/ ou équivalent). Exclure STOP et messages vides.
- **Job close-inactive-live-sessions** : Exécuté périodiquement (BullMQ repeatable ou cron Railway). Sélectionner LiveSession où status = active ET last_activity_at < now - INACTIVITY_WINDOW ; mettre status = closed ; logger event_log live_session.closed (tenant_id, session_id).
- **INACTIVITY_WINDOW** : Valeur en minutes (ex. 45), constante ou config ; documentée. Même valeur pour résolution « session courante » et pour le job de fermeture.

---

## Architecture Compliance

- **§6 Live Session Auto** : Conforme — session courante, création au premier signal live, job fermeture, INACTIVITY_WINDOW 30–60 min.
- **§11.2 Railway** : Conforme — cron/job fermeture sur Railway.
- **Implementation Patterns** : snake_case DB, camelCase code, correlationId, EventLog. Conforme.

---

## Library & Framework Requirements

- **Prisma** : Modèle LiveSession, enum, index. Pas de nouvelle dépendance.
- **BullMQ** : Repeatable job pour fermeture sessions (ou équivalent).
- **Event Log** : Étendre eventLog.ts avec live_session.created, live_session.closed.

---

## File Structure Requirements

- **Modèle** : `prisma/schema.prisma` (LiveSession), `prisma/migrations/`
- **Service session** : `src/server/live-session/service.ts` (ou sous `src/server/workers/` selon convention)
- **Worker fermeture** : `src/server/workers/close-inactive-live-sessions.ts`
- **Event Log** : `src/server/events/eventLog.ts`

---

## Testing Requirements

- Test : premier message live crée LiveSession et last_activity_at mis à jour.
- Test : message suivant (dans fenêtre) réutilise même session.
- Test : job ferme sessions inactives au-delà de INACTIVITY_WINDOW ; sessions récentes inchangées.

---

## Previous Story Intelligence

- **Story 2.5** : OptOut, webhook-processor (routing, STOP). Pour 2.6 : ne pas créer de session sur message STOP ; réutiliser flow webhook-processor (determineMessageType, puis si signal live → getOrCreateCurrentSession + updateLastActivity).
- **Story 2.4** : Outbox, outbox-sender. Pas d’impact direct sur 2.6 (session live indépendante de l’envoi).
- **Story 2.3** : EventLog. Pour 2.6 : ajouter événements live_session.created, live_session.closed avec correlationId si disponible.
- **Story 2.2** : messageType seller/client. Pour 2.6 : utiliser messageType pour décider « signal live » (vendeur = oui ; client = oui si body matche code).
- **Story 2.1** : Webhook, queue, MessageIn. Pour 2.6 : pas de changement route webhook ; logique session dans worker uniquement.

---

## Git Intelligence Summary

- Patterns établis : Prisma @map snake_case, workers BullMQ, logger structuré, correlationId, EventLog, isolation tenant. Pour 2.6 : même stack ; nouveau modèle LiveSession, service getOrCreateCurrentSession, job repeatable fermeture, pas de changement webhook route.

---

## Latest Tech Information

- **Session auto** : Pattern classique « session = fenêtre d’activité » ; last_activity_at + job cron pour fermeture. Éviter race conditions : utiliser transaction ou SELECT FOR UPDATE si plusieurs workers peuvent créer une session en parallèle (un seul worker webhook par tenant en pratique).
- **BullMQ repeatable** : Pour job périodique, utiliser add() avec repeat option (ex. every 10 minutes) ou équivalent selon version BullMQ.

---

## Project Context Reference

- **Artefacts** : `_bmad-output/planning-artifacts/` (epics.md, architecture.md) ; `_bmad-output/implementation-artifacts/` (sprint-status.yaml, stories 2-1 à 2-5). Pas de project-context.md.
- **Conventions** : document_output_language French ; stack T3 + Prisma ; UI shadcn/ui + Tailwind (pas d’UI pour 2.6).

---

## Story Completion Status

- **Status** : review
- **Completion note** : Ultimate context engine analysis completed — comprehensive developer guide created for Story 2.6 (création et fermeture automatiques de la session live). Contexte développeur avec pièges, dépendances, conformité architecture, règle « signal live » et options A/B documentées.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1: Modèle LiveSession (enum LiveSessionStatus active|closed), relation Tenant → LiveSession, index (tenant_id, status). Migration SQL créée (20260209170000_add_live_session_story_2_6). db push utilisé pour sync locale.
- Task 2: Service `src/server/live-session/service.ts` (getOrCreateCurrentSession, updateLastActivity), config `getInactivityWindowMinutes()` dans `src/server/live-session/config.ts`. Signal live = Option A : tout message vendeur OU client avec body pattern code (lettre(s)+chiffre(s), ex. A12). Intégration dans webhook-processor : appel getOrCreateCurrentSession si signal live, logLiveSessionCreated si created, EnrichedInboundMessage.liveSessionId exposé.
- Task 3: Worker `close-inactive-live-sessions.ts` (runCloseInactiveLiveSessions, start/stop worker), interval 10 min, log live_session_closed par session fermée. Démarrage dans scripts/start-worker.ts.
- Task 4: LIVE_SESSION_INACTIVITY_WINDOW_MINUTES dans env.js et .env.example (défaut 45 min).
- Task 5: Tests unitaires eventLog (logLiveSessionCreated, logLiveSessionClosed), live-session/service, close-inactive-live-sessions, webhook-processor (isLiveSignal, processWebhookJob + live session). Suite complète 117 tests passent.
- CR 2026-02-05 : Corrections appliquées — (1) updateLastActivity documentée comme réservée aux appelants avec sessionId, webhook utilise getOrCreateCurrentSession ; (2) close-inactive findMany avec take: 100 + orderBy lastActivityAt asc ; (3) README workers : section close-inactive-live-sessions, env LIVE_SESSION_INACTIVITY_WINDOW_MINUTES, Output webhook avec liveSessionId ; (4) race getOrCreateCurrentSession documentée en JSDoc ; (5) test close-inactive mis à jour pour take/orderBy.

### File List

- prisma/schema.prisma (modèle LiveSession, enum LiveSessionStatus)
- prisma/migrations/20260209170000_add_live_session_story_2_6/migration.sql
- src/env.js (LIVE_SESSION_INACTIVITY_WINDOW_MINUTES)
- .env.example (LIVE_SESSION_INACTIVITY_WINDOW_MINUTES)
- src/server/live-session/config.ts
- src/server/live-session/service.ts
- src/server/live-session/service.test.ts
- src/server/events/eventLog.ts (live_session_created, live_session_closed)
- src/server/events/eventLog.test.ts
- src/server/workers/webhook-processor.ts (isLiveSignal, getOrCreateCurrentSession, logLiveSessionCreated, liveSessionId)
- src/server/workers/webhook-processor.test.ts
- src/server/workers/close-inactive-live-sessions.ts
- src/server/workers/close-inactive-live-sessions.test.ts
- src/server/messaging/types.ts (EnrichedInboundMessage.liveSessionId)
- scripts/start-worker.ts (close-inactive-live-sessions worker)
- src/server/workers/README.md (section close-inactive-live-sessions, env LIVE_SESSION_INACTIVITY_WINDOW_MINUTES, Output liveSessionId)
- _bmad-output/implementation-artifacts/sprint-status.yaml (2-6 → done)

---

## Senior Developer Review (AI)

**Date:** 2026-02-05  
**Outcome:** Changes Requested  
**Story:** 2-6-creation-et-fermeture-automatiques-de-la-session-live

### Synthèse

- **Git vs File List :** Cohérent pour les fichiers 2-6 (plusieurs fichiers en untracked ; File List reflète bien l’implémentation).
- **AC #1 :** Implémenté (création auto session, last_activity_at, job fermeture, INACTIVITY_WINDOW).
- **Tâches [x] :** Toutes réalisées dans le code ; incohérence « Story Completion Status: ready-for-dev » corrigée → review.

### Action Items (tous traités 2026-02-05)

- [x] [MEDIUM] **updateLastActivity** : JSDoc mise à jour — réservée aux appelants avec sessionId (ex. Epic 3) ; webhook utilise getOrCreateCurrentSession.
- [x] [MEDIUM] **Job close-inactive-live-sessions** : take: 100 + orderBy lastActivityAt asc ajoutés (CLOSE_BATCH_LIMIT).
- [x] [MEDIUM] **README workers** : Section close-inactive-live-sessions ajoutée ; LIVE_SESSION_INACTIVITY_WINDOW_MINUTES documentée.
- [x] [LOW] **Race condition** : Note JSDoc ajoutée sur getOrCreateCurrentSession (acceptable MVP, durcir si scaling).
- [x] [LOW] **README webhook-processor** : Output inclut liveSessionId.

### Re-review (2026-02-05)

**Outcome:** Approve  
**Vérification:** Tous les action items traités (batch limit, README, JSDoc updateLastActivity/race). AC #1 et tâches confirmés implémentés. Aucun nouveau point bloquant.
