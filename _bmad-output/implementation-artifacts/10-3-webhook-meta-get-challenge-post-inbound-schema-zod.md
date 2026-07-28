# Story 10.3: Webhook Meta (GET challenge + POST inbound) + schema Zod

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **systeme**,
je veux **une route `/api/webhooks/meta` qui gere le challenge GET (verification Meta) et le POST inbound (reception messages), avec un schema Zod `metaWebhookSchema`**,
afin que **Meta puisse verifier le webhook et que les messages entrants soient traites**.

## Acceptance Criteria

1. **AC1 — GET challenge (verification Meta)**
   **Given** la route `/api/webhooks/meta`
   **When** Meta envoie un `GET` avec `hub.mode=subscribe`, `hub.verify_token` et `hub.challenge`
   **Then** si `hub.verify_token` correspond a `META_VERIFY_TOKEN`, retourner `hub.challenge` avec status 200 ; sinon 403

2. **AC2 — POST inbound (reception messages)**
   **Given** un POST Meta avec payload JSON
   **When** le webhook est recu
   **Then** verifier signature HMAC-SHA256, parser le JSON via `metaWebhookSchema`, resoudre le tenant via `metaPhoneNumberId`, meme flux (idempotence, persist MessageIn, enqueue BullMQ, reponse 200 < 1 s)

3. **AC3 — Schema Zod metaWebhookSchema**
   **Given** le fichier `src/lib/zod/webhook.ts`
   **When** la story est completee
   **Then** `metaWebhookSchema` est ajoute pour valider la structure Meta (`object`, `entry[].changes[].value`)

4. **AC4 — Batch messages**
   **Given** un POST Meta contenant N messages dans `entry[].changes[].value.messages[]`
   **When** le webhook est traite
   **Then** chaque message genere un `MessageIn` distinct + un job BullMQ distinct (1 message = 1 persist + 1 enqueue)

5. **AC5 — Tests complets**
   **Given** les fichiers de tests
   **When** les tests sont executes
   **Then** couvrent : challenge GET valide/invalide, POST single message, POST batch multi-messages, tenant non trouve, signature invalide, payload status-only (pas de messages)

## Tasks / Subtasks

- [x] Task 1 — Creer le schema Zod `metaWebhookSchema` (AC: #3)
  - [x] 1.1 Ajouter `metaWebhookSchema` dans `src/lib/zod/webhook.ts`
  - [x] 1.2 Schema valide la structure : `object: "whatsapp_business_account"`, `entry[].changes[].value` avec `metadata.phone_number_id`, `messages[]` optionnel (status-only possible)

- [x] Task 2 — Creer la route GET challenge (AC: #1)
  - [x] 2.1 Creer `src/app/api/webhooks/meta/route.ts`
  - [x] 2.2 Handler GET : lire `hub.mode`, `hub.verify_token`, `hub.challenge` depuis les query params
  - [x] 2.3 Si `hub.mode === "subscribe"` ET `hub.verify_token === env.META_VERIFY_TOKEN` → retourner `hub.challenge` (status 200, plain text)
  - [x] 2.4 Sinon → retourner 403
  - [x] 2.5 Guard : si `META_VERIFY_TOKEN` non configure → retourner 403

- [x] Task 3 — Creer la route POST inbound (AC: #2, #4)
  - [x] 3.1 Rate limiting par IP (reutiliser `checkWebhookRateLimit`)
  - [x] 3.2 Lire le body une seule fois avec `await request.text()`
  - [x] 3.3 Verifier signature HMAC-SHA256 inline (crypto.createHmac + timingSafeEqual) — AVANT resolution du tenant
  - [x] 3.4 Parser le JSON body, valider avec `metaWebhookSchema`
  - [x] 3.5 Extraire `phone_number_id` depuis `entry[0].changes[0].value.metadata.phone_number_id`
  - [x] 3.6 Resoudre le tenant via `db.tenant.findUnique({ where: { metaPhoneNumberId } })`
  - [x] 3.7 Si tenant non trouve → persist MessageIn avec `tenantId: null` + return 200
  - [x] 3.8 Creer un Request clone avec le bodyText pour `parseInboundBatch()`
  - [x] 3.9 Instancier `MetaCloudAdapter(tenant.metaPhoneNumberId, tenant.metaAccessToken)`
  - [x] 3.10 Appeler `adapter.parseInboundBatch(requestClone)` → tableau de `InboundMessage[]`
  - [x] 3.11 Si tableau vide (status-only) → return 200
  - [x] 3.12 Pour CHAQUE message du batch :
    - Idempotence DB : `db.messageIn.findUnique({ where: { tenantId_providerMessageId } })`
    - Si doublon → `logIdempotentIgnored()`, continuer au message suivant
    - Persist `db.messageIn.create()` avec catch P2002 (race condition)
    - Log `logWebhookReceived()`
    - Valider avec `inboundMessageForQueueSchema`
    - Enqueue BullMQ : `webhookProcessingQueue.add("process-inbound", payload, { jobId: "${tenantId}-${providerMessageId}" })`
  - [x] 3.13 Retourner 200 en < 1 s — verifier le temps ecoule

- [x] Task 4 — Tests (AC: #5)
  - [x] 4.1 Creer `src/app/api/webhooks/meta/route.test.ts`
  - [x] 4.2 Tests GET : challenge valide → 200 + challenge, token invalide → 403, mode invalide → 403, META_VERIFY_TOKEN absent → 403
  - [x] 4.3 Tests POST : single message text → 200 + MessageIn persist + BullMQ enqueue
  - [x] 4.4 Tests POST : batch multi-messages → N MessageIn + N jobs BullMQ
  - [x] 4.5 Tests POST : tenant non trouve → 200 + MessageIn avec tenantId null
  - [x] 4.6 Tests POST : signature invalide → 401
  - [x] 4.7 Tests POST : payload status-only (pas de messages[]) → 200 sans persist
  - [x] 4.8 Tests POST : idempotence — message deja existant → 200 sans doublon
  - [x] 4.9 Verifier 0 regression sur les tests existants (616 tests passent, 0 regression)

## Dev Notes

### Architecture & Patterns

- **Provider-agnostic (§7.1)** : La route Meta est un nouvel endpoint **a cote** de la route Twilio. Les deux cohabitent. Aucune modification au webhook-processor, aux queues BullMQ, ni au business logic.
- **Ultra-lightweight webhook < 1 s** : la route ne fait que verify + dedupe + persist + enqueue. Tout le traitement metier est dans le worker `webhook-processor.ts`.
- **Batch Meta** : un seul POST Meta peut contenir N messages. Chaque message = 1 MessageIn + 1 job BullMQ. La route itere sur le resultat de `parseInboundBatch()`.

### Implementation de reference : route Twilio (SUIVRE CE PATTERN)

Le fichier `src/app/api/webhooks/twilio/route.ts` (430 lignes) est la reference. La route Meta doit suivre **exactement** le meme flux en 13 etapes :

1. Start timer + `correlationId = crypto.randomUUID()` (pour tracing request-level)
2. Rate limit par IP (`checkWebhookRateLimit`) — si depasse, return 200 (pas 4xx pour eviter retries Meta)
3. Lire body UNE seule fois : `await request.text()`
4. Verifier signature HMAC-SHA256 (pas besoin de l'URL, contrairement a Twilio)
5. Parser le body JSON + valider avec `metaWebhookSchema`
6. Extraire `phone_number_id` du payload pour resolver le tenant
7. `db.tenant.findUnique({ where: { metaPhoneNumberId } })`
8. Si pas de tenant → persist MessageIn avec `tenantId: null`, return 200
9. Creer Request clone pour `parseInboundBatch()`
10. Boucle sur chaque message : idempotence check → persist → log → validate → enqueue
11. Check temps ecoule — warn si >= 1000ms
12. Return 200

### Differences critiques Meta vs Twilio dans la route

| Aspect | Twilio (`route.ts`) | Meta (a implementer) |
|--------|---------------------|---------------------|
| **HTTP method** | POST only | GET (challenge) + POST (inbound) |
| **Body format** | `application/x-www-form-urlencoded` | `application/json` |
| **Lecture body** | `request.text()` → `URLSearchParams` | `request.text()` → `JSON.parse()` |
| **Signature header** | `X-Twilio-Signature` (HMAC-SHA1, URL-based) | `X-Hub-Signature-256` (HMAC-SHA256, body-based) |
| **Verification** | `adapter.verifySignature(req, secret, body, fullUrl)` | HMAC inline (pas besoin d'instancier adapter) |
| **Tenant resolution** | `To` field → `whatsappPhoneNumber` | `metadata.phone_number_id` → `metaPhoneNumberId` |
| **Messages par POST** | Toujours 1 | 1 a N (batch) — iterer |
| **Parser** | `adapter.parseInboundFromUrlSearchParams(formData)` | `adapter.parseInboundBatch(requestClone)` |
| **Status-only** | N/A | `messages[]` absent → tableau vide, return 200 |
| **providerMessageId** | `MessageSid` Twilio | `message.id` (wamid) |
| **correlationId message** | `randomUUID()` | `message.id` (wamid) — defini par `parseInboundBatch()` |

### Verification de signature INLINE (pas via adapter)

**IMPORTANT** : La verification de signature doit se faire AVANT la resolution du tenant. Or, `MetaCloudAdapter` requiert `phoneNumberId` + `accessToken` dans son constructeur (validation stricte). Donc :

```typescript
// Verification HMAC-SHA256 inline — PAS besoin de l'adapter
function verifyMetaSignature(bodyText: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expectedSignature = "sha256=" + crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signatureHeader),
    );
  } catch {
    return false; // longueur differente
  }
}
```

Puis apres la resolution du tenant, instancier l'adapter pour `parseInboundBatch()` :
```typescript
const adapter = new MetaCloudAdapter(tenant.metaPhoneNumberId!, tenant.metaAccessToken!);
```

### Schema Zod `metaWebhookSchema`

A ajouter dans `src/lib/zod/webhook.ts` :

```typescript
// Structure du payload webhook Meta WhatsApp Cloud API
export const metaWebhookMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string() }).optional(),
  video: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string() }).optional(),
  document: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string(), filename: z.string().optional() }).optional(),
});

export const metaWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.literal("whatsapp"),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }),
        messages: z.array(metaWebhookMessageSchema).optional(),
        statuses: z.array(z.unknown()).optional(),
        contacts: z.array(z.unknown()).optional(),
      }),
      field: z.literal("messages"),
    })),
  })),
});
```

### Request clone pour parseInboundBatch()

`MetaCloudAdapter.parseInboundBatch()` appelle `req.json()` en interne. Puisque le body a deja ete lu (pour signature + validation schema), il faut passer un clone avec le body texte :

```typescript
const requestClone = new Request(request.url, {
  method: "POST",
  headers: request.headers,
  body: bodyText,
});
const messages = await adapter.parseInboundBatch(requestClone);
```

### Imports necessaires

```typescript
import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { MetaCloudAdapter } from "~/server/messaging/providers/meta/adapter";
import { webhookProcessingQueue } from "~/server/workers/queues";
import { metaWebhookSchema, inboundMessageForQueueSchema } from "~/lib/zod/webhook";
import { env } from "~/env";
import { webhookLogger } from "~/lib/logger";
import { checkWebhookRateLimit, getClientIpFromRequest } from "~/lib/rate-limit";
import { captureException as sendToSentry } from "~/lib/sentry";
import { logWebhookReceived, logIdempotentIgnored } from "~/server/events/eventLog";
```

### Gestion d'erreurs — TOUJOURS retourner 200

Meta retente sur les reponses non-2xx. Comme pour Twilio :
- Erreurs critiques (ECONNREFUSED, ETIMEDOUT, DB, Redis) → Sentry + return 200
- Signature invalide → return 401 (prod) / continue (dev) — identique a Twilio
- Tenant non trouve → persist MessageIn avec null + return 200
- Exception inattendue → catch global → Sentry + return 200

### Persist MessageIn sans tenant (tenant non trouve)

Pattern exact de la route Twilio a reproduire :
```typescript
if (!tenant) {
  try {
    await db.messageIn.create({
      data: {
        tenantId: null,
        providerMessageId,
        from: messages[0].from,
        body: messages[0].body ?? "",
        mediaUrl: messages[0].mediaUrl,
        correlationId: requestCorrelationId,
      },
    });
  } catch { /* ignore — tracabilite best-effort */ }
  return new NextResponse("OK", { status: 200 });
}
```

### Idempotence — 2 couches

1. **Couche DB** : `@@unique([tenantId, providerMessageId])` sur `MessageIn` — check avant persist + catch P2002
2. **Couche BullMQ** : `jobId: "${tenantId}-${providerMessageId}"` — empeche les jobs en double

### Project Structure Notes

- **Nouveau fichier** : `src/app/api/webhooks/meta/route.ts` — route GET + POST
- **Modification** : `src/lib/zod/webhook.ts` — ajout `metaWebhookSchema` + `metaWebhookMessageSchema`
- **Nouveau fichier** : `src/app/api/webhooks/meta/route.test.ts` — tests
- **Pas de modification** : `webhook-processor.ts`, `queues.ts`, `types.ts`, `adapter.ts` — tout est deja en place

### References

- [Source: src/app/api/webhooks/twilio/route.ts] — implementation de reference (pattern exact a suivre)
- [Source: src/server/messaging/providers/meta/adapter.ts] — MetaCloudAdapter + parseInboundBatch()
- [Source: src/lib/zod/webhook.ts] — schemas Zod existants (twilioWebhookSchema, inboundMessageForQueueSchema)
- [Source: src/server/messaging/types.ts] — interface MessagingProvider + InboundMessage
- [Source: src/server/workers/queues.ts] — webhookProcessingQueue (BullMQ)
- [Source: src/server/workers/webhook-processor.ts] — worker qui consomme les jobs (inchange)
- [Source: src/server/events/eventLog.ts] — logWebhookReceived(), logIdempotentIgnored()
- [Source: src/lib/rate-limit.ts] — checkWebhookRateLimit(), getClientIpFromRequest()
- [Source: src/lib/sentry.ts] — captureException()
- [Source: src/env.js] — META_APP_SECRET, META_VERIFY_TOKEN
- [Source: prisma/schema.prisma#Tenant] — metaPhoneNumberId @unique
- [Source: docs/migration-twilio-meta-whatsapp.md] — plan de migration
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10] — story 10.3 AC
- [Source: _bmad-output/planning-artifacts/architecture.md#§7.1] — architecture provider-agnostic, webhook < 1s

### Previous Story Intelligence (10.2)

- **Story 10.2 completee** : `MetaCloudAdapter` implementee avec `parseInbound()`, `parseInboundBatch()`, `verifySignature()`, `send()`
- **Learnings** :
  - Le constructeur valide strictement `phoneNumberId` et `accessToken` — on ne peut PAS instancier avec des valeurs vides pour juste verifier la signature → faire la verification HMAC inline
  - `parseInboundBatch()` retourne `InboundMessage[]` — iterer et traiter chaque message separement
  - `correlationId` de chaque message = `message.id` (wamid) — defini par l'adapter, pas par la route
  - Media entrant : `mediaUrl` = `"meta-media://{MEDIA_ID}"` — stocker tel quel
  - Status-only payloads : `parseInboundBatch()` retourne `[]` — ne pas crasher
  - Les numeros `from` sont deja prefixes `+` par l'adapter
  - 23 tests unitaires passent, 0 regression sur 588 tests existants
- **Code review findings (10.2)** : validation constructeur, log status-only, guard from absent, guard double +, support document sortant, validation payload structure

### Story 10.1 Intelligence

- `META_APP_SECRET` et `META_VERIFY_TOKEN` deja dans `env.js` (optionnels — guard si absent)
- `metaPhoneNumberId` sur Tenant : `String? @unique` — lookup direct possible
- `metaAccessToken` JAMAIS retourne en clair au client
- Convention nommage : `nullableStringTrimmed` helper pour Zod transforms

### Git Intelligence

- Commits recents : pages legales, dette technique epic 9, fixes TS null safety
- Pattern commits : messages en francais, prefixes `feat()`, `fix()`, `chore()`
- Framework : Next.js App Router + tRPC + Prisma + shadcn/ui + Vitest
- Convention tests : fichiers `.test.ts` a cote du code ou dans le meme dossier

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Correction mock `vi.fn()` : arrow functions ne fonctionnent pas comme constructeur dans Vitest — utiliser `function` pour `mockImplementation` des classes
- `correlationId` dans MetaCloudAdapter retourne un wamid (pas UUID), mais `inboundMessageForQueueSchema` exige un UUID → la route genere un `crypto.randomUUID()` par message

### Completion Notes List

- ✅ Task 1 : Schema Zod `metaWebhookSchema` + `metaWebhookMessageSchema` ajoutes dans `src/lib/zod/webhook.ts`
- ✅ Task 2 : Route GET `/api/webhooks/meta` — verification challenge Meta avec guards
- ✅ Task 3 : Route POST — flux complet 12 etapes : rate-limit → signature HMAC-SHA256 inline → schema validation → tenant resolution → batch parsing → idempotence → persist → log → validate → enqueue → time check
- ✅ Task 4 : 23 tests unitaires couvrant schema (12), GET challenge (4), POST inbound (7)
- ✅ Suite complete : 617 tests passent, 0 regression

### Implementation Notes

- Signature HMAC-SHA256 verifiee INLINE (avant resolution tenant) car MetaCloudAdapter requiert phoneNumberId+accessToken dans son constructeur
- correlationId genere par `crypto.randomUUID()` dans la route (pas le wamid) pour compatibilite avec `inboundMessageForQueueSchema.correlationId: z.string().uuid()`
- Pattern identique a la route Twilio : gestion erreurs retourne toujours 200 (eviter retries Meta), Sentry pour erreurs critiques
- Batch Meta : itere sur chaque message de `parseInboundBatch()` — 1 message = 1 persist + 1 enqueue
- Dev/prod toggle pour signature : en dev continue malgre signature invalide, en prod retourne 401

### File List

- `src/lib/zod/webhook.ts` — modifie (ajout metaWebhookSchema, metaWebhookMessageSchema)
- `src/app/api/webhooks/meta/route.ts` — nouveau (route GET challenge + POST inbound)
- `src/app/api/webhooks/meta/route.test.ts` — nouveau (23 tests)

### Code Review Fixes

- **H1+M1** : try/catch per-message dans le batch loop — une erreur Redis/validation sur un message ne perd plus les suivants
- **M2** : null-tenant persist TOUS les messages du batch (pas seulement le premier)
- **M3** : ajout test POST avec message image + mediaUrl
- **M4** : GET challenge exige `hub.challenge` present (sinon 403)
- **L1** : suppression import `afterEach` inutilise
- **L2** : suppression mock `findFirst` inutilise
- **L3** : `verifyMetaSignature` compare hex bytes (strip `sha256=` prefix, `Buffer.from("hex")`)

### Change Log

- 2026-02-18 : Story 10.3 implementee — route webhook Meta GET/POST + schema Zod + 22 tests, 0 regression sur 616 tests
- 2026-02-18 : Code review fixes (8 findings) — batch resilience, null-tenant persist all, media test, signature hex comparison — 23 tests, 617 total, 0 regression
