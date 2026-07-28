# Story 3.3: Créer un item unique (code non préparé, quantité 1)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur**,
I want **qu'un client puisse réserver un code au format libre (ex. A12, B7) sans que je l'aie enregistré à l'avance**,
so that **l'article soit traité comme unique (quantité 1)**.

## Acceptance Criteria

1. **Given** une session live active et une grille catégories→prix
   **When** un client réserve un code qui n'a pas été enregistré en stock préparé
   **Then** le système crée un live_item avec quantité 1 (article unique) et applique le prix via la lettre du code (FR13, FR14)
   **And** FR13, FR14 couverts

## Tasks / Subtasks

- [x] Task 1 : Création à la demande (client envoie un code inexistant) (AC: #1)
  - [x] Dans le worker webhook, lorsque le message est **client** (pas vendeur) et que le body correspond à un code (pattern réservation), rechercher un LiveItem existant pour (tenant_id, live_session_id, code).
  - [x] Si aucun LiveItem n'existe : créer un LiveItem avec code (normalisé), quantity = 1, amountCents via getPriceFromCode(tenantId, code), lié à la session courante (getOrCreateCurrentSession).
  - [x] Réutiliser la logique de session et de prix (Story 3.1, 3.2) ; ne pas dupliquer la création côté vendeur (3.2) — uniquement ajouter le chemin « client envoie code → item absent → créer item qty 1 ».
- [x] Task 2 : Unicité et cohérence (AC: #1)
  - [x] S'assurer que la contrainte UNIQUE (tenant_id, live_session_id, code) reste respectée : la création « à la demande » utilise le même modèle et la même normalisation (trim + uppercase) que createLiveItem (3.2).
  - [x] En cas de race (deux clients envoient le même code en même temps), une seule création doit gagner ; l'autre peut soit réutiliser l'item créé soit recevoir une réponse cohérente (réservation sur l'item existant).
- [x] Task 3 : Intent client « code » et intégration (AC: #1)
  - [x] Dans le webhook-processor, après routage vendeur vs client : pour un message **client** avec body = code (ex. A12), appeler une logique « resolveOrCreateLiveItem » : si item existe → le retourner ; sinon créer avec qty 1 et prix, puis retourner.
  - [x] Ne pas envoyer de message de « création item » au client (c'est une réservation) ; la réponse au client (réservé / file / épuisé) sera gérée en Epic 4. Pour 3.3, se limiter à garantir que l'item existe avec qty 1 et prix.
- [x] Task 4 : Tests (AC: #1)
  - [x] Test : client envoie un code A12, aucun item en session → un LiveItem est créé avec code A12, quantity 1, amountCents dérivé de la grille.
  - [x] Test : client envoie A12 une deuxième fois (item déjà créé) → pas de second item, même item réutilisé.
  - [x] Test : deux messages client avec même code (simulation concurrence) → un seul item créé, contrainte unique respectée.

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Ajouter test unitaire dans `eventLog.test.ts` pour `logLiveItemCreated(..., { actorType: "client" })`.
- [x] [AI-Review][LOW] Aligner le libellé Story (« As a vendeur » → bénéfice client ou reformuler).
- [x] [AI-Review][LOW] Mettre à jour ou supprimer la section « Story Completion Status » (obsolète).

## Dev Notes

- **FR couverts :** FR13 — Le vendeur peut utiliser des codes au format libre sans catalogue préalable. FR14 — Le système peut traiter un code non préparé comme article unique (quantité 1).
- **Source épics :** Epic 3, Story 3.3 ; création d’un live_item à la demande quand un client « réserve » un code non encore enregistré.
- **Piège :** Ne pas confondre avec la création par le vendeur (Story 3.2) : ici le déclencheur est un **message client** (code envoyé pour réserver). La réponse « réservé / file / épuisé » est Epic 4 ; en 3.3 on assure uniquement que l’item existe avec qty 1 et prix.

### Project Structure Notes

- **Architecture §Requirements to Structure :** Pricing / codes (FR11–FR13) → `src/server/whatsapp/intents.ts`, Prisma (live_items). Story 3.2 a livré `createLiveItem` (vendeur). Pour 3.3 : même modèle LiveItem ; nouveau chemin « resolveOrCreateLiveItem » (ou équivalent) appelé depuis le flux client (webhook-processor) lorsque le code n’existe pas encore.
- **Architecture §4 (Data) :** LiveItem inchangé ; quantity = 1 pour article « non préparé » ; pas de stock préparé (reserved_qty/available_qty) pour ce cas — à distinguer de la story 3.4 (stock préparé).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.3] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#4 Key Flows] — Pipeline message entrant, routage vendeur vs client
- [Source: _bmad-output/implementation-artifacts/3-2-unicite-du-code-par-tenant-id-live-session-id-code.md] — createLiveItem, unicité, normalisation code

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- En live, un **client** peut envoyer un code (ex. A12) pour réserver. Si ce code n’a pas été créé par le vendeur (Story 3.2) ni enregistré en stock préparé (Story 3.4), le système doit **créer à la volée** un LiveItem avec quantité 1 (article unique) et appliquer le prix via la grille (getPriceFromCode). Ainsi, le vendeur n’a pas besoin de « préparer » tous les codes à l’avance ; un code libre est traité comme unique (FR13, FR14). La réponse au client (réservé / file / épuisé) sera implémentée en Epic 4 ; cette story se limite à garantir l’existence de l’item avec qty 1 et prix.

### Technical Requirements

- **Modèle :** Réutiliser `LiveItem` (Story 3.2). Pour un item « non préparé » : quantity = 1 ; amountCents dérivé de `getPriceFromCode(tenantId, code)`. Pas de champs reserved_qty/available_qty à gérer pour ce cas (article unique = 1 unité, la « réservation » consomme l’unique place).
- **Résolution ou création :** Fonction du type `resolveOrCreateLiveItem(tenantId, liveSessionId, code)` : si un LiveItem existe pour (tenantId, liveSessionId, code) → le retourner ; sinon créer avec code normalisé (trim + uppercase), quantity = 1, amountCents = getPriceFromCode(tenantId, code), puis retourner. Utiliser la même normalisation et la même contrainte UNIQUE que createLiveItem.
- **Concurrence :** Deux clients envoyant le même code en même temps : une seule insertion doit réussir (contrainte UNIQUE) ; l’autre peut faire un SELECT après échec P2002 et récupérer l’item créé par le premier (pattern « get or create » avec retry read-after-conflict si besoin).

### Architecture Compliance

- **Stack :** Prisma (Neon), pas de cache. Conformité architecture §4, §5, §6.
- **Webhook / worker :** La création d’item à la demande s’exécute dans le worker (flux client), pas dans la route webhook. Réutiliser getOrCreateCurrentSession (ou équivalent) pour la session ; getPriceFromCode pour le prix.
- **Isolation tenant :** Toutes les requêtes filtrées par tenantId ; session résolue par tenant.

### Library / Framework Requirements

- **Prisma :** Pas de nouveau modèle ; réutilisation de LiveItem. Gérer P2002 en cas de race (réessayer une lecture pour obtenir l’item créé par l’autre requête).
- **Service live-session :** Réutiliser getOrCreateCurrentSession(tenantId) pour obtenir ou créer la session active (Story 2.6).
- **Pricing :** Réutiliser getPriceFromCode(tenantId, code) (Story 3.1).

### File Structure Requirements

- **Service item :** Étendre ou ajouter dans `src/server/live-item/` une fonction `resolveOrCreateLiveItem(tenantId, liveSessionId, code)` (ou `getOrCreateLiveItemForCode`) qui fait findFirst puis create si absent. Éviter duplication avec createLiveItem (vendeur) : factoriser la création (normalisation, prix, quantity) si possible.
- **Worker :** Dans `src/server/workers/webhook-processor.ts`, pour le flux **client** avec intent « réserver code » : avant toute logique de réservation (Epic 4), appeler resolveOrCreateLiveItem pour garantir que l’item existe ; ensuite, pour 3.3, on ne fait pas encore la réservation complète (message « réservé ») — à documenter comme « item créé si besoin, prêt pour Epic 4 » ou implémenter un premier message minimal si le product owner le souhaite.
- **Event log :** Si création à la demande, enregistrer un événement du type `live_item_created` (client-triggered) pour traçabilité, aligné avec Story 3.2.

### Testing Requirements

- Test : message client avec code A12, aucun item en session → après traitement, un LiveItem existe avec (tenant_id, live_session_id, code=A12), quantity 1, amountCents cohérent avec la grille.
- Test : message client A12 une deuxième fois → même item, pas de doublon.
- Test : concurrence (deux appels resolveOrCreateLiveItem pour même (tenant, session, code)) → un seul enregistrement en base, les deux appels retournent le même item (ou un succès et un « read after P2002 »).

### Previous Story Intelligence (Story 3.2)

- **Story 3.2 (Unicité code) :** createLiveItem(tenantId, code, options?) pour le **vendeur** ; contrainte @@unique([tenantId, liveSessionId, code]) ; normalisation trim + uppercase ; getPriceFromCode pour amountCents ; P2002 → message « Code déjà utilisé… ». Ne pas dupliquer la logique de création : en extraire une fonction interne (ex. createLiveItemRecord) réutilisable par resolveOrCreateLiveItem.
- **Event log :** live_item_created, live_item_duplicate_rejected déjà en place ; ajouter si besoin un variant pour « client-triggered » création (optionnel).
- **Webhook-processor :** Routage vendeur vs client déjà en place ; intent vendeur « créer item » (3.2) vs intent client « code » (réservation) ; pour client + code, appeler resolveOrCreateLiveItem avant la logique réservation (Epic 4).

### Git Intelligence Summary

- Derniers ajouts : `src/server/live-item/createLiveItem.ts`, `src/server/workers/webhook-processor.ts`, eventLog (live_item_created, live_item_duplicate_rejected). Pour 3.3 : même module live-item, nouvelle fonction resolveOrCreateLiveItem ; webhook-processor étendu pour le chemin client + code.

### Latest Tech Information

- Aucune recherche web critique pour cette story ; stack inchangé (Prisma, T3, BullMQ).

### Project Context Reference

- Structure T3 + architecture.md ; conventions du repo (tests à côté des modules ou dans tests/unit/).

### Story Completion Status (obsolete — see Dev Agent Record)

- **Status :** review → done after code review fixes

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- **Story 3.3 implémentée (2026-02-07).** resolveOrCreateLiveItem
- **Code review (2026-02-07).** Corrections : test eventLog pour actorType "client", libellé Story aligné, section Story Completion Status mise à jour.(tenantId, liveSessionId, code) dans `src/server/live-item/createLiveItem.ts` : findFirst puis create si absent (quantity 1, getPriceFromCode) ; en cas de P2002, read-after-conflict (findFirstOrThrow). createLiveItem refactorisé pour utiliser createLiveItemRecord (factorisation). Webhook-processor : pour message client avec body match CLIENT_CODE_PATTERN et liveSessionId, appelle resolveOrCreateLiveItem ; si created, logLiveItemCreated avec actorType "client". eventLog.logLiveItemCreated accepte option actorType "seller" | "client". Tests : resolveOrCreateLiveItem.test.ts (5 tests), webhook-processor 2 tests Story 3.3, createLiveItem tests inchangés (7). Tous les 159 tests passent.

### File List

- src/server/live-item/createLiveItem.ts
- src/server/live-item/resolveOrCreateLiveItem.test.ts
- src/server/workers/webhook-processor.ts
- src/server/workers/webhook-processor.test.ts
- src/server/events/eventLog.ts
- src/server/events/eventLog.test.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/3-3-creer-un-item-unique-code-non-prepare-quantite-1.md

---

## Senior Developer Review (AI)

**Review date:** 2026-02-07  
**Reviewer:** Code Review workflow (adversarial)

**Outcome:** Approve (après corrections automatiques)

**Git vs Story:** Fichiers de la story cohérents avec les changements.

### Action Items (tous traités)

- [x] [AI-Review][MEDIUM] **Couverture test eventLog** — Test ajouté dans `eventLog.test.ts` pour `logLiveItemCreated(..., { actorType: "client" })`.
- [x] [AI-Review][LOW] **Story wording** — Libellé Story reformulé : « qu'un client puisse réserver un code ... sans que je l'aie enregistré à l'avance » (bénéfice vendeur explicite).
- [x] [AI-Review][LOW] **Section obsolète** — « Story Completion Status » mise à jour (référence Dev Agent Record).

---

## Change Log

- 2026-02-07: Code review (AI) — Changes Requested. 1 MEDIUM (test eventLog actorType client), 2 LOW (wording story, section obsolète).
- 2026-02-07: Corrections appliquées (option 1). Test eventLog actorType client ajouté ; libellé Story et section Story Completion Status mis à jour. Statut → done.
