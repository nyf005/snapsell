# Story 10.5: Test bout en bout Meta

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **developpeur**,
je veux **ecrire des tests d'integration bout en bout qui couvrent le flux complet Meta WhatsApp : webhook inbound → traitement → outbox → envoi sortant**,
afin que **la migration Twilio → Meta soit validee de maniere exhaustive avant la suppression de Twilio (story 10.6)**.

## Acceptance Criteria

1. **AC1 — Test integration inbound complet (webhook → messageIn → queue)**
   **Given** un tenant avec config Meta (`metaPhoneNumberId`, `metaWabaId`, `metaAccessToken`) en base
   **When** un POST arrive sur `/api/webhooks/meta` avec un payload Meta valide, une signature HMAC-SHA256 valide, et un tenant existant
   **Then** le message est persiste dans `messageIn` en base, un job est enqueue dans BullMQ, et le `correlationId` est un UUID valide lie au messageIn

2. **AC2 — Test integration outbound complet (outbox-sender → MetaCloudAdapter → envoi)**
   **Given** un `messageOut` en status `pending` en base avec un `tenantId` dont le tenant a config Meta complete
   **When** `processOutboxBatch()` est execute
   **Then** le message passe en `sent`, le `providerMessageId` (wamid) est stocke, et `MetaCloudAdapter.send()` a ete appele avec les bons parametres (phoneNumberId, accessToken du tenant, to, body)

3. **AC3 — Test integration flux batch (plusieurs messages dans 1 POST Meta)**
   **Given** un payload Meta contenant 3 messages dans `entry[0].changes[0].value.messages[]`
   **When** le POST est traite
   **Then** 3 `messageIn` sont crees en base, 3 jobs sont enqueues, chacun avec un `correlationId` UUID distinct

4. **AC4 — Test integration idempotence inbound (doublon rejete)**
   **Given** un message deja persiste dans `messageIn` pour un (tenantId, providerMessageId)
   **When** le meme payload arrive une 2eme fois sur le webhook Meta
   **Then** aucun doublon n'est cree, aucun job n'est enqueue, le log `idempotent_ignored` est emis, et la reponse reste 200

5. **AC5 — Test integration tenant sans config Meta (outbox graceful fail)**
   **Given** un `messageOut` en base dont le tenant n'a pas `metaAccessToken` ou `metaPhoneNumberId`
   **When** `processOutboxBatch()` est execute
   **Then** le message passe en `failed` avec `lastError = "meta_config_missing"`, le worker ne crashe pas, et apres `MAX_RETRIES` le message va en DLQ

6. **AC6 — Test integration media inbound (image Meta → mediaUrl en base)**
   **Given** un payload Meta avec un message type `image` contenant un `id` media
   **When** le POST est traite
   **Then** le `messageIn` persiste a un `mediaUrl` au format `meta-media://{media_id}`

7. **AC7 — Zero regression**
   **Given** la suite de tests existante (630+ tests)
   **When** les tests sont executes
   **Then** 0 regression sur tous les tests existants

## Tasks / Subtasks

- [x] Task 1 — Creer le fichier de test integration Meta e2e (AC: #1, #2, #3, #4, #5, #6)
  - [x] 1.1 Creer `src/server/messaging/providers/meta/__tests__/meta-e2e.integration.test.ts`
  - [x] 1.2 Setup : factory pour creer un tenant avec config Meta en base (vraie DB via Prisma), mock BullMQ queue, mock `MetaCloudAdapter.send()` (pas d'appel reseau reel a Meta)
  - [x] 1.3 Test AC#1 : POST webhook → messageIn en DB → job enqueue → verifier correlationId UUID
  - [x] 1.4 Test AC#2 : ecrire un messageOut pending en DB → appeler `processOutboxBatch()` → verifier status `sent` + providerMessageId
  - [x] 1.5 Test AC#3 : POST avec 3 messages → 3 messageIn en DB → 3 jobs
  - [x] 1.6 Test AC#4 : inserer messageIn en DB d'abord → POST doublon → verifier 0 nouveau messageIn, 0 job
  - [x] 1.7 Test AC#5 : tenant sans config → messageOut → `processOutboxBatch()` → status `failed` + lastError
  - [x] 1.8 Test AC#6 : POST avec image → messageIn avec mediaUrl `meta-media://`

- [x] Task 2 — Verifier zero regression (AC: #7)
  - [x] 2.1 Lancer la suite complete (`npx vitest run`) et verifier 0 regression
  - [x] 2.2 Verifier que les tests d'integration existants (`outbox-sender.integration.test.ts`, `stop-optout-blocked.integration.test.ts`) passent toujours

## Dev Notes

### Architecture & Patterns

- **Convention test integration :** les tests d'integration existants utilisent `RUN_INTEGRATION_TESTS=true` comme guard (voir `outbox-sender.integration.test.ts` et `stop-optout-blocked.integration.test.ts`). Suivre le meme pattern : `describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)`.
- **Vraie DB Prisma :** les integration tests utilisent une vraie connexion DB (pas de mock Prisma). Les donnees de test sont creees dans `beforeEach` et nettoyees dans `afterEach` ou via transactions rollback.
- **Mock reseau Meta :** `MetaCloudAdapter.send()` doit etre mocke (pas d'appel HTTP reel a `graph.facebook.com`). Utiliser `vi.spyOn` ou mock de module. Le webhook POST peut utiliser la vraie route via `fetch` local ou appel direct de la handler function.
- **Mock BullMQ :** la queue `webhookProcessingQueue` doit etre mockee pour capturer les jobs enqueues sans demarrer un vrai worker Redis.
- **Framework :** Vitest (`npx vitest run`). Fichiers `*.test.ts` ou `*.integration.test.ts` dans le meme arbre que le code source.

### Strategie de test — ce qui est deja couvert vs ce qui manque

**Deja couvert (ne pas dupliquer) :**
- Tests unitaires `adapter.test.ts` (17 tests) : constructor, verifySignature, parseInbound, parseInboundBatch, send
- Tests unitaires `route.test.ts` (16 tests) : schema Zod, GET challenge, POST inbound (single, batch, tenant not found, signature, status-only, image, idempotence)
- Tests unitaires `outbox-sender.test.ts` (12 tests) : opt-out, send via Meta, failures, backoff, meta_config_missing, tenant_not_found, media R2
- Tests integration `outbox-sender.integration.test.ts` (2 tests) : vraie DB send success + DLQ after max retries
- Tests integration `stop-optout-blocked.integration.test.ts` : STOP flow

**CE QUI MANQUE (objectif de cette story) :**
- Test d'integration qui traverse **plusieurs couches** : webhook route → DB persist → queue enqueue (inbound)
- Test d'integration qui traverse : outbox-sender → tenant lookup DB → MetaCloudAdapter instantiation → send (outbound)
- Test avec **vraie DB** pour le batch Meta (3 messages dans 1 POST)
- Test avec **vraie DB** pour l'idempotence (P2002 race condition guard)
- Test avec **vraie DB** pour media inbound `meta-media://`
- Test tenant sans config Meta avec **vraie DB** (pas juste un mock)

### Implementation de reference : structure du test

```typescript
// src/server/messaging/providers/meta/__tests__/meta-e2e.integration.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "~/server/db";
import { processOutboxBatch } from "~/server/workers/outbox-sender";

// Guard integration tests
describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "Meta WhatsApp E2E Integration",
  () => {
    let testTenant: { id: string };

    beforeEach(async () => {
      // Creer tenant avec config Meta
      testTenant = await db.tenant.create({
        data: {
          name: "Test Tenant Meta E2E",
          metaPhoneNumberId: "test-phone-id-e2e",
          metaWabaId: "test-waba-id-e2e",
          metaAccessToken: "test-token-e2e",
          // ... autres champs requis
        },
      });
    });

    afterEach(async () => {
      // Cleanup
      await db.messageIn.deleteMany({ where: { tenantId: testTenant.id } });
      await db.messageOut.deleteMany({ where: { tenantId: testTenant.id } });
      await db.tenant.delete({ where: { id: testTenant.id } });
    });

    // ... tests AC#1 a AC#6
  }
);
```

### Signature HMAC-SHA256 pour les tests

Pour generer une signature valide dans les tests :

```typescript
import crypto from "crypto";

function generateMetaSignature(body: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return `sha256=${hmac.digest("hex")}`;
}
```

### Payload Meta de reference pour les tests

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "33612345678",
          "phone_number_id": "test-phone-id-e2e"
        },
        "messages": [{
          "from": "33698765432",
          "id": "wamid.test123",
          "timestamp": "1708300800",
          "type": "text",
          "text": { "body": "A12" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### Gestion d'erreurs — points d'attention

- **P2002 race condition** : le code dans `route.ts` catch l'erreur Prisma P2002 sur `messageIn.create` et fait `continue` (pas de crash). Le test AC#4 peut verifier ce path en creant d'abord un messageIn puis en envoyant le meme payload.
- **Queue mock** : mocker `webhookProcessingQueue.add()` pour capturer les appels sans Redis. Pattern existant dans `route.test.ts`.
- **`env.META_APP_SECRET`** : la verification de signature dans le POST handler utilise cette variable. Le test doit la setter dans l'env mock.

### Fichiers existants a NE PAS modifier

- `src/server/messaging/providers/meta/adapter.ts` — deja complet
- `src/app/api/webhooks/meta/route.ts` — deja complet
- `src/server/workers/outbox-sender.ts` — deja complet
- `src/server/messaging/types.ts` — interface inchangee
- `src/lib/zod/webhook.ts` — schemas deja complets

### Project Structure Notes

- **Nouveau fichier** : `src/server/messaging/providers/meta/__tests__/meta-e2e.integration.test.ts`
- **Convention** : les tests d'integration existants sont dans le meme arbre source (pas un dossier `tests/` separe). Exemples : `outbox-sender.integration.test.ts`, `stop-optout-blocked.integration.test.ts`
- **Guard** : `RUN_INTEGRATION_TESTS=true` pour ne pas polluer le CI rapide
- **Aucun fichier existant n'est modifie** — cette story est 100% additive (ajout de tests uniquement)

### References

- [Source: src/server/messaging/providers/meta/adapter.ts] — MetaCloudAdapter (constructor, send, parseInbound, parseInboundBatch, verifySignature)
- [Source: src/server/messaging/providers/meta/adapter.test.ts] — 17 tests unitaires adapter
- [Source: src/app/api/webhooks/meta/route.ts] — Route GET challenge + POST inbound (13 etapes)
- [Source: src/app/api/webhooks/meta/route.test.ts] — 16 tests unitaires route
- [Source: src/server/workers/outbox-sender.ts] — processOutboundMessage, processOutboxBatch (MetaCloudAdapter per-tenant)
- [Source: src/server/workers/outbox-sender.test.ts] — 12 tests unitaires outbox
- [Source: src/server/workers/outbox-sender.integration.test.ts] — 2 tests integration (vraie DB)
- [Source: src/server/workers/__tests__/stop-optout-blocked.integration.test.ts] — test integration STOP flow
- [Source: src/server/messaging/types.ts] — interface MessagingProvider, InboundMessage, OutboundMessage, ProviderSendResult
- [Source: src/lib/zod/webhook.ts] — metaWebhookSchema, metaWebhookMessageSchema, inboundMessageForQueueSchema
- [Source: prisma/schema.prisma#Tenant] — metaPhoneNumberId @unique, metaWabaId, metaAccessToken
- [Source: src/env.js] — META_APP_SECRET, META_VERIFY_TOKEN (env vars globales)
- [Source: docs/migration-twilio-meta-whatsapp.md] — plan de migration complet
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10] — description epic 10

### Previous Story Intelligence (10.4)

- **Story 10.4 completee** : outbox-sender utilise MetaCloudAdapter per-tenant — 13 tests fichier, 621 suite totale, 0 regression
- **Learnings** :
  - `MetaCloudAdapter` constructeur valide strictement `phoneNumberId` et `accessToken` → toujours verifier avant instanciation
  - Gestion d'erreur gracieuse : `tenant_not_found` et `meta_config_missing` → message `failed` avec `lastError`, pas de crash worker
  - Mock pattern : `lastAdapterArgs` pour capturer les arguments du constructeur dans les tests
  - Integration test existant ajoute pour tenant Meta config (vraie DB)
  - Pattern commits : `feat(meta): ...` ou `test(meta): ...`

### Previous Story Intelligence (10.3)

- **Story 10.3 completee** : route webhook Meta GET/POST — 23 tests, 617 total → 621 apres 10.4
- **Learnings** :
  - `correlationId` genere par `crypto.randomUUID()` dans la route (pas le wamid Meta) pour compatibilite schema UUID
  - Arrow functions ne fonctionnent pas comme constructeur dans Vitest mock → utiliser `function` pour `mockImplementation` des classes
  - La route retourne TOUJOURS 200 pour eviter les retries Meta
  - Signature verification inline dans la route (pas via l'adapter) car l'adapter a besoin du tenant pour etre instancie

### Previous Story Intelligence (10.2)

- **Story 10.2 completee** : MetaCloudAdapter — send(), parseInbound(), parseInboundBatch(), verifySignature()
- **Learnings** :
  - `send()` strip le `+` prefix du numero (API Meta attend format sans `+`)
  - Media : distingue image vs document via extension
  - Error handling : retourne `ProviderSendResult` avec `success: false` et `error` — jamais de throw
  - `parseInboundBatch()` gere les status-only payloads (pas de messages) → retourne `[]`

### Git Intelligence

- Commits recents : pages legales, dette technique epic 9, fixes TS null safety
- Pattern commits : messages en francais, prefixes `feat()`, `fix()`, `chore()`, `test()` — pour cette story : `test(meta): tests d'integration bout en bout Meta WhatsApp`
- Framework : Next.js App Router + tRPC + Prisma + shadcn/ui + Vitest
- Convention tests : fichiers `.test.ts` ou `.integration.test.ts` dans le meme arbre source
- 621 tests au total apres story 10.4

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Migration Prisma `20260217000000_add_meta_whatsapp_fields` appliquee avant execution (colonnes meta_phone_number_id, meta_waba_id, meta_access_token)
- 2 echecs pre-existants dans `webhook-processor.integration.test.ts` — cause: quota Upstash Redis depasse (infra, pas regression)

### Completion Notes List

- Task 1: Cree `meta-e2e.integration.test.ts` avec 6 tests couvrant AC#1-AC#6
  - Inbound: POST handler reel → vraie DB Prisma → BullMQ queue mockee
  - Outbound: writeToOutbox → processOutboxBatch → vi.spyOn(MetaCloudAdapter.prototype.send)
  - Idempotence: pre-insertion messageIn + doublon → 0 nouveau + logIdempotentIgnored
  - Tenant sans config: 5 retries → DLQ + lastError meta_config_missing
  - Media image: meta-media://img_e2e_001
  - Guard: `RUN_INTEGRATION_TESTS=true && DATABASE_URL` (pattern existant)
  - Dynamic imports pour eviter validation env quand test est skip
- Task 2: Suite complete 630 passed, 0 regression. Les 2 echecs = Upstash Redis quota (pre-existant)

### File List

- `src/server/messaging/providers/meta/__tests__/meta-e2e.integration.test.ts` (NEW)

### Code Review Record (2026-02-19)

**Reviewer:** Amelia (Dev Agent CR) | **Modèle:** Claude Sonnet 4.6

**Issues corrigées :**
- [H1] `processOutboxBatch(1)` → `processOutboxBatch(10)` en AC#2 et AC#5 — isolation batchSize
- [H2] Ajout vérification credentials constructeur MetaCloudAdapter (`vi.hoisted` + `vi.mock` partiel avec `TrackedMetaCloudAdapter`) en AC#2
- [M2] AC#3 : ajout assertions `from` (+prefix) et `body` pour les 3 messages batch
- [M3] Ajout `afterEach` nettoyage DB (`messageIn` + `messageOut`) entre tests individuels
- [L1] AC#1 : cross-référencement `correlationId` entre `messageIn` DB et payload BullMQ
- [L2] AC#7 : correction count "621+" → "630+"

**Note git hygiene (M1) :** Les stories 10.1–10.4 présentent ~20 fichiers non commitées. À committer avant ou avec 10.5 pour maintenir la traçabilité git par story.

### Change Log

- 2026-02-19: Story 10.5 implementee — 6 tests E2E Meta WhatsApp, 0 regression (630 tests suite)
- 2026-02-19: Code review CR appliquée — 6 issues corrigées (H1×2, H2, M2, M3, L1, L2)
