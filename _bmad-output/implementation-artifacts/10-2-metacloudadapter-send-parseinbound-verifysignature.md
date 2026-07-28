# Story 10.2: MetaCloudAdapter (send + parseInbound + verifySignature)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **systeme**,
je veux **un `MetaCloudAdapter implements MessagingProvider` qui envoie des messages via `POST graph.facebook.com/v21.0/{phone_number_id}/messages`, parse le payload JSON Meta entrant, et verifie la signature HMAC-SHA256**,
afin que **le systeme puisse communiquer via l'API WhatsApp Meta**.

## Acceptance Criteria

1. **AC1 — send() envoie via Meta Cloud API**
   **Given** un tenant avec `metaPhoneNumberId` et `metaAccessToken`
   **When** `send()` est appele avec un `OutboundMessage`
   **Then** un `POST` est envoie a `https://graph.facebook.com/v21.0/{phoneNumberId}/messages` avec le Bearer token du tenant ; `ProviderSendResult` retourne avec le `wamid` comme `providerMessageId`

2. **AC2 — parseInbound() parse le JSON Meta**
   **Given** un payload JSON Meta webhook (`entry[].changes[].value.messages[]`)
   **When** `parseInbound()` est appele
   **Then** retourne un `InboundMessage` normalise par message ; gere le batch (plusieurs messages dans 1 POST) ; `tenantId` est `null` (resolu dans la route) ; `from` est prefixe par `+` pour format E.164

3. **AC3 — verifySignature() verifie HMAC-SHA256**
   **Given** une requete avec le header `X-Hub-Signature-256`
   **When** `verifySignature()` est appele avec `META_APP_SECRET`
   **Then** verifie le HMAC-SHA256 du body brut ; retourne `true` si valide, `false` sinon

4. **AC4 — Support media sortant**
   **Given** un `OutboundMessage` avec `mediaUrl` present
   **When** `send()` est appele
   **Then** le media est envoye comme message image/document (pas besoin d'upload separe pour les URLs publiques — utiliser le champ `link` dans le payload Meta)

5. **AC5 — Tests unitaires complets**
   **Given** le fichier de tests `adapter.test.ts`
   **When** les tests sont executes
   **Then** couvrent : send text-only, send avec mediaUrl, send erreur API, parseInbound single message, parseInbound batch (plusieurs messages), parseInbound status-only (pas de message), verifySignature valide, verifySignature invalide, verifySignature header manquant

## Tasks / Subtasks

- [x] Task 1 — Creer `MetaCloudAdapter` (AC: #1, #2, #3, #4)
  - [x] 1.1 Renommer `adapter.ts.example` en `adapter.ts` dans `src/server/messaging/providers/meta/`
  - [x] 1.2 Adapter le constructeur : ne prendre que `phoneNumberId` + `accessToken` (le `appSecret` est une env var globale, pas per-tenant)
  - [x] 1.3 Implementer `verifySignature()` — HMAC-SHA256, header `X-Hub-Signature-256`, utiliser `timingSafeEqual` au lieu de `===`
  - [x] 1.4 Implementer `parseInbound()` — parser JSON, naviguer `entry[].changes[].value.messages[]`, gerer batch (retourner tableau), prefixer `from` avec `+`
  - [x] 1.5 Implementer `send()` — POST `graph.facebook.com/v21.0/{phoneNumberId}/messages`, Bearer token, texte + media
  - [x] 1.6 Implementer support media sortant dans `send()` — si `mediaUrl` present, envoyer comme message `image` avec `link` (URLs publiques)

- [x] Task 2 — Tests unitaires (AC: #5)
  - [x] 2.1 Creer `src/server/messaging/providers/meta/adapter.test.ts`
  - [x] 2.2 Tests `verifySignature` : header valide, header invalide, header manquant, erreur interne
  - [x] 2.3 Tests `parseInbound` : single message text, message avec media (image), batch multi-messages, payload status-only (pas de messages[]), body vide
  - [x] 2.4 Tests `send` : text-only, avec mediaUrl, erreur HTTP API Meta, pas de messageId dans reponse
  - [x] 2.5 Verifier 0 regression sur les tests existants

## Dev Notes

### Architecture & Patterns

- **Provider-agnostic (§7.1)** : `MetaCloudAdapter implements MessagingProvider`. Meme interface que `TwilioAdapter`. Le business logic ne change PAS.
- **Per-tenant credentials** : contrairement a Twilio (env vars globales), Meta utilise des credentials **par tenant** (`metaPhoneNumberId`, `metaAccessToken` stockes en DB sur le model `Tenant`). Le constructeur recoit ces valeurs, pas des env vars.
- **`META_APP_SECRET`** : seule env var globale Meta. C'est le App Secret de l'application Facebook, utilise pour verifier les signatures webhook (HMAC-SHA256). Ce n'est PAS un credential per-tenant.
- **Batch inbound** : Meta peut envoyer **plusieurs messages** dans un seul POST webhook (`entry[].changes[].value.messages[]` peut contenir N messages). L'interface `parseInbound()` actuelle retourne un seul `InboundMessage`. **Decision** : retourner le premier message et ajouter une methode `parseInboundBatch()` qui retourne `InboundMessage[]`, OU modifier `parseInbound` pour accepter un body pre-parse. La route webhook (story 10.3) iterera sur les messages.
- **Status notifications** : Meta envoie aussi des notifications de statut (`entry[].changes[].value.statuses[]`) sur le meme webhook. `parseInbound()` doit gerer le cas ou `messages[]` est absent (payload status-only) sans erreur.

### Interface MessagingProvider — Reference EXACTE

```typescript
// src/server/messaging/types.ts — NE PAS MODIFIER
export interface MessagingProvider {
  parseInbound(req: Request | IncomingMessage): Promise<InboundMessage>;
  verifySignature(req: Request | IncomingMessage, secret: string, bodyText?: string, fullUrl?: string): Promise<boolean>;
  send(message: OutboundMessage): Promise<ProviderSendResult>;
}

export interface InboundMessage {
  tenantId: string | null;
  providerMessageId: string;
  from: string;
  body: string;
  mediaUrl?: string;
  correlationId: string;
}

export interface OutboundMessage {
  tenantId: string;
  to: string;
  body: string;
  correlationId: string;
  mediaUrl?: string;
}

export interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}
```

### TwilioAdapter — Reference Implementation (patterns a suivre)

| Pattern | Twilio | Meta (a implementer) |
|---------|--------|---------------------|
| Constructor | `authToken`, `accountSid`, `whatsappNumber` (env vars) | `phoneNumberId`, `accessToken` (DB per-tenant) |
| verifySignature | `X-Twilio-Signature`, HMAC-SHA1, `twilio.validateRequest()` | `X-Hub-Signature-256`, HMAC-SHA256, `crypto.createHmac()` + `timingSafeEqual` |
| parseInbound | FormData/URLSearchParams, `twilioWebhookSchema` Zod | JSON, `entry[].changes[].value.messages[]` |
| send | `twilio.messages.create({ from, to, body, mediaUrl })` | `fetch POST graph.facebook.com/v21.0/{id}/messages` |
| Error handling | catch + return `{ success: false, error }` | Meme pattern |
| Logging | `webhookLogger` (parse/verify), `workerLogger` (send) | Meme pattern |
| tenantId | `null` (resolu dans route) | `null` (resolu dans route) |
| correlationId | `randomUUID()` | `message.id` (wamid) — utiliser l'ID Meta comme correlationId |

### Differences critiques Meta vs Twilio

1. **Payload JSON** (pas form-urlencoded) — structure imbriquee `entry[].changes[].value`
2. **Batch possible** — 1 POST peut contenir N messages
3. **Status notifications** — `statuses[]` au lieu de `messages[]` — NE PAS crasher
4. **Signature HMAC-SHA256** — utiliser `crypto.createHmac("sha256", secret)` + `timingSafeEqual`
5. **Auth per-tenant** — Bearer token dans header Authorization
6. **Numero sans +** — Meta envoie `from: "33612345678"` sans le `+`, ajouter `+` pour E.164
7. **Numero to sans +** — `send()` doit retirer le `+` du numero destinataire
8. **Media sortant** — pour URLs publiques, envoyer directement avec `type: "image"` et `image: { link: url }`

### Structure du payload Meta webhook (reference)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "33XXXXXXXXX",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "messages": [{
          "from": "33612345678",
          "id": "wamid.HBgNMzM2MTIzNDU2Nzg...",
          "timestamp": "1234567890",
          "text": { "body": "Bonjour" },
          "type": "text"
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**Payload image entrante :**
```json
{
  "type": "image",
  "image": {
    "mime_type": "image/jpeg",
    "sha256": "...",
    "id": "MEDIA_ID"
  }
}
```
Note : pour les images entrantes, l'URL de download n'est pas directement dans le payload. Il faut faire un GET `graph.facebook.com/v21.0/{MEDIA_ID}` pour obtenir l'URL. Pour cette story, stocker le `MEDIA_ID` comme `mediaUrl` (prefixe `meta-media://`). Le download sera gere dans une story ulterieure si necessaire.

### Payload send() Meta (reference)

**Text message :**
```json
{
  "messaging_product": "whatsapp",
  "to": "33612345678",
  "type": "text",
  "text": { "body": "Votre reservation est confirmee" }
}
```

**Image message (URL publique) :**
```json
{
  "messaging_product": "whatsapp",
  "to": "33612345678",
  "type": "image",
  "image": {
    "link": "https://example.com/photo.jpg",
    "caption": "Votre article"
  }
}
```

**Reponse succes :**
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "33612345678", "wa_id": "33612345678" }],
  "messages": [{ "id": "wamid.HBgNMzM2MTIzNDU2Nzg..." }]
}
```

### Fichier .example existant

Un fichier template existe deja : `src/server/messaging/providers/meta/adapter.ts.example`. Il contient une implementation quasi-complete MAIS avec ces problemes a corriger :

1. **Constructeur trop lourd** : prend `appId`, `appSecret`, `wabaId` — l'adapter n'a besoin que de `phoneNumberId` + `accessToken` (le secret est passe via `verifySignature()`)
2. **Pas de `timingSafeEqual`** : utilise `===` pour comparer les signatures — vulnérable au timing attack
3. **parseInbound ne gere pas le batch** : prend seulement `messages[0]` — doit supporter N messages
4. **parseInbound ne gere pas les status-only** : crashe si pas de `messages[]`
5. **send() ne gere pas media** : seulement `type: "text"` — doit supporter `type: "image"` avec `link`
6. **`sendTemplate()` hors scope** : methode bonus pas dans l'interface `MessagingProvider` — conserver mais ne pas inclure dans l'interface

### Securite

- **`timingSafeEqual`** : OBLIGATOIRE pour la comparaison de signature HMAC. Utiliser `crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(receivedHash))` au lieu de `===`.
- **Token en memoire** : le `accessToken` per-tenant est en memoire seulement le temps de l'envoi. Pas de caching global.
- **Pas de log du token** : ne JAMAIS logger `accessToken` ou `appSecret`.

### Project Structure Notes

- **Nouveau fichier** : `src/server/messaging/providers/meta/adapter.ts` (renommer le .example)
- **Nouveau fichier** : `src/server/messaging/providers/meta/adapter.test.ts`
- Alignement avec la structure existante : `providers/twilio/adapter.ts` + `providers/twilio/adapter.test.ts`
- Convention nommage : `MetaCloudAdapter` (comme indique dans les AC de l'epic)

### References

- [Source: docs/migration-twilio-meta-whatsapp.md] — plan de migration complet
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10] — story 10.2 AC
- [Source: _bmad-output/planning-artifacts/architecture.md#§7.1] — architecture provider-agnostic
- [Source: src/server/messaging/types.ts] — interface MessagingProvider + types
- [Source: src/server/messaging/providers/twilio/adapter.ts] — implementation reference
- [Source: src/server/messaging/providers/twilio/adapter.test.ts] — pattern de tests reference
- [Source: src/server/messaging/providers/meta/adapter.ts.example] — template existant
- [Source: prisma/schema.prisma#Tenant] — champs `metaPhoneNumberId`, `metaWabaId`, `metaAccessToken`
- [Source: src/env.js] — `META_APP_SECRET`, `META_VERIFY_TOKEN`

### Previous Story Intelligence (10.1)

- **Story 10.1 completee** : env vars Meta, champs Prisma, page settings UI — tout est en place
- **Learnings** :
  - La migration Prisma a ete creee manuellement (pas via `migrate dev` interactif)
  - Le champ `metaAccessToken` ne doit JAMAIS etre retourne en clair au client (bug fixe en code review)
  - Le champ `whatsappPhoneNumber` (Twilio) est conserve pour retrocompatibilite (suppression story 10.6)
  - Convention nommage schemas Zod : `nullableStringTrimmed` helper pour les transforms
  - Pattern unicite : `findFirst` + `where: { id: { not: tenantId } }` + catch `P2002`
- **Code review findings appliques** : token overwrite bug, 8 tests router ajoutes

### Git Intelligence

- Commits recents : pages legales, dette technique epic 9, fixes TS null safety
- Pattern de commit : messages en francais, prefixes `feat()`, `fix()`, `chore()`
- Framework : Next.js (App Router) + tRPC + Prisma + shadcn/ui + Vitest

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A

### Completion Notes List

- **Task 1:** `MetaCloudAdapter` implementee dans `adapter.ts`. Constructeur simplifie (phoneNumberId + accessToken). `verifySignature()` utilise `crypto.timingSafeEqual` avec Buffer hex. `parseInbound()` + `parseInboundBatch()` gerent batch N messages et payloads status-only. `send()` supporte text et image (mediaUrl → `type: "image"` avec `link`). `sendTemplate()` conservee (hors interface). Classe renommee `MetaCloudAdapter` (etait `MetaAdapter`).
- **Task 2:** 23 tests unitaires couvrent : constructor validation (empty phoneNumberId, empty accessToken), verifySignature (valide, invalide, header manquant, hex malformed, auto-read body), parseInbound (text, image meta-media://, status-only, body vide), parseInboundBatch (batch multi-messages, status-only, missing from skip, double + guard, non-whatsapp payload, video/document media), send (text-only, mediaUrl image, mediaUrl document/PDF, HTTP error, no messageId, network exception). 0 regression sur 588 tests existants.
- **Code Review (AI):** 7 findings corriges (0 HIGH, 4 MEDIUM, 3 LOW). M1: validation constructeur. M2: log status-only. M3: guard from absent. M4: afterEach unstubAllGlobals. L1: guard double +. L2: support document sortant. L3: validation payload structure.

### File List

- `src/server/messaging/providers/meta/adapter.ts` (renamed from adapter.ts.example, rewritten)
- `src/server/messaging/providers/meta/adapter.test.ts` (new)
