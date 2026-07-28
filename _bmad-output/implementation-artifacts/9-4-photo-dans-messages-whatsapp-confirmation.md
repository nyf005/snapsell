# Story 9.4: Photo dans les messages WhatsApp de confirmation

Status: done

<!-- Infrastructure R2 et CatalogueItem.mediaStorageKey déjà en place (Stories 9.2, 9.3). MessageOut n'a PAS encore de champ mediaUrl — migration nécessaire. TwilioAdapter.send() n'envoie que du texte — extension nécessaire. SDK Twilio v5.12.1 supporte mediaUrl nativement. -->

## Story

As a **cliente**,
I want **recevoir la photo de l'article dans le message WhatsApp de confirmation de réservation**,
so that **je puisse vérifier visuellement que c'est bien le bon article**.

## Acceptance Criteria

1. **Given** une cliente réserve un article catalogue qui a une photo (`CatalogueItem.mediaStorageKey` non null)
   **When** le bot envoie le message récap (prix + total + "Réponds OUI pour confirmer")
   **Then** le message inclut la photo de l'article en media (MMS WhatsApp)
   **And** le texte du récap reste identique au format existant

2. **Given** une cliente réserve un article catalogue qui n'a PAS de photo (`mediaStorageKey` null)
   **When** le bot envoie le message récap
   **Then** le message est envoyé en texte uniquement (comportement actuel inchangé)
   **And** aucune erreur n'est générée

3. **Given** une cliente confirme sa commande (OUI) pour un article avec photo
   **When** le bot envoie le message de confirmation de commande
   **Then** le message de confirmation est envoyé en **texte uniquement** (pas de photo en double)
   **And** la photo n'est envoyée qu'une seule fois (au récap, pas à la confirmation)

4. **Given** un article catalogue a une photo mais la génération d'URL signée R2 échoue
   **When** le bot compose le message récap
   **Then** le message est envoyé en texte uniquement (fallback gracieux)
   **And** l'erreur est loggée avec correlationId

5. **Given** un article provient d'un LiveItem (session live, pas de catalogueItemId sur la réservation)
   **When** le bot envoie le message récap
   **Then** le message est envoyé en texte uniquement (pas de photo, comportement actuel préservé)
   **And** le flux live existant n'est PAS impacté

6. **Given** un message sortant dans l'outbox a un `mediaUrl`
   **When** le worker outbox-sender traite le message via TwilioAdapter
   **Then** le message Twilio est envoyé avec `mediaUrl` (array contenant l'URL)
   **And** le body texte est envoyé comme caption du media

7. **Given** un message sortant dans l'outbox n'a PAS de `mediaUrl` (null)
   **When** le worker outbox-sender traite le message
   **Then** le comportement est identique à l'actuel (texte uniquement, aucune régression)

## Tasks / Subtasks

- [x] Task 1 : Étendre le schéma Prisma — ajouter `mediaUrl` sur `MessageOut` (AC: #1, #6, #7)
  - [x] Ajouter `mediaUrl String? @map("media_url")` dans le modèle `MessageOut` (prisma/schema.prisma)
  - [x] Créer la migration Prisma
  - [x] Exécuter `npx prisma generate`

- [x] Task 2 : Étendre l'interface `OutboundMessage` et `writeToOutbox` (AC: #1, #2, #6)
  - [x] Ajouter `mediaUrl?: string` dans `OutboundMessage` (src/server/messaging/types.ts)
  - [x] Mettre à jour le schéma Zod de validation dans outbox.ts pour accepter `mediaUrl` optionnel
  - [x] Mettre à jour `writeToOutbox()` pour persister `mediaUrl` dans MessageOut

- [x] Task 3 : Créer la fonction de génération d'URL signée R2 (AC: #1, #4)
  - [x] Créer `src/server/media/r2-signed-url.ts`
  - [x] Utiliser `@aws-sdk/s3-request-presigner` + `GetObjectCommand` pour générer une URL signée (expiration 1h)
  - [x] Réutiliser `createR2Client()` et `getR2BucketName()` de `r2-client.ts`
  - [x] Gérer le cas R2 non configuré (return null)
  - [x] Gérer les erreurs (return null + log, pas de throw)

- [x] Task 4 : Étendre TwilioAdapter.send() pour supporter les media (AC: #6, #7)
  - [x] Modifier `src/server/messaging/providers/twilio/adapter.ts`
  - [x] Si `message.mediaUrl` présent : ajouter `mediaUrl: [message.mediaUrl]` dans `messages.create()`
  - [x] Si absent : comportement inchangé (texte uniquement)

- [x] Task 5 : Passer le `mediaUrl` dans outbox-sender au provider (AC: #6, #7)
  - [x] Modifier `src/server/workers/outbox-sender.ts`
  - [x] Lire `messageOut.mediaUrl` depuis la DB et le passer dans l'`OutboundMessage` au provider

- [x] Task 6 : Attacher la photo au message récap de réservation (AC: #1, #2, #4, #5)
  - [x] Dans `src/server/workers/webhook-processor.ts`, au moment de l'envoi du récap (après collecte adresse)
  - [x] Si la réservation a un `catalogueItemId` : charger le `CatalogueItem` et vérifier `mediaStorageKey`
  - [x] Si `mediaStorageKey` non null : passer storageKey brut comme `mediaUrl` à `writeToOutbox()` (signing déféré à outbox-sender)
  - [x] Passer `mediaUrl` à `writeToOutbox()` dans le message récap
  - [x] Si `catalogueItemId` null (LiveItem) ou `mediaStorageKey` null : texte uniquement (pas de changement)

- [x] Task 7 : Tests (AC: #1–#7)
  - [x] Tests unitaires `r2-signed-url.ts` : URL générée OK, R2 non configuré, erreur SDK
  - [x] Tests unitaires TwilioAdapter : envoi avec mediaUrl, envoi sans mediaUrl (régression)
  - [x] Tests webhook-processor : récap avec photo catalogue, récap sans photo, récap LiveItem (pas de photo), fallback erreur URL signée
  - [x] Tests outbox-sender : message avec mediaUrl passé au provider, message sans mediaUrl inchangé

## Dev Notes

### Flow complet (cliente réserve un article avec photo)

```
1. Cliente envoie code "A12" sur WhatsApp
2. webhook-processor.ts : réservation créée (ou file d'attente)
3. Cliente envoie son adresse
4. webhook-processor.ts (collecte adresse) :
   a. reservation.catalogueItemId est défini → charger CatalogueItem
   b. catalogueItem.mediaStorageKey = "tenants/{tid}/catalogue-items/{iid}/photo"
   c. writeToOutbox({ tenantId, to, body: récap, correlationId, mediaUrl: mediaStorageKey })
      (storageKey brut, PAS d'URL signée ici — signée à l'envoi par outbox-sender)
5. outbox-sender.ts : lit MessageOut.mediaUrl (storageKey) → generateSignedR2Url() → URL signée (1h)
6. TwilioAdapter.send() : messages.create({ ..., mediaUrl: [signedUrl] })
7. Twilio télécharge l'image depuis R2 via l'URL signée et l'envoie en MMS WhatsApp
8. Cliente voit le récap AVEC la photo de l'article
9. Cliente répond OUI → confirmation texte uniquement (pas de photo en double)
```

### Pourquoi des URL signées R2 (et pas des URL publiques)

- **Sécurité** : les photos sont isolées par tenant ; une URL publique permettrait à quiconque de deviner le path
- **Expiration** : l'URL signée expire après 1h, suffisant pour que Twilio télécharge l'image (quelques secondes)
- **Pas de proxy API** : Twilio a besoin d'une URL directement accessible (pas derrière une session auth)
- **Pattern AWS S3** : `@aws-sdk/s3-request-presigner` fonctionne avec Cloudflare R2 (compatible S3)

### Interaction avec les flux existants

**Récap réservation (modifié) :**
Le message récap (`Récap : A12 — 5000 FCFA — Total : 5000 FCFA. Réponds OUI pour confirmer.`) est enrichi d'une photo media SI le CatalogueItem a une photo. Le texte reste identique.

**Confirmation commande (inchangé) :**
Le message `"Commande confirmée. Merci !"` reste texte uniquement. La photo a déjà été vue au récap.

**Flux live (inchangé) :**
Les réservations sur LiveItem (sans catalogueItemId) ne sont pas impactées. Pas de photo envoyée.

**Messages déjà en outbox (rétrocompatibilité) :**
Les messages existants ont `mediaUrl = null`. Le worker outbox-sender et TwilioAdapter ignorent ce champ si null — aucune régression.

### Infrastructure existante à réutiliser

| Composant | Fichier source | Ce qu'on réutilise |
|-----------|---------------|-------------------|
| R2 client factory | `src/server/media/r2-client.ts` | `createR2Client()`, `isR2Configured()`, `getR2BucketName()` |
| CatalogueItem.mediaStorageKey | `prisma/schema.prisma` L362-382 | Champ photo déjà en place |
| Outbox write | `src/server/messaging/outbox.ts` | `writeToOutbox()` — à étendre |
| Outbox sender | `src/server/workers/outbox-sender.ts` | Worker existant — à étendre |
| Twilio adapter | `src/server/messaging/providers/twilio/adapter.ts` | `TwilioAdapter.send()` — à étendre |
| OutboundMessage type | `src/server/messaging/types.ts` | Interface existante — à étendre |
| Webhook processor | `src/server/workers/webhook-processor.ts` | Flux récap adresse — à modifier |
| Reservation model | `src/server/reservation/service.ts` | `getActiveReservationForClient()` — utiliser `catalogueItemId` |

### Nouvelle dépendance npm

```
@aws-sdk/s3-request-presigner
```

Nécessaire pour `getSignedUrl()`. Vérifier si déjà installé (le projet utilise `@aws-sdk/client-s3`).

### Points d'attention

1. **Twilio télécharge l'image** : l'URL signée doit être accessible publiquement (pas derrière un VPN/firewall). R2 est public par défaut via le endpoint S3.
2. **Expiration URL** : 1h est largement suffisant. Twilio télécharge l'image immédiatement à l'envoi.
3. **Taille image** : Twilio accepte jusqu'à 5 Mo pour les MMS WhatsApp. Les photos catalogue sont déjà limitées (5 Mo dashboard, 10 Mo WhatsApp).
4. **Content-Type** : Twilio détermine le type depuis l'URL. L'image R2 a le bon Content-Type (set à l'upload).
5. **Pas de double envoi** : la photo n'est envoyée qu'au récap, PAS à la confirmation de commande.

### Sécurité

- **Tenant isolation** : le `catalogueItemId` est extrait de la réservation du client (liée au tenant)
- **URL signée** : expire après 1h, contient la signature HMAC du bucket R2
- **Pas d'injection** : le path R2 est déterministe (tenantId + itemId), pas de saisie utilisateur
- **Fallback sûr** : si la génération d'URL échoue, le message est envoyé en texte (pas de crash)

### Schéma migration

```sql
ALTER TABLE "messages_out" ADD COLUMN "media_url" TEXT;
```

Un seul champ suffit. Pas besoin de `media_type` — Twilio détecte le type depuis le Content-Type de l'URL.

### Project Structure Notes

- Nouveau fichier : `src/server/media/r2-signed-url.ts` (utilitaire URL signée, réutilisable)
- Nouvelle migration Prisma pour `MessageOut.mediaUrl`
- Modifications mineures sur 5 fichiers existants (types, adapter, outbox-sender, webhook-processor, outbox)
- Pattern cohérent avec l'architecture provider-agnostic (mediaUrl est générique, pas spécifique Twilio)

### Leçons des stories précédentes (9.1, 9.2, 9.3)

- **Story 9.1** : Prisma validate + generate après toute modification schéma
- **Story 9.2** : Module `r2-client.ts` partagé — le réutiliser directement
- **Story 9.3** : Code review a révélé : conditionner les messages photo sur `isR2Configured()`, valider content-type, limiter la taille
- **Story 9.3** : 541 tests passent actuellement. Ne rien casser.
- **Story 9.3** : Messages consolidés (pas 2 messages séparés) — appliquer le même principe ici

### Git intelligence (derniers commits pertinents)

- `71a7a6c` fix(ui): formatting montants XOF — inputs entiers sans décimales
- `433ab63` feat(epic-8): catalogue produit, améliorations sidebar et landing page
- Conventions de commit : `feat(scope)`, `fix(scope)`, `refactor(scope)`
- Story 9.3 est en `review` — ses changements sur webhook-processor.ts sont dans le working tree

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 9, Story 9.4]
- [Source: _bmad-output/implementation-artifacts/9-3-upload-photo-catalogue-whatsapp.md — Story précédente]
- [Source: prisma/schema.prisma — MessageOut L288-311, CatalogueItem L362-382]
- [Source: src/server/messaging/types.ts — OutboundMessage interface]
- [Source: src/server/messaging/providers/twilio/adapter.ts — TwilioAdapter.send()]
- [Source: src/server/messaging/outbox.ts — writeToOutbox()]
- [Source: src/server/workers/outbox-sender.ts — Worker outbox]
- [Source: src/server/workers/webhook-processor.ts — Flux récap + confirmation]
- [Source: src/server/order/createOrderFromReservation.ts — Création commande post-confirmation]
- [Source: src/server/media/r2-client.ts — Module partagé R2]
- [Source: src/server/reservation/service.ts — getActiveReservationForClient()]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Aucun incident de debug.

### Completion Notes List

- Task 1: Migration `20260212100000_story_9_4_message_out_media_url` ajoutant `media_url TEXT` sur `messages_out`. Prisma generate OK.
- Task 2: `OutboundMessage.mediaUrl` optionnel ajouté. Schéma Zod étendu avec `z.string().min(1).optional()` (accepte clés R2 et URLs). `writeToOutbox()` persiste `mediaUrl` (null si absent).
- Task 3: `r2-signed-url.ts` créé — `generateSignedR2Url(storageKey, correlationId)` retourne URL signée (1h) ou null (R2 non configuré / erreur). Dépendance `@aws-sdk/s3-request-presigner` installée.
- Task 4: `TwilioAdapter.send()` passe `mediaUrl: [url]` à Twilio si présent, sinon texte uniquement.
- Task 5: `outbox-sender.processOutboundMessage()` lit `mediaUrl` (storageKey) depuis MessageOut DB, signe via `generateSignedR2Url()` juste avant envoi, passe URL signée au provider. Fallback texte si signing échoue. URLs http passées telles quelles.
- Task 6: `webhook-processor.ts` — au récap (après collecte adresse), si `CatalogueItem.mediaStorageKey` non null, passe storageKey brut comme `mediaUrl` à `writeToOutbox()` (signing déféré à outbox-sender). LiveItem et articles sans photo = texte uniquement. Confirmation OUI = texte uniquement (pas de photo en double).
- Task 7: Tests ajoutés (3 r2-signed-url, 4 TwilioAdapter send, 5 webhook-processor récap photo dont AC #3, 4 outbox-sender mediaUrl dont signing + fallback). Suite complète : 558 pass, 0 fail.
- `CollectAddressItemInfo` étendu avec `catalogueItemId` et `mediaStorageKey` pour éviter un lookup DB supplémentaire.

### Change Log

- 2026-02-12: Story 9.4 implémentée — photo catalogue dans messages WhatsApp récap (7 tâches, 13 tests ajoutés)
- 2026-02-12: Code review — 6 findings corrigés (H1: URL signée à l'envoi, M1: tests déplacés, M2: test outbox mediaUrl, M3: File List, L1: test AC #3, L2: generated/prisma). 558 tests pass.
- 2026-02-12: Code review pass 2 — 3 LOW (doc stale) corrigés. Dev Notes, Completion Notes, Task 6 mis à jour. Status → done.

### File List

- prisma/schema.prisma (modified — ajout `mediaUrl` sur `MessageOut`)
- prisma/migrations/20260212100000_story_9_4_message_out_media_url/migration.sql (new)
- generated/prisma/* (auto-generated — `npx prisma generate`)
- package.json (modified — ajout `@aws-sdk/s3-request-presigner`)
- package-lock.json (modified — lockfile)
- src/server/messaging/types.ts (modified — `OutboundMessage.mediaUrl`)
- src/server/messaging/outbox.ts (modified — Zod + persistence `mediaUrl`)
- src/server/messaging/outbox.test.ts (modified — tests `mediaUrl: null` + `mediaUrl` présent)
- src/server/media/r2-signed-url.ts (new — URL signée R2)
- src/server/media/r2-signed-url.test.ts (new — 3 tests)
- src/server/messaging/providers/twilio/adapter.ts (modified — `mediaUrl` dans `messages.create`)
- src/server/messaging/providers/twilio/adapter.test.ts (modified — 4 tests send ajoutés)
- src/server/workers/outbox-sender.ts (modified — signe storageKey R2 avant envoi, passe `mediaUrl` au provider)
- src/server/workers/outbox-sender.test.ts (modified — 4 tests mediaUrl dans processOutboundMessage)
- src/server/workers/webhook-processor.ts (modified — passe storageKey brut au récap, plus d'import generateSignedR2Url)
- src/server/workers/webhook-processor.test.ts (modified — 5 tests Story 9.4 dont AC #3)
- src/server/reservation/service.ts (modified — `CollectAddressItemInfo` étendu avec `catalogueItemId` et `mediaStorageKey`)
