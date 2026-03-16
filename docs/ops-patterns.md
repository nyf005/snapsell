# Patterns Ops

5 patterns opérationnels du projet, avec fichier source et conventions.

---

## 1. Event Log

**Fichier source :** `src/server/events/eventLog.ts`

Journal structuré des événements métier persisté en base (`EventLog` Prisma). Chaque événement a un `event_type`, `entity_type`, `actor_type`, et un payload JSON validé par Zod.

**Types d'événements :** ~22 types (`webhook_received`, `reservation_hold`, `order_created`, `deposit_approved`, etc.)

**Exemple :**
```ts
await logReservationHold(tenantId, reservationId, correlationId);
```

**Conventions :**
- Helpers typés par événement (`logXxx`) — pas d'appel générique direct
- Payload validé par `eventLogPayloadSchema` avec sanitization PII (pas de numéro de téléphone, pas d'adresse, pas de corps de message)
- `correlationId` obligatoire pour traçabilité bout-en-bout
- `actor_type` : `"system"` | `"seller"` | `"client"`

---

## 2. Correlation ID

**Création :** `crypto.randomUUID()` à l'entrée du système (webhook route ou adapter)

**Fichiers clés :**
- `src/app/api/webhooks/meta/route.ts` — génération à la réception webhook
- `src/server/messaging/providers/meta/adapter.ts` — génération pour messages sortants

**Propagation :** le `correlationId` est passé dans :
- Le job pg-boss (`job.data.correlationId`)
- Tous les appels `eventLog` (paramètre obligatoire)
- Le logger structuré (champ de contexte)
- Sentry (`captureException` avec tag `correlationId`)

**Convention :** tout nouveau point d'entrée (webhook, cron, API ops) doit créer un `correlationId` et le propager dans toute la chaîne.

---

## 3. Dead Letter Queue (DLQ)

**Modèle Prisma :** `DeadLetterJob` (`prisma/schema.prisma`)

**Fichier source :** `src/server/workers/outbox-sender.ts` (production des DLQ) + `src/server/api/routers/ops.ts` (consommation ops)

Un message échoué après N tentatives (défaut : 5, configurable via `OUTBOX_MAX_RETRIES`) est déplacé dans la table `dead_letter_jobs` avec le payload original, le message d'erreur, et la stack trace.

**Champs clés :**
- `jobType` : type de job (`"message_out"`)
- `payload` : JSON original du job
- `attempts` : nombre de tentatives effectuées
- `resolvedAt` : `null` si non résolu, date si traité

**Opérations ops (tRPC) :** list, retry, purge via le router `ops.ts`

**Convention :** tout worker avec retry doit implémenter le pattern DLQ après épuisement des tentatives.

---

## 4. Outbox

**Fichier source :** `src/server/workers/outbox-sender.ts`

Pattern polling DB pour envoi de messages sortants. Le worker lit les `MessageOut` avec `status = 'pending'` ou `status = 'failed'` dont `next_attempt_at <= now()`.

**Paramètres :**
- Intervalle de polling : 5 secondes
- Batch size : 10 messages par cycle
- Backoff exponentiel : 1s, 2s, 4s, 8s, 16s... cap configurable (`OUTBOX_BACKOFF_MAX_MS`, défaut 30s)
- Max retries avant DLQ : 5 (configurable via `OUTBOX_MAX_RETRIES`)

**Exemple de cycle (QStash) :**
```
writeToOutbox → persist MessageOut (pending) → publish QStash → route /api/qstash/outbox-send → send via Meta → mark 'sent' | QStash retry si 5xx → DLQ callback si max retries atteint
```

**Convention :** l'outbox utilise QStash en production (event-driven, serverless-native) avec pg-boss comme fallback en développement.

---

## 5. Chiffrement at-rest (`metaAccessToken`)

**Fichier source :** `src/lib/crypto.ts`

AES-256-GCM symétrique pour le chiffrement de `metaAccessToken` en base de données. La clé est chargée depuis `ENCRYPTION_KEY` (64 hex = 32 octets).

**Format stocké :** `enc:<iv_b64url>:<authTag_b64url>:<ciphertext_b64url>`

**Utilisation :**
```ts
import { encrypt, decrypt } from "~/lib/crypto";

// Avant écriture en DB
data.metaAccessToken = encrypt(input.metaAccessToken);

// Avant utilisation (appel API Meta)
const token = decrypt(tenant.metaAccessToken);
```

**Dégradation gracieuse :** en dev/test sans `ENCRYPTION_KEY`, `encrypt()` retourne le plaintext et `decrypt()` passe les valeurs non-préfixées telles quelles. En production, `ENCRYPTION_KEY` est obligatoire.

**Migration des tokens existants :** script one-shot idempotent `scripts/encrypt-existing-tokens.ts` (skip si déjà préfixé `enc:`).

**Convention :** tout nouveau champ PII sensible (token, secret tiers) doit être chiffré via ce module.

---

## 6. Structured Logger

**Fichier source :** `src/lib/logger.ts`

Logger structuré avec format `[timestamp] [LEVEL] [Component] message {context}`.

**Loggers disponibles :**
- `webhookLogger` — composant `"Webhook"`
- `workerLogger` — composant `"Worker"`
- `invitationLogger` — composant `"Invitation"`
- Extensible via `createLogger("NouveauComposant")`

**Niveaux :**
- `debug` : dev uniquement (`NODE_ENV === "development"`)
- `info` : tous environnements
- `warn` : alertes non-bloquantes
- `error` : erreurs avec stack trace automatique

**Exemple :**
```ts
import { createLogger } from "~/lib/logger";
const myLogger = createLogger("MonService");
myLogger.info("Opération réussie", { orderId, correlationId });
myLogger.error("Échec", error, { orderId });
```

**Convention :** toujours utiliser le logger structuré au lieu de `console.log`. Inclure `correlationId` quand disponible.
