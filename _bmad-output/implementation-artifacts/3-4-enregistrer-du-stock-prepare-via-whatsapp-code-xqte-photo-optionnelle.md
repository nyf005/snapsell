# Story 3.4 : Enregistrer du stock préparé via WhatsApp (CODE xQTE, photo optionnelle)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur**,
I want **enregistrer du stock préparé sur WhatsApp (CODE xQTE + photo optionnelle + tailles optionnelles)**,
so that **le stock soit décrémenté à la confirmation et pas à la réservation**.

## Acceptance Criteria

1. **Given** je suis reconnu comme vendeur et j'envoie un message du type « A12 x5 » (et optionnellement une photo)
   **When** le worker traite le message
   **Then** un live_item (ou prepared_stock) est créé avec code A12, quantité 5, et optionnellement media lié ; la quantité est en available_qty (FR15)
   **And** FR15 couvert

## Tasks / Subtasks

- [x] Task 1 : Schéma et champs stock préparé (AC: #1)
  - [x] S'assurer que LiveItem (ou modèle dédié) supporte available_qty et reserved_qty (archi §4, §D). Pour un item « stock préparé » : available_qty = quantité enregistrée, reserved_qty = 0 à la création. Story 3.6 utilisera reserved_qty à la réservation et décrément à la confirmation.
  - [x] Si le modèle actuel n'a que `quantity` : ajouter reservedQty et availableQty (Int, défaut 0) en migration ; pour « article unique » (3.3) garder quantity=1 et availableQty=1, reservedQty=0 ; pour « stock préparé » (3.4) quantity = total, availableQty = quantité saisie, reservedQty = 0.
- [x] Task 2 : Intent vendeur « CODE xQTE » (AC: #1)
  - [x] Le pattern SELLER_CREATE_ITEM_PATTERN existe déjà (code ou code x qte). S'assurer que createLiveItem (ou équivalent) enregistre la quantité en available_qty (et quantity si champ conservé).
  - [x] Si le code existe déjà dans la session (doublon) : ne pas écraser ; renvoyer message FR40 « Code déjà utilisé… » (comportement actuel 3.2). Pas d'update implicite du stock sur renvoi du même code.
- [x] Task 3 : Photo optionnelle (AC: #1)
  - [x] Si le message vendeur contient un media (mediaUrl dans le job) en plus du CODE xQTE : télécharger le media de Twilio, uploader vers R2 (Cloudflare), enregistrer la clé/URL en DB liée au LiveItem créé. Architecture §8 : médias en R2, chemins en DB ; §pièges : media download en async, ne pas bloquer le worker.
  - [x] Option : lier la photo au dernier code créé/édité dans une fenêtre (ex. 2 min) → détaillé en Story 3.5 ; pour 3.4 on peut accepter photo dans le même message que CODE xQTE (même message Twilio avec body + MediaUrl0).
- [x] Task 4 : Event log et traçabilité (AC: #1)
  - [x] Enregistrer un événement type live_item_created (ou prepared_stock_registered) avec correlationId quand un item en stock préparé est créé ; inclure code, quantity/available_qty, optionnellement media présent.
- [x] Task 5 : Tests (AC: #1)
  - [x] Test : vendeur envoie « A12 x5 » → un LiveItem est créé avec code A12, available_qty = 5 (et reserved_qty = 0).
  - [x] Test : vendeur envoie « A12 x5 » avec media → item créé + media stocké (R2 ou mock) et lien en DB.
  - [x] Test : vendeur renvoie « A12 x3 » alors que A12 existe déjà → pas de mise à jour implicite ; message « Code déjà utilisé… ».

## Dev Notes

- **FR couvert :** FR15 — Le vendeur peut enregistrer du stock préparé sur WhatsApp (prioritaire MVP) : CODE xQTE + photo optionnelle + tailles optionnelles.
- **Source épics :** Epic 3, Story 3.4 ; objectif = stock préparé enregistré par le vendeur, quantité en available_qty ; décrément à la confirmation (Story 3.6), pas à la réservation.
- **Distinction 3.3 vs 3.4 :** En 3.3 (article unique) le client envoie un code non préparé → item créé avec quantité 1. En 3.4 le **vendeur** envoie « CODE xQTE » → item avec quantité > 1 (stock préparé), available_qty utilisé pour le blocage à la réservation (3.6).

### Project Structure Notes

- **Architecture §Requirements to Structure :** Stock préparé (FR14–FR17) → Prisma (live_items avec available_qty / reserved_qty), webhook-processor (intent vendeur). Story 3.2 a livré createLiveItem (code + quantity) ; 3.4 étend pour available_qty / reserved_qty et photo optionnelle.
- **Architecture §8 :** Médias (photos produit) → Cloudflare R2, chemins en DB ; téléchargement Twilio → R2 en **async** (ne pas bloquer le worker).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.4] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#4.4 Stock decrement at confirmation] — reserved_qty / available_qty
- [Source: _bmad-output/implementation-artifacts/3-3-creer-un-item-unique-code-non-prepare-quantite-1.md] — resolveOrCreateLiveItem, createLiveItem
- [Source: _bmad-output/implementation-artifacts/3-2-unicite-du-code-par-tenant-id-live-session-id-code.md] — createLiveItem, unicité, FR40

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- Le **vendeur** envoie sur WhatsApp un message du type « A12 x5 » pour enregistrer du stock préparé : code A12, quantité 5. La quantité doit être stockée en **available_qty** (FR15). À la réservation (Epic 4 / Story 3.6) on bloquera une unité (reserved_qty += 1) sans décrémenter available_qty ; à la confirmation on décrémente (reserved_qty -= 1, available_qty -= 1). Cette story se limite à : créer/mettre à jour l’item avec la quantité en available_qty et, optionnellement, lier une photo (media du message) au produit.
- **Photo optionnelle :** si le message contient un media (image), le télécharger (Twilio), le stocker en R2, et associer l’URL/clé au LiveItem. Architecture : médias en R2, chemins en DB ; traitement async pour ne pas bloquer le worker.
- **Pas d’update implicite :** si le vendeur renvoie un code déjà existant en session, ne pas modifier le stock ; répondre « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … » (FR40).

### Technical Requirements

- **Modèle :** LiveItem doit supporter le stock préparé : `availableQty` et `reservedQty` (ou noms snake_case en DB). À la création par le vendeur « CODE xQTE » : availableQty = quantité saisie, reservedQty = 0. Conserver ou dériver `quantity` = availableQty + reservedQty si utile pour affichage.
- **Création :** Réutiliser createLiveItem (Story 3.2) en passant la quantité ; s’assurer que cette quantité est enregistrée en available_qty (et reserved_qty = 0). Si le schéma actuel n’a que `quantity`, ajouter une migration pour availableQty / reservedQty.
- **Média :** Champ optionnel sur LiveItem (ex. `mediaStorageKey` ou `mediaUrl`) pour le lien R2. Job webhook contient déjà `mediaUrl` (URL Twilio) ; worker doit : télécharger le fichier, l’uploader vers R2, enregistrer la clé/URL en DB sur le LiveItem. Faire le téléchargement/upload en async (queue secondaire ou job dédié) pour ne pas bloquer la réponse bot.

### Architecture Compliance

- **Stack :** Prisma (Neon), Cloudflare R2 pour médias. Conformité architecture §4 (Data), §8 (Media R2), §11 (Vercel + Railway).
- **Webhook / worker :** Traitement dans le worker (flux vendeur). Réutiliser getOrCreateCurrentSession, createLiveItem ; étendre pour available_qty / reserved_qty et option media.
- **Isolation tenant :** Toutes les opérations filtrées par tenantId.

### Library / Framework Requirements

- **Prisma :** Migration si ajout de champs (availableQty, reservedQty, mediaStorageKey ou mediaUrl).
- **R2 :** Utiliser le client S3-compatible (R2) pour upload ; configuration R2_* dans env (voir architecture §11.3). Signed URLs pour consultation ultérieure (dashboard / preuves).
- **Twilio media :** Téléchargement depuis mediaUrl (Twilio) puis upload R2 en async (worker ou job BullMQ secondaire).

### File Structure Requirements

- **Live item :** Logique dans `src/server/live-item/` (createLiveItem.ts ou module dédié stock préparé). Ne pas dupliquer la logique 3.2 : étendre createLiveItem pour accepter availableQty/reservedQty et option media.
- **Worker :** Dans `src/server/workers/webhook-processor.ts`, flux vendeur : après parseCreateItemIntent, appeler createLiveItem avec quantity → available_qty ; si job.data.mediaUrl présent, enqueue un job « upload media → link to LiveItem » ou traiter en async dans la même job sans bloquer.
- **Event log :** Enregistrer un événement (ex. live_item_created avec type prepared_stock ou champ dédié) pour traçabilité.

### Testing Requirements

- Test : vendeur « A12 x5 » → LiveItem créé avec code A12, availableQty = 5, reservedQty = 0.
- Test : vendeur « A12 x5 » + mediaUrl dans le job → LiveItem créé + media en R2 (ou mock) et lien en DB.
- Test : vendeur renvoie « A12 x3 » (code déjà existant) → pas de mise à jour, message FR40.
- Test : unicité (tenant_id, live_session_id, code) préservée ; pas de doublon.

### Previous Story Intelligence (Story 3.2, 3.3)

- **Story 3.2 :** createLiveItem(tenantId, code, { quantity }) pour le vendeur ; contrainte @@unique([tenantId, liveSessionId, code]) ; normalisation trim + uppercase ; getPriceFromCode pour amountCents ; P2002 → message « Code déjà utilisé… ». Pattern SELLER_CREATE_ITEM_PATTERN : `^([A-Za-z]+\d+)(?:\s*x\s*(\d+))?$` (code x qte).
- **Story 3.3 :** resolveOrCreateLiveItem pour le client (code non préparé, quantité 1). createLiveItemRecord factorise la création. Pour 3.4 : étendre le modèle et createLiveItem pour available_qty / reserved_qty et option media ; pas de changement au flux client.

### Git Intelligence Summary

- Derniers ajouts : createLiveItem (quantity), resolveOrCreateLiveItem, webhook-processor (vendeur create item, client resolveOrCreate). Pour 3.4 : même module live-item, champs availableQty/reservedQty, media R2, event log.

### Latest Tech Information

- Cloudflare R2 : API S3-compatible ; utiliser @aws-sdk/client-s3 ou package R2 documenté. Variables R2_* (endpoint, access key, secret, bucket) dans env.
- Twilio Media : URL temporaire ; télécharger rapidement ou copier vers notre stockage (R2) pour persistance.

### Project Context Reference

- Structure T3 + architecture.md ; conventions du repo (tests à côté des modules ou dans tests/unit/). Médias : R2, pas de stockage dans public/.

### Story Completion Status

- **Status :** ready-for-dev
- **Note :** Contexte complet préparé pour l’agent dev ; analyse artefacts et stories 3.2, 3.3, épics et architecture.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Schéma LiveItem étendu : availableQty, reservedQty, mediaStorageKey (migration 20260209220000). createLiveItemRecord et createLiveItem utilisent available_qty / reserved_qty ; 3.3 conserve quantity=1, availableQty=1, reservedQty=0.
- Intent CODE xQTE déjà géré par parseCreateItemIntent ; quantité passée à createLiveItem et enregistrée en availableQty. Doublon → FR40 inchangé.
- Photo optionnelle : module uploadMediaAndLinkToLiveItem (Twilio → R2, puis update LiveItem.mediaStorageKey), appelé en async (void) depuis le worker si mediaUrl présent. Env R2_* et Twilio pour auth optionnels (no-op si R2 non configuré).
- Event log : logLiveItemCreated étendu avec quantity, available_qty, has_media dans le payload.
- Tests : createLiveItem (Story 3.4 A12 x5), webhook-processor (mediaUrl → uploadMediaAndLinkToLiveItem, doublon A12 x3 → FR40).
- CR 3-4 : update LiveItem avec where tenantId (isolation tenant), File List complété (route Twilio, adapter, .env.example), validation URL mediaUrl, tests eventLog (quantity/available_qty/has_media) et uploadMediaToLiveItem (R2 non configuré, URL invalide), type CreateLiveItemResult.liveItem + mediaStorageKey optionnel, commentaire pas de retry/DLQ média.

### File List

- prisma/schema.prisma (LiveItem: availableQty, reservedQty, mediaStorageKey)
- prisma/migrations/20260209220000_add_live_item_available_reserved_media_story_3_4/migration.sql
- .env.example (R2_* optional, exemples)
- src/env.js (R2_* optional)
- src/app/api/webhooks/twilio/route.ts (mediaUrl dans le job)
- src/server/messaging/providers/twilio/adapter.ts (MediaUrl0 → mediaUrl)
- src/server/live-item/createLiveItem.ts (createLiveItemRecord options, createLiveItem/resolveOrCreateLiveItem types)
- src/server/media/uploadMediaToLiveItem.ts (new)
- src/server/events/eventLog.ts (logLiveItemCreated payload extended)
- src/server/workers/webhook-processor.ts (mediaUrl → uploadMediaAndLinkToLiveItem, log payload)
- src/server/live-item/createLiveItem.test.ts
- src/server/live-item/resolveOrCreateLiveItem.test.ts
- src/server/workers/webhook-processor.test.ts
- src/server/events/eventLog.test.ts (unchanged payload shape for existing tests)
- src/server/media/uploadMediaToLiveItem.test.ts (Story 3.4: R2 non configuré, URL invalide)
- package.json (@aws-sdk/client-s3)
