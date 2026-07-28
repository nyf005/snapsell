# Story 2.5: Respect du STOP (scope tenant)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **respecter la demande STOP du client (scope = tenant)**,
so that **le client ne reçoive plus de messages non autorisés après STOP**.

## Acceptance Criteria

1. **Given** un client a envoyé STOP sur le numéro du tenant  
   **When** le système prépare un message sortant vers ce numéro (hors messages transactionnels stricts si définis)  
   **Then** le message n'est pas envoyé (ou selon la règle produit : transactionnels stricts uniquement) (FR10, FR46)  
   **And** FR10 couvert

## Tasks / Subtasks

- [x] Task 1 : Modèle Prisma OptOut (scope tenant) (AC: #1)
  - [x] Créer modèle Prisma `OptOut` avec champs : id, tenant_id, phone_number (format E.164 normalisé), opted_out_at, created_at, updated_at
  - [x] Migration Prisma ; contrainte UNIQUE (tenant_id, phone_number) pour éviter doublons
  - [x] Index sur (tenant_id, phone_number) pour lookup rapide avant envoi
  - [x] Contrainte : tenant_id NOT NULL (isolation tenant stricte)
- [x] Task 2 : Détection et enregistrement STOP dans webhook-processor (AC: #1)
  - [x] Dans `src/server/workers/webhook-processor.ts`, détecter message "STOP" (case-insensitive, avec variations possibles : "stop", "STOP", "arrêt", etc.)
  - [x] Créer enregistrement OptOut avec tenant_id, phone_number (from normalisé E.164), opted_out_at = now
  - [x] Gérer idempotence : si OptOut existe déjà pour (tenant_id, phone_number), ne pas créer de doublon
  - [x] Logger événement `opt_out.recorded` dans EventLog (Story 2.3) avec correlationId
- [x] Task 3 : Vérification STOP avant envoi dans outbox-sender (AC: #1)
  - [x] Dans `src/server/workers/outbox-sender.ts`, avant appel MessagingProvider.send(), vérifier si OptOut existe pour (tenant_id, to)
  - [x] Si OptOut trouvé : ne pas envoyer le message, mettre status = 'blocked' (nouveau statut), logger événement `message.blocked_optout` dans EventLog
  - [x] Si OptOut non trouvé : procéder à l'envoi normal (comportement actuel)
  - [x] Gérer cas messages transactionnels stricts : si config tenant permet messages transactionnels après STOP, vérifier type de message (à définir selon règle produit)
- [x] Task 4 : Fonction helper pour vérifier OptOut (AC: #1)
  - [x] Créer fonction `checkOptOut(tenantId: string, phoneNumber: string): Promise<boolean>` dans `src/server/messaging/optout.ts`
  - [x] Fonction utilisée par outbox-sender avant envoi
  - [x] Normaliser phoneNumber en format E.164 avant lookup (cohérent avec format utilisé dans MessageOut.to)
- [x] Task 5 : Tests et validation (AC: #1)
  - [x] Test unitaire : détection STOP dans webhook-processor crée OptOut
  - [x] Test unitaire : idempotence STOP (double STOP ne crée pas doublon)
  - [x] Test unitaire : outbox-sender bloque message si OptOut existe
  - [x] Test unitaire : outbox-sender envoie message si OptOut n'existe pas
  - [x] Test intégration : webhook STOP → OptOut créé → message suivant bloqué (optionnel MVP)

## Dev Notes

- **FR couvert** : FR10 — Le client peut signaler l'arrêt des messages (STOP) et le système en tient compte.
- **FR couvert** : FR46 — Scope opt-out (STOP) : scope = tenant ; définir quels messages restent autorisés après STOP (transactionnels stricts vs aucun).
- **Architecture §7 (Messaging & Templates)** : STOP : politique explicite par tenant (scope = tenant) ; après STOP, seuls les messages transactionnels stricts autorisés ou aucun, selon règle produit (FR46).
- **Architecture §4.5 (Outbound messaging via outbox + retries + DLQ)** : Vérification STOP doit se faire AVANT l'envoi via MessagingProvider. Si OptOut trouvé, mettre status = 'blocked' (pas 'failed'), ne pas créer DeadLetterJob (ce n'est pas une erreur technique).
- **Architecture §10 (Security)** : Isolation tenant stricte (OptOut filtré par tenant_id). Un client qui envoie STOP sur un tenant ne bloque que les messages de ce tenant, pas les autres tenants.
- **Piège critique** : Ne jamais envoyer un message si OptOut existe (sauf messages transactionnels stricts si configuré). Vérification STOP AVANT appel MessagingProvider.send(), pas après.
- **Piège critique** : Normaliser phone_number en format E.164 (cohérent avec MessageOut.to) pour éviter problèmes de matching (ex. +33612345678 vs 0612345678).
- **Piège critique** : Gérer idempotence STOP : si client envoie STOP plusieurs fois, ne pas créer plusieurs OptOut. Contrainte UNIQUE (tenant_id, phone_number) + gestion doublon silencieuse.
- **Stack (archi §11)** : Modèle Prisma OptOut en DB Neon (Postgres) ; vérification dans worker outbox-sender sur Railway ; EventLog pour traçabilité.

### Project Structure Notes

- **Modèle Prisma** : `prisma/schema.prisma` (modèle OptOut), migrations dans `prisma/migrations/`
- **Détection STOP** : `src/server/workers/webhook-processor.ts` (détecter message STOP, créer OptOut)
- **Vérification STOP** : `src/server/workers/outbox-sender.ts` (vérifier OptOut avant envoi)
- **Helper OptOut** : `src/server/messaging/optout.ts` (fonction checkOptOut() pour vérifier OptOut)
- **Event Log** : `src/server/events/eventLog.ts` (logger événements opt_out.recorded, message.blocked_optout)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.5] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7B, Story 7B.3] — Définir le scope STOP (tenant) et messages autorisés après STOP
- [Source: _bmad-output/planning-artifacts/architecture.md#7 Messaging & Templates] — Politique STOP par tenant (scope = tenant)
- [Source: _bmad-output/planning-artifacts/architecture.md#4.5 Outbound messaging via outbox + retries + DLQ] — Pipeline outbox, vérification STOP avant envoi
- [Source: _bmad-output/planning-artifacts/architecture.md#10 Security] — Isolation tenant stricte

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif** : Implémenter le respect du STOP (opt-out) avec scope tenant. Quand un client envoie STOP sur le numéro WhatsApp du tenant, le système enregistre cette demande et bloque tous les messages sortants vers ce numéro (sauf messages transactionnels stricts si configuré). FR10, FR46.
- **Valeur** : Conformité réglementaire (RGPD, opt-out), respect de la volonté du client, prévention spam. Prérequis pour Epic 4 (rappels réservation), Epic 5 (notifications statut commande) — ces messages doivent respecter le STOP.
- **Scope tenant** : Un client qui envoie STOP sur le numéro du tenant A bloque uniquement les messages du tenant A, pas ceux du tenant B. Isolation tenant stricte.

### Ce qui existe déjà (Epic 1 + Story 2.1 + Story 2.2 + Story 2.3 + Story 2.4)

- **Prisma** : Tenant, User, MessageIn, MessageOut, DeadLetterJob, EventLog, SellerPhone (Story 2.1, 2.3, 2.4). Pas encore de modèle OptOut.
- **Worker webhook-processor** : `src/server/workers/webhook-processor.ts` traite messages entrants, routing vendeur vs client (Story 2.2). Pour 2.5 : ajouter détection STOP, création OptOut.
- **Worker outbox-sender** : `src/server/workers/outbox-sender.ts` lit outbox, envoie via MessagingProvider (Story 2.4). Pour 2.5 : ajouter vérification OptOut avant envoi.
- **Event Log** : Service `eventLog.ts` avec méthodes logWebhookReceived(), logMessageSent(), logIdempotentIgnored() (Story 2.3). Pour 2.5 : ajouter logOptOutRecorded(), logMessageBlockedOptOut().
- **Stack** : T3 (Next.js App Router, Prisma, Tailwind), Neon (Postgres), Upstash (Redis/BullMQ), Railway (workers).
- **Logger structuré** : `src/lib/logger.ts` avec `workerLogger` (Story 2.2) ; réutiliser pour logs OptOut.
- **Types normalisés** : `src/server/messaging/types.ts` avec `InboundMessage`, `OutboundMessage` (Story 2.1, 2.4). Pour 2.5 : pas de nouveaux types nécessaires, utiliser types existants.

### Pièges à éviter

- **Ne jamais** envoyer un message si OptOut existe (sauf messages transactionnels stricts si configuré). Vérification STOP AVANT appel MessagingProvider.send(), pas après. Architecture §4.5 : vérification avant envoi.
- **Ne jamais** créer plusieurs OptOut pour le même (tenant_id, phone_number). Gérer idempotence : contrainte UNIQUE (tenant_id, phone_number) + gestion doublon silencieuse (si OptOut existe déjà, ne pas créer de doublon, juste logger).
- **Ne jamais** oublier de normaliser phone_number en format E.164 avant lookup. Cohérent avec format utilisé dans MessageOut.to (ex. +33612345678). Problèmes de matching possibles si formats différents (ex. 0612345678 vs +33612345678).
- **Ne jamais** bloquer les messages d'un autre tenant. Isolation tenant stricte : OptOut filtré par tenant_id. Un client qui envoie STOP sur tenant A ne bloque que les messages du tenant A.
- **Status 'blocked' vs 'failed'** : Si OptOut trouvé, mettre status = 'blocked' (nouveau statut), pas 'failed'. 'blocked' = message bloqué par politique (STOP), 'failed' = erreur technique (Twilio échec). Ne pas créer DeadLetterJob pour messages bloqués (ce n'est pas une erreur technique).
- **Messages transactionnels stricts** : Si config tenant permet messages transactionnels après STOP (ex. notifications de commande confirmée, livrée), vérifier type de message avant blocage. À définir selon règle produit (FR46). MVP : bloquer tous les messages après STOP (pas de messages transactionnels stricts en MVP, sauf si configuré explicitement).

### Dépendances techniques

- **Prisma** : Nouveau modèle `OptOut` avec champs requis (tenant_id, phone_number, opted_out_at). Contrainte UNIQUE (tenant_id, phone_number) pour éviter doublons. Index sur (tenant_id, phone_number) pour lookup rapide. Migration sans données existantes à migrer.
- **Worker webhook-processor** : Ajouter détection message STOP (case-insensitive, variations possibles : "stop", "STOP", "arrêt", etc.). Créer OptOut avec tenant_id, phone_number normalisé E.164. Gérer idempotence (si OptOut existe déjà, ne pas créer de doublon).
- **Worker outbox-sender** : Ajouter vérification OptOut avant appel MessagingProvider.send(). Si OptOut trouvé, mettre status = 'blocked', ne pas envoyer, logger événement message.blocked_optout. Si OptOut non trouvé, procéder à l'envoi normal.
- **Helper OptOut** : Créer fonction `checkOptOut(tenantId: string, phoneNumber: string): Promise<boolean>` dans `src/server/messaging/optout.ts`. Normaliser phoneNumber en format E.164 avant lookup. Utilisée par outbox-sender.
- **Event Log** : Ajouter méthodes logOptOutRecorded(), logMessageBlockedOptOut() dans `src/server/events/eventLog.ts` (Story 2.3). Logger avec correlationId pour traçabilité.

### Fichiers à créer / modifier (indicatif)

- **Créer** : `prisma/schema.prisma` — ajout modèle OptOut ; migrations.
- **Modifier** : `src/server/workers/webhook-processor.ts` — ajouter détection STOP, création OptOut.
- **Modifier** : `src/server/workers/outbox-sender.ts` — ajouter vérification OptOut avant envoi, status 'blocked'.
- **Créer** : `src/server/messaging/optout.ts` — fonction checkOptOut() pour vérifier OptOut.
- **Modifier** : `src/server/events/eventLog.ts` — ajouter méthodes logOptOutRecorded(), logMessageBlockedOptOut().

### Conformité architecture

- **§7 Messaging & Templates** : STOP : politique explicite par tenant (scope = tenant) ; après STOP, seuls les messages transactionnels stricts autorisés ou aucun, selon règle produit (FR46). Conforme.
- **§4.5 Outbound messaging via outbox + retries + DLQ** : Vérification STOP avant envoi via MessagingProvider. Si OptOut trouvé, mettre status = 'blocked', ne pas créer DeadLetterJob. Conforme.
- **§10 Security** : Isolation tenant stricte (OptOut filtré par tenant_id). Conforme.
- **Implementation Patterns** : Naming DB snake_case (Prisma @map), code camelCase/PascalCase ; gestion erreurs (log + EventLog) ; correlationId propagé partout. Conforme.

### Exigences librairies / frameworks

- **Prisma** : Déjà utilisé ; ajout modèle OptOut avec index et contraintes.
- **Logger structuré** : Réutiliser `workerLogger` de `src/lib/logger.ts` (Story 2.2).
- **Event Log** : Réutiliser service `eventLog.ts` (Story 2.3) ; ajouter méthodes logOptOutRecorded(), logMessageBlockedOptOut().

### Structure des fichiers (rappel)

- `prisma/schema.prisma` — modèle OptOut ; migrations dans `prisma/migrations/`
- `src/server/workers/webhook-processor.ts` — détection STOP, création OptOut
- `src/server/workers/outbox-sender.ts` — vérification OptOut avant envoi
- `src/server/messaging/optout.ts` — fonction checkOptOut()
- `src/server/events/eventLog.ts` — méthodes logOptOutRecorded(), logMessageBlockedOptOut()

### Tests (optionnel MVP)

- Test unitaire : détection STOP dans webhook-processor crée OptOut
- Test unitaire : idempotence STOP (double STOP ne crée pas doublon)
- Test unitaire : outbox-sender bloque message si OptOut existe
- Test unitaire : outbox-sender envoie message si OptOut n'existe pas
- Test intégration : webhook STOP → OptOut créé → message suivant bloqué

---

## Technical Requirements (Dev Agent Guardrails)

- **Modèle Prisma OptOut** : Créer modèle `OptOut` avec champs : id, tenant_id, phone_number (format E.164 normalisé), opted_out_at, created_at, updated_at. Contrainte UNIQUE (tenant_id, phone_number) pour éviter doublons. Index sur (tenant_id, phone_number) pour lookup rapide. Contrainte : tenant_id NOT NULL (isolation tenant stricte).
- **Détection STOP dans webhook-processor** : Détecter message "STOP" (case-insensitive, variations possibles : "stop", "STOP", "arrêt", etc.). Créer OptOut avec tenant_id, phone_number (from normalisé E.164), opted_out_at = now. Gérer idempotence : si OptOut existe déjà pour (tenant_id, phone_number), ne pas créer de doublon, juste logger.
- **Vérification STOP avant envoi dans outbox-sender** : Avant appel MessagingProvider.send(), vérifier si OptOut existe pour (tenant_id, to). Si OptOut trouvé : ne pas envoyer le message, mettre status = 'blocked' (nouveau statut), logger événement message.blocked_optout dans EventLog. Si OptOut non trouvé : procéder à l'envoi normal.
- **Fonction helper checkOptOut()** : Créer fonction `checkOptOut(tenantId: string, phoneNumber: string): Promise<boolean>` dans `src/server/messaging/optout.ts`. Normaliser phoneNumber en format E.164 avant lookup. Utilisée par outbox-sender avant envoi.
- **Event Log intégration** : Ajouter méthodes logOptOutRecorded(), logMessageBlockedOptOut() dans `src/server/events/eventLog.ts` (Story 2.3). Logger avec correlationId pour traçabilité. Ne pas bloquer la création OptOut si event_log échoue.
- **Isolation tenant** : Toujours vérifier que l'OptOut appartient au tenant_id correct (pas de cross-tenant). Lookup filtré par tenant_id.

---

## Architecture Compliance

- **§7 Messaging & Templates** : STOP : politique explicite par tenant (scope = tenant) ; après STOP, seuls les messages transactionnels stricts autorisés ou aucun, selon règle produit (FR46). Conforme.
- **§4.5 Outbound messaging via outbox + retries + DLQ** : Vérification STOP avant envoi via MessagingProvider. Si OptOut trouvé, mettre status = 'blocked', ne pas créer DeadLetterJob (ce n'est pas une erreur technique). Conforme.
- **§10 Security** : Isolation tenant stricte (OptOut filtré par tenant_id). Conforme.
- **Implementation Patterns** : Naming DB snake_case (Prisma @map), code camelCase/PascalCase ; gestion erreurs (log + EventLog) ; correlationId propagé partout. Conforme.

---

## Library & Framework Requirements

- **Prisma** : `@prisma/client` (latest stable) pour modèle OptOut avec index et contraintes. Migration Prisma Migrate.
- **Logger structuré** : Réutiliser `workerLogger` de `src/lib/logger.ts` (Story 2.2).
- **Event Log** : Réutiliser service `eventLog.ts` (Story 2.3) ; ajouter méthodes logOptOutRecorded(), logMessageBlockedOptOut().

---

## File Structure Requirements

- **Modèle Prisma** : `prisma/schema.prisma` (modèle OptOut), migrations dans `prisma/migrations/`.
- **Détection STOP** : `src/server/workers/webhook-processor.ts` (détecter message STOP, créer OptOut).
- **Vérification STOP** : `src/server/workers/outbox-sender.ts` (vérifier OptOut avant envoi).
- **Helper OptOut** : `src/server/messaging/optout.ts` (fonction checkOptOut()).

---

## Testing Requirements

- **Optionnel MVP** : Tests unitaires détection STOP, idempotence STOP, outbox-sender bloque message si OptOut existe, outbox-sender envoie message si OptOut n'existe pas ; test intégration webhook STOP → OptOut créé → message suivant bloqué.

---

## Previous Story Intelligence

- **Story 2.4** : Worker outbox-sender créé avec envoi via MessagingProvider, retries avec backoff, DLQ après N échecs. Pour 2.5 : ajouter vérification OptOut avant appel MessagingProvider.send(), mettre status = 'blocked' si OptOut trouvé (pas 'failed', pas de DLQ).
- **Story 2.3** : Event Log créé avec méthodes logWebhookReceived(), logMessageSent(), logIdempotentIgnored(). Pour 2.5 : ajouter méthodes logOptOutRecorded(), logMessageBlockedOptOut() pour traçabilité STOP.
- **Story 2.2** : Worker webhook-processor créé avec routing vendeur vs client. Logger structuré (`workerLogger`) créé. Pour 2.5 : ajouter détection STOP, création OptOut dans webhook-processor, réutiliser patterns worker BullMQ, logger structuré.
- **Story 2.1** : Route webhook créée avec vérification signature, idempotence, persist MessageIn, enqueue job, réponse < 1 s. Queue BullMQ configurée. Pour 2.5 : réutiliser patterns queue BullMQ, types normalisés (InboundMessage pour détecter STOP).
- **Story 1.1–1.7** : Structure T3, Prisma, tRPC, RBAC, isolation tenant stricte. Pour 2.5 : réutiliser patterns Prisma (migrations, @map snake_case), isolation tenant (OptOut filtré par tenant_id), gestion erreurs (log + EventLog).

---

## Git Intelligence Summary

- Derniers commits : travail sur Epic 1 (inscription, auth, grille, livraison, WhatsApp config, invitations) et Story 2.1 (webhook, queue, logger structuré), Story 2.2 (worker routing vendeur vs client), Story 2.3 (Event Log), Story 2.4 (outbox-sender, MessagingProvider, retries, DLQ). Patterns établis : Prisma migrations, tRPC routers, RBAC, isolation tenant, shadcn/ui + Tailwind, BullMQ queue, logger structuré, correlationId propagation, Event Log, outbox pattern. Pour 2.5 : suivre les mêmes patterns (Prisma @map snake_case, isolation tenant, logger structuré, correlationId) ; nouveau : modèle OptOut, détection STOP dans webhook-processor, vérification STOP dans outbox-sender, status 'blocked', helper checkOptOut().

---

## Latest Tech Information

- **Opt-out / STOP** : Pattern classique pour conformité réglementaire (RGPD, opt-out). Enregistrer demande STOP en DB, vérifier avant chaque envoi. Scope tenant : un client qui envoie STOP sur tenant A ne bloque que les messages du tenant A. Architecture §7.
- **Format E.164** : Normaliser phone_number en format E.164 (ex. +33612345678) avant lookup pour éviter problèmes de matching. Cohérent avec format utilisé dans MessageOut.to. Bibliothèque : `libphonenumber-js` (optionnel) ou normalisation manuelle.
- **Status 'blocked' vs 'failed'** : Distinguer messages bloqués (status = 'blocked', politique STOP) et messages échoués (status = 'failed', erreur technique Twilio). Ne pas créer DeadLetterJob pour messages bloqués (ce n'est pas une erreur technique).
- **Idempotence STOP** : Gérer idempotence : si client envoie STOP plusieurs fois, ne pas créer plusieurs OptOut. Contrainte UNIQUE (tenant_id, phone_number) + gestion doublon silencieuse (si OptOut existe déjà, ne pas créer de doublon, juste logger).

---

## Project Context Reference

- **Artefacts BMAD** : `_bmad-output/planning-artifacts/` (prd.md, architecture.md, epics.md) ; `_bmad-output/implementation-artifacts/` (sprint-status.yaml, stories 1-1 à 1-7, stories 2-1 à 2-4).
- **Conventions** : document_output_language French ; stack T3 + NextAuth + Prisma ; UI shadcn/ui + Tailwind (pas d'UI pour Story 2.5). Pas de fichier project-context.md dans le repo.

---

## Story Completion Status

- **Status** : review
- **Completion note** : Story 2.5 créée avec contexte complet pour implémentation. Tous les artefacts analysés (epics.md, architecture.md, stories précédentes). Contexte développeur exhaustif avec pièges à éviter, dépendances techniques, conformité architecture, patterns établis.

---

## Senior Developer Review (AI)

**Date :** 2026-02-05  
**Story :** 2-5-respect-du-stop-scope-tenant  
**Fichiers revus :** prisma/schema.prisma, migration OptOut, optout.ts, eventLog.ts, webhook-processor.ts, outbox-sender.ts + tests.

### Outcome

**Approve** — AC #1 implémenté (STOP scope tenant, blocage avant envoi, status blocked, pas de DLQ). Tâches cochées vérifiées. Corrections mineures appliquées.

### Findings et corrections appliquées

| Sévérité | Finding | Action |
|----------|---------|--------|
| HIGH | Section "Story Completion Status" indiquait "ready-for-dev" au lieu de "review". | Corrigé → "review". |
| MEDIUM | Sous-tâche "Gérer cas messages transactionnels stricts" cochée sans code dédié (MVP = tout bloquer). | Commentaire ajouté dans outbox-sender.ts (report FR46/7B.3). |
| MEDIUM | checkOptOut : fallback si E.164 invalide peut donner faux négatif si MessageOut.to non E.164. | Commentaire ajouté dans optout.ts (hypothèse E.164 documentée). |
| LOW | Index Prisma @@index([tenantId, phoneNumber]) redondant avec @@unique (déjà un index). | Corrigé : index retiré du schema + migration initiale ; migration 20260209160000_drop_opt_outs_redundant_index pour DB déjà migrées. |
| LOW | isStopMessage : "stop." ou "STOP." non reconnus (ponctuation finale). | Corrigé : trim ponctuation finale (. , ! ?) avant comparaison ; test ajouté. |
| LOW | Pas de test pour webhook STOP avec `from` invalide E.164 (catch, pas d'OptOut créé). | Corrigé : test ajouté (STOP + from invalide → pas d'OptOut, job réussit). |

### Action Items

Aucun (corrections appliquées en revue).

### Review (2e passage) — 2026-02-05

**Story :** 2-5-respect-du-stop-scope-tenant (Status: done)  
**Objectif :** Re-vérification après correction des LOW.

- **AC #1** : Confirmé implémenté (STOP scope tenant, blocage avant envoi, status `blocked`, pas de DLQ).
- **Findings précédents** : Tous traités — index OptOut retiré (schema + migrations), isStopMessage avec ponctuation finale, test `from` invalide E.164 ajouté.
- **Fichiers revus** : schema OptOut (@@unique seul), webhook-processor (isStopMessage), optout.ts (commentaire E.164), outbox-sender (commentaire transactionnel), tests (19 + 5 + 3).
- **Tests** : 27 passed (webhook-processor, outbox-sender, optout).

**Outcome :** **Approve** — Aucun nouveau finding. Story prête pour done.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1 : Modèle Prisma `OptOut` ajouté dans `prisma/schema.prisma` avec @@unique([tenantId, phoneNumber]), @@index([tenant_id, phone_number]). Migration SQL créée manuellement `prisma/migrations/20260209150000_add_opt_out_story_2_5/migration.sql`. Statut `blocked` ajouté au commentaire MessageOut.status.
- Task 2 : Dans webhook-processor, helper `isStopMessage(body)` (stop, arrêt, arret, unsubscribe, optout, opt-out), détection STOP pour messageType client + tenantId, création OptOut avec E.164, idempotence via findUnique avant create, log `logOptOutRecorded`.
- Task 3 : Dans outbox-sender, avant `MessagingProvider.send()` appel à `checkOptOut(tenantId, to)` ; si true : update status = 'blocked', `logMessageBlockedOptOut`, return success sans envoi (pas de DLQ).
- Task 4 : `src/server/messaging/optout.ts` avec `checkOptOut(tenantId, phoneNumber)` et normalisation E.164 (strip whatsapp:, validate E.164).
- Task 5 : Tests unitaires ajoutés : webhook-processor (isStopMessage, STOP crée OptOut, idempotence), outbox-sender (blocked si OptOut, envoi si pas OptOut), optout (checkOptOut true/false, normalisation). Suite complète OK (98 passed, 6 skipped).

### File List

- prisma/schema.prisma (modèle OptOut, relation Tenant.optOuts, MessageOut.status comment blocked ; index redondant retiré)
- prisma/migrations/20260209150000_add_opt_out_story_2_5/migration.sql (création table opt_outs, sans index redondant)
- prisma/migrations/20260209160000_drop_opt_outs_redundant_index/migration.sql (drop index redondant si déjà appliqué)
- src/server/messaging/optout.ts (nouveau)
- src/server/messaging/optout.test.ts (nouveau)
- src/server/events/eventLog.ts (EventType/EntityType étendus, logOptOutRecorded, logMessageBlockedOptOut)
- src/server/workers/webhook-processor.ts (isStopMessage avec ponctuation finale, détection STOP et création OptOut)
- src/server/workers/webhook-processor.test.ts (tests isStopMessage dont ponctuation, STOP crée OptOut, idempotence, from invalide E.164)
- src/server/workers/outbox-sender.ts (checkOptOut avant envoi, status blocked)
- src/server/workers/outbox-sender.test.ts (test blocked, test envoi avec checkOptOut)
- _bmad-output/implementation-artifacts/sprint-status.yaml (2-5 → in-progress puis review)
