# Story 10.6: Supprimer Twilio (adapter, webhook, env vars, dependance npm)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **developpeur**,
je veux **supprimer tout le code Twilio : TwilioAdapter, route webhook /api/webhooks/twilio, env vars TWILIO_* dans env.js, schema twilioWebhookSchema, references Twilio dans les fichiers media, et la dependance npm twilio**,
afin que **le codebase soit propre et ne depende plus que de Meta WhatsApp Cloud API**.

## Acceptance Criteria

1. **AC1 — Suppression dossier TwilioAdapter**
   **Given** le dossier `src/server/messaging/providers/twilio/` contenant `adapter.ts` et `adapter.test.ts`
   **When** le nettoyage est applique
   **Then** le dossier entier est supprime (adapter + tests)

2. **AC2 — Suppression route webhook Twilio**
   **Given** le dossier `src/app/api/webhooks/twilio/` contenant `route.ts` et `route.integration.test.ts`
   **When** le nettoyage est applique
   **Then** le dossier entier est supprime (route + tests)

3. **AC3 — Suppression twilioWebhookSchema**
   **Given** `src/lib/zod/webhook.ts` contenant `twilioWebhookSchema` (lignes 3-14)
   **When** le nettoyage est applique
   **Then** le schema `twilioWebhookSchema` et son commentaire sont supprimes ; les schemas Meta et inbound restent intacts

4. **AC4 — Suppression env vars TWILIO_* dans env.js**
   **Given** `src/env.js` contenant 4 vars Twilio dans `server` (lignes 24-28) et `runtimeEnv` (lignes 90-93)
   **When** le nettoyage est applique
   **Then** les 4 variables `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_SECRET`, `TWILIO_WHATSAPP_NUMBER` sont supprimees des deux sections (server schema + runtimeEnv)
   **And** le commentaire `// Twilio configuration` est supprime
   **And** le commentaire de `WEBHOOK_PUBLIC_URL` est mis a jour (retirer la mention "Twilio")

5. **AC5 — Suppression env vars TWILIO_* dans .env et .env.example**
   **Given** `.env` et `.env.example` contenant les variables TWILIO_*
   **When** le nettoyage est applique
   **Then** toutes les lignes TWILIO_* et leurs commentaires sont supprimees dans les deux fichiers
   **And** le commentaire `WEBHOOK_PUBLIC_URL` referençant Twilio est supprime ou mis a jour dans `.env`

6. **AC6 — Nettoyage code media (Twilio URL detection)**
   **Given** `src/server/media/uploadMediaToCatalogueItem.ts` (lignes 45-53) et `src/server/media/uploadMediaToLiveItem.ts` (lignes 45-52) contenant la detection d'URL Twilio et l'auth Basic avec `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`
   **When** le nettoyage est applique
   **Then** le bloc conditionnel `isTwilioUrl` + auth Basic est supprime dans les deux fichiers ; le `fetch(mediaUrl, { headers })` reste mais sans la logique Twilio-specifique ; les JSDoc en tete de fichier sont mis a jour (retirer mentions "Twilio")
   **And** les tests associes (`uploadMediaToCatalogueItem.test.ts`, `uploadMediaToLiveItem.test.ts` si existants) sont mis a jour pour retirer les cas de test Twilio URL

7. **AC7 — Suppression champ whatsappPhoneNumber sur Tenant (Prisma)**
   **Given** `prisma/schema.prisma` contenant `whatsappPhoneNumber String? @unique @map("whatsapp_phone_number")` sur le model Tenant
   **When** le nettoyage est applique
   **Then** le champ `whatsappPhoneNumber` est supprime du schema Prisma ; une migration est creee ; toutes les references a ce champ dans le code (tRPC, settings, seed, etc.) sont supprimees ou migrees
   **And** les commentaires Prisma "ex. MessageSid Twilio" sur `providerMessageId` dans MessageIn/MessageOut sont mis a jour (retirer mention Twilio, garder "ex. wamid Meta" ou simplement "provider message ID")

8. **AC8 — Suppression dependance npm twilio**
   **Given** `package.json` contenant `"twilio": "^5.12.1"`
   **When** `npm uninstall twilio` est execute
   **Then** `twilio` est retire de `package.json` et `package-lock.json` ; `npm ls twilio` ne retourne rien

9. **AC9 — Nettoyage commentaires et references orphelines**
   **Given** des commentaires dans le code qui mentionnent "Twilio" sans necessite fonctionnelle
   **When** le nettoyage est applique
   **Then** les commentaires sont supprimes ou mis a jour dans : `src/app/api/webhooks/meta/route.ts` (retirer "meme pattern que la route Twilio"), `src/server/events/eventLog.ts` (retirer "MessageSid Twilio"), `src/server/messaging/types.ts` (retirer "ex. Twilio"), `src/server/proof/createPaymentProof.ts` (retirer mentions Twilio)

10. **AC10 — Zero regression**
    **Given** la suite de tests existante (630+ tests)
    **When** `npx vitest run` est execute
    **Then** 0 regression sur tous les tests restants ; les tests Twilio supprimes ne comptent pas comme regression

## Tasks / Subtasks

- [x] Task 1 — Supprimer le dossier TwilioAdapter (AC: #1)
  - [x] 1.1 Supprimer `src/server/messaging/providers/twilio/` (adapter.ts + adapter.test.ts)

- [x] Task 2 — Supprimer la route webhook Twilio (AC: #2)
  - [x] 2.1 Supprimer `src/app/api/webhooks/twilio/` (route.ts + route.integration.test.ts)

- [x] Task 3 — Nettoyer webhook.ts (AC: #3)
  - [x] 3.1 Supprimer `twilioWebhookSchema` et son commentaire dans `src/lib/zod/webhook.ts`

- [x] Task 4 — Nettoyer env.js (AC: #4)
  - [x] 4.1 Supprimer les 4 vars TWILIO_* du schema `server` dans `src/env.js`
  - [x] 4.2 Supprimer les 4 vars TWILIO_* de `runtimeEnv` dans `src/env.js`
  - [x] 4.3 Mettre a jour le commentaire de `WEBHOOK_PUBLIC_URL`

- [x] Task 5 — Nettoyer .env et .env.example (AC: #5)
  - [x] 5.1 Supprimer le bloc `# --- Twilio WhatsApp ---` et les 4 vars dans `.env`
  - [x] 5.2 Supprimer le bloc Twilio dans `.env.example`
  - [x] 5.3 Supprimer ou mettre a jour le commentaire `WEBHOOK_PUBLIC_URL` referençant Twilio

- [x] Task 6 — Nettoyer les fichiers media (AC: #6)
  - [x] 6.1 Supprimer la logique `isTwilioUrl` + auth Basic dans `uploadMediaToCatalogueItem.ts`
  - [x] 6.2 Supprimer la logique `isTwilioUrl` + auth Basic dans `uploadMediaToLiveItem.ts`
  - [x] 6.3 Mettre a jour les JSDoc (retirer mentions Twilio)
  - [x] 6.4 Mettre a jour les tests media si necessaire

- [x] Task 7 — Migration Prisma : supprimer whatsappPhoneNumber (AC: #7)
  - [x] 7.1 Supprimer `whatsappPhoneNumber` du model Tenant dans `schema.prisma`
  - [x] 7.2 Mettre a jour les commentaires `providerMessageId` (retirer "Twilio")
  - [x] 7.3 Creer la migration Prisma (`prisma/migrations/20260219000000_remove_twilio_fields/migration.sql` + `npx prisma db push`)
  - [x] 7.4 Rechercher et supprimer toutes les references a `whatsappPhoneNumber` dans le code (tRPC, settings, seed, etc.)

- [x] Task 8 — Supprimer la dependance npm (AC: #8)
  - [x] 8.1 `npm uninstall twilio`
  - [x] 8.2 Verifier `npm ls twilio` ne retourne rien

- [x] Task 9 — Nettoyer les commentaires orphelins (AC: #9)
  - [x] 9.1 `src/app/api/webhooks/meta/route.ts` : retirer mention "route Twilio"
  - [x] 9.2 `src/server/events/eventLog.ts` : retirer "MessageSid Twilio"
  - [x] 9.3 `src/server/messaging/types.ts` : retirer "ex. Twilio"
  - [x] 9.4 `src/server/proof/createPaymentProof.ts` : retirer mentions Twilio

- [x] Task 10 — Verifier zero regression (AC: #10)
  - [x] 10.1 Lancer `npx vitest run` et verifier 0 regression (601 passes, echec meta-e2e pre-existant)
  - [x] 10.2 Lancer `npx tsc --noEmit` et verifier 0 erreur TypeScript introduite (erreurs pre-existantes uniquement)
  - [x] 10.3 Lancer `npm run build` et verifier le build passe ✅

## Dev Notes

### Architecture & Patterns

- **Provider-agnostic (archi §7.1) :** L'architecture a une interface `MessagingProvider` dans `src/server/messaging/types.ts`. Twilio etait la premiere implementation ; Meta est desormais la seule. L'interface reste en place pour de futurs providers.
- **Media upload :** Les deux fichiers media (`uploadMediaToCatalogueItem.ts`, `uploadMediaToLiveItem.ts`) contiennent une logique de detection d'URL Twilio pour ajouter un header Basic Auth. Avec Meta, les medias passent par `meta-media://{media_id}` (pas une URL Twilio). La logique Twilio est devenue du dead code.
- **Champ `whatsappPhoneNumber` :** Ce champ Prisma etait utilise pour stocker le numero Twilio du tenant. Il est remplace par `metaPhoneNumberId` (story 10.1). Verifier que la page `parametres/whatsapp` n'utilise plus ce champ avant de le supprimer.

### Inventaire complet des suppressions

#### Dossiers entiers a supprimer
| Chemin | Contenu |
|--------|---------|
| `src/server/messaging/providers/twilio/` | `adapter.ts` (223 lignes), `adapter.test.ts` (305 lignes) |
| `src/app/api/webhooks/twilio/` | `route.ts` (431 lignes), `route.integration.test.ts` (248 lignes) |

#### Fichiers a modifier (pas supprimer)
| Fichier | Modification |
|---------|-------------|
| `src/env.js` | Supprimer 4 vars TWILIO_* (schema + runtimeEnv), commentaire |
| `src/lib/zod/webhook.ts` | Supprimer `twilioWebhookSchema` (lignes 3-14) |
| `src/server/media/uploadMediaToCatalogueItem.ts` | Supprimer bloc isTwilioUrl + auth Basic (lignes 45-53), MAJ JSDoc |
| `src/server/media/uploadMediaToLiveItem.ts` | Supprimer bloc isTwilioUrl + auth Basic (lignes 44-52), MAJ JSDoc |
| `prisma/schema.prisma` | Supprimer `whatsappPhoneNumber` sur Tenant, MAJ commentaires providerMessageId |
| `.env` | Supprimer bloc TWILIO_* (lignes 17-24) |
| `.env.example` | Supprimer bloc TWILIO_* |
| `package.json` | Supprimer `"twilio": "^5.12.1"` |
| `src/app/api/webhooks/meta/route.ts` | Retirer commentaire "meme pattern que la route Twilio" |
| `src/server/events/eventLog.ts` | Retirer "MessageSid Twilio" dans commentaires |
| `src/server/messaging/types.ts` | Retirer "ex. Twilio" dans commentaires |
| `src/server/proof/createPaymentProof.ts` | Retirer mentions Twilio dans commentaires |

#### Detail modification media upload

**Avant (uploadMediaToCatalogueItem.ts, lignes 44-55) :**
```typescript
// 1. Fetch media from Twilio (Basic Auth)
const isTwilioUrl = mediaUrl.includes("api.twilio.com") || mediaUrl.includes("twilio.com");
const accountSid = env.TWILIO_ACCOUNT_SID;
const authToken = env.TWILIO_AUTH_TOKEN;
const headers: HeadersInit = {};
if (isTwilioUrl && accountSid && authToken) {
  headers["Authorization"] =
    "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}
const response = await fetch(mediaUrl, { headers });
```

**Apres :**
```typescript
const response = await fetch(mediaUrl);
```

Meme pattern pour `uploadMediaToLiveItem.ts`.

### Prisma Migration — Points d'attention

- **`whatsappPhoneNumber`** a un `@unique` index. La migration doit dropper l'index et la colonne.
- Verifier qu'aucun code applicatif ne reference `whatsappPhoneNumber` (recherche globale). Les candidats :
  - Page settings WhatsApp (`src/app/(dashboard)/parametres/whatsapp/`) — probablement deja migre vers `metaPhoneNumberId` (story 10.1)
  - tRPC router settings — verifier `settings.setWhatsAppConfig`
  - Seeds/fixtures — verifier `prisma/seed*.ts`
- Ne PAS supprimer `metaPhoneNumberId`, `metaWabaId`, `metaAccessToken` — ce sont les champs Meta actifs.

### WEBHOOK_PUBLIC_URL — Decision

`WEBHOOK_PUBLIC_URL` n'est plus necessaire si la verification de signature Meta utilise `META_APP_SECRET` (HMAC-SHA256 sur le body, pas sur l'URL). Cependant, cette variable pourrait servir a d'autres usages (rate limiting, logs). **Decision recommandee :** garder la variable mais mettre a jour son commentaire (retirer "Twilio").

### Ordre d'execution recommande

1. **D'abord** les suppressions de fichiers/dossiers (Tasks 1-2) — pas de dependance
2. **Ensuite** les modifications de fichiers (Tasks 3-6, 9) — pas de dependance entre eux
3. **Puis** la migration Prisma (Task 7) — necessite `npx prisma migrate dev`
4. **Puis** le npm uninstall (Task 8) — apres suppression du code qui importe twilio
5. **Enfin** la verification (Task 10) — apres tout le reste

### Project Structure Notes

- Tous les fichiers modifies sont existants — aucun fichier n'est cree (sauf la migration Prisma auto-generee)
- La structure `src/server/messaging/providers/` contiendra uniquement `meta/` apres suppression de `twilio/`
- La structure `src/app/api/webhooks/` contiendra uniquement `meta/` apres suppression de `twilio/`

### References

- [Source: src/server/messaging/providers/twilio/adapter.ts] — TwilioAdapter a supprimer
- [Source: src/server/messaging/providers/twilio/adapter.test.ts] — Tests Twilio a supprimer
- [Source: src/app/api/webhooks/twilio/route.ts] — Route webhook Twilio a supprimer
- [Source: src/app/api/webhooks/twilio/route.integration.test.ts] — Tests integration webhook a supprimer
- [Source: src/lib/zod/webhook.ts#twilioWebhookSchema] — Schema Zod a supprimer (lignes 3-14)
- [Source: src/env.js#TWILIO_*] — 4 env vars a supprimer (lignes 24-28, 90-93)
- [Source: src/server/media/uploadMediaToCatalogueItem.ts#45-53] — Logique Twilio URL auth a supprimer
- [Source: src/server/media/uploadMediaToLiveItem.ts#44-52] — Logique Twilio URL auth a supprimer
- [Source: prisma/schema.prisma#Tenant.whatsappPhoneNumber] — Champ Prisma a supprimer
- [Source: package.json#twilio] — Dependance npm a supprimer
- [Source: _bmad-output/implementation-artifacts/10-5-test-bout-en-bout-meta.md] — Story precedente (630 tests)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10] — Description Epic 10

### Previous Story Intelligence (10.5)

- **Story 10.5 completee** : 6 tests E2E Meta WhatsApp — 630 tests suite totale, 0 regression
- **Learnings** :
  - `RUN_INTEGRATION_TESTS=true` pour les tests d'integration (guard existant)
  - 2 echecs pre-existants dans `webhook-processor.integration.test.ts` = quota Upstash Redis (infra, pas regression)
  - Dynamic imports pour eviter validation env quand test est skip
  - Pattern commits : `feat(meta): ...` ou `chore(meta): ...`

### Previous Story Intelligence (10.4)

- **Story 10.4 completee** : outbox-sender utilise MetaCloudAdapter per-tenant
- **Learnings** :
  - `MetaCloudAdapter` constructeur valide strictement `phoneNumberId` et `accessToken`
  - Gestion d'erreur gracieuse : `meta_config_missing` → message `failed`, pas de crash
  - TwilioAdapter n'est plus utilise dans l'outbox-sender depuis 10.4

### Git Intelligence

- Dernier commit : `feat(meta): migration complete Twilio → Meta WhatsApp Business API (epic 10, stories 10.1-10.5)`
- Pattern commit pour cette story : `chore(meta): supprimer Twilio — adapter, webhook, env vars, dependance npm`
- Framework : Next.js App Router + tRPC + Prisma + shadcn/ui + Vitest
- 630 tests au total apres story 10.5

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-02-19)

### Debug Log References

- DB locale avait du drift → utilisé `prisma db push` au lieu de `migrate dev` pour éviter le reset
- `.next/types` stale contenaient encore la route Twilio → nettoyés manuellement (validator.ts + dossier)
- Toutes les erreurs TypeScript sont pré-existantes (confirmé avec git stash before/after)
- L'échec `meta-e2e.integration.test.ts` (afterEach not defined) est pré-existant (existait avant story 10.6)

### Completion Notes List

- ✅ Supprimé `src/server/messaging/providers/twilio/` (adapter.ts + adapter.test.ts — 223+305 lignes)
- ✅ Supprimé `src/app/api/webhooks/twilio/` (route.ts + route.integration.test.ts — 431+248 lignes)
- ✅ Supprimé `twilioWebhookSchema` dans `src/lib/zod/webhook.ts`
- ✅ Supprimé 4 vars TWILIO_* de `src/env.js` (schema server + runtimeEnv), commentaire mis à jour
- ✅ Supprimé blocs TWILIO_* de `.env` et `.env.example`, tableau déploiement mis à jour
- ✅ Supprimé logique `isTwilioUrl` + auth Basic dans les 2 fichiers media upload ; JSDoc mis à jour ; tests mis à jour
- ✅ Supprimé `whatsappPhoneNumber` de `prisma/schema.prisma` ; migration créée et appliquée via `prisma db push` ; commentaires `providerMessageId` mis à jour ; références dans settings.ts, settings.schema.ts et leurs tests nettoyées
- ✅ `npm uninstall twilio` → 43 packages removed ; `npm ls twilio` = empty
- ✅ Commentaires orphelins nettoyés dans 4 fichiers (meta/route.ts, eventLog.ts, types.ts, createPaymentProof.ts)
- ✅ 601 tests passent, 0 régression (échec meta-e2e.integration pré-existant)
- ✅ Build Next.js réussi sans erreurs

### File List

**Supprimés :**
- src/server/messaging/providers/twilio/adapter.ts
- src/server/messaging/providers/twilio/adapter.test.ts
- src/app/api/webhooks/twilio/route.ts
- src/app/api/webhooks/twilio/route.integration.test.ts

**Modifiés :**
- src/lib/zod/webhook.ts
- src/env.js
- .env
- .env.example
- src/server/media/uploadMediaToCatalogueItem.ts
- src/server/media/uploadMediaToCatalogueItem.test.ts
- src/server/media/uploadMediaToLiveItem.ts
- src/server/media/uploadMediaToLiveItem.test.ts
- prisma/schema.prisma
- src/server/api/routers/settings.ts
- src/server/api/routers/settings.schema.ts
- src/server/api/routers/settings.schema.test.ts
- src/server/api/routers/settings.test.ts
- src/server/events/eventLog.ts
- src/server/events/eventLog.test.ts
- src/server/messaging/types.ts
- src/server/proof/createPaymentProof.ts
- src/server/workers/outbox-sender.test.ts
- src/server/workers/webhook-processor.test.ts
- src/server/workers/webhook-processor.integration.test.ts
- src/server/workers/reservation-ttl.test.ts
- src/server/workers/__tests__/stop-optout-blocked.integration.test.ts
- src/server/api/routers/orders.test.ts
- src/server/api/routers/ops.test.ts
- src/server/waitlist/addToWaitlist.test.ts
- src/app/api/webhooks/meta/route.ts
- src/app/api/webhooks/meta/route.test.ts
- prisma/seed-ops-events.ts
- package.json
- package-lock.json

**Créés :**
- prisma/migrations/20260219000000_remove_twilio_fields/migration.sql
- src/lib/validations/phone.test.ts

**Regénérés (automatiquement par prisma db push) :**
- generated/prisma/index.d.ts
- generated/prisma/index.js
- generated/prisma/edge.js
- generated/prisma/wasm.js
- generated/prisma/index-browser.js
- generated/prisma/schema.prisma
- generated/prisma/package.json

## Change Log

- 2026-02-19 : Implémentation complète story 10.6 — suppression Twilio (adapter, webhook, env vars, npm). 4 dossiers/fichiers supprimés, 20+ fichiers nettoyés, migration Prisma appliquée, 601 tests passants.
- 2026-02-19 : Code Review (CR) — 3 HIGH, 3 MEDIUM, 2 LOW. Tous fixés. H1-H3: résidus Twilio nettoyés (webhook-processor.test.ts 14 URLs, seed-ops-events.ts provider→meta, ops.test.ts erreur générique). M1-M3: File List complétée (+10 fichiers). L1: dead code e164PhoneSchema supprimé de settings.schema.ts, tests migrés vers phone.test.ts. L2: migration SQL alignée conventions Prisma (retrait IF EXISTS). 599 tests passent, 0 régression.
