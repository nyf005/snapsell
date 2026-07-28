# Story 10.4: Outbox-sender — remplacer Twilio par Meta

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **systeme**,
je veux **que l'outbox-sender utilise `MetaCloudAdapter` au lieu de `TwilioAdapter` pour envoyer les messages sortants**,
afin que **tous les messages sortants passent par l'API Meta**.

## Acceptance Criteria

1. **AC1 — Resolution du provider Meta par tenant**
   **Given** un `messageOut` avec `tenantId`
   **When** l'outbox-sender traite le message
   **Then** il lit le tenant en base, recupere `metaAccessToken` et `metaPhoneNumberId`, et instancie un `MetaCloudAdapter` pour l'envoi

2. **AC2 — TwilioAdapter n'est plus utilise**
   **Given** le fichier `outbox-sender.ts`
   **When** la story est completee
   **Then** `TwilioAdapter` n'est plus importe ni utilise dans l'outbox-sender

3. **AC3 — Erreur gracieuse si config Meta absente**
   **Given** un tenant sans `metaAccessToken` ou `metaPhoneNumberId`
   **When** l'outbox-sender traite un message pour ce tenant
   **Then** le message est marque en erreur avec un message clair (ex. "Tenant meta_config_missing") et ne crashe pas le worker

4. **AC4 — Tests couvrent envoi via Meta**
   **Given** les fichiers de tests
   **When** les tests sont executes
   **Then** couvrent : envoi via MetaCloudAdapter, tenant sans config Meta → erreur gracieuse, et les tests existants (opt-out, media R2, DLQ) continuent de passer

5. **AC5 — Zero regression**
   **Given** la suite de tests existante (617+ tests)
   **When** les tests sont executes
   **Then** 0 regression sur tous les tests existants

## Tasks / Subtasks

- [x] Task 1 — Modifier `processOutboundMessage()` pour resoudre le provider Meta (AC: #1, #2, #3)
  - [x] 1.1 Ajouter un lookup tenant en DB : `db.tenant.findUnique({ where: { id: tenantId }, select: { metaPhoneNumberId: true, metaAccessToken: true } })`
  - [x] 1.2 Verifier que `metaPhoneNumberId` et `metaAccessToken` sont renseignes — sinon retourner `{ success: false, error: "meta_config_missing" }` et mettre le message en `failed` avec `lastError`
  - [x] 1.3 Instancier `MetaCloudAdapter(tenant.metaPhoneNumberId, tenant.metaAccessToken)` au lieu de `TwilioAdapter`
  - [x] 1.4 Supprimer l'import `TwilioAdapter` et les references aux env vars Twilio (`TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_WHATSAPP_NUMBER`) dans `outbox-sender.ts`
  - [x] 1.5 Ajouter l'import `MetaCloudAdapter` depuis `~/server/messaging/providers/meta/adapter`
  - [x] 1.6 Mettre a jour les commentaires du fichier (en-tete JSDoc) pour refleter Meta au lieu de Twilio

- [x] Task 2 — Mettre a jour les tests unitaires (AC: #4, #5)
  - [x] 2.1 Remplacer le mock `TwilioAdapter` par un mock `MetaCloudAdapter` dans `outbox-sender.test.ts`
  - [x] 2.2 Ajouter un mock `db.tenant.findUnique` retournant `{ metaPhoneNumberId: "123456", metaAccessToken: "token-test" }`
  - [x] 2.3 Ajouter test : tenant sans config Meta → erreur gracieuse (message non envoye, status `failed`, lastError contient "meta_config_missing")
  - [x] 2.4 Ajouter test : tenant introuvable (null) → erreur gracieuse
  - [x] 2.5 Mettre a jour le mock `~/env` pour supprimer les env vars Twilio non utilisees
  - [x] 2.6 Verifier que les tests existants (opt-out, media R2, DLQ, backoff) continuent de passer avec les nouveaux mocks
  - [x] 2.7 Verifier 0 regression sur la suite complete (617+ tests)

## Dev Notes

### Architecture & Patterns

- **Provider-agnostic (§7.1)** : L'outbox-sender est le **seul endroit** ou le provider BSP est instancie pour les messages sortants. Tout le reste du systeme (business logic, event log, workers metier) est deja agnostique.
- **Modification locale** : seule la fonction `processOutboundMessage()` change. Les fonctions `processOutboxBatch()`, `createDeadLetterJob()`, `startOutboxSenderWorker()`, `stopOutboxSenderWorker()` restent **inchangees**.
- **Pas de factory pattern** : puisqu'on remplace Twilio par Meta (pas de cohabitation), on instancie directement `MetaCloudAdapter`. La story 10.6 supprimera completement Twilio.

### Implementation de reference : code actuel (REMPLACER CE BLOCK)

Le bloc a remplacer dans `processOutboundMessage()` (lignes 104-109) :

```typescript
// AVANT (Twilio) — A SUPPRIMER
const adapter = new TwilioAdapter(
  env.TWILIO_AUTH_TOKEN ?? "",
  env.TWILIO_ACCOUNT_SID,
  env.TWILIO_WHATSAPP_NUMBER,
);
```

Remplacer par :

```typescript
// APRES (Meta) — Resolution per-tenant
const tenant = await db.tenant.findUnique({
  where: { id: tenantId },
  select: { metaPhoneNumberId: true, metaAccessToken: true },
});

if (!tenant?.metaPhoneNumberId || !tenant?.metaAccessToken) {
  const errorMsg = !tenant
    ? "tenant_not_found"
    : "meta_config_missing";
  
  workerLogger.error("Cannot send message: tenant Meta config missing", new Error(errorMsg), {
    messageOutId: id,
    tenantId,
    correlationId,
  });

  await db.messageOut.update({
    where: { id },
    data: {
      status: "failed",
      attempts: messageOut.attempts + 1,
      nextAttemptAt: calculateNextAttemptAt(messageOut.attempts + 1),
      lastError: errorMsg,
      updatedAt: new Date(),
    },
  });

  return { success: false, error: errorMsg };
}

const adapter = new MetaCloudAdapter(
  tenant.metaPhoneNumberId,
  tenant.metaAccessToken,
);
```

### Imports a modifier

```diff
- import { TwilioAdapter } from "~/server/messaging/providers/twilio/adapter";
+ import { MetaCloudAdapter } from "~/server/messaging/providers/meta/adapter";
```

### Gestion d'erreurs — tenant sans config Meta

**IMPORTANT** : Ne pas crasher le worker si un tenant n'a pas configure Meta. Le message doit etre marque `failed` avec un `lastError` descriptif. Apres `MAX_RETRIES`, il ira en DLQ normalement (le flow existant gere deja ca).

Scenarios d'erreur :
1. **Tenant introuvable** (`findUnique` retourne `null`) → `lastError: "tenant_not_found"`
2. **Config Meta absente** (`metaPhoneNumberId` ou `metaAccessToken` est `null`) → `lastError: "meta_config_missing"`

Ces deux cas sont traites AVANT l'instanciation de `MetaCloudAdapter` (dont le constructeur throw si les valeurs sont vides).

### MetaCloudAdapter.send() — ce qui est deja gere par l'adapter

L'adapter Meta gere deja :
- **Text messages** : `type: "text"`, `text: { body }`
- **Image avec URL** : `type: "image"`, `image: { link, caption }`
- **Document avec URL** : `type: "document"`, `document: { link, caption }`
- **Strip `+` prefix** : le numero `to` est normalise (suppression du `+` initial pour l'API Meta)
- **Error handling** : erreurs HTTP retournees comme `ProviderSendResult.error`

Le flow media R2 (Story 9.4) continue de fonctionner : `generateSignedR2Url()` produit une URL publique → l'adapter Meta la recoit dans `mediaUrl` → l'envoie comme `image.link` ou `document.link`.

### Performance — lookup tenant supplementaire

Le lookup `db.tenant.findUnique({ where: { id }, select: { ... } })` est un **SELECT par PK** (index clustered) avec **2 colonnes seulement**. Le cout est negligeable (~1ms) par rapport au temps d'envoi via l'API Meta (~200-500ms). Pas d'optimisation necessaire a ce stade.

### Project Structure Notes

- **Modification** : `src/server/workers/outbox-sender.ts` — remplacement TwilioAdapter → MetaCloudAdapter + lookup tenant
- **Modification** : `src/server/workers/outbox-sender.test.ts` — mocks + nouveaux tests
- **Pas de modification** : `src/server/messaging/providers/meta/adapter.ts` (deja complet depuis 10.2)
- **Pas de modification** : `src/server/messaging/types.ts` (interface inchangee)
- **Pas de modification** : `processOutboxBatch()`, `createDeadLetterJob()`, `startOutboxSenderWorker()` (flux inchanges)

### References

- [Source: src/server/workers/outbox-sender.ts#processOutboundMessage] — code actuel a modifier (lignes 104-109 = instanciation TwilioAdapter)
- [Source: src/server/workers/outbox-sender.test.ts] — tests existants (427 lignes, mock TwilioAdapter)
- [Source: src/server/messaging/providers/meta/adapter.ts] — MetaCloudAdapter.send() (deja implemente, Story 10.2)
- [Source: src/server/messaging/providers/meta/adapter.ts#constructor] — constructeur avec validation stricte phoneNumberId + accessToken
- [Source: src/server/messaging/types.ts] — interface MessagingProvider, OutboundMessage, ProviderSendResult
- [Source: src/server/media/r2-signed-url.ts] — generateSignedR2Url() pour les medias Story 9.4
- [Source: prisma/schema.prisma#Tenant] — metaPhoneNumberId String? @unique, metaAccessToken String?
- [Source: docs/migration-twilio-meta-whatsapp.md#4] — "Modifier l'outbox-sender pour resoudre le provider par tenant"
- [Source: _bmad-output/planning-artifacts/architecture.md#§7.1] — architecture provider-agnostic, outbox pattern
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10#Story-10.4] — story AC originaux
- [Source: _bmad-output/planning-artifacts/architecture.md#§4.5] — outbox + retries + DLQ pattern

### Previous Story Intelligence (10.3)

- **Story 10.3 completee** : route webhook Meta GET/POST + schema Zod — 23 tests, 617 total, 0 regression
- **Learnings** :
  - `MetaCloudAdapter` constructeur valide strictement `phoneNumberId` et `accessToken` → toujours verifier avant instanciation
  - `correlationId` genere par `crypto.randomUUID()` dans la route (pas le wamid) pour compatibilite schema
  - Pattern gestion d'erreurs : toujours retourner 200 dans les routes webhook, mais dans l'outbox-sender on utilise le flow fail+retry existant
  - 617 tests passent actuellement, 0 regression apres 10.3

### Previous Story Intelligence (10.2)

- **Story 10.2 completee** : `MetaCloudAdapter` — send() gere text, image, document ; support media sortant (upload → media_id puis envoi)
- **Learnings** :
  - `send()` strip le `+` prefix du numero (l'API Meta attend format sans `+`)
  - Media : si `mediaUrl` present, l'adapter distingue image vs document via extension
  - Error handling : retourne `ProviderSendResult` avec `success: false` et `error` — jamais de throw
  - 23 tests unitaires sur l'adapter

### Previous Story Intelligence (10.1)

- `metaPhoneNumberId` : `String? @unique` sur Tenant — lookup par PK fonctionne
- `metaAccessToken` : `String?` sur Tenant — JAMAIS retourne en clair au client (mais accessible server-side)
- Les champs Twilio (`whatsappPhoneNumber`) restent sur le model Tenant jusqu'a la story 10.6

### Git Intelligence

- Commits recents : pages legales, dette technique epic 9, fixes TS null safety
- Pattern commits : messages en francais, prefixes `feat()`, `fix()`, `chore()` — pour cette story : `feat(outbox): remplacer TwilioAdapter par MetaCloudAdapter`
- Framework : Next.js App Router + tRPC + Prisma + shadcn/ui + Vitest
- Convention tests : fichiers `.test.ts` dans le meme dossier que le code source
- 617 tests au total apres story 10.3

## Dev Agent Record

### Agent Model Used

Antigravity (Google Deepmind)

### Debug Log References

Aucun probleme rencontre.

### Completion Notes List

- **Task 1** : `processOutboundMessage()` modifie — TwilioAdapter remplace par MetaCloudAdapter per-tenant. Lookup tenant par PK avec `select: { metaPhoneNumberId, metaAccessToken }`. Gestion d'erreur gracieuse pour `tenant_not_found` et `meta_config_missing` (message marque `failed` avec `lastError`, pas de crash worker). Import TwilioAdapter supprime, import MetaCloudAdapter ajoute. JSDoc en-tete mis a jour (§7.1 au lieu de §11.2).
- **Task 2** : Tests mis a jour — mock TwilioAdapter → MetaCloudAdapter, mock `db.tenant.findUnique` ajoute. 3 nouveaux tests AC#3 (tenant_not_found, meta_config_missing, partial config). Env vars Twilio supprimees du mock `~/env`. 12 tests fichier, 620 tests suite complete, 0 regression.

### Change Log

- 2026-02-18 : Story 10.4 — Remplacement TwilioAdapter par MetaCloudAdapter dans outbox-sender (resolution per-tenant, gestion d'erreurs gracieuse, 12 tests, 0 regression)
- 2026-02-19 : Code review fixes (H1, M1, M2, L1) — integration test tenant Meta config, File List complete, AC labels corriges, test DB error ajoute — 13 tests fichier, 621 suite, 0 regression

### File List

- `src/server/workers/outbox-sender.ts` — modified (TwilioAdapter → MetaCloudAdapter + tenant lookup)
- `src/server/workers/outbox-sender.test.ts` — modified (mocks + 4 nouveaux tests AC#3/#4 + DB error)
- `src/server/workers/outbox-sender.integration.test.ts` — modified (mock TwilioAdapter → MetaCloudAdapter + tenant Meta config)
- `src/server/workers/__tests__/stop-optout-blocked.integration.test.ts` — modified (mock TwilioAdapter → MetaCloudAdapter)
- `src/server/workers/README.md` — modified (documentation Twilio → Meta)
