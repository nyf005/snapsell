# Epic 13 — Security Hardening & Infrastructure Migration (Vercel-native)

**Date :** 2026-03-16
**Statut :** done

---

## Contexte

Audit de sécurité et migration infrastructure avant mise en production. L'objectif était de :
1. Combler les gaps de sécurité P0–P3 identifiés à l'audit
2. Supprimer la dépendance Railway aux workers périodiques en migrant vers Vercel Cron + QStash

---

## Stories complétées

### 13-1 — Chiffrement at-rest `metaAccessToken` (P0)
**Fichiers :** `src/lib/crypto.ts`, `src/server/api/routers/settings.ts`, `src/server/workers/outbox-sender.ts`, `src/app/api/webhooks/meta/route.ts`, `scripts/encrypt-existing-tokens.ts`

- AES-256-GCM avec IV aléatoire 12 octets + auth tag
- Clé 32 octets via `ENCRYPTION_KEY` (64 hex) dans `src/env.js`
- Format stocké : `enc:<iv>:<authTag>:<ciphertext>` (base64url)
- Dégradation gracieuse en dev/test sans clé (plaintext passthrough)
- Script migration idempotent pour chiffrer les tokens existants
- Décryptage transparent dans : `setWhatsAppConfig`, `testWhatsAppConnection`, `connectWhatsAppEmbedded`, `processOutboundMessage`, webhook Meta

### 13-2 — Session revocation via `tokenVersion` (P1)
**Fichiers :** `prisma/schema.prisma`, `prisma/migrations/20260316000000_add_token_version_to_users/migration.sql`, `src/server/auth.ts`

- Colonne `token_version INTEGER DEFAULT 0` sur table `users`
- Stocké dans le JWT à la connexion
- Re-check DB toutes les heures dans le `jwt` callback ; mismatch → `return null` (force re-login)
- Durée de session réduite 30j → 7j

### 13-3 — Rate limiting tRPC (P2)
**Fichiers :** `src/lib/trpc-rate-limit.ts`, `src/server/api/trpc.ts`

- Upstash Redis sliding window : 20 req/min par `userId`
- Middleware `rateLimitMiddleware` appliqué sur `protectedProcedure`
- Désactivé si `UPSTASH_REDIS_REST_URL` absent (dev/test sans Redis)
- Erreur : `TRPCError` code `TOO_MANY_REQUESTS`

### 13-4 — QStash pour l'outbox (Option A)
**Fichiers :** `src/server/messaging/outbox.ts`, `src/app/api/qstash/outbox-send/route.ts`, `src/app/api/qstash/outbox-dlq/route.ts`, `src/server/workers/queues.ts`

- `enqueueOutboxSend()` : publie vers QStash si `QSTASH_TOKEN` + `NEXT_PUBLIC_APP_URL` présents, sinon fallback pg-boss (dev)
- Route `/api/qstash/outbox-send` : vérif signature QStash → `processOutboundMessage` → 503 si échec (trigger retry)
- Route `/api/qstash/outbox-dlq` : failure callback → persist `DeadLetterJob` en DB
- Retries : 5 tentatives avec backoff exponentiel QStash
- Signature vérifiée via `@upstash/qstash Receiver`
- `OUTBOX_DLQ` retiré des queues pg-boss (géré par QStash)

### 13-5 — Vercel Cron Jobs (Option A suite)
**Fichiers :** `vercel.json`, `src/app/api/cron/reservation-ttl/route.ts`, `src/app/api/cron/close-sessions/route.ts`, `scripts/start-worker.ts`

- `vercel.json` avec 2 crons déclarés
- `/api/cron/reservation-ttl` — toutes les minutes : rappels T-2 (`runReservationReminderJob`) + expirations T=0 (`runReservationTtlJob`)
- `/api/cron/close-sessions` — toutes les 10 min : fermeture sessions inactives (`runCloseInactiveLiveSessions`)
- Sécurisés par `CRON_SECRET` (Bearer token Vercel)
- `start-worker.ts` allégé : ne démarre plus que `startWebhookProcessorWorker`

### 13-6 — Health check endpoint (P3)
**Fichier :** `src/app/api/healthz/route.ts`

- `GET /api/healthz` : ping `SELECT 1` sur la DB
- Retourne `200 { status: "ok", db: "ok" }` ou `503 { status: "degraded", db: "error" }`
- Utilisable comme health check Railway

---

## Variables d'environnement ajoutées

| Variable | Env | Obligatoire prod | Usage |
|----------|-----|------------------|-------|
| `ENCRYPTION_KEY` | Vercel + Railway | ✅ | AES-256-GCM key (64 hex) |
| `CRON_SECRET` | Vercel | ✅ | Sécurité routes cron |
| `QSTASH_TOKEN` | Vercel + Railway | ✅ | Publication QStash |
| `QSTASH_CURRENT_SIGNING_KEY` | Vercel | ✅ | Vérif signature QStash |
| `QSTASH_NEXT_SIGNING_KEY` | Vercel | ✅ | Vérif signature QStash (rotation) |
| `UPSTASH_REDIS_REST_URL` | Vercel | Recommandé | Rate limiting tRPC |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel | Recommandé | Rate limiting tRPC |

---

## Migration en production (actions à faire une seule fois)

1. **Générer `ENCRYPTION_KEY`** : `openssl rand -hex 32` → ajouter dans Vercel + Railway
2. **Appliquer la migration DB** : `npx prisma migrate deploy` (ajoute `token_version`)
3. **Chiffrer les tokens existants** : `DATABASE_URL="..." tsx scripts/encrypt-existing-tokens.ts`

---

## Railway : encore nécessaire ?

**Oui, Railway est encore nécessaire** — mais uniquement pour **1 seul worker** :

| Worker | Avant | Après |
|--------|-------|-------|
| `webhook-processor` | Railway ✅ | Railway ✅ (inchangé) |
| `outbox-sender` | Railway ❌ | Vercel via QStash ✅ |
| `reservation-ttl` | Railway ❌ | Vercel Cron ✅ |
| `close-inactive-live-sessions` | Railway ❌ | Vercel Cron ✅ |

Le `webhook-processor` doit rester un process long-running car il écoute la queue pg-boss (polling continu). Il ne peut pas être serverless. Railway reste la bonne solution pour ce cas.

---

## Tests

- 619 tests passent (0 failure)
- 2 assertions mises à jour dans `settings.test.ts` pour refléter le format `enc:` des tokens chiffrés
- Typecheck clean (`tsc --noEmit`)
