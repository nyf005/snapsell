# Story 3.2: Unicité du code par (tenant_id, live_session_id, code)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **garantir l'unicité d'un code dans (tenant_id, live_session_id, code)**,
so that **un même code ne désigne qu'un seul item par session**.

## Acceptance Criteria

1. **Given** une live_session active et un code déjà créé (ex. A12) dans cette session
   **When** le vendeur tente de créer à nouveau A12 ou le système enregistre un item
   **Then** la contrainte UNIQUE (tenant_id, live_session_id, code) est respectée ; si doublon, le bot répond « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … » (FR12, FR40)
   **And** FR12, FR40 couverts

## Tasks / Subtasks

- [x] Task 1 : Modèle LiveItem et contrainte d'unicité (AC: #1)
  - [x] Ajouter le modèle Prisma `LiveItem` (ou équivalent) avec champs tenantId, liveSessionId, code (normalisé trim + uppercase), et lien vers session ; optionnel : amountCents (prix dérivé), quantity (1 par défaut pour story 3.3).
  - [x] Contrainte UNIQUE (tenant_id, live_session_id, code) en base (Prisma @@unique).
  - [x] Migration Prisma créée et appliquée.
- [x] Task 2 : Création d'item et gestion du doublon (AC: #1)
  - [x] Lors de la création d'un item (message vendeur type « A12 » ou « A12 x1 »), résoudre la session live courante (service live-session existant), calculer le prix via `getPriceFromCode(tenantId, code)` (Story 3.1), puis tenter l'insertion.
  - [x] Si contrainte unique violée (code déjà présent pour ce tenant + session) : ne pas mettre à jour implicitement ; enqueuer une réponse outbox « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … » (FR40).
  - [x] Si succès : créer l'item, mettre à jour last_activity_at sur la session, répondre au vendeur (message de confirmation selon templates).
- [x] Task 3 : Intent vendeur et intégration worker (AC: #1)
  - [x] Dans le worker webhook (ou module intents), détecter le message vendeur comme intent « créer item » (pattern code seul ou code x quantité), appeler le service de création d'item qui applique la règle d'unicité.
  - [x] S'assurer que le routage vendeur vs client (Story 2.2) reste inchangé : seul un message identifié vendeur déclenche la création d'item ; un message client avec un code déclenchera la réservation (story 4.x).
- [x] Task 4 : Tests (AC: #1)
  - [x] Test unitaire ou intégration : créer un item A12 en session → succès ; recréer A12 même session → échec avec message « Code déjà utilisé… ».
  - [x] Test : même code A12 dans une autre session (autre tenant ou autre session) → autorisé (unicité par session).

## Dev Notes

- **FR couverts :** FR12 — Le système garantit l'unicité d'un code dans (tenant_id, live_session_id, code). FR40 — Si le vendeur renvoie un code déjà existant en session : pas d'update implicite ; bot répond « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … ».
- **Source épics :** Epic 3, Story 3.2 ; contrainte UNIQUE et message bot explicites.
- **Piège :** Ne pas faire d'update silencieuse en cas de doublon ; toujours répondre au vendeur avec le message prescrit. MODIF sera une story ultérieure ; pour 3.2 on se limite à refuser le doublon et indiquer l’option MODIF.

### Project Structure Notes

- **Architecture §Requirements to Structure :** Pricing / codes (FR11–FR13) → `src/server/whatsapp/intents.ts`, Prisma (live_items, category_prices). Story 3.1 a livré `src/server/pricing/getPriceFromCode`. Pour 3.2 : nouveau modèle `LiveItem` (ou `live_items` en DB), service de création d'item (ex. `src/server/live-session/` ou `src/server/live-item/`), appel depuis le worker webhook après routage vendeur.
- **Architecture §4 (Data) :** Unicité code : `UNIQUE (tenant_id, live_session_id, code)` (décision figée).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.2] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#5 Consistency & Concurrency] — Contraintes d'unicité
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns - Data] — Unicité (tenant_id, live_session_id, code)
- [Source: prisma/schema.prisma] — LiveSession existant ; ajouter LiveItem avec @@unique

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- En live, le vendeur envoie des codes (ex. A12, B7) pour créer des articles. Un même code ne peut exister qu’une seule fois **par session live** pour un tenant. Si le vendeur renvoie un code déjà créé dans la même session, le système ne doit pas écraser ni créer un doublon : il répond « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … ». La modification (MODIF) n’est pas dans le scope de cette story.

### Technical Requirements

- **Modèle :** `LiveItem` (ou nom aligné schéma) avec `tenantId`, `liveSessionId`, `code` (string normalisée : trim + uppercase pour comparaison et unicité). Optionnel pour 3.2 : `amountCents` (dérivé de la grille via `getPriceFromCode`), `quantity` (défaut 1). Relation `LiveSession` has many `LiveItem`.
- **Contrainte DB :** `@@unique([tenantId, liveSessionId, code])` sur le modèle Prisma. Pas de fallback applicatif : la base garantit l’unicité.
- **Création d’item :** Résoudre la session live courante (tenant + active + last_activity_at dans la fenêtre) via le service existant `src/server/live-session/service.ts` ; calculer le prix avec `getPriceFromCode(tenantId, code)` ; insérer en DB. En cas d’erreur Prisma `P2002` (unique constraint violation), ne pas modifier l’enregistrement existant ; enqueuer la réponse « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … » (template ou message fixe).
- **Normalisation du code :** Même règle que Story 3.1 (extraction catégorie) : trim + uppercase pour le champ `code` stocké et pour la contrainte, afin d’éviter doublons A12 vs a12.

### Architecture Compliance

- **Stack :** Prisma (Neon), pas de cache. Conformité architecture §4, §5 (contraintes uniques), §6 (live session).
- **Naming :** DB snake_case (ex. `live_items`, `tenant_id`, `live_session_id`, `code`). Prisma @map si besoin. Code TypeScript camelCase.
- **Webhook / worker :** La route webhook reste légère (< 1 s) ; la création d’item s’exécute dans le worker après enqueue (Story 2.1, 2.2). Pas de logique métier lourde dans la route.
- **Isolation tenant :** Toutes les requêtes filtrées par `tenantId` ; résolution de session par tenant.

### Library / Framework Requirements

- **Prisma :** Nouveau modèle + migration. Gérer `PrismaClientKnownRequestError` code `P2002` pour la contrainte unique.
- **Service live-session :** Réutiliser `getCurrentLiveSession(tenantId)` (ou équivalent) pour obtenir l’id de session avant création d’item. Si pas de session active, comportement à définir (créer la session selon Story 2.6 ou refuser avec message clair).
- Aucune nouvelle dépendance npm obligatoire.

### File Structure Requirements

- **Prisma :** `prisma/schema.prisma` — ajout du modèle `LiveItem` et relation depuis `LiveSession`. Migration dans `prisma/migrations/`.
- **Service item :** `src/server/live-item/createLiveItem.ts` (ou sous `src/server/live-session/` selon convention) — fonction qui prend tenantId, liveSessionId, code (normalisé), optionnel amountCents/quantity ; appelle getPriceFromCode si besoin ; insert ; catch P2002 → retourner un résultat « duplicate » pour que le worker envoie le message FR40.
- **Worker :** Adapter `src/server/workers/webhook-processor.ts` pour, lorsque le message est vendeur et le body correspond au pattern « code » (ou « code x qte »), appeler le service de création d’item et, selon le résultat (succès / duplicate), enqueuer la réponse appropriée.
- **Templates / messages :** Message « Code déjà utilisé… » soit dans `src/server/whatsapp/templates.ts` (ou équivalent) soit constante dans le module qui gère la création d’item.

### Testing Requirements

- Test : création d’un item avec code A12 dans une session → succès, un enregistrement en base avec (tenant_id, live_session_id, code) unique.
- Test : deuxième création A12 même tenant + même session → échec (P2002 ou retour « duplicate »), pas de second enregistrement, message « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … ».
- Test : même code A12 dans une autre session (autre live_session_id) ou autre tenant → autorisé (contrainte par session).
- Test optionnel : code normalisé (a12 → A12) pour unicité (a12 et A12 ne créent pas deux lignes).

### Previous Story Intelligence (Story 3.1)

- **Story 3.1 (Prix au code) :** Module `src/server/pricing/getPriceFromCode.ts` et `extractCategoryLetter`. Utiliser `getPriceFromCode(tenantId, code)` pour remplir `amountCents` sur LiveItem à la création. Ne pas réinventer la grille ni l’extraction de catégorie.
- **Patterns :** Prisma via `src/server/db.ts` ; pas de logique métier dans la route webhook ; tests unitaires avec DB mockée ou intégration avec test DB.
- **Story 2.6 (Live session) :** Service `src/server/live-session/service.ts` pour session courante et mise à jour `last_activity_at`. Réutiliser pour obtenir `liveSessionId` avant création d’item et mettre à jour l’activité après création.

### Git Intelligence Summary

- Derniers ajouts : `src/server/pricing/` (3.1), `src/server/live-session/` (2.6), `src/server/workers/webhook-processor.ts`. Nouveau modèle `LiveItem` et module `live-item` (ou sous live-session) s’alignent sur la structure existante.

### Latest Tech Information

- Prisma : gérer P2002 pour unique constraint. Pas de recherche web critique pour cette story.

### Project Context Reference

- Pas de `project-context.md` trouvé. Suivre structure T3 + architecture.md et conventions du repo (tests dans `tests/unit/` ou à côté des modules).

### Story Completion Status

- **Status :** ready-for-dev
- **Completion note :** Contexte story 3.2 complété — unicité du code par (tenant_id, live_session_id, code), contrainte DB, message FR40 en cas de doublon (FR12, FR40 couverts).

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1 : Modèle `LiveItem` ajouté dans `prisma/schema.prisma` avec `@@unique([tenantId, liveSessionId, code])`, relation `LiveSession` has many `LiveItem`. Migration `20260209210000_add_live_item_story_3_2` créée (à appliquer avec `npx prisma migrate deploy` ou `migrate dev`).
- Task 2 : Service `src/server/live-item/createLiveItem.ts` — `createLiveItem(tenantId, code, options?)` résout la session via `getOrCreateCurrentSession`, prix via `getPriceFromCode`, insert ; P2002 → `{ success: false, duplicate: true }`. Message FR40 via `messageCodeAlreadyUsed(code)`.
- Task 3 : Dans `webhook-processor.ts`, intent vendeur « créer item » : `parseCreateItemIntent(body)` (pattern code ou code x qte), appel `createLiveItem` ; en cas de succès outbox « Créé : A12 (x1). », en cas de doublon outbox message FR40.
- Task 4 : Tests unitaires `createLiveItem.test.ts` (succès, doublon P2002, invalid_code, même code autre session autorisé) ; tests `webhook-processor.test.ts` (parseCreateItemIntent, seller A12 → outbox confirmation, seller doublon → outbox FR40). Suite complète : 150 tests passent.
- **CR (correctifs)** : EventLog (architecture §3) — ajout `live_item_created` et `live_item_duplicate_rejected` dans `src/server/events/eventLog.ts` ; appel depuis webhook-processor après création / refus doublon ; `CreateLiveItemResult` étendu avec `liveSessionId` pour l’audit ; tests eventLog et worker mis à jour. Note de scope : les autres fichiers modifiés dans le repo sont hors périmètre 3-2.

### File List

- prisma/schema.prisma
- prisma/migrations/20260209210000_add_live_item_story_3_2/migration.sql
- src/server/live-item/createLiveItem.ts
- src/server/live-item/createLiveItem.test.ts
- src/server/workers/webhook-processor.ts
- src/server/workers/webhook-processor.test.ts
- src/server/events/eventLog.ts
- src/server/events/eventLog.test.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/3-2-unicite-du-code-par-tenant-id-live-session-id-code.md

*Note : Les autres fichiers modifiés dans le repo (DEPLOYMENT.md, route webhook Twilio, env, adapter, dashboard) sont hors périmètre story 3-2.*
