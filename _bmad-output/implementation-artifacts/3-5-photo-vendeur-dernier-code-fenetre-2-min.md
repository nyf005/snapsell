# Story 3.5 : Photo vendeur → dernier code (fenêtre 2 min)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **lier une photo envoyée par le vendeur au dernier code créé/édité dans une fenêtre (ex. 2 min)**,
so that **le produit soit enrichi sans commande explicite**.

## Acceptance Criteria

1. **Given** le vendeur a créé ou édité un code dans les 2 dernières minutes
   **When** le vendeur envoie une photo
   **Then** la photo est attachée à ce dernier code (FR41)
   **And** si aucun code récent, le bot répond « Envoie d'abord CODE PRIX »
   **And** FR41 couvert

## Tasks / Subtasks

- [x] Task 1 : Détecter message vendeur « photo seule » (AC: #1)
  - [x] Dans le worker, après le bloc « vendeur » : si messageType === "seller" et body vide ou non parseable en CODE/CODE xQTE, et mediaUrl présent → traiter comme « photo seule ».
  - [x] Ne pas confondre avec Story 3.4 : en 3.4 la photo accompagne « CODE xQTE » dans le même message ; en 3.5 la photo arrive seule (message sans code dans le body).
- [x] Task 2 : Dernier code créé/édité dans la fenêtre 2 min (AC: #1)
  - [x] Définir une constante PHOTO_TO_LAST_CODE_WINDOW_MS (ex. 2 * 60 * 1000). Idéalement configurable (tenant ou env) plus tard ; en MVP constante dans le module.
  - [x] Requête : pour le tenant, session live courante (getOrCreateCurrentSession), dernier LiveItem dont updatedAt (ou createdAt si pas d’édition) est dans les 2 dernières minutes. Filtrer par tenantId et liveSessionId. Ordre updatedAt DESC, limit 1.
  - [x] « Créé ou édité » = soit l’item a été créé récemment (createLiveItem 3.2/3.4), soit il a été mis à jour (ex. media lié en 3.4) ; updatedAt couvre les deux.
- [x] Task 3 : Lier la photo au dernier code (AC: #1)
  - [x] Si un tel LiveItem existe : appeler uploadMediaAndLinkToLiveItem(tenantId, liveItem.id, mediaUrl, correlationId) (déjà existant Story 3.4). Réponse outbox : « Photo ajoutée à [code]. »
  - [x] Si aucun LiveItem dans la fenêtre : écrire en outbox le message « Envoie d'abord CODE PRIX » (ou template équivalent).
- [x] Task 4 : Event log (AC: #1)
  - [x] Lorsqu’une photo est liée au dernier code (3.5), enregistrer un événement type live_item_photo_linked ou étendre logLiveItemCreated avec un flag/raison pour distinguer « photo seule → dernier code » de « photo dans même message que CODE xQTE » (3.4). Option minimal : log existant live_item_created avec payload has_media + source: "photo_alone" si besoin traçabilité.
- [x] Task 5 : Tests (AC: #1)
  - [x] Test : vendeur envoie photo seule alors qu’il a créé un code il y a 1 min → photo liée à ce LiveItem, réponse « Photo ajoutée à [code]. »
  - [x] Test : vendeur envoie photo seule sans aucun code créé récemment → réponse « Envoie d'abord CODE PRIX ».
  - [x] Test : vendeur envoie photo seule, dernier code créé il y a 3 min → réponse « Envoie d'abord CODE PRIX ».

## Dev Notes

- **FR couvert :** FR41 — Photo vendeur liée au dernier code créé/édité dans une fenêtre (ex. 2 min) ; sinon bot demande « Envoie d'abord CODE PRIX ». Enrichissement produit / item, pas checkout client.
- **Source épics :** Epic 3, Story 3.5 ; objectif = permettre au vendeur d’envoyer une photo dans un message séparé après avoir créé un code, pour l’attacher à ce code sans ressaisir le code.
- **Distinction 3.4 vs 3.5 :** En 3.4, la photo est dans le **même message** que « CODE xQTE » (body + MediaUrl0). En 3.5, le message contient **uniquement** un média (body vide ou non reconnu comme code) : on associe la photo au **dernier** code créé/édité par le vendeur dans la fenêtre 2 min.

### Project Structure Notes

- **Architecture §Requirements to Structure :** Prix, codes, produits (FR11–FR17, FR40, FR41) → webhook-processor (intent vendeur), live-item, media. Story 3.4 a livré uploadMediaAndLinkToLiveItem et le flux « CODE xQTE + photo » ; 3.5 ajoute le flux « photo seule → dernier code » dans le même worker.
- **Architecture §8 :** Médias en R2, chemins en DB ; traitement async (uploadMediaToLiveItem) inchangé.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.5] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#8 Data Storage] — Media R2, chemins en DB
- [Source: _bmad-output/implementation-artifacts/3-4-enregistrer-du-stock-prepare-via-whatsapp-code-xqte-photo-optionnelle.md] — uploadMediaAndLinkToLiveItem, flux vendeur CODE xQTE + photo
- [Source: _bmad-output/implementation-artifacts/3-2-unicite-du-code-par-tenant-id-live-session-id-code.md] — createLiveItem, getOrCreateCurrentSession

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- Le **vendeur** peut envoyer une **photo seule** (message sans texte code, ex. body vide ou texte non reconnu) après avoir créé ou édité un code. La photo doit être attachée au **dernier** LiveItem créé ou édité par ce vendeur dans la **session live courante**, si cet item a été touché dans les **2 dernières minutes** (fenêtre configurable en constante pour MVP).
- Si aucun code récent dans la fenêtre → réponse bot : **« Envoie d'abord CODE PRIX »** (FR41). Pas de création d’item à partir de la photo seule.
- Ne pas modifier le comportement 3.4 : message « CODE xQTE » + photo dans le même envoi reste géré comme aujourd’hui (photo liée à l’item créé par ce message).

### Technical Requirements

- **Détection « photo seule » :** Dans le bloc `if (tenantId && messageType === "seller")` du webhook-processor : si `parseCreateItemIntent(body)` est null et `mediaUrl` est présent → branche « photo seule » (Story 3.5). Sinon, garder le flux actuel (createItem → createLiveItem, puis si mediaUrl uploadMediaAndLinkToLiveItem).
- **Dernier code dans la fenêtre :** Requête Prisma : LiveItem où `tenantId`, `liveSessionId` = session courante, `updatedAt >= new Date(Date.now() - PHOTO_TO_LAST_CODE_WINDOW_MS)`, orderBy updatedAt desc, take 1. Utiliser `getOrCreateCurrentSession(tenantId)` pour obtenir la session ; si pas de session active, considérer qu’il n’y a pas de « dernier code ».
- **Liaison photo :** Réutiliser `uploadMediaAndLinkToLiveItem(tenantId, liveItemId, mediaUrl, correlationId)` sans modification. Réponse outbox : « Photo ajoutée à [code]. » (code = liveItem.code).
- **Fenêtre :** Constante `PHOTO_TO_LAST_CODE_WINDOW_MS = 2 * 60 * 1000` (2 min). À placer dans le module (ex. webhook-processor ou constantes partagées) ; pas de config tenant en MVP.

### Architecture Compliance

- **Stack :** Prisma (Neon), Cloudflare R2 pour médias. Conformité architecture §4 (Data), §8 (Media R2), §11 (Vercel + Railway).
- **Webhook / worker :** Tout dans le worker (flux vendeur). Réutiliser getOrCreateCurrentSession, uploadMediaAndLinkToLiveItem ; pas de nouveau service lourd.
- **Isolation tenant :** Toutes les requêtes filtrées par tenantId ; session courante par tenant.

### Library / Framework Requirements

- **Prisma :** Requête read-only (findFirst avec where, orderBy, take). Aucune migration nécessaire (LiveItem.updatedAt déjà présent).
- **R2 / media :** Inchangé par rapport à 3.4 (uploadMediaAndLinkToLiveItem).

### File Structure Requirements

- **Worker :** `src/server/workers/webhook-processor.ts` — dans le bloc vendeur, ajouter la branche « photo seule » après le traitement createItem (si !createItem && mediaUrl → get last code in window → uploadMediaAndLinkToLiveItem ou message « Envoie d'abord CODE PRIX »).
- **Optionnel :** Fonction helper dans `src/server/live-item/` pour « getLastEditedLiveItemInWindow(tenantId, windowMs) » si on veut garder le processor lisible ; sinon requête inline dans le worker.
- **Event log :** Optionnel : nouvel event_type `live_item_photo_linked` ou réutilisation de logLiveItemCreated avec payload étendu (source: "photo_alone") ; à aligner avec eventLog.ts existant.

### Testing Requirements

- Test : vendeur crée un code (A12 x1), puis 1 min après envoie une photo seule → dernier LiveItem = A12, photo liée (mediaStorageKey mis à jour), réponse « Photo ajoutée à A12. »
- Test : vendeur envoie une photo seule sans avoir créé de code dans les 2 min → réponse « Envoie d'abord CODE PRIX », pas de création d’item.
- Test : vendeur crée un code, 3 min après envoie une photo seule → réponse « Envoie d'abord CODE PRIX » (hors fenêtre).
- Test : ne pas casser 3.4 : message « A12 x5 » + mediaUrl → item créé avec availableQty 5 et photo liée comme aujourd’hui.

### Previous Story Intelligence (Story 3.4, 3.2)

- **Story 3.4 :** uploadMediaAndLinkToLiveItem(tenantId, liveItemId, mediaUrl, correlationId) : fetch Twilio → upload R2 → update LiveItem.mediaStorageKey. Appelé en async (void) depuis le worker. Si R2 non configuré, no-op. LiveItem a déjà mediaStorageKey (migration 20260209220000).
- **Story 3.2 :** createLiveItem(tenantId, code, { quantity }) ; getOrCreateCurrentSession(tenantId) pour la session courante. Le bloc vendeur actuel ne traite que lorsque parseCreateItemIntent(body) retourne un résultat ; il ne gère pas le cas « body vide + mediaUrl ».

### Git Intelligence Summary

- Derniers ajouts : createLiveItem (quantity, availableQty, reservedQty), uploadMediaAndLinkToLiveItem, webhook-processor (vendeur create item + photo optionnelle 3.4). Pour 3.5 : même worker, nouvelle branche « photo seule » + requête dernier LiveItem par updatedAt dans fenêtre 2 min.

### Latest Tech Information

- Aucune nouvelle dépendance. R2 et Twilio déjà en place (3.4). Prisma updatedAt géré automatiquement.

### Project Context Reference

- Structure T3 + architecture.md ; conventions du repo (tests à côté des modules). Médias : R2, pas de stockage dans public/.

### Story Completion Status

- **Status :** done
- **Note :** Contexte complet préparé pour l’agent dev ; analyse épics, architecture, stories 3.2 et 3.4.

---

## Senior Developer Review (AI)

- **Review outcome :** Approve (corrections appliquées)
- **Review date :** 2026-02-07
- **Findings :** 1 Medium, 3 Low — tous corrigés automatiquement.
- **Action items :** Aucun restant.

**Corrections appliquées :**
- [MEDIUM] Tests 3.5 : ajout de `expect(createLiveItem).not.toHaveBeenCalled()` dans les 3 tests « photo seule » (webhook-processor.test.ts).
- [LOW] PHOTO_TO_LAST_CODE_WINDOW_MS exportée (webhook-processor.ts).
- [LOW] JSDoc getLastEditedLiveItemInWindow : précision sur getOrCreateCurrentSession (getLastEditedLiveItemInWindow.ts).
- [LOW] Commentaire traçabilité event log vs upload async (webhook-processor.ts).

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Story 3.5 implémentée : détection « photo seule » (messageType seller, body vide ou non parseable, mediaUrl présent). Constante PHOTO_TO_LAST_CODE_WINDOW_MS = 2 min (exportée). Helper getLastEditedLiveItemInWindow(tenantId, windowMs) dans live-item. Branche dans webhook-processor : si dernier LiveItem en fenêtre → uploadMediaAndLinkToLiveItem + outbox « Photo ajoutée à [code]. » + logLiveItemPhotoLinked ; sinon outbox « Envoie d'abord CODE PRIX ». Event type live_item_photo_linked (payload code, source: photo_alone). Tests : webhook-processor (photo seule 1 min, sans code, 3 min, 3.4 inchangé + createLiveItem.not.toHaveBeenCalled dans les 3 tests 3.5), getLastEditedLiveItemInWindow, eventLog logLiveItemPhotoLinked. Code review : 4 findings (1 M, 3 L) corrigés.

### File List

- src/server/workers/webhook-processor.ts
- src/server/live-item/getLastEditedLiveItemInWindow.ts
- src/server/live-item/getLastEditedLiveItemInWindow.test.ts
- src/server/events/eventLog.ts
- src/server/workers/webhook-processor.test.ts
- src/server/events/eventLog.test.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/3-5-photo-vendeur-dernier-code-fenetre-2-min.md
