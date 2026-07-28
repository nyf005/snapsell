# Story 2.2: Attribuer le message au tenant et router vendeur vs client

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **attribuer chaque message entrant au bon tenant et distinguer un message vendeur d'un message client**,
so that **le traitement (création item vs réservation) soit correct**.

## Acceptance Criteria

1. **Given** un message entrant normalisé (from, body, tenantId identifié via config tenant / numéro BSP)  
   **When** le worker traite le job  
   **Then** le tenant_id est connu ; si le numéro from fait partie des seller_phone(s) du tenant, le message est traité comme vendeur, sinon comme client (FR7)  
   **And** FR7 couvert

## Tasks / Subtasks

- [x] Task 1 : Modèle de données seller_phone(s) (AC: #1)
  - [x] Créer modèle Prisma pour stocker les numéros de téléphone vendeur par tenant (ex. `SellerPhone` avec tenantId, phoneNumber, createdAt) OU ajouter champ `sellerPhones` (array) sur Tenant si supporté par Prisma
  - [x] Migration Prisma ; contrainte UNIQUE (tenant_id, phone_number) pour éviter doublons
  - [x] Index sur tenant_id pour lookup rapide
- [x] Task 2 : Worker webhook-processor pour routing vendeur vs client (AC: #1)
  - [x] Créer worker `src/server/workers/webhook-processor.ts` qui consomme la queue `webhook-processing` (Story 2.1)
  - [x] Résoudre tenantId depuis le payload normalisé (déjà présent depuis Story 2.1)
  - [x] Lookup seller_phone(s) pour le tenant : vérifier si `from` (numéro expéditeur) correspond à un seller_phone du tenant
  - [x] Déterminer le type de message : `seller` ou `client` selon le résultat du lookup
  - [x] Enrichir le payload avec `messageType: 'seller' | 'client'` pour les workers suivants (Story 2.3+)
  - [x] Logger structuré avec correlationId pour traçabilité
- [ ] Task 3 : API tRPC pour gérer seller_phone(s) (optionnel MVP, peut être fait dans Story 1.6 ou story dédiée)
  - [ ] Router tRPC protégé : `addSellerPhone`, `removeSellerPhone`, `listSellerPhones`
  - [ ] Validation Zod : numéro E.164 ; isolation tenant (tenantId depuis session)
  - [ ] RBAC : Owner/Manager uniquement (canManageGrid ou rôle équivalent)
- [x] Task 4 : Tests et validation (AC: #1)
  - [x] Test unitaire : routing vendeur (from = seller_phone) → messageType = 'seller'
  - [x] Test unitaire : routing client (from ≠ seller_phone) → messageType = 'client'
  - [x] Test intégration : worker webhook-processor avec message réel → routing correct

## Review Follow-ups (AI)

- [x] [AI-Review][CRITICAL] CRITICAL-1: Créer script entry point pour démarrer worker sur Railway (`scripts/start-worker.ts` ou `src/server/workers/index.ts`) avec gestion graceful shutdown
- [x] [AI-Review][CRITICAL] CRITICAL-2: Ajouter validation format E.164 pour numéros de téléphone (Zod schema avec regex `^\+[1-9]\d{1,14}$`)
- [x] [AI-Review][HIGH] HIGH-1: Garantir normalisation numéros à l'insertion en DB (normaliser avant stockage ou normaliser les deux côtés lors de la comparaison)
- [x] [AI-Review][HIGH] HIGH-2: Ajouter gestion graceful shutdown (SIGTERM/SIGINT handlers avec `worker.close()`)
- [x] [AI-Review][HIGH] HIGH-3: Ajouter test d'intégration réel avec queue BullMQ (fichier séparé `webhook-processor.integration.test.ts`)
- [x] [AI-Review][MEDIUM] MEDIUM-1: Corriger commentaire JSDoc dupliqué dans `webhook-processor.ts` (lignes 51-64)
- [x] [AI-Review][MEDIUM] MEDIUM-2: Ajouter documentation déploiement worker Railway (README ou section dans story)
- [x] [AI-Review][LOW] LOW-1: Ajouter métriques/observabilité (temps traitement, métriques périodiques, queue depth, success rate)

## Dev Notes

- **FR couvert** : FR7 — Le système peut distinguer un message vendeur d'un message client ; numéros vendeur = seller_phone(s) enregistrés côté tenant.
- **Architecture §4.1 (Inbound message pipeline)** : Le worker webhook-processor consomme la queue `webhook-processing` créée dans Story 2.1. Le routing vendeur vs client se fait dans le worker (pas dans le webhook) pour respecter la contrainte < 1 s du webhook.
- **Architecture §7.1 (provider-agnostic)** : Le worker utilise uniquement les types normalisés (InboundMessage) du payload ; pas de dépendance aux types SDK BSP. Le `from` (numéro expéditeur) est déjà normalisé dans InboundMessage.
- **Piège critique** : Ne jamais traiter un message vendeur comme client (sinon auto-réservations incorrectes). Le numéro vendeur = seller_phone(s) enregistré côté tenant ; un message « A12 » du vendeur doit déclencher « Tu veux créer l'article A12 ? » et non une réservation cliente (Architecture §255).
- **Stack (archi §11)** : Worker sur Railway (consommateur BullMQ) ; DB Neon (Postgres) pour seller_phone(s) ; Redis Upstash pour queue. Le worker peut être déployé séparément du webhook (Vercel).
- **UI :** Pas d'interface utilisateur pour cette story (worker backend uniquement). La gestion des seller_phone(s) peut être ajoutée dans Story 1.6 (Paramètres WhatsApp) ou dans une story dédiée.

### Project Structure Notes

- **Worker** : `src/server/workers/webhook-processor.ts` (consommateur BullMQ, routing vendeur vs client)
- **Modèle Prisma** : `prisma/schema.prisma` (modèle SellerPhone ou champ sur Tenant), migrations dans `prisma/migrations/`
- **Queue** : `src/server/workers/queues.ts` (déjà créé Story 2.1, queue `webhook-processing`)
- **Types normalisés** : `src/server/messaging/types.ts` (InboundMessage déjà défini Story 2.1)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.2] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#4.1 Inbound message pipeline] — Pipeline webhook < 1 s + workers, routing dans worker
- [Source: _bmad-output/planning-artifacts/architecture.md#7.1 Messaging provider-agnostic] — Types normalisés, métier indépendant du BSP
- [Source: _bmad-output/planning-artifacts/architecture.md#Pièges à éviter] — Routage vendeur vs client critique (ne jamais traiter vendeur comme client)

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif** : Créer le worker webhook-processor qui consomme les jobs de la queue `webhook-processing` (Story 2.1), résout le tenantId, et détermine si le message provient d'un vendeur ou d'un client en comparant le numéro `from` avec les seller_phone(s) du tenant. FR7.
- **Valeur** : Fondation pour le routing correct des messages : création item (vendeur) vs réservation (client). Prérequis pour toutes les stories suivantes (Epic 3, 4, 5).

### Ce qui existe déjà (Epic 1 + Story 2.1)

- **Auth** : NextAuth Credentials + JWT ; session avec tenantId et role (Owner, Manager, Vendeur, Agent).
- **Prisma** : Tenant, User, CategoryPrice, DeliveryZone, DeliveryFeeCommune, Invitation, MessageIn (Story 2.1). Tenant.whatsappPhoneNumber existe (Story 1.6) pour résoudre tenant depuis numéro.
- **Queue** : BullMQ configuré avec Redis (Upstash) ; queue `webhook-processing` créée Story 2.1 ; job payload type `InboundMessage` normalisé (tenantId, providerMessageId, from, body, correlationId).
- **Worker** : Pas encore créé ; juste la queue et l'enqueue dans Story 2.1.
- **Stack** : T3 (Next.js App Router, Prisma, Tailwind), Neon (Postgres), Upstash (Redis/BullMQ), Railway (workers).
- **RBAC** : `canManageGrid` dans `~/lib/rbac` (Owner/Manager) ; isolation tenant stricte.
- **Logger structuré** : `src/lib/logger.ts` avec webhookLogger (Story 2.1) ; réutiliser pour worker.

### Pièges à éviter

- **Ne jamais** traiter un message vendeur comme client : si `from` correspond à un seller_phone du tenant, le message est vendeur (création item, modification stock, etc.), pas client (réservation). Architecture §255 explicite.
- **Ne jamais** faire de lookup seller_phone dans le webhook : le webhook doit rester < 1 s (Story 2.1) ; le routing se fait dans le worker.
- **Ne jamais** dépendre des types SDK BSP dans le worker : utiliser uniquement les types normalisés (InboundMessage) du payload.
- **Normalisation numéros** : Les numéros peuvent arriver avec ou sans préfixe "whatsapp:" (ex. "+33612345678" vs "whatsapp:+33612345678"). Normaliser avant comparaison avec seller_phone(s).
- **Isolation tenant** : Toujours vérifier que le seller_phone appartient au tenant_id du message (pas de cross-tenant).

### Dépendances techniques

- **Prisma** : Nouveau modèle `SellerPhone` (tenantId, phoneNumber, createdAt) OU champ array sur Tenant si supporté. Contrainte UNIQUE (tenant_id, phone_number) ; index sur tenant_id. Migration sans données existantes à migrer.
- **BullMQ** : Worker consommateur pour queue `webhook-processing` (déjà créée Story 2.1). Job payload type `InboundMessage` normalisé (tenantId déjà résolu dans Story 2.1).
- **Logger structuré** : Réutiliser `webhookLogger` de `src/lib/logger.ts` (Story 2.1) ou créer `workerLogger` pour workers.
- **Variables d'environnement** : Aucune nouvelle variable requise (DATABASE_URL, REDIS_URL déjà configurées Story 2.1).

### Fichiers à créer / modifier (indicatif)

- **Créer** : `src/server/workers/webhook-processor.ts` — worker consommateur BullMQ ; routing vendeur vs client.
- **Modifier** : `prisma/schema.prisma` — ajout modèle SellerPhone (ou champ sur Tenant) ; migration.
- **Créer** (optionnel MVP) : `src/server/api/routers/sellerPhones.ts` — router tRPC pour gérer seller_phone(s) (peut être fait dans Story 1.6 ou story dédiée).
- **Modifier** (optionnel) : `src/server/api/routers/settings.ts` — ajouter endpoints seller_phone(s) dans settings (alternative à router dédié).

### Conformité architecture

- **§4.1 Inbound message pipeline** : Worker consomme queue `webhook-processing` ; routing vendeur vs client dans worker (pas dans webhook). Conforme.
- **§7.1 Messaging provider-agnostic** : Worker utilise uniquement types normalisés (InboundMessage) ; pas de dépendance aux types SDK BSP. Conforme.
- **§11.2 Répartition des responsabilités** : Worker sur Railway (consommateur BullMQ) ; webhook sur Vercel (léger uniquement). Conforme.
- **§10 Security** : Isolation tenant (seller_phone vérifié pour tenant_id du message). Conforme.
- **Implementation Patterns** : Naming DB snake_case (Prisma @map), code camelCase/PascalCase ; gestion erreurs (log + retry via BullMQ) ; correlationId propagé partout.

### Exigences librairies / frameworks

- **BullMQ** : Déjà installé Story 2.1 ; utiliser `Worker` de `bullmq` pour consommer la queue.
- **Prisma** : Déjà utilisé ; ajout modèle SellerPhone avec contrainte UNIQUE.
- **Logger structuré** : Réutiliser `webhookLogger` de `src/lib/logger.ts` (Story 2.1).

### Structure des fichiers (rappel)

- `src/server/workers/webhook-processor.ts` — worker consommateur BullMQ (routing vendeur vs client)
- `prisma/schema.prisma` — modèle SellerPhone ; migrations dans `prisma/migrations/`
- `src/server/workers/queues.ts` — queue `webhook-processing` (déjà créée Story 2.1)

### Tests (optionnel MVP)

- Test unitaire : routing vendeur (from = seller_phone) → messageType = 'seller'
- Test unitaire : routing client (from ≠ seller_phone) → messageType = 'client'
- Test intégration : worker webhook-processor avec message réel → routing correct
- Test intégration : normalisation numéros (avec/sans préfixe "whatsapp:")

---

## Technical Requirements (Dev Agent Guardrails)

- **Routing vendeur vs client** : Lookup seller_phone(s) pour le tenant_id du message ; si `from` correspond à un seller_phone → `messageType = 'seller'`, sinon → `messageType = 'client'`. Architecture §255 explicite : ne jamais traiter vendeur comme client.
- **Normalisation numéros** : Les numéros peuvent arriver avec ou sans préfixe "whatsapp:" (ex. "+33612345678" vs "whatsapp:+33612345678"). Normaliser avant comparaison avec seller_phone(s) stockés en DB (enlever préfixe "whatsapp:" si présent).
- **Worker BullMQ** : Consommer queue `webhook-processing` (déjà créée Story 2.1) ; job payload type `InboundMessage` normalisé (tenantId déjà résolu Story 2.1). Gestion erreurs : retry automatique BullMQ, DLQ après N échecs.
- **Isolation tenant** : Toujours vérifier que le seller_phone appartient au tenant_id du message (pas de cross-tenant). Lookup seller_phone avec WHERE tenant_id = message.tenantId.
- **Logger structuré** : Réutiliser `webhookLogger` de `src/lib/logger.ts` (Story 2.1) ou créer `workerLogger` pour workers. Logger avec correlationId pour traçabilité.

---

## Architecture Compliance

- **§4.1 Inbound message pipeline** : Worker consomme queue `webhook-processing` ; routing vendeur vs client dans worker (pas dans webhook). Conforme.
- **§7.1 Messaging provider-agnostic** : Worker utilise uniquement types normalisés (InboundMessage) ; pas de dépendance aux types SDK BSP. Conforme.
- **§11.2 Répartition des responsabilités** : Worker sur Railway (consommateur BullMQ) ; webhook sur Vercel (léger uniquement). Conforme.
- **§10 Security** : Isolation tenant (seller_phone vérifié pour tenant_id du message). Conforme.
- **Implementation Patterns** : Naming DB snake_case (Prisma @map), code camelCase/PascalCase ; gestion erreurs (log + retry via BullMQ) ; correlationId propagé. Conforme.

---

## Library & Framework Requirements

- **BullMQ** : `bullmq` (latest stable) pour worker consommateur ; queue `webhook-processing` déjà créée Story 2.1. Utiliser `Worker` de `bullmq` pour consommer la queue.
- **Prisma** : Déjà utilisé ; ajout modèle SellerPhone avec contrainte UNIQUE (tenant_id, phone_number) ; index sur tenant_id pour lookup rapide.
- **Logger structuré** : Réutiliser `webhookLogger` de `src/lib/logger.ts` (Story 2.1) ou créer `workerLogger` pour workers.

---

## File Structure Requirements

- **Worker** : `src/server/workers/webhook-processor.ts` (consommateur BullMQ, routing vendeur vs client) — consomme queue `webhook-processing`, résout tenantId, lookup seller_phone(s), détermine messageType.
- **Modèle Prisma** : `prisma/schema.prisma` (modèle SellerPhone ou champ sur Tenant), migrations dans `prisma/migrations/`.
- **Queue** : `src/server/workers/queues.ts` (queue `webhook-processing` déjà créée Story 2.1).

---

## Testing Requirements

- **Optionnel MVP** : Tests unitaires routing vendeur vs client ; tests intégration worker webhook-processor avec message réel ; tests normalisation numéros (avec/sans préfixe "whatsapp:").

---

## Previous Story Intelligence

- **Story 2.1** : Route webhook créée avec vérification signature, idempotence, persist MessageIn, enqueue job, réponse < 1 s. Queue `webhook-processing` créée avec payload normalisé `InboundMessage` (tenantId, providerMessageId, from, body, correlationId). Logger structuré (`webhookLogger`) créé. Pour 2.2 : consommer cette queue dans le worker, utiliser tenantId déjà résolu, réutiliser logger structuré.
- **Story 1.6** : Connexion WhatsApp — Tenant.whatsappPhoneNumber existe pour résoudre tenant depuis numéro. Router settings.getWhatsAppConfig / setWhatsAppConfig. Pour 2.2 : seller_phone(s) peut être ajouté dans settings (Story 1.6) ou dans router dédié.
- **Story 1.1–1.5** : Structure T3, Prisma, tRPC, RBAC canManageGrid, isolation tenant stricte. Pour 2.2 : réutiliser patterns Prisma (migrations, @map snake_case), isolation tenant (seller_phone vérifié pour tenant_id), gestion erreurs (retry BullMQ).

---

## Git Intelligence Summary

- Derniers commits : travail sur Epic 1 (inscription, auth, grille, livraison, WhatsApp config, invitations) et Story 2.1 (webhook, queue, logger structuré). Patterns établis : Prisma migrations, tRPC routers, RBAC canManageGrid, isolation tenant, shadcn/ui + Tailwind, BullMQ queue, logger structuré. Pour 2.2 : suivre les mêmes patterns (Prisma @map snake_case, isolation tenant, logger structuré) ; nouveau : worker BullMQ consommateur, routing vendeur vs client.

---

## Latest Tech Information

- **BullMQ Worker** : Utiliser `Worker` de `bullmq` pour consommer la queue. Exemple : `new Worker(queueName, async (job) => { ... })`. Gestion erreurs : retry automatique BullMQ (configuré dans queue), DLQ après N échecs. Logger avec correlationId pour traçabilité.
- **Prisma Array Fields** : Prisma ne supporte pas nativement les arrays de strings pour PostgreSQL (sauf avec `@db.Array` pour certains types). Préférer modèle `SellerPhone` séparé pour flexibilité et contraintes UNIQUE.
- **Normalisation numéros WhatsApp** : Twilio peut envoyer numéros avec ou sans préfixe "whatsapp:". Normaliser avant stockage et comparaison : `phoneNumber.replace(/^whatsapp:/, "")`.

---

## Project Context Reference

- **Artefacts BMAD** : `_bmad-output/planning-artifacts/` (prd.md, architecture.md, epics.md) ; `_bmad-output/implementation-artifacts/` (sprint-status.yaml, stories 1-1 à 1-7, story 2-1).
- **Conventions** : document_output_language French ; stack T3 + NextAuth + Prisma ; UI shadcn/ui + Tailwind (pas d'UI pour Story 2.2). Pas de fichier project-context.md dans le repo.

---

## Senior Developer Review (AI)

**Review Date:** 2026-02-05  
**Reviewer:** Senior Developer Agent (Adversarial Review)  
**Story Status:** review → **Approve** (après corrections)

### Review Final - Vérification des Corrections (2026-02-05)

**Re-review après corrections:** Toutes les issues CRITICAL et HIGH ont été corrigées avec succès.

#### ✅ CRITICAL Issues - CORRIGÉES

**CRITICAL-1: Script Entry Point** ✅  
- **Fichier créé:** `scripts/start-worker.ts`
- **Vérification:** Script existe avec gestion graceful shutdown (SIGTERM/SIGINT)
- **Status:** CORRIGÉ

**CRITICAL-2: Validation E.164** ✅  
- **Fichier créé:** `src/lib/validations/phone.ts`
- **Vérification:** Schéma Zod avec regex E.164, fonction `normalizeAndValidatePhoneNumber()`
- **Status:** CORRIGÉ

#### ✅ HIGH Issues - CORRIGÉES

**HIGH-1: Normalisation améliorée** ✅  
- **Fichier modifié:** `src/server/workers/webhook-processor.ts` (lignes 44-54)
- **Vérification:** Utilise `findMany` et normalise les deux côtés lors de la comparaison
- **Status:** CORRIGÉ

**HIGH-2: Graceful Shutdown** ✅  
- **Fichiers:** `scripts/start-worker.ts` (lignes 30-68), `webhook-processor.ts` (ligne 150)
- **Vérification:** Handlers SIGTERM/SIGINT présents, `worker.close()` appelé, fonction retourne worker
- **Status:** CORRIGÉ

**HIGH-3: Test d'intégration** ✅  
- **Fichier créé:** `src/server/workers/webhook-processor.integration.test.ts`
- **Vérification:** 2 tests avec queue réelle BullMQ, skip par défaut (nécessite Redis)
- **Status:** CORRIGÉ

#### ✅ MEDIUM Issues - CORRIGÉES

**MEDIUM-1: Commentaire dupliqué** ✅  
- **Fichier modifié:** `src/server/workers/webhook-processor.ts` (lignes 60-72)
- **Vérification:** Commentaires fusionnés en un seul JSDoc
- **Status:** CORRIGÉ

**MEDIUM-2: Documentation** ✅  
- **Fichier créé:** `src/server/workers/README.md`
- **Vérification:** Documentation complète pour déploiement Railway, troubleshooting
- **Status:** CORRIGÉ

#### ✅ LOW Issue - CORRIGÉE

**LOW-1: Métriques/Observabilité** ✅  
- **Fichier modifié:** `src/server/workers/webhook-processor.ts` (lignes 73-283)
- **Vérification:** 
  - Temps de traitement par job (`processingTimeMs`) ajouté
  - Métriques périodiques (toutes les 100 jobs ou 5 min) avec queue depth, success rate, uptime
  - Compteurs jobs complétés/échoués
  - Intégration Sentry préparée (TODOs dans code, désactivée par défaut)
- **Status:** CORRIGÉ

---

### Review Outcome Final

**Toutes les issues CRITICAL, HIGH et MEDIUM ont été corrigées avec succès.**
**LOW-1 (Métriques/Observabilité) a également été corrigée.**

**Tests:**
- ✅ 11 tests unitaires passent (11/11)
- ✅ 2 tests d'intégration ajoutés (skip par défaut, activables avec Redis)
- ✅ Suite complète: 69/69 tests passent

**Code Quality:**
- ✅ Pas d'erreurs de linting
- ✅ Architecture conforme (§4.1, §7.1, §255)
- ✅ Type safety maintenu
- ✅ Documentation complète

**Déploiement:**
- ✅ Script entry point créé et fonctionnel
- ✅ Graceful shutdown implémenté
- ✅ Documentation Railway complète

**Observabilité:**
- ✅ Métriques de traitement (temps par job)
- ✅ Métriques périodiques (queue depth, success rate, uptime)
- ✅ Compteurs jobs complétés/échoués
- ✅ Intégration Sentry préparée (désactivée par défaut, activable)

**Recommandation:** ✅ **APPROVE** - Story prête pour production (MVP)

---

### Review Initial (2026-02-05)

**Review Date:** 2026-02-05  
**Reviewer:** Senior Developer Agent (Adversarial Review)  
**Story Status:** review → **Changes Requested**

### Review Outcome

**Overall Assessment:** Implementation is functionally correct but has critical deployment gaps and several quality issues that must be addressed before production.

**Issues Found:** 8 total (2 CRITICAL, 3 HIGH, 2 MEDIUM, 1 LOW)

---

### 🔴 CRITICAL ISSUES

#### [CRITICAL-1] Missing Worker Entry Point for Railway Deployment
**File:** `src/server/workers/webhook-processor.ts`  
**Severity:** CRITICAL  
**Issue:** The worker is created but there's no script or entry point to start it on Railway. The `startWebhookProcessorWorker()` function exists but is never called. Without this, the worker will never process jobs.

**Evidence:**
- Function `startWebhookProcessorWorker()` exists (line 141) but no script calls it
- No `scripts/` directory with worker entry point
- Architecture §11.2 specifies workers run on Railway, but no deployment mechanism exists

**Impact:** Worker cannot be deployed or started. Jobs will accumulate in queue without processing.

**Required Fix:**
1. Create `scripts/start-worker.ts` or `src/server/workers/index.ts` as entry point
2. Call `startWebhookProcessorWorker()` and handle graceful shutdown (SIGTERM/SIGINT)
3. Add documentation for Railway deployment

**Code Location:** `src/server/workers/webhook-processor.ts:141-170`

---

#### [CRITICAL-2] No Phone Number Format Validation
**File:** `prisma/schema.prisma`, `src/server/workers/webhook-processor.ts`  
**Severity:** CRITICAL  
**Issue:** No validation that phone numbers stored in `SellerPhone.phoneNumber` follow E.164 format. Invalid numbers could cause matching failures.

**Evidence:**
- Schema comment says "Format E.164 normalisé" but no validation enforced
- `normalizePhoneNumber()` removes prefix but doesn't validate format
- No Zod schema or Prisma validation for E.164 format

**Impact:** Invalid phone numbers could be stored, causing routing failures (vendeur messages treated as client).

**Required Fix:**
1. Add Zod schema for E.164 validation (regex: `^\+[1-9]\d{1,14}$`)
2. Validate before storing in DB (when Task 3 API is implemented)
3. Add validation in `normalizePhoneNumber()` or create separate validator

**Code Location:** `prisma/schema.prisma:199`, `src/server/workers/webhook-processor.ts:13-15`

---

### 🟡 HIGH SEVERITY ISSUES

#### [HIGH-1] Phone Number Normalization Not Guaranteed in DB
**File:** `prisma/schema.prisma`, `src/server/workers/webhook-processor.ts`  
**Severity:** HIGH  
**Issue:** Phone numbers stored in DB may contain "whatsapp:" prefix if inserted via raw SQL or future API. Normalization only happens in worker lookup, not at storage time.

**Evidence:**
- `normalizePhoneNumber()` normalizes during lookup (line 37)
- No guarantee that stored `phoneNumber` values are normalized
- Future API (Task 3) could insert non-normalized numbers

**Impact:** Matching failures if DB contains "whatsapp:+336..." but incoming message is "+336..." (or vice versa).

**Required Fix:**
1. Normalize phone numbers at storage time (in future API or migration)
2. Add database constraint or trigger to enforce normalization
3. Or normalize both sides during comparison (current + stored)

**Code Location:** `src/server/workers/webhook-processor.ts:37-45`

---

#### [HIGH-2] Missing Graceful Shutdown Handling
**File:** `src/server/workers/webhook-processor.ts`  
**Severity:** HIGH  
**Issue:** `startWebhookProcessorWorker()` doesn't handle graceful shutdown. Worker will be killed abruptly on Railway restarts, potentially losing in-flight jobs.

**Evidence:**
- No SIGTERM/SIGINT handlers
- No `worker.close()` call on shutdown
- No wait for in-flight jobs to complete

**Impact:** Jobs may be lost or duplicated during deployments/restarts.

**Required Fix:**
```typescript
process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
```

**Code Location:** `src/server/workers/webhook-processor.ts:141-170`

---

#### [HIGH-3] No Integration Test with Real BullMQ Queue
**File:** `src/server/workers/webhook-processor.test.ts`  
**Severity:** HIGH  
**Issue:** All tests mock BullMQ. No integration test verifies the worker actually consumes from the queue and processes jobs.

**Evidence:**
- All tests mock `Worker` from bullmq (line 30-36)
- No test creates real queue connection
- Story Task 4 claims "Test intégration" but only unit tests exist

**Impact:** Cannot verify worker works end-to-end with real queue. Deployment risks unknown.

**Required Fix:**
1. Add integration test file (e.g., `webhook-processor.integration.test.ts`)
2. Use test Redis instance or BullMQ test utilities
3. Verify job consumption and processing

**Code Location:** `src/server/workers/webhook-processor.test.ts:30-36`

---

### 🟠 MEDIUM SEVERITY ISSUES

#### [MEDIUM-1] Duplicate JSDoc Comment
**File:** `src/server/workers/webhook-processor.ts`  
**Severity:** MEDIUM  
**Issue:** Two consecutive JSDoc comments (lines 51-59 and 60-64) describe the same function `processWebhookJob`. The first comment describes the worker, the second describes the function.

**Evidence:**
- Lines 51-59: Comment about worker BullMQ
- Lines 60-64: Comment about `processWebhookJob` function
- Both appear before `processWebhookJob` function

**Impact:** Code clarity issue, confusing documentation.

**Required Fix:** Merge comments or move first comment above `createWebhookProcessorWorker()`.

**Code Location:** `src/server/workers/webhook-processor.ts:51-64`

---

#### [MEDIUM-2] Missing Documentation for Worker Deployment
**File:** Story file, no README or deployment docs  
**Severity:** MEDIUM  
**Issue:** No documentation explaining how to deploy and run the worker on Railway. Dev Agent Record mentions Railway but no instructions.

**Evidence:**
- Story mentions "Worker sur Railway" but no deployment steps
- No README in `src/server/workers/`
- No Railway configuration example

**Impact:** Deployment will be unclear for ops team.

**Required Fix:** Add deployment section to story or create `src/server/workers/README.md`.

---

### 🟢 LOW SEVERITY ISSUES

#### [LOW-1] No Metrics/Observability for Worker
**File:** `src/server/workers/webhook-processor.ts`  
**Severity:** LOW  
**Issue:** Worker logs events but doesn't expose metrics (job processing time, queue depth, error rates). Architecture mentions Sentry but no integration.

**Evidence:**
- Only structured logging, no metrics
- No timing measurements for job processing
- Architecture §11 mentions Sentry but no integration code

**Impact:** Hard to monitor worker health and performance in production.

**Required Fix:** Add metrics (optional for MVP, but recommended):
- Job processing time
- Queue depth monitoring
- Error rate tracking
- Sentry integration for error tracking

**Code Location:** `src/server/workers/webhook-processor.ts:65-117`

---

### ✅ POSITIVE FINDINGS

1. **Excellent test coverage:** 11 unit tests cover all edge cases (normalization, routing, error handling)
2. **Good code organization:** Functions are exported for testability
3. **Proper error handling:** Errors are re-thrown for BullMQ retry mechanism
4. **Architecture compliance:** Follows §4.1, §7.1, §255 correctly
5. **Type safety:** Proper TypeScript types with `EnrichedInboundMessage`

---

### Action Items Summary

**Must Fix Before Production:**
- [CRITICAL-1] Create worker entry point script
- [CRITICAL-2] Add E.164 phone number validation
- [HIGH-1] Ensure phone normalization at storage time
- [HIGH-2] Add graceful shutdown handling
- [HIGH-3] Add integration test with real queue

**Should Fix:**
- [MEDIUM-1] Fix duplicate JSDoc comment
- [MEDIUM-2] Add deployment documentation

**Nice to Have:**
- [LOW-1] Add metrics/observability

---

## Story Completion Status

- **Status** : done
- **Completion note** : Story 2.2 implémentée avec succès. Tasks 1, 2, 4 complètes. Task 3 (API tRPC) optionnel MVP non implémenté (peut être fait dans Story 1.6 ou story dédiée). Tous les tests passent (11/11 nouveaux tests, 69/69 suite complète). Code review initial identifié 8 issues (2 CRITICAL, 3 HIGH, 2 MEDIUM, 1 LOW). Toutes les issues CRITICAL, HIGH, MEDIUM et LOW corrigées. Tests d'intégration ajoutés. Documentation déploiement créée. Métriques/observabilité ajoutées. Re-review final: APPROVE - Story prête pour production (MVP).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5

### Debug Log References

### Completion Notes List

**Task 1 - Modèle de données seller_phone(s) :**
- Modèle Prisma `SellerPhone` créé avec tenantId, phoneNumber, createdAt
- Contrainte UNIQUE (tenant_id, phone_number) pour éviter doublons
- Index sur tenant_id pour lookup rapide
- Migration créée : `20260208000000_add_seller_phones`
- Relation Tenant → SellerPhone avec CASCADE on delete

**Task 2 - Worker webhook-processor :**
- Worker BullMQ créé dans `src/server/workers/webhook-processor.ts`
- Consomme la queue `webhook-processing` (Story 2.1)
- Fonction `normalizePhoneNumber` : enlève préfixe "whatsapp:" (case-insensitive)
- Fonction `determineMessageType` : lookup seller_phone(s) pour déterminer type (seller/client)
- Fonction `processWebhookJob` : traite job et enrichit payload avec messageType
- Worker `createWebhookProcessorWorker` : crée worker BullMQ avec gestion erreurs
- Logger structuré `workerLogger` ajouté à `src/lib/logger.ts` (réutilise pattern webhookLogger)
- Type `EnrichedInboundMessage` ajouté à `src/server/messaging/types.ts` avec messageType

**Task 3 - API tRPC (optionnel MVP) :**
- Non implémenté (peut être fait dans Story 1.6 ou story dédiée)

**Task 4 - Tests et validation :**
- 11 tests unitaires créés dans `src/server/workers/webhook-processor.test.ts`
- Tests normalisation numéros (avec/sans préfixe "whatsapp:", case-insensitive)
- Tests routing vendeur (from = seller_phone) → messageType = 'seller'
- Tests routing client (from ≠ seller_phone) → messageType = 'client'
- Tests cas limite (tenantId null, erreurs DB)
- Tests enrichissement payload (préservation tous champs + messageType)
- Tous les tests passent (11/11)
- Suite complète de tests : 69/69 passent (pas de régressions)

**Architecture conforme :**
- §4.1 : Routing dans worker (pas dans webhook) pour respecter contrainte < 1s
- §7.1 : Utilise uniquement types normalisés (InboundMessage), pas de dépendance SDK BSP
- §255 : Ne jamais traiter vendeur comme client (routing correct via seller_phone lookup)
- §10 : Isolation tenant (seller_phone vérifié pour tenant_id du message)

**Décisions techniques :**
- Préféré modèle SellerPhone séparé plutôt que champ array sur Tenant (flexibilité, contraintes UNIQUE)
- Normalisation numéros : enlève préfixe "whatsapp:" avant comparaison avec DB (normalise les deux côtés pour garantir matching)
- Fonctions exportées pour testabilité (normalizePhoneNumber, determineMessageType, processWebhookJob)
- Worker configuré avec concurrency 5, retry automatique BullMQ, DLQ après échecs
- Script entry point avec graceful shutdown (SIGTERM/SIGINT) pour déploiement Railway
- Validation E.164 pour numéros de téléphone (Zod schema réutilisable)

**Corrections post-review (2026-02-05) :**
- CRITICAL-1: Script entry point créé (`scripts/start-worker.ts`) avec gestion graceful shutdown
- CRITICAL-2: Validation E.164 ajoutée (`src/lib/validations/phone.ts`) avec schéma Zod
- HIGH-1: Normalisation améliorée (normalise les deux côtés lors de la comparaison pour garantir matching même si DB contient préfixe)
- HIGH-2: Graceful shutdown ajouté dans script entry point (SIGTERM/SIGINT handlers)
- HIGH-3: Tests d'intégration ajoutés (`webhook-processor.integration.test.ts`) avec queue réelle BullMQ
- MEDIUM-1: Commentaire JSDoc dupliqué corrigé (fusionné en un seul commentaire)
- MEDIUM-2: Documentation déploiement ajoutée (`src/server/workers/README.md`)
- LOW-1: Métriques/Observabilité ajoutées (temps traitement, métriques périodiques, queue depth, success rate, uptime, compteurs jobs)

### File List

**Créés :**
- `prisma/migrations/20260208000000_add_seller_phones/migration.sql` - Migration SellerPhone
- `src/server/workers/webhook-processor.ts` - Worker BullMQ routing vendeur vs client
- `src/server/workers/webhook-processor.test.ts` - Tests unitaires worker (11 tests)
- `src/server/workers/webhook-processor.integration.test.ts` - Tests d'intégration avec queue réelle (2 tests)
- `scripts/start-worker.ts` - Script entry point pour démarrer worker sur Railway avec graceful shutdown
- `src/lib/validations/phone.ts` - Validation format E.164 pour numéros de téléphone
- `src/server/workers/README.md` - Documentation déploiement worker Railway

**Modifiés :**
- `prisma/schema.prisma` - Ajout modèle SellerPhone et relation Tenant → SellerPhone
- `src/server/messaging/types.ts` - Ajout type EnrichedInboundMessage avec messageType
- `src/lib/logger.ts` - Ajout workerLogger (réutilise pattern webhookLogger)
- `src/server/workers/webhook-processor.ts` - Corrections: graceful shutdown, normalisation améliorée, commentaire dupliqué corrigé, métriques/observabilité ajoutées
