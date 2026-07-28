# Story 6.4: Live Ops (session en cours, réservations, libérer)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur ou agent**,
I want **consulter la session live en cours (éléments/codes, réservations) et libérer une réservation si besoin**,
so that **je garde le contrôle pendant ou après le live**.

## Acceptance Criteria

1. **Given** une session live active pour mon tenant  
   **When** j'accède à la vue Live Ops  
   **Then** je vois les items/codes de la session, les réservations en cours, et je peux libérer une réservation (FR32, FR33)  
   **And** FR32, FR33 couverts

## Tasks / Subtasks

- [x] Task 1 : API Live Ops — session courante et données (AC: #1)
  - [x] Exposer la « session live courante » du tenant : soit réutiliser la logique `getOrCreateCurrentSession` en lecture seule (session active avec `last_activity_at > now - INACTIVITY_WINDOW`), soit créer une procédure dédiée `live.getCurrentSession` qui retourne la session active ou null. Ne pas créer de session depuis le dashboard : lecture seule. Si aucune session active → afficher un état « Aucune session live en cours ».
  - [x] Procédure (ou procédures) tRPC pour le dashboard : `live.getCurrentSession` (session + lastActivityAt), `live.getSessionItems` (live_items de la session avec code, amountCents, quantity, availableQty, reservedQty, mediaStorageKey), `live.getSessionReservations` (réservations actives : status reserved | address_collected, avec liveItemId, clientPhone masqué/tronqué pour PII, expiresAt). Toutes les requêtes filtrées par `tenantId` depuis la session auth (isolation tenant stricte).
  - [x] Créer un router tRPC `live` (ou `liveSession`) dans `src/server/api/routers/`, l’enregistrer dans `root.ts`. Schémas Zod dans `live.schema.ts` si besoin (ids, pas de schéma lourd côté liste).

- [x] Task 2 : API libérer une réservation (AC: #1)
  - [x] Procédure `live.releaseReservation` (ou `reservations.releaseByVendeur`) : input `reservationId` (ou reservationId + tenantId implicite). Vérifier que la réservation appartient au tenant, qu’elle est en `reserved` ou `address_collected`, puis : (1) mettre à jour la réservation en `status = expired`, (2) appeler `releaseReservation(tenantId, liveItemId, { correlationId })` depuis `~/server/live-item/reservation.ts` pour décrémenter `reserved_qty` sur le LiveItem, (3) si une waitlist existe pour ce (liveItemId, liveSessionId), promouvoir le premier en file (réutiliser la logique du worker reservation-ttl ou un service partagé « promoteFirstFromWaitlist » si existant). Logger un événement d’audit : `reservation_expired` avec `actorType: "seller"` et payload contenant reservation_id, live_item_id, reason: "released_by_seller" (ou étendre eventLog avec un type dédié `reservation_released_by_seller` si souhaité pour distinguer expiration TTL vs manuelle).
  - [x] Isolation tenant : réservation et live_item doivent appartenir au tenant de la session ; sinon 404 ou 403.

- [x] Task 3 : UI Live Ops — page et composants (AC: #1)
  - [x] Compléter la page `src/app/(dashboard)/dashboard/live/page.tsx` : afficher la session courante (titre « Session live en cours » ou « Aucune session live en cours »), la liste des items (code, prix, quantités dispo / réservées), et la liste des réservations en cours (code item, client masqué ex. ***1234, statut, expiration). Utiliser les composants shadcn (Card, Table, Badge, Button) et le design system existant (orders, proofs). Données chargées via tRPC (getCurrentSession, getSessionItems, getSessionReservations) ; polling 30–60 s acceptable (NFR-P4) ou invalidation après action « Libérer ».
  - [x] Pour chaque réservation active : bouton « Libérer » qui appelle `live.releaseReservation(reservationId)`, avec confirmation courte (ConfirmDialog ou alert confirm) pour éviter les clics accidentels. Message de succès/erreur (role="alert" si erreur, aria-label sur le bouton).
  - [x] Accessibilité : labels clairs, structure sémantique (titres, listes). Pas d’affichage de numéros complets (PII) : tronquer ou masquer le client_phone.

- [x] Task 4 : Tests (AC: #1)
  - [x] Tests du router live : getCurrentSession retourne null si aucune session active pour le tenant ; avec session active en base, retourne la session et les items/réservations. Filtrage tenant : un tenant ne voit pas les données d’un autre tenant.
  - [x] Test releaseReservation : succès (réservation passée en expired, reserved_qty décrémenté, event_log avec actorType seller) ; 404 si réservation inexistante ou autre tenant ; 400 si réservation déjà confirmed/expired.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 6, Story 6.4 ; FR32, FR33.
- **Contexte :** Les pages `dashboard/live/page.tsx` et `dashboard/reservations/page.tsx` existent en placeholder (« À venir »). La story 6.4 se concentre sur la vue **Live Ops** (une seule vue qui agrège session + items + réservations + action Libérer). La page « Réservations » peut rester un redirect ou un alias vers Live Ops, ou afficher une liste cross-session selon le produit ; l’AC exige « consulter la session live en cours » donc priorité à la vue Live Ops unifiée.
- **Session courante :** Définie comme dans l’architecture §6 : session `active` avec `last_activity_at > now - INACTIVITY_WINDOW`. Le service `getOrCreateCurrentSession` dans `~/server/live-session/service.ts` crée une session si besoin ; pour le dashboard, une lecture seule (findFirst sans create) suffit pour éviter de créer une session vide à chaque visite.

### Project Structure Notes

- **Fichiers à créer / modifier :**
  - `src/server/api/routers/live.ts` (ou `liveSession.ts`) : router tRPC getCurrentSession, getSessionItems, getSessionReservations, releaseReservation.
  - `src/server/api/routers/live.schema.ts` : schémas Zod (ids, releaseReservation input).
  - `src/server/api/root.ts` : enregistrer le router live.
  - `src/app/(dashboard)/dashboard/live/page.tsx` : remplacer le placeholder par le contenu (session, items, réservations, bouton Libérer). Optionnel : composant client dans `_components/live-ops-content.tsx` pour tRPC et état.
  - Réutilisation : `~/server/live-session/service.ts` (lecture session active), `~/server/live-item/reservation.ts` (releaseReservation), `~/server/events/eventLog.ts` (log avec actorType seller). Si la promotion waitlist après libération manuelle doit réutiliser la même logique que le job TTL, extraire une fonction partagée (ex. dans `~/server/waitlist/` ou `reservation-ttl`) pour « expirer une réservation et promouvoir le premier en file ».
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] — §6 Live Session Auto, §3 Core Domain (LiveSession, LiveItem, Reservation, Waitlist) ; [Source: _bmad-output/implementation-artifacts/6-3-*.md] pour patterns UI (Select, aria-label, role="alert", STATUS_LABELS).

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR32 :** Le vendeur (ou agent) peut consulter les éléments/codes et réservations en cours pour une session de live (Live Ops minimal).
- **FR33 :** Le vendeur (ou agent) peut libérer une réservation ou intervenir manuellement (ex. libérer pour le suivant).
- **État actuel :** Page Live = placeholder. Aucun router tRPC pour live/session/réservations côté dashboard. Les services backend existent : `live-session/service.ts` (getOrCreateCurrentSession), `live-item/reservation.ts` (releaseReservation sur le stock), `reservation/service.ts` (création réservation client). Il faut exposer une API lecture seule pour la session courante + items + réservations, et une mutation « libérer une réservation » qui met la réservation en expired, décrémente reserved_qty, et promeut la waitlist si applicable.

### Technical Requirements

- **Session courante (lecture seule) :** Même critère que `getOrCreateCurrentSession` (session active + last_activity_at > now - INACTIVITY_WINDOW) mais sans créer de session. Si aucune → retourner null ; le front affiche « Aucune session live en cours ».
- **Libération :** Mettre Reservation.status = expired, appeler `releaseReservation(tenantId, liveItemId, correlationId)`, puis promouvoir le premier en waitlist si présent (même comportement que expiration TTL). Event log : `reservation_expired` avec actorType "seller" et payload raison "released_by_seller" (ou type dédié si l’équipe préfère).
- **PII :** Ne pas exposer client_phone en clair dans l’API/UI ; tronquer (ex. ***6789) ou masquer pour l’affichage.

### Architecture Compliance

- **Stack :** tRPC (router live), Prisma, Next.js App Router, shadcn/ui. Pas de nouvelle route REST. Pas de WebSocket (polling 30–60 s pour le dashboard, NFR-P4).
- **Isolation tenant :** Toutes les requêtes filtrées par tenantId issu de la session auth. Aucune donnée cross-tenant.
- **Naming :** DB snake_case (Prisma @map) ; API et front en camelCase (liveSessionId, clientPhone masqué).

### Library / Framework Requirements

- Aucune nouvelle dépendance. Réutiliser Zod, tRPC, Prisma, `releaseReservation` et eventLog existants.

### File Structure Requirements

- Nouveau router : `src/server/api/routers/live.ts` + `live.schema.ts`. Page : `src/app/(dashboard)/dashboard/live/page.tsx` (+ optionnel `_components/live-ops-content.tsx`). Tests : `live.test.ts` dans le même dossier que le router.

### Testing Requirements

- **Live router :** getCurrentSession (null si pas de session ; avec session en base retourne session + items + réservations). getSessionItems / getSessionReservations filtrés par tenant. releaseReservation : succès (status expired, reserved_qty décrémenté, event_log) ; 404/403 pour autre tenant ; 400 pour réservation déjà expired/confirmed.
- **Isolation :** Un tenant ne peut pas voir ni libérer les réservations d’un autre tenant.

---

## Previous Story Intelligence

- **Story 6.3 (Statut commande) :** Router orders, updateStatus, transitions, event_log, outbox. Patterns : Select/boutons pour action, STATUS_LABELS, aria-label, role="alert" pour erreurs. Fichier partagé `src/lib/order-status-transitions.ts`. Pour 6.4 : même pattern de mutation (releaseReservation) avec feedback succès/erreur et confirmation avant action destructive.
- **Story 6.2 (Proofs inbox) :** Page Proofs avec liste, actions Valider/Refuser, tRPC proofs.approve/reject. Pour 6.4 : liste de réservations avec action « Libérer », même pattern de bouton + confirmation.
- **Story 6.1 (Liste commandes) :** Filtres, tableau, StatusBadge. Pour 6.4 : tableau ou cartes pour items et réservations, pas de filtres complexes en MVP (une seule session courante).
- **Backend existant :** `releaseReservation` dans `live-item/reservation.ts` ne met pas à jour la table Reservation (elle ne gère que reserved_qty sur LiveItem). Pour « libérer une réservation » côté vendeur, il faut en plus : mettre à jour Reservation.status = expired et, si besoin, appeler la logique de promotion waitlist (voir reservation-ttl worker).

---

## Project Context Reference

- **Config :** INACTIVITY_WINDOW (live session) dans env ou config tenant ; RESERVATION_TTL_* pour référence. Pas de config spécifique Live Ops.
- **Conventions :** TypeScript strict, Prisma, tRPC, shadcn/ui ; tests Vitest (live.test.ts).

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

(Optionnel)

### Completion Notes List

- **Task 1:** `getCurrentSessionReadOnly` ajouté dans `~/server/live-session/service.ts` (lecture seule, même critère INACTIVITY_WINDOW). Router `live` avec `getCurrentSession`, `getSessionItems`, `getSessionReservations` ; schéma `live.schema.ts` (releaseReservationInputSchema). Enregistrement dans `root.ts`.
- **Task 2:** `live.releaseReservation` : vérification tenant + statut actif, update Reservation → expired, appel `releaseReservation` (live-item), log `reservation_expired` via `logEvent` avec `actorType: "seller"` et `reason: "released_by_seller"`, promotion waitlist (findFirst + createReservation + delete waitlist + logWaitlistPromoted + writeToOutbox) comme dans reservation-ttl.
- **Task 3:** Page Live remplacée par `LiveOpsContent` (client) : session courante / « Aucune session live en cours », tableaux items (code, prix, dispo/réservées) et réservations (code, client masqué ***1234, statut, expiration), bouton Libérer avec AlertDialog de confirmation, polling 45 s, role="alert" pour erreurs, aria-label sur le bouton.
- **Task 4:** `live.test.ts` : getCurrentSession (null / avec session), getSessionItems/getSessionReservations (vide si pas de session, filtrés tenant, clientPhoneMasked), releaseReservation (404 not found, 404 autre tenant, 400 confirmed/expired, succès + event_log actorType seller, promotion waitlist).

### Change Log

- 2026-02-09 : Code review (CR 6-4). Corrections : rollback réservation + CONFLICT si releaseReservation échoue ; message de succès UI « Réservation libérée. ». Statut → done.
- 2026-02-09 : « Corrige tout » : getLiveOpsData (1 appel), validation CUID reservationId, tests isolation tenant + CUID ; live.schema.test.ts ajouté.

### File List

- src/server/live-session/service.ts (modifié : getCurrentSessionReadOnly)
- src/server/api/routers/live.schema.ts (créé, puis modifié : cuidSchema)
- src/server/api/routers/live.schema.test.ts (créé)
- src/server/api/routers/live.ts (créé, puis modifié : getLiveOpsData, rollback, CUID)
- src/server/api/root.ts (modifié : liveRouter)
- src/app/(dashboard)/dashboard/live/page.tsx (modifié : LiveOpsContent)
- src/app/(dashboard)/dashboard/live/_components/live-ops-content.tsx (créé, puis modifié : getLiveOpsData, message succès)
- src/server/api/routers/live.test.ts (créé, puis modifié : getLiveOpsData, isolation, CUID)

---

## Senior Developer Review (AI)

**Date :** 2026-02-09  
**Reviewer :** Code Review Agent (adversarial)  
**Outcome :** Changes Requested → **Corrections appliquées**

### Résumé

- **Git vs File List :** Aucune divergence pour les fichiers 6-4 (story scope correct).
- **AC :** Tous les critères d’acceptation sont implémentés (session courante, items, réservations, libérer, PII masqué).
- **Tasks [x] :** Toutes les tâches sont réellement réalisées et couvertes par les tests.

### Problèmes identifiés et traités

| Sévérité | Description | Statut |
|----------|-------------|--------|
| **HIGH** | Si `releaseReservation()` échouait (ex. `no_reservation`), la réservation restait en `expired` sans décrément de `reserved_qty` → état incohérent. | **Corrigé** : rollback du statut de la réservation en cas d’échec + throw `CONFLICT` avec message explicite. Test ajouté. |
| **MEDIUM** | Story exige « Message de succès/erreur » ; seul l’erreur était affiché (role="alert"). | **Corrigé** : message de succès « Réservation libérée. » avec role="status", disparition après 4 s. |
| **LOW** | Triple appel à `getCurrentSessionReadOnly` par chargement. | **Corrigé** : procédure unique `getLiveOpsData` (1 appel session + Promise.all items + reservations). UI bascule sur getLiveOpsData. |
| **LOW** | `releaseReservationInputSchema` : pas de format CUID. | **Corrigé** : schéma CUID (20–36 caractères, ^c[a-z0-9]+$). Tests + live.schema.test.ts. |
| **LOW** | Tests d’isolation tenant pour getSessionItems/getSessionReservations. | **Corrigé** : test « tenant isolation: tenant2 receives only tenant2 session and data » dans getLiveOpsData. |

### Action Items (résolus ou optionnels)

- [x] [HIGH] Rollback statut réservation + CONFLICT si `releaseReservation` échoue — **fait** (live.ts + live.test.ts)
- [x] [MEDIUM] Afficher un message de succès après « Libérer » — **fait** (live-ops-content.tsx)
- [x] [LOW] Réduire les appels à getCurrentSessionReadOnly — **fait** (getLiveOpsData + UI)
- [x] [LOW] Valider format CUID sur `reservationId` — **fait** (live.schema.ts + live.schema.test.ts)

### Checklist validation

- AC croisés avec l’implémentation : OK
- File List cohérente avec les changements 6-4 : OK
- Tests identifiés et couvrant les AC : OK (17 tests live + 5 tests schéma, dont getLiveOpsData, isolation tenant, CUID)
- Qualité / sécurité : isolation tenant, PII masqué, rollback en cas d’échec : OK
- Statut après review : **done** (corrections appliquées, pas de HIGH/MEDIUM restant)
