# Story 8.3: Lancer le live par clic (bouton dashboard)

Status: done

<!-- Dépendance : utilisée par 8.1 pour déterminer « en live » (getCurrentSessionReadOnly). La session est démarrée explicitement par le vendeur, pas par le premier message WhatsApp. -->

## Ce que cette story corrige

- **Aujourd'hui :** Une session live est créée **implicitement** dès qu'un message WhatsApp arrive (vendeur ou client) via `getOrCreateCurrentSession` dans le webhook. Le vendeur peut donc « être en live » sans le vouloir (ex. il alimente son catalogue par WhatsApp). Pas d'action explicite « je lance mon live ».
- **Après :** La session live est créée **uniquement** quand le vendeur clique sur « Lancer le live » dans le dashboard. Le webhook ne crée plus de session sur un message entrant. « Être en live » = avoir cliqué sur le bouton ; la création à la volée (8.1) et l'affichage Live Ops s'appuient sur cette session explicite.
- **Stories qu'on fait évoluer :** **2.6** (création/réactivation session au premier message → session créée uniquement au clic sur « Lancer le live » ; le webhook ne appelle plus getOrCreateCurrentSession pour les messages entrants), **6.4 / 6.6** (bouton « Lancer le live » ne faisait que naviguer vers `/dashboard/live` → il appelle maintenant l’API startLive pour créer la session).

## Contexte

Aujourd’hui une session live est créée **implicitement** dès qu’un message WhatsApp arrive (vendeur ou client) via `getOrCreateCurrentSession` dans le webhook. Or le vendeur peut envoyer des messages pour alimenter son catalogue **sans** être en live. Pour que « être en live » soit clair et que la création à la volée (story 8.1) ne s’applique qu’en live, on rend le **démarrage du live explicite** : le bouton « Lancer le live » du dashboard crée (ou réactive) la session.

## Story

As a **vendeur**,
I want **lancer mon live en cliquant sur un bouton dans le dashboard**,
so that **une session live soit active uniquement quand je le décide, et que les clientes puissent réserver les codes que je présente (création à la volée en live, story 8.1)**.

## Acceptance Criteria

1. **Given** je suis connecté au dashboard et aucune session live n’est active  
   **When** je clique sur « Lancer le live » (carte Session Live)  
   **Then** une session live est créée (status active, last_activity_at = now)  
   **And** je suis redirigé (ou la page se met à jour) pour voir la page live avec « session en cours »

2. **Given** une session live est déjà active (dans la fenêtre d’inactivité)  
   **When** je clique sur « Lancer le live » ou « Voir le live »  
   **Then** aucune nouvelle session n’est créée ; la session existante est réutilisée (optionnel : last_activity_at mis à jour)  
   **And** j’accède à la page live

3. **Given** le webhook reçoit un message **vendeur** (ex. code, code x qte pour alimenter le catalogue)  
   **When** aucune session n’est active  
   **Then** on **ne crée pas** de session pour ce message (pas d’appel getOrCreateCurrentSession pour l’intent vendeur « créer item » si pas de session). Le vendeur peut alimenter le catalogue par WhatsApp sans démarrer un live.  
   **And** si une session est active : comportement inchangé (createLiveItem / upsert catalogue selon 8.2).

4. **Given** le webhook reçoit un message **client** (ex. code pour réserver)  
   **When** aucune session n’est active  
   **Then** on **ne crée pas** de session (story 8.1 : getCurrentSessionReadOnly uniquement ; lookup catalogue seul, pas de création à la volée).

## Tasks / Subtasks

- [x] Task 1 : API « Démarrer le live » (AC: #1, #2)
  - [x] Exposer une procédure tRPC (ex. `live.startLive` ou `dashboard.startLive`) qui appelle `getOrCreateCurrentSession(tenantId)`. Retourner la session (id, lastActivityAt) ou l'équivalent pour que le front affiche « en cours ».
  - [x] Si session déjà active : retourner cette session (getOrCreateCurrentSession le fait déjà). Optionnel : logger `logLiveSessionCreated` uniquement quand `session.created === true`.

- [x] Task 2 : Bouton « Lancer le live » appelle l'API (AC: #1, #2)
  - [x] Dans `dashboard-content.tsx` (ou équivalent), le bouton « Lancer le live » : au clic, appeler la procédure `startLive` (ou `live.startLive`) puis rediriger vers `/dashboard/live` (ou rafraîchir les données pour afficher « Voir le live »).
  - [x] Gérer le cas « déjà en live » : si `hasLiveSession` est déjà true, le lien peut rester « Voir le live » sans appeler startLive. Si on veut un seul bouton « Lancer / Voir le live », appeler startLive à chaque clic (idempotent).
  - [x] UX : loading state pendant l'appel, message d'erreur si échec.

- [x] Task 3 : Webhook — ne plus créer de session sur message vendeur ou client (AC: #3, #4)
  - [x] Dans `webhook-processor.ts`, **supprimer** (ou conditionner) le bloc qui appelle `getOrCreateCurrentSession` pour tout message « live signal » ou « client non vide ». La session n'est plus créée par le webhook ; elle est créée uniquement par le clic sur « Lancer le live » (Task 1).
  - [x] Conséquence : pour l'intent **vendeur** « créer item » (code / code x qte) : si pas de session active, ne pas appeler getOrCreateCurrentSession ; uniquement upsert catalogue (story 8.2). Si session active : garder le flux actuel (createLiveItem ou équivalent 8.2).
  - [x] Pour l'intent **client** « code » : déjà géré en 8.1 avec getCurrentSessionReadOnly (pas de création de session).

- [x] Task 4 : Tests (AC: #1–#4)
  - [x] Test API : appel `startLive` sans session → session créée ; appel avec session active → même session retournée.
  - [x] Test webhook : message vendeur sans session active → pas d'appel getOrCreateCurrentSession (ou pas de création de session) ; upsert catalogue seul. Message client sans session → getCurrentSessionReadOnly null, findOrderableItemByCode seul (8.1).
  - [x] Test E2E ou manuel : clic « Lancer le live » → session créée, redirection vers page live, hasLiveSession true.

## Dev Agent Record

### Agent Model Used
- claude-sonnet-4-5-20250929

### Debug Log References
- None

### Completion Notes
- Implemented `live.startLive` tRPC mutation that calls `getOrCreateCurrentSession` and logs session creation only when `created === true`
- Updated dashboard button "Lancer le live" to call the mutation and redirect to `/dashboard/live` on success
- Added loading state ("Démarrage...") during API call
- Removed `getOrCreateCurrentSession` calls from webhook-processor.ts (lines 243-265)
- Webhook now uses `getCurrentSessionReadOnly` for both seller and client messages
- Session creation is now explicit via dashboard button click only
- Added comprehensive tests in `live.test.ts` for startLive mutation (4 new tests)
- Updated webhook-processor tests to reflect new behavior (2 updated tests)
- All tests passing (437 tests total)

### File List
- `src/server/api/routers/live.ts` - Added startLive mutation
- `src/server/api/routers/live.test.ts` - Added tests for startLive
- `src/app/(dashboard)/dashboard/_components/dashboard-content.tsx` - Updated button to call startLive API
- `src/server/workers/webhook-processor.ts` - Removed getOrCreateCurrentSession, now uses getCurrentSessionReadOnly only
- `src/server/workers/webhook-processor.test.ts` - Updated tests for webhook behavior changes

### Change Log
- 2026-02-11: Implemented story 8.3 - Live session now starts explicitly via dashboard button click
- 2026-02-11: Code Review (Opus 4.6) — 6 issues fixed:
  - M1: Added onError + error display to startLive mutation (dashboard-content.tsx)
  - M2: Removed redundant double getCurrentSessionReadOnly call in webhook-processor.ts (seller create-item)
  - M3: Removed dead code `if (!tenantId)` checks in all liveRouter handlers (enforceTenant middleware handles it)
  - M4: Added test for getOrCreateCurrentSession failure propagation in startLive
  - L1: Renamed isLiveSignal → shouldReadSession (name reflects post-8.3 purpose)
  - L2: Simplified double assertion in "throws FORBIDDEN" test

## Dev Notes

- **Ordre :** Implémenter 8.3 avant ou en parallèle de 8.1 Task 3 (webhook) pour que « en live » soit bien défini par le bouton. On peut livrer 8.3 en premier (bouton + API), puis adapter le webhook dans 8.1.
- **Fichiers concernés :**
  - `src/server/api/routers/live.ts` (ou `dashboard.ts`) — procédure `startLive` appelant `getOrCreateCurrentSession`.
  - `src/app/(dashboard)/dashboard/_components/dashboard-content.tsx` — bouton « Lancer le live » appelle startLive puis navigation.
  - `src/server/workers/webhook-processor.ts` — retirer (ou conditionner) l’appel getOrCreateCurrentSession pour les messages entrant ; intent vendeur « créer item » sans session → pas de création session, upsert catalogue seul.
- **Option secours :** Si on souhaite garder un fallback « premier message WhatsApp crée la session » (ex. vendeur a oublié de cliquer), on peut documenter ce choix en Dev Notes ; par défaut on suit AC #3 et #4 (pas de création par webhook).
