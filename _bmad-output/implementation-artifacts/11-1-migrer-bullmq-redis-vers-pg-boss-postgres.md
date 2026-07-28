# Story 11.1: Migrer BullMQ/Redis vers pg-boss/Postgres + outbox-sender

Status: done

## Story

En tant que **developpeur**,
je veux **remplacer BullMQ + Redis (Upstash) par pg-boss qui utilise Postgres (Neon) comme backend de queue, et migrer l'outbox-sender du polling setInterval vers pg-boss**,
afin de **supprimer la dependance Redis, reduire les couts d'infrastructure, simplifier le stack, et reduire la latence d'envoi des messages sortants**.

## Contexte

### Pourquoi cette migration

- Redis (Upstash free tier) est la seule raison pour laquelle le projet depend de Redis : **une seule queue BullMQ** (`webhook-processing`) pour traiter les messages WhatsApp entrants.
- L'outbox-sender utilise du **polling setInterval 5s** sur Postgres — fonctionnel mais sous-optimal (latence ~2.5s, charge DB constante, backoff manuel).
- Les 2 autres workers (`close-inactive-live-sessions`, `reservation-ttl`) sont des **crons periodiques** — le polling setInterval est adapte pour eux, pas besoin de migrer.
- Le rate limiting (`src/lib/rate-limit.ts`) est en memoire (Map), pas Redis.
- pg-boss utilise Postgres comme backend, et Neon est deja en place. Zero nouvelle infra.

### Perimetre

Deux migrations dans une story :

1. **webhook-processing** : BullMQ/Redis → pg-boss (supprime Redis)
2. **outbox-sender** : polling setInterval → pg-boss queue `outbox-send` (supprime la latence, simplifie le code retry/DLQ)

### pg-boss : points cles

- **API** : `boss.send(queue, data, opts)` / `boss.work(queue, opts, handler)`
- **Retry** : `retryLimit, retryDelay, retryBackoff` (backoff exponentiel natif)
- **Deduplication** : `singletonKey` (equivalent de BullMQ `jobId`)
- **Concurrence** : `localConcurrency` (per-process)
- **Dead letter** : `boss.createQueue("main", { deadLetter: "dlq-queue" })` (natif)
- **Cleanup** : `deleteAfterSeconds` (equivalent de `removeOnComplete/removeOnFail`)
- **Shutdown** : `boss.stop({ timeout: 30_000 })` (equivalent de `worker.close()`)

### Contrainte Neon

pg-boss necessite la connexion **directe** (non-pooler) de Neon. L'URL pooler (`-pooler.` dans le hostname) utilise PgBouncer en mode transaction, incompatible avec pg-boss (advisory locks, session state). Le `DATABASE_URL` actuel doit etre l'URL directe pour le worker Railway.

## Acceptance Criteria

### Partie A : webhook-processing (BullMQ → pg-boss)

1. **AC1 — Remplacement queues.ts**
   **Given** `src/server/workers/queues.ts` qui cree une Queue BullMQ avec connexion ioredis
   **When** la migration est appliquee
   **Then** le fichier exporte une instance pg-boss configuree avec `DATABASE_URL` ; les queues `webhook-processing` et `outbox-send` sont creees avec leurs options respectives ; plus aucune reference a Redis/ioredis

2. **AC2 — Remplacement enqueue dans webhook route**
   **Given** `src/app/api/webhooks/meta/route.ts` ligne 247 : `webhookProcessingQueue.add("process-inbound", validatedPayload, { jobId })`
   **When** la migration est appliquee
   **Then** l'appel utilise `boss.send("webhook-processing", validatedPayload, { singletonKey: jobId })` ; le comportement d'idempotence par `jobId` = `${tenant.id}-${message.providerMessageId}` est preserve via `singletonKey` ; la reponse `null` de `send()` (doublon) est geree silencieusement (log info, pas d'erreur)

3. **AC3 — Remplacement Worker dans webhook-processor.ts**
   **Given** `src/server/workers/webhook-processor.ts` qui utilise `new Worker<InboundMessage, EnrichedInboundMessage>()` de BullMQ et `Job<InboundMessage>` comme type de parametre
   **When** la migration est appliquee
   **Then** `processWebhookJob` accepte un job pg-boss (type `{ id: string, data: InboundMessage, name: string }`) ; `createWebhookProcessorWorker` utilise `boss.work("webhook-processing", { localConcurrency: 5 }, handler)` ; les references a `job.id`, `job.data`, `job.attemptsMade`, `job.opts.attempts`, `job.returnvalue` sont adaptees au format pg-boss

4. **AC4 — Remplacement lifecycle dans start-worker.ts**
   **Given** `scripts/start-worker.ts` qui demarre un Worker BullMQ et gere son graceful shutdown
   **When** la migration est appliquee
   **Then** le script appelle `boss.start()` au demarrage ; le graceful shutdown utilise `boss.stop({ timeout: 30_000 })` au lieu de `worker.close()` ; les workers polling restants (close-inactive-live-sessions, reservation-ttl) restent inchanges ; le type `Worker` de BullMQ n'est plus importe

5. **AC5 — Metriques worker webhook-processing**
   **Given** `startWebhookProcessorWorker()` qui log des metriques de queue (waiting, active, completed, failed counts) et des events `completed`/`failed`/`error`
   **When** la migration est appliquee
   **Then** les metriques de queue utilisent les API pg-boss ou sont simplifiees ; les events completed/failed/error sont captures via un wrapper autour du handler ; le monitoring reste fonctionnel

### Partie B : outbox-sender (polling → pg-boss)

6. **AC6 — Enqueue dans writeToOutbox**
   **Given** `src/server/messaging/outbox.ts` qui cree un MessageOut avec status `pending` dans la table Postgres
   **When** la migration est appliquee
   **Then** apres le `db.messageOut.create()`, un appel `boss.send("outbox-send", { messageOutId })` est effectue pour declencher le traitement immediat ; la table MessageOut reste la source de verite (audit trail, statut, providerMessageId) ; si `boss.send()` echoue, le MessageOut reste en `pending` (un fallback poll ou un retry futur le rattrapera)

7. **AC7 — Worker outbox-send via pg-boss**
   **Given** `src/server/workers/outbox-sender.ts` qui utilise `setInterval(processOutboxBatch, 5000)` pour traiter les messages
   **When** la migration est appliquee
   **Then** le worker utilise `boss.work("outbox-send", { localConcurrency: 3 }, handler)` ; le handler charge le MessageOut par `messageOutId`, appelle `processOutboundMessage()` (logique metier inchangee) ; le polling `setInterval` est supprime ; `startOutboxSenderWorker` et `stopOutboxSenderWorker` sont supprimes ou adaptes

8. **AC8 — Retry et DLQ outbox via pg-boss**
   **Given** `outbox-sender.ts` qui gere manuellement le backoff (`calculateNextAttemptAt`) et la DLQ (`createDeadLetterJob`)
   **When** la migration est appliquee
   **Then** le retry est gere par pg-boss (queue `outbox-send` creee avec `retryLimit: 5, retryDelay: 1, retryBackoff: true`) ; la DLQ utilise `boss.createQueue("outbox-send", { deadLetter: "outbox-dlq" })` ; les fonctions `calculateNextAttemptAt` et `createDeadLetterJob` sont supprimees ; le claim atomique (`updateMany status → sending`) est supprime (pg-boss = single-consumer natif)

9. **AC9 — Statut MessageOut synchronise**
   **Given** le handler outbox-send qui traite un job pg-boss
   **When** le message est envoye avec succes
   **Then** le MessageOut est mis a jour (`status: "sent"`, `providerMessageId`) comme avant ; en cas d'echec, le MessageOut passe en `status: "failed"` avec `lastError` ; en cas de DLQ (apres retryLimit), le MessageOut reste `failed` et un `DeadLetterJob` est cree (ou le job pg-boss atterrit dans `outbox-dlq`)

### Partie C : Nettoyage global

10. **AC10 — Suppression env vars Redis**
    **Given** `src/env.js` contenant `REDIS_URL` et `REDIS_TOKEN` dans server schema + runtimeEnv
    **When** la migration est appliquee
    **Then** `REDIS_URL` et `REDIS_TOKEN` sont supprimes de `env.js` (schema + runtimeEnv) ; `.env` et `.env.example` sont nettoyes (sections Redis supprimees) ; le commentaire deploiement dans `.env.example` est mis a jour (retirer REDIS_URL des colonnes Vercel/Railway)

11. **AC11 — Suppression dependances npm**
    **Given** `package.json` contenant `bullmq` et `ioredis`
    **When** `pnpm remove bullmq ioredis && pnpm add pg-boss` est execute
    **Then** `bullmq` et `ioredis` sont retires de `package.json` ; `pg-boss` est ajoute ; le lockfile est coherent

12. **AC12 — Mise a jour tests**
    **Given** les fichiers de tests qui importent `bullmq` ou mockent des queues BullMQ
    **When** la migration est appliquee
    **Then** tous les imports BullMQ sont remplaces ; les mocks sont adaptes au format pg-boss ; les tests outbox-sender sont adaptes (plus de `processOutboxBatch`, tests du handler pg-boss) ; `src/server/messaging/outbox.test.ts` mocke `boss.send()` ; 0 regression

13. **AC13 — Nettoyage commentaires et documentation**
    **Given** des commentaires dans le code qui mentionnent "Redis", "Upstash", "BullMQ", "ioredis", "polling outbox" sans necessite fonctionnelle
    **When** la migration est appliquee
    **Then** tous les commentaires et JSDoc sont mis a jour dans les fichiers modifies

14. **AC14 — Zero regression**
    **Given** la suite de tests existante
    **When** `pnpm test` est execute
    **Then** 0 regression sur tous les tests restants

## Tasks / Subtasks

### Phase 1 : Setup pg-boss

- [x] Task 1 — Installer pg-boss et supprimer BullMQ/ioredis (AC: #11)
  - [x] 1.1 `pnpm remove bullmq ioredis`
  - [x] 1.2 `pnpm add pg-boss`
  - [x] 1.3 Verifier que le lockfile est coherent

- [x] Task 2 — Remplacer queues.ts (AC: #1)
  - [x] 2.1 Remplacer le contenu de `src/server/workers/queues.ts` :
    - Importer `PgBoss` depuis `pg-boss`
    - Creer l'instance : `new PgBoss({ connectionString: env.DATABASE_URL, max: 5 })`
    - Exporter l'instance `boss` et une fonction `ensureQueues()` qui cree les deux queues :
      - `webhook-processing` : `{ retryLimit: 2, retryDelay: 2, retryBackoff: true, deleteAfterSeconds: 3600 }`
      - `outbox-send` : `{ retryLimit: 5, retryDelay: 1, retryBackoff: true, deleteAfterSeconds: 3600, deadLetter: "outbox-dlq" }`
      - `outbox-dlq` : `{ deleteAfterSeconds: 604800 }` (7 jours)
    - Exporter le type job pg-boss pour reutilisation

### Phase 2 : Migration webhook-processing

- [x] Task 3 — Adapter webhook-processor.ts (AC: #3, #5)
  - [x] 3.1 Remplacer `import { Worker, type Job } from "bullmq"` par le type job pg-boss
  - [x] 3.2 Modifier `processWebhookJob(job)` : le parametre `job` passe de `Job<InboundMessage>` a `PgBoss.Job<InboundMessage>` ; `job.data` reste identique ; `job.id` reste disponible
  - [x] 3.3 Remplacer `createWebhookProcessorWorker()` : utiliser `boss.work("webhook-processing", { localConcurrency: 5 }, handler)` ; retourner l'ID du worker (string) au lieu de l'objet Worker
  - [x] 3.4 Adapter `startWebhookProcessorWorker()` : simplifier les metriques (compteurs locaux OK, supprimer les appels `queue.getWaitingCount()` etc.) ; les events completed/failed sont geres dans le wrapper handler
  - [x] 3.5 Le `throw error` en fin de `processWebhookJob` pour le retry automatique reste identique (pg-boss retry sur erreur)

- [x] Task 4 — Adapter la route webhook Meta (AC: #2)
  - [x] 4.1 Dans `src/app/api/webhooks/meta/route.ts` : remplacer `import { webhookProcessingQueue } from "~/server/workers/queues"` par l'import de `boss` depuis queues.ts
  - [x] 4.2 Remplacer `webhookProcessingQueue.add("process-inbound", validatedPayload, { jobId })` par `boss.send("webhook-processing", validatedPayload, { singletonKey: jobId })`
  - [x] 4.3 Gerer le retour `null` de `boss.send()` (doublon singletonKey) : log info, `continue` (meme comportement que l'idempotence actuelle)

### Phase 3 : Migration outbox-sender

- [x] Task 5 — Adapter writeToOutbox (AC: #6)
  - [x] 5.1 Dans `src/server/messaging/outbox.ts` : apres `db.messageOut.create()`, appeler `boss.send("outbox-send", { messageOutId: messageOut.id })` pour declencher le traitement immediat
  - [x] 5.2 Wrapper le `boss.send()` dans un try/catch : si echec, logger un warning (le MessageOut reste `pending` — un mecanisme de rattrapage peut le recuperer plus tard)
  - [x] 5.3 Importer `boss` depuis `~/server/workers/queues`

- [x] Task 6 — Remplacer outbox-sender par worker pg-boss (AC: #7, #8, #9)
  - [x] 6.1 Creer un nouveau handler `processOutboxJob(job: PgBoss.Job<{ messageOutId: string }>)` qui :
    - Charge le MessageOut par ID (`db.messageOut.findUnique`)
    - Si MessageOut introuvable ou deja `sent`/`blocked` → return (job idempotent)
    - Met le status a `sending` (garde le pattern claim)
    - Appelle `processOutboundMessage()` existant (logique metier inchangee)
    - En cas de succes : MessageOut → `sent` (deja fait dans `processOutboundMessage`)
    - En cas d'echec : `throw error` pour que pg-boss gere le retry
  - [x] 6.2 Supprimer `processOutboxBatch()` (polling batch)
  - [x] 6.3 Supprimer `calculateNextAttemptAt()` (backoff manuel)
  - [x] 6.4 Adapter `createDeadLetterJob()` : quand pg-boss envoie un job en DLQ (apres retryLimit:5), ecouter l'event ou verifier periodiquement `outbox-dlq` ; OU garder `createDeadLetterJob` dans un wrapper `onFailed` apres le dernier retry
  - [x] 6.5 Supprimer `startOutboxSenderWorker()` et `stopOutboxSenderWorker()` (plus de setInterval)
  - [x] 6.6 Exporter une fonction `startOutboxWorker()` qui appelle `boss.work("outbox-send", { localConcurrency: 3 }, handler)`

### Phase 4 : Lifecycle start-worker.ts

- [x] Task 7 — Adapter start-worker.ts (AC: #4)
  - [x] 7.1 Remplacer les imports BullMQ par l'import de `boss` depuis queues.ts
  - [x] 7.2 Au demarrage : `await boss.start()` → `await ensureQueues()` → demarrer les workers pg-boss (webhook-processing + outbox-send)
  - [x] 7.3 Supprimer `startOutboxSenderWorker(5000, 10)` et son interval
  - [x] 7.4 Graceful shutdown : `await boss.stop({ timeout: 30_000 })` remplace `worker.close()` ET `stopOutboxSenderWorker()` ; les workers polling restants (close-inactive-live-sessions, reservation-ttl) restent inchanges (clearInterval)
  - [x] 7.5 Mettre a jour le JSDoc en tete de fichier (retirer mentions Redis/Upstash/BullMQ/Twilio, documenter pg-boss + DATABASE_URL)
  - [x] 7.6 Le type de `webhookWorker` passe de `Worker | null` a `string | null` (ID retourne par `boss.work()`)

### Phase 5 : Nettoyage

- [x] Task 8 — Supprimer env vars Redis (AC: #10)
  - [x] 8.1 Dans `src/env.js` : supprimer `REDIS_URL` (schema + refine) et `REDIS_TOKEN` dans la section `server` et dans `runtimeEnv`
  - [x] 8.2 Dans `.env` : supprimer les lignes `REDIS_URL` et `REDIS_TOKEN`
  - [x] 8.3 Dans `.env.example` : supprimer la section `# Redis/Upstash Configuration` et mettre a jour le tableau de deploiement (retirer `REDIS_URL` et `REDIS_TOKEN` des colonnes Vercel/Railway)

- [x] Task 9 — Adapter les tests (AC: #12)
  - [x] 9.1 `webhook-processor.test.ts` : remplacer `import type { Job } from "bullmq"` par le type pg-boss ; adapter les mocks de job (`{ id, data, name }` au lieu de `{ id, data, attemptsMade, opts }`)
  - [x] 9.2 `stop-optout-blocked.integration.test.ts` : remplacer `import type { Job } from "bullmq"` par le type pg-boss
  - [x] 9.3 `webhook-processor.integration.test.ts` : recrire pour utiliser pg-boss (connexion `DATABASE_URL` au lieu de `REDIS_URL`) ou supprimer si les tests unitaires couvrent deja les scenarios
  - [x] 9.4 `outbox-sender.integration.test.ts` : adapter pour tester le handler pg-boss au lieu du polling batch
  - [x] 9.5 `src/server/messaging/outbox.test.ts` : ajouter mock de `boss.send()` et verifier qu'il est appele apres `db.messageOut.create()`
  - [x] 9.6 Verifier que les mocks de `./queues` dans les tests sont coherents avec la nouvelle API

- [x] Task 10 — Nettoyage commentaires et documentation (AC: #13)
  - [x] 10.1 `scripts/start-worker.ts` : mettre a jour le JSDoc (retirer Upstash/BullMQ/Twilio, documenter pg-boss + DATABASE_URL)
  - [x] 10.2 `src/app/api/webhooks/meta/route.ts` : adapter la detection d'erreur critique (lignes 286-287 : `error.message.includes("redis")` → retirer ou remplacer par "pg-boss"/"database" — note : "database" est deja present)
  - [x] 10.3 `src/server/workers/outbox-sender.ts` : mettre a jour les commentaires (retirer "polling", documenter pg-boss)
  - [x] 10.4 `src/server/messaging/outbox.ts` : mettre a jour le JSDoc (documenter l'enqueue pg-boss)
  - [x] 10.5 `.env.example` : verifier coherence des commentaires deploiement

### Phase 6 : Verification

- [x] Task 11 — Verification finale (AC: #14)
  - [x] 11.1 `pnpm test` : 0 regression
  - [x] 11.2 `pnpm build` : build Next.js OK
  - [x] 11.3 Verifier que `pnpm ls bullmq ioredis` ne retourne rien
  - [x] 11.4 Grep global `bullmq|ioredis|REDIS_URL|REDIS_TOKEN|upstash` dans le code source → 0 reference residuelle (hors node_modules, .git)
  - [x] 11.5 Verifier que `setInterval` n'apparait plus dans `outbox-sender.ts`

## Technical Notes

### Mapping BullMQ → pg-boss (webhook-processing)

| BullMQ | pg-boss |
|---|---|
| `new Queue("webhook-processing", { connection })` | `new PgBoss({ connectionString })` + `boss.createQueue("webhook-processing", opts)` |
| `queue.add("process-inbound", data, { jobId })` | `boss.send("webhook-processing", data, { singletonKey: jobId })` |
| `new Worker("webhook-processing", handler, { concurrency: 5 })` | `boss.work("webhook-processing", { localConcurrency: 5 }, handler)` |
| `attempts: 3, backoff: { type: "exponential", delay: 2000 }` | `retryLimit: 2, retryDelay: 2, retryBackoff: true` |
| `removeOnComplete: { age: 3600, count: 1000 }` | `deleteAfterSeconds: 3600` |
| `removeOnFail: { age: 86400 }` | `deleteAfterSeconds: 86400` (ou 3600, ajuster selon besoin) |
| `await worker.close()` | `await boss.stop({ timeout: 30_000 })` |
| `job.id, job.data, job.attemptsMade` | `job.id, job.data, job.retrycount` |

### Architecture outbox-sender avec pg-boss

**Avant (polling) :**
```
writeToOutbox() → INSERT MessageOut (status=pending)
                           ↓
              setInterval 5s → findMany pending/failed → processOutboundMessage()
                           ↓
              Retry manuel (calculateNextAttemptAt) → createDeadLetterJob() apres N echecs
```

**Apres (pg-boss) :**
```
writeToOutbox() → INSERT MessageOut (status=pending) + boss.send("outbox-send", { messageOutId })
                           ↓
              boss.work("outbox-send") → load MessageOut → processOutboundMessage()
                           ↓
              Retry pg-boss (retryLimit:5, retryBackoff:true) → Dead letter → "outbox-dlq"
```

**Ce qui change :**
- Latence : ~2.5s → ~0s (traitement immediat)
- Polling : supprime (plus de `findMany` toutes les 5s)
- Backoff : natif pg-boss (supprime `calculateNextAttemptAt`)
- DLQ : native pg-boss (supprime `createDeadLetterJob` ou la simplifie)
- Claim atomique : supprime (pg-boss = single-consumer)

**Ce qui ne change PAS :**
- La table `MessageOut` reste la source de verite
- `processOutboundMessage()` reste identique (logique metier)
- Le statut MessageOut est toujours synchronise (pending → sending → sent/failed)
- Les events `logMessageSent`, `logMessageBlockedOptOut` restent en place

### Contrainte Neon : URL directe obligatoire

```
# CORRECT (direct) :
postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# INCORRECT (pooler — NE PAS utiliser pour pg-boss) :
postgres://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/dbname?sslmode=require
```

Le worker Railway doit utiliser l'URL directe. Si le `DATABASE_URL` actuel est l'URL pooler, il faut soit :
- Ajouter une env var `DATABASE_URL_DIRECT` pour le worker
- Soit s'assurer que le worker utilise deja l'URL directe

### Schema pg-boss

pg-boss cree automatiquement un schema `pgboss` dans la base Postgres au premier `boss.start()`. Ce schema contient les tables de jobs, archives, et scheduling. Aucune migration Prisma n'est necessaire — pg-boss gere son propre schema.

### Impact deploiement

- **Railway (worker)** : supprimer `REDIS_URL` + `REDIS_TOKEN` des env vars ; s'assurer que `DATABASE_URL` est l'URL directe Neon
- **Vercel (Next.js app)** : supprimer `REDIS_URL` des env vars ; la route webhook utilise `boss.send()` qui necessite une connexion Postgres (deja disponible via `DATABASE_URL`)
- **Upstash** : le compte peut etre ferme / la database Redis supprimee apres validation en production

### Attention : boss.send() dans le contexte Vercel (serverless)

Deux endroits appellent `boss.send()` depuis du code qui s'execute sur Vercel :
1. La route webhook Meta (`POST /api/webhooks/meta`) — enqueue `webhook-processing`
2. `writeToOutbox()` — appele depuis le webhook-processor worker (Railway) ET depuis des routes tRPC (Vercel)

Pour le worker Railway : pas de souci, `boss.start()` est appele au boot.

Pour Vercel : `boss.send()` necessite que pg-boss soit initialise. Options :
- **Lazy singleton** : initialiser `boss` une seule fois au niveau module (comme le client Prisma actuel), avec `boss.start()` en lazy init
- **INSERT SQL direct** : ecrire dans la table pgboss via Prisma `$executeRaw` pour eviter de demarrer pg-boss dans le contexte serverless
- A evaluer selon la complexite pendant l'implementation

### Appels a writeToOutbox (21 fichiers)

`writeToOutbox()` est appele depuis de nombreux fichiers (webhook-processor, reservation-ttl, routes tRPC orders, proofs, live). L'ajout de `boss.send()` dans `writeToOutbox()` est transparent pour tous les appelants — aucun changement dans les fichiers appelants.

## Dependencies

- Postgres (Neon) : deja en place
- pg-boss npm package : a installer
- URL directe Neon : a verifier dans les env vars Railway

## Out of Scope

- Migration des workers cron (close-inactive-live-sessions, reservation-ttl) vers pg-boss — le polling setInterval est adapte pour ces crons periodiques
- Ajout d'un dashboard de monitoring des jobs (equivalent Bull Board)
- Migration du rate limiting vers pg-boss/Postgres (reste en memoire)

---

## Dev Agent Record

### File List

**Modified:**
- `package.json` — Remplace bullmq+ioredis par pg-boss v12
- `src/server/workers/queues.ts` — Nouveau module pg-boss (instance, QUEUE, ensureQueues, type PgBossJob)
- `src/server/workers/webhook-processor.ts` — Handler pg-boss work() remplace BullMQ Worker
- `src/server/workers/webhook-processor.test.ts` — Tests unitaires adaptes pg-boss
- `src/server/workers/webhook-processor.integration.test.ts` — Tests integration adaptes pg-boss
- `src/server/workers/outbox-sender.ts` — Migre polling setInterval vers pg-boss work()
- `src/server/workers/outbox-sender.test.ts` — Tests unitaires adaptes, mocks BullMQ supprimes
- `src/server/workers/outbox-sender.integration.test.ts` — Tests integration adaptes pg-boss
- `src/server/workers/__tests__/stop-optout-blocked.integration.test.ts` — Commentaire obsolete corrige
- `src/server/messaging/outbox.ts` — Ajout boss.send() apres create + try/catch resilience (AC6)
- `src/server/messaging/outbox.test.ts` — Tests boss.send() + resilience AC6 + mock warn
- `src/server/messaging/providers/meta/__tests__/meta-e2e.integration.test.ts` — Suppression env OUTBOX_MAX_RETRIES/OUTBOX_BACKOFF_MAX_MS
- `src/app/api/webhooks/meta/route.ts` — boss.send() remplace BullMQ add() + null handling
- `src/app/api/webhooks/meta/route.test.ts` — Tests adaptes pg-boss
- `src/app/api/webhooks/meta/route.ts.example` — Supprime (vestige BullMQ pre-migration)
- `src/env.js` — Suppression REDIS_URL, REDIS_TOKEN, OUTBOX_MAX_RETRIES, OUTBOX_BACKOFF_MAX_MS
- `.env.example` — Suppression variables Redis/outbox obsoletes
- `scripts/start-worker.ts` — Lifecycle pg-boss (start/stop/ensureQueues)
- `src/lib/zod/webhook.ts` — Commentaire mis a jour (BullMQ → pg-boss)
- `src/server/workers/README.md` — Reecrit pour documenter architecture pg-boss
- `generated/prisma/edge.js` — Regenere (prisma)
- `generated/prisma/index.js` — Regenere (prisma)
- `generated/prisma/wasm.js` — Regenere (prisma)
- `prisma/migrations/20260219000000_remove_twilio_fields/migration.sql` — Migration Twilio cleanup (story 10.6, pas 11.1)

### Change Log

| Date | Description |
|------|-------------|
| 2026-02-20 | Implementation story 11.1 : migration BullMQ/Redis → pg-boss/Postgres. 12 findings code review fixes (3 CRITICAL, 6 MEDIUM, 3 LOW). Tests 598/598 pass, build OK. |

### Completion Notes

**Implementation :**
- pg-boss v12 installe, instance singleton avec `DATABASE_URL` direct Neon
- 3 queues creees : `webhook-processing`, `outbox-send`, `outbox-dlq` (dead letter)
- `boss.send()` fonctionne en serverless (Vercel) sans `boss.start()` — simple INSERT SQL via connection pool
- `boss.start()` appele uniquement dans `start-worker.ts` (Railway) pour activer `work()`
- `localConcurrency: 5` (webhook) et `3` (outbox) pour limiter les connexions Neon
- `batchSize: 1` sur les deux workers pour isolation d'erreur (throw ne skip pas de jobs)
- Retry natif pg-boss : `retryLimit: 5`, `retryBackoff: true`, `deadLetter: "outbox-dlq"`
- `singletonKey` pour idempotence (webhook route + outbox enqueue)
- `writeToOutbox()` enqueue immediatement via `boss.send()` avec try/catch resilience (AC6)
- Suppression complete de bullmq, ioredis, REDIS_URL, REDIS_TOKEN du projet

**Verification :**
- 598 tests passes, 0 echecs
- Build Next.js reussi
- Zero reference residuelle a bullmq/ioredis dans package.json
