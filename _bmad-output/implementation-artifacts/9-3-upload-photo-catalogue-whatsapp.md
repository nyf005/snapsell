# Story 9.3: Upload photo catalogue via WhatsApp

Status: done

<!-- Infrastructure R2 et module r2-client.ts partagé déjà en place (Stories 3.4, 5.3, 9.2). Pattern async upload (uploadMediaAndLinkToLiveItem) réutilisable. CatalogueItem.mediaStorageKey existe déjà. Aucune migration Prisma nécessaire. -->

## Story

As a **vendeur**,
I want **envoyer une photo par WhatsApp avec le code d'un article catalogue pour y associer la photo**,
so that **je puisse alimenter mes photos depuis mon téléphone, sans passer par le dashboard**.

## Acceptance Criteria

1. **Given** le vendeur envoie un message WhatsApp contenant une photo ET un code catalogue valide (ex: "A12")
   **When** le worker traite le message
   **Then** la photo est téléchargée depuis Twilio, uploadée sur R2 (clé `tenants/{tenantId}/catalogue-items/{itemId}/photo`), et `CatalogueItem.mediaStorageKey` est mis à jour
   **And** le bot répond confirmation (ex: "Photo ajoutée à A12.")

2. **Given** le vendeur envoie une photo + code qui n'existe PAS dans le catalogue du tenant
   **When** le worker traite le message
   **Then** le bot répond "Code A12 introuvable dans ton catalogue. Crée d'abord l'article depuis le dashboard ou envoie le code avec quantité (ex: A12 x5)."
   **And** aucun upload R2 n'est effectué

3. **Given** le vendeur envoie une photo SANS texte (body vide ou non parseable comme code)
   **When** une session live est active
   **Then** le comportement existant (Story 3.5 : photo liée au dernier LiveItem dans la fenêtre 2 min) est préservé tel quel
   **And** Story 9.3 n'intervient PAS (pas de fallback catalogue sur photo seule)

4. **Given** le vendeur envoie une photo + code ET une session live est active avec un LiveItem ayant le même code
   **When** le worker traite le message
   **Then** la photo est associée au **CatalogueItem** (persistant, priorité catalogue)
   **And** le bot confirme "Photo ajoutée à A12 (catalogue)."

5. **Given** un article catalogue existant a déjà une photo (mediaStorageKey non null)
   **When** le vendeur envoie une nouvelle photo + même code
   **Then** la nouvelle photo remplace l'ancienne sur R2 (même clé déterministe) et mediaStorageKey reste identique

6. **Given** R2 n'est pas configuré (env vars absentes)
   **When** le vendeur envoie une photo + code
   **Then** l'upload est ignoré gracieusement (pas de crash worker)
   **And** le bot ne mentionne pas la photo (comportement dégradé silencieux, l'item est toujours créé/traité normalement si applicable)

7. **Given** le téléchargement depuis Twilio ou l'upload R2 échoue
   **When** le worker traite le message
   **Then** l'erreur est loggée (correlationId) mais le worker ne crash pas
   **And** le bot ne mentionne pas l'échec photo au vendeur (fire-and-forget async, comme Story 3.4)

## Tasks / Subtasks

- [x] Task 1 : Créer la fonction `uploadMediaToCatalogueItem` (AC: #1, #5, #6, #7)
  - [x] Créer `src/server/media/uploadMediaToCatalogueItem.ts`
  - [x] Réutiliser `createR2Client()` et `getR2BucketName()` de `r2-client.ts`
  - [x] Télécharger le media depuis Twilio URL (Basic Auth AccountSid:AuthToken, même pattern que `uploadMediaAndLinkToLiveItem`)
  - [x] Upload R2 avec clé `tenants/{tenantId}/catalogue-items/{catalogueItemId}/photo`
  - [x] Mettre à jour `CatalogueItem.mediaStorageKey` en DB
  - [x] Gérer R2 non configuré (return early, pas de crash)
  - [x] Log erreurs avec correlationId (catch, console.error, pas de throw)

- [x] Task 2 : Ajouter le handling dans le webhook-processor (AC: #1, #2, #3, #4)
  - [x] Dans le flux vendeur (`messageType === "seller"`), détecter le cas : `mediaUrl` présent ET body contient un code parseable
  - [x] Utiliser `parseCreateItemIntent()` existant pour extraire le code du body (déjà gère "A12", "A12 x5", etc.)
  - [x] Si code extrait ET mediaUrl : lookup `CatalogueItem` par `(tenantId, code)` via `findOrderableItemByCode()`
  - [x] Si CatalogueItem trouvé : appeler `uploadMediaToCatalogueItem()` en async (fire-and-forget avec .catch log)
  - [x] Si CatalogueItem NON trouvé : envoyer message "Code introuvable dans ton catalogue"
  - [x] Si pas de code dans le body mais mediaUrl + vendeur : laisser le flux existant Story 3.5 (photo seule → dernier LiveItem)
  - [x] Envoyer confirmation bot "Photo ajoutée à {code}." (ou "Photo ajoutée à {code} (catalogue)." si session live active)

- [x] Task 3 : Ajouter le template de message bot (AC: #1, #2, #4)
  - [x] Ajouter dans `src/server/whatsapp/templates.ts` (ou inline dans webhook-processor) les messages :
    - Confirmation : "Photo ajoutée à {code}."
    - Erreur code inconnu : "Code {code} introuvable dans ton catalogue. Crée l'article d'abord (dashboard ou envoie {code} x1)."

- [x] Task 4 : Event log (AC: #1)
  - [x] Logger un événement `catalogue_item.photo_linked` dans l'EventLog (correlationId, tenantId, catalogueItemId, code)
  - [x] Réutiliser le pattern de `logLiveItemPhotoLinked()` dans `src/server/events/eventLog.ts`

- [x] Task 5 : Tests (AC: #1–#7)
  - [x] Tests unitaires `uploadMediaToCatalogueItem` : upload OK, R2 non configuré, erreur fetch Twilio, erreur upload R2
  - [x] Tests unitaires webhook-processor : vendeur photo + code existant, vendeur photo + code inconnu, vendeur photo sans code (flux 3.5 préservé), vendeur photo + code en live actif, vendeur photo + code sans live
  - [x] Pattern de test : mocks Prisma + mocks S3Client comme dans les tests existants (`webhook-processor.test.ts`, `catalogue.test.ts`)

## Dev Notes

### Flow complet (vendeur envoie photo + code via WhatsApp)

```
1. Twilio → Webhook API (POST /api/webhooks/twilio)
2. Webhook : verify → idempotence → persist MessageIn → enqueue job → 200
3. Worker webhook-processor.ts :
   a. determineMessageType() → "seller"
   b. parseCreateItemIntent(body) → { code: "A12", quantity: 1 }
   c. Détecte mediaUrl présent
   d. findOrderableItemByCode(tenantId, "A12") → CatalogueItem | null
   e. Si trouvé :
      - void uploadMediaToCatalogueItem(tenantId, item.id, mediaUrl, correlationId).catch(...)
      - logCatalogueItemPhotoLinked(...)
      - Écrire outbox : "Photo ajoutée à A12."
   f. Si non trouvé :
      - Écrire outbox : "Code A12 introuvable dans ton catalogue."
   g. Le reste du flux vendeur continue normalement (upsert live item si session active, etc.)
```

### Interaction avec le flux vendeur existant

**Cas "photo + code" (nouveau, Story 9.3) :**
Le vendeur envoie `A12` (ou `A12 x5`) avec une photo jointe. Le webhook-processor détecte `parseCreateItemIntent` + `mediaUrl`. Le flux existant pour créer/mettre à jour le LiveItem (si session active) s'exécute normalement. **En plus**, le code déclenche l'upload vers le CatalogueItem.

**Cas "photo seule" (existant, Story 3.5) :**
Le vendeur envoie une photo SANS body parseable. Le flux existant (fenêtre 2 min → dernier LiveItem) est préservé sans modification. Story 9.3 n'intervient pas sur ce cas.

**Priorité :** Le code Story 9.3 s'insère DANS le flux vendeur "createItem" existant, comme un enrichissement. Il ne remplace rien.

### Infrastructure existante à réutiliser

| Composant | Fichier source | Ce qu'on réutilise |
|-----------|---------------|-------------------|
| R2 client factory | `src/server/media/r2-client.ts` | `createR2Client()`, `isR2Configured()`, `getR2BucketName()` |
| Twilio media download | `src/server/media/uploadMediaToLiveItem.ts` | Pattern fetch URL Twilio avec Basic Auth (lignes 44-57) |
| Catalogue lookup par code | `src/server/catalogue/findOrderableItemByCode.ts` | `findOrderableItemByCode(tenantId, code)` |
| Intent parser | `src/server/workers/webhook-processor.ts` | `parseCreateItemIntent(body)` (lignes 91-106) |
| Event logging | `src/server/events/eventLog.ts` | Pattern `logLiveItemPhotoLinked()` |
| Message type routing | `src/server/workers/webhook-processor.ts` | `determineMessageType()` (lignes 127-159) |
| Message outbox | `src/server/workers/webhook-processor.ts` | Pattern d'écriture outbox existant pour réponses bot |

### Clé de stockage R2

Pattern : `tenants/{tenantId}/catalogue-items/{catalogueItemId}/photo`

Identique à Story 9.2 (dashboard upload). Cela signifie qu'un upload WhatsApp et un upload dashboard écrivent **au même emplacement R2**. Remplacement transparent.

### Sécurité

- **Tenant isolation** : le vendeur est identifié par `sellerPhone(s)` du tenant ; le lookup catalogue est filtré par `tenantId`
- **Pas de code injection** : la clé R2 est déterministe (tenantId + itemId, pas de saisie utilisateur dans le path)
- **Media validation** : le Content-Type vient de la réponse Twilio (pas du body utilisateur) ; le fichier est un blob binaire, pas d'exécution
- **Fire-and-forget** : l'upload async ne bloque pas le worker ; un échec n'impacte pas le traitement du message

### Pattern async upload (fire-and-forget)

```typescript
// Pattern existant Story 3.4 (webhook-processor.ts, lignes 521-535)
if (mediaUrl) {
  void uploadMediaToCatalogueItem(
    tenantId,
    catalogueItem.id,
    mediaUrl,
    correlationId,
  ).catch((err) => {
    console.error(
      `[${correlationId}] Failed to upload catalogue photo for ${code}:`,
      err,
    );
  });
}
```

### Architecture `uploadMediaToCatalogueItem`

```typescript
// src/server/media/uploadMediaToCatalogueItem.ts
// Calqué sur uploadMediaAndLinkToLiveItem (src/server/media/uploadMediaToLiveItem.ts)

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client, getR2BucketName, isR2Configured } from "./r2-client";
import { db } from "~/server/db";
import { env } from "~/env";

export async function uploadMediaToCatalogueItem(
  tenantId: string,
  catalogueItemId: string,
  mediaUrl: string,
  correlationId: string,
): Promise<void> {
  if (!isR2Configured()) return;

  // 1. Fetch media from Twilio (Basic Auth)
  const authHeader = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
  ).toString("base64");
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${authHeader}` },
  });
  if (!response.ok) throw new Error(`Twilio fetch failed: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  // 2. Upload to R2
  const key = `tenants/${tenantId}/catalogue-items/${catalogueItemId}/photo`;
  const client = createR2Client();
  await client.send(new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  // 3. Update DB
  await db.catalogueItem.update({
    where: { id: catalogueItemId, tenantId },
    data: { mediaStorageKey: key },
  });
}
```

### Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/server/media/uploadMediaToCatalogueItem.ts` | **Nouveau** — upload Twilio → R2 → CatalogueItem.mediaStorageKey |
| `src/server/workers/webhook-processor.ts` | **Modifier** — ajouter détection photo + code vendeur → upload catalogue |
| `src/server/events/eventLog.ts` | **Modifier** — ajouter `logCatalogueItemPhotoLinked()` |
| `src/server/workers/webhook-processor.test.ts` | **Modifier** — ajouter tests vendeur photo + code |
| `src/server/media/uploadMediaToCatalogueItem.test.ts` | **Nouveau** — tests unitaires upload |

### Project Structure Notes

- La nouvelle fonction `uploadMediaToCatalogueItem.ts` suit le même pattern et emplacement que `uploadMediaToLiveItem.ts`
- Aucun nouveau modèle Prisma — `CatalogueItem.mediaStorageKey` existe déjà
- Aucune nouvelle migration Prisma nécessaire
- La clé R2 est identique entre dashboard (Story 9.2) et WhatsApp (Story 9.3) : même emplacement

### Leçons des stories précédentes (9.1, 9.2)

- **Story 9.1** : Prisma validate + generate après toute modification schéma (ici : pas nécessaire)
- **Story 9.2** : Module `r2-client.ts` extrait pour éviter la duplication — le réutiliser directement
- **Story 9.2** : Pattern API route `/api/catalogue/[itemId]/photo` pour servir les photos (GET) — déjà en place, pas de modification
- **Story 9.2** : 523 tests passent actuellement. S'assurer de ne rien casser.
- **Pattern de test** : mocks Prisma dans les fichiers `*.test.ts` co-localisés
- **Code review Story 9.2** : 7 findings corrigés — être rigoureux sur tenant isolation et gestion d'erreurs async

### Git intelligence (5 derniers commits pertinents)

- `71a7a6c` fix(ui): formatting montants XOF — inputs entiers sans décimales
- `433ab63` feat(epic-8): catalogue produit, améliorations sidebar et landing page
- Conventions de commit : `feat(scope)`, `fix(scope)`, `refactor(scope)`
- Pas de changements en cours qui conflicteraient avec Story 9.3

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 9, Story 9.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — §8 Data Storage (Cloudflare R2), §11 Deployment]
- [Source: src/server/media/uploadMediaToLiveItem.ts — Pattern upload Twilio → R2 existant]
- [Source: src/server/media/r2-client.ts — Module partagé R2 (Story 9.2)]
- [Source: src/server/workers/webhook-processor.ts — Flux vendeur, intent parsing, photo handling Story 3.5]
- [Source: src/server/catalogue/findOrderableItemByCode.ts — Lookup catalogue par code]
- [Source: src/app/api/catalogue/[itemId]/photo/route.ts — API route serving photo (Story 9.2)]
- [Source: prisma/schema.prisma — CatalogueItem.mediaStorageKey (L371)]
- [Source: _bmad-output/implementation-artifacts/9-2-upload-photo-catalogue-dashboard.md — Story précédente, leçons et patterns]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Corrigé mocks eventLog pour retourner des Promises (`.mockResolvedValue(undefined)`) — sinon `.catch()` sur `undefined` provoquait TypeError dans les tests

### Completion Notes List

- Task 1: Créé `uploadMediaToCatalogueItem.ts` calqué sur `uploadMediaAndLinkToLiveItem.ts`. Clé R2 déterministe `tenants/{tenantId}/catalogue-items/{catalogueItemId}/photo`. Gestion R2 non configuré (return early), URL invalide (return early), erreurs fetch/upload (throw pour que le .catch appelant log). 7 tests unitaires.
- Task 2: Intégré dans le flux vendeur `processWebhookJob`. Après `upsertCatalogueItemFromWebhook` réussit + `mediaUrl` → fire-and-forget `uploadMediaToCatalogueItem` + event log + confirmation outbox. Si upsert échoue + `mediaUrl` → message "Code introuvable". Photo seule (body vide) → flux Story 3.5 préservé inchangé.
- Task 3: Messages inline dans webhook-processor (pas de fichier templates séparé, cohérent avec le pattern existant). "Photo ajoutée à {code}." sans session live, "Photo ajoutée à {code} (catalogue)." avec session live active. "Code {code} introuvable dans ton catalogue. Crée l'article d'abord (dashboard ou envoie {code} x1)." pour code inconnu.
- Task 4: Ajouté event type `catalogue_item.photo_linked` dans EventType union + z.enum + helper `logCatalogueItemPhotoLinked()` dans eventLog.ts. Payload: catalogue_item_id, code, source: "whatsapp".
- Task 5: 6 nouveaux tests Story 9.3 dans webhook-processor.test.ts (AC#1 photo+code, AC#2 code inconnu, AC#3 photo seule préservée, AC#4 photo+code+live, AC#5 remplacement photo, AC#6/7 code sans photo). 7 tests dans uploadMediaToCatalogueItem.test.ts. Total: 13 nouveaux tests, 536 tests suite complète passent.

### Code Review Fixes

- **H1 fix**: Confirmation photo conditionnée sur `isR2Configured()` — plus de "Photo ajoutée" quand R2 n'est pas configuré
- **M1 fix**: Message consolidé unique ("Créé : A12 (x1). Photo ajoutée au catalogue.") au lieu de deux messages WhatsApp séparés quand photo+code+session live
- **M2 fix**: Ajout try/catch wrapper dans `uploadMediaToCatalogueItem.ts` (aligné sur pattern `uploadMediaToLiveItem.ts`)
- **M3 fix**: Messages d'erreur différenciés — "Pas de prix configuré pour la catégorie « X »" vs "Code introuvable"
- **L1 fix**: Test AC#4 vérifie `writeToOutbox` appelé exactement 1 fois (message consolidé)
- **L2 fix**: Validation content-type (accepte uniquement image/jpeg, png, webp, gif, heic, heif)
- **L3 fix**: Limite taille buffer 10 Mo max
- 5 nouveaux tests ajoutés (H1, M3, L2 unsupported content-type, L2 octet-stream rejeté, L3 taille). Total: 541 tests suite complète passent.

### File List

- `src/server/media/uploadMediaToCatalogueItem.ts` — **Nouveau** — upload Twilio → R2 → CatalogueItem.mediaStorageKey (+ try/catch, content-type validation, size limit)
- `src/server/media/uploadMediaToCatalogueItem.test.ts` — **Nouveau** — 11 tests unitaires upload (7 originaux + 4 review fixes)
- `src/server/workers/webhook-processor.ts` — **Modifié** — import isR2Configured, guard R2 sur confirmation photo, message consolidé, messages d'erreur différenciés
- `src/server/workers/webhook-processor.test.ts` — **Modifié** — mock r2-client, 8 tests Story 9.3 (6 originaux + 2 review fixes), AC#4 mis à jour
- `src/server/events/eventLog.ts` — **Modifié** — ajout event type `catalogue_item.photo_linked` + helper `logCatalogueItemPhotoLinked()`
