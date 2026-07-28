# Story 9.1: Refactorer CATALOGUE_SESSION_SENTINEL dans Waitlist

Status: done

<!-- Dette technique identifiée en rétro Epic 8. Le workaround stocke catalogueItemId dans le champ liveItemId et utilise une valeur sentinelle "catalogue" dans liveSessionId. -->

## Ce que cette story corrige

- **Aujourd'hui :** Quand un article catalogue est en rupture et qu'un client est ajouté en file d'attente, le code utilise un workaround : `liveSessionId = "catalogue"` (sentinel) et `liveItemId = catalogueItemId` (champ détourné). Lors de la promotion (TTL ou libération manuelle), chaque consommateur doit vérifier `liveSessionId === CATALOGUE_SESSION_SENTINEL` pour reconstruire le bon appel. 4 fichiers contiennent cette logique conditionnelle fragile.
- **Après :** La table Waitlist a un vrai champ nullable `catalogueItemId`. Le champ `liveSessionId` devient nullable. La logique sentinel disparaît. Les consommateurs utilisent `waitlistEntry.catalogueItemId` directement.

## Story

As a **développeur**,
I want **remplacer le workaround CATALOGUE_SESSION_SENTINEL par un vrai champ `catalogueItemId` nullable sur Waitlist**,
so that **le modèle reflète le domaine, la logique sentinel fragile est supprimée, et le code est plus lisible et maintenable**.

## Acceptance Criteria

1. **Given** la table Waitlist en base
   **When** la migration est appliquée
   **Then** un nouveau champ nullable `catalogue_item_id` (String?) existe sur Waitlist
   **And** le champ `live_session_id` est nullable (String?)
   **And** le champ `live_item_id` est nullable (String?)
   **And** une contrainte CHECK garantit que exactement l'un des deux est renseigné : (`live_item_id` IS NOT NULL AND `live_session_id` IS NOT NULL) OR (`catalogue_item_id` IS NOT NULL)
   **And** les données existantes (s'il y en a) sont migrées correctement

2. **Given** un article catalogue en rupture de stock
   **When** un client envoie le code par WhatsApp
   **Then** le client est ajouté en file d'attente avec `catalogueItemId = <id>`, `liveItemId = null`, `liveSessionId = null`
   **And** la constante `CATALOGUE_SESSION_SENTINEL` n'est plus utilisée

3. **Given** un client en file d'attente pour un article catalogue (TTL expire sur une réservation précédente)
   **When** le worker reservation-ttl promeut le premier en file
   **Then** il utilise `waitlistEntry.catalogueItemId` directement (pas de vérification sentinel)
   **And** `createReservation` est appelé avec `catalogueItemId` et `liveSessionId = null`

4. **Given** un vendeur libère manuellement une réservation sur un article catalogue
   **When** le router live.releaseReservation traite la libération
   **Then** la promotion utilise `waitlistEntry.catalogueItemId` directement

5. **Given** la contrainte d'unicité waitlist
   **When** un même client tente de rejoindre deux fois la file pour le même article catalogue
   **Then** l'unicité est respectée (idempotence)
   **And** l'index unique est adapté pour supporter les nullable (partial unique index ou compound)

## Tasks / Subtasks

- [x] Task 1 : Migration Prisma (AC: #1, #5)
  - [x] Ajouter `catalogueItemId String? @map("catalogue_item_id")` sur le modèle Waitlist
  - [x] Rendre `liveSessionId` nullable (`String?`)
  - [x] Rendre `liveItemId` nullable (`String?`)
  - [x] Ajouter relation `catalogueItem CatalogueItem? @relation(fields: [catalogueItemId], references: [id])`
  - [x] Ajouter contrainte CHECK : `(live_item_id IS NOT NULL AND live_session_id IS NOT NULL) OR (catalogue_item_id IS NOT NULL)`
  - [x] Adapter l'index unique : remplacer `@@unique([tenantId, liveSessionId, clientPhone, liveItemId])` par deux partial unique indexes (un pour live, un pour catalogue) ou un compound qui gère les nullables
  - [x] Migrer les données existantes : entrées avec `liveSessionId = "catalogue"` → `catalogueItemId = liveItemId, liveItemId = null, liveSessionId = null`

- [x] Task 2 : Refactorer `addToWaitlist.ts` (AC: #2)
  - [x] Modifier la signature pour accepter `catalogueItemId` en option (au lieu de squatter `liveItemId`)
  - [x] Supprimer `CATALOGUE_SESSION_SENTINEL`
  - [x] Quand `options.table === "catalogue_items"` : insérer avec `catalogueItemId` et `liveItemId = null, liveSessionId = null`
  - [x] Adapter le lock SQL (déjà paramétré par table)
  - [x] Adapter la query `MAX(position)` pour grouper par `catalogue_item_id` au lieu de `live_item_id + live_session_id`

- [x] Task 3 : Refactorer `webhook-processor.ts` (AC: #2)
  - [x] Supprimer l'import de `CATALOGUE_SESSION_SENTINEL`
  - [x] Passer `catalogueItemId` à `addToWaitlist` au lieu de `catalogueItem.id` dans le paramètre `liveItemId`

- [x] Task 4 : Refactorer `reservation-ttl.ts` (AC: #3)
  - [x] Supprimer l'import de `CATALOGUE_SESSION_SENTINEL`
  - [x] Remplacer la logique `isCataloguePromotion` (qui teste le sentinel) par `!!waitlistEntry.catalogueItemId`
  - [x] Utiliser `waitlistEntry.catalogueItemId` directement dans `createReservation`

- [x] Task 5 : Refactorer `live.ts` (router releaseReservation) (AC: #4)
  - [x] Supprimer l'import de `CATALOGUE_SESSION_SENTINEL`
  - [x] Remplacer la logique `isCatalogueWaitlist` par `!!firstInWaitlist.catalogueItemId`
  - [x] Utiliser `firstInWaitlist.catalogueItemId` directement

- [x] Task 6 : Tests (AC: #1–#5)
  - [x] Mettre à jour `addToWaitlist.test.ts` : tester insertion avec `catalogueItemId`, unicité, lock
  - [x] Mettre à jour `reservation-ttl.test.ts` : promotion catalogue sans sentinel
  - [x] Mettre à jour `webhook-processor.test.ts` : file d'attente catalogue sans sentinel
  - [x] Mettre à jour `live.test.ts` : libération manuelle catalogue sans sentinel
  - [x] Vérifier 0 référence résiduelle à `CATALOGUE_SESSION_SENTINEL` dans le codebase

## Dev Notes

### Fichiers impactés

| Fichier | Action |
|---------|--------|
| `prisma/schema.prisma` (lignes 486-501) | Modifier modèle Waitlist |
| `src/server/waitlist/addToWaitlist.ts` | Refactorer signature + supprimer sentinel |
| `src/server/workers/webhook-processor.ts` (ligne 310) | Adapter appel addToWaitlist |
| `src/server/workers/reservation-ttl.ts` (lignes 246-253) | Supprimer logique sentinel |
| `src/server/api/routers/live.ts` (lignes 295-299) | Supprimer logique sentinel |
| Tests correspondants (4 fichiers) | Adapter mocks et assertions |

### Pattern actuel (à supprimer)

```typescript
// AVANT (workaround)
addToWaitlist(tenantId, liveSessionId ?? CATALOGUE_SESSION_SENTINEL, catalogueItem.id, ...)

// Promotion : reconstruction manuelle
const isCataloguePromotion = entry.liveSessionId === CATALOGUE_SESSION_SENTINEL;
const catalogueItemId = isCataloguePromotion ? entry.liveItemId : null;
const liveSessionId = isCataloguePromotion ? null : entry.liveSessionId;
```

```typescript
// APRÈS (clean)
addToWaitlist(tenantId, liveSessionId, null, clientPhone, correlationId, { catalogueItemId: catalogueItem.id, table: "catalogue_items" })

// Promotion : lecture directe
const catalogueItemId = entry.catalogueItemId; // nullable, direct
```

### Contrainte CHECK

```sql
ALTER TABLE waitlist ADD CONSTRAINT waitlist_item_check
  CHECK (
    (live_item_id IS NOT NULL AND live_session_id IS NOT NULL)
    OR (catalogue_item_id IS NOT NULL)
  );
```

### Index unique

L'index unique actuel `(tenant_id, live_session_id, client_phone, live_item_id)` ne fonctionne pas avec des nullables en PostgreSQL. Options :
- **Option A (recommandée)** : Deux partial unique indexes
  - `CREATE UNIQUE INDEX waitlist_live_unique ON waitlist(tenant_id, live_session_id, client_phone, live_item_id) WHERE live_item_id IS NOT NULL;`
  - `CREATE UNIQUE INDEX waitlist_catalogue_unique ON waitlist(tenant_id, catalogue_item_id, client_phone) WHERE catalogue_item_id IS NOT NULL;`
- **Option B** : COALESCE dans un index unique (moins propre)

### Guard Prisma (action item rétro Epic 8)

Après modification du schéma, exécuter `npx prisma validate` et `npx prisma generate` pour vérifier la cohérence avant de marquer la story "done".

### References

- [Source: _bmad-output/implementation-artifacts/epic-8-retro-2026-02-11.md#Dette technique #1]
- [Source: src/server/waitlist/addToWaitlist.ts — lignes 13-14, sentinel definition]
- [Source: prisma/schema.prisma — lignes 486-501, modèle Waitlist]
- [Source: src/server/workers/webhook-processor.ts — ligne 310, usage sentinel]
- [Source: src/server/workers/reservation-ttl.ts — lignes 246-253, promotion sentinel]
- [Source: src/server/api/routers/live.ts — lignes 295-299, release sentinel]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Prisma validate: OK
- Prisma generate: OK
- Full test suite: 504 passed, 0 failed (4 skipped pre-existants)

### Completion Notes
- **Task 1**: Migration `20260212000000_story_9_1_waitlist_catalogue_item_id` — schema Waitlist modifié (catalogueItemId nullable, liveSessionId/liveItemId nullable), CHECK constraint, 2 partial unique indexes (Option A), data migration sentinel → catalogueItemId, FK vers catalogue_items. Relation inverse `waitlist Waitlist[]` ajoutée sur CatalogueItem.
- **Task 2**: `addToWaitlist.ts` entièrement refactoré — signature accepte `options.catalogueItemId`, `CATALOGUE_SESSION_SENTINEL` supprimé, insert avec `catalogueItemId` et `liveItemId=null`/`liveSessionId=null` pour catalogue, lock SQL et MAX(position) adaptés par type.
- **Task 3**: `webhook-processor.ts` — import sentinel supprimé, appel addToWaitlist passe `catalogueItemId` via options au lieu de squatter `liveItemId`.
- **Task 4**: `reservation-ttl.ts` — import sentinel supprimé, waitlist lookup utilise `catalogueItemId` directement, promotion `createReservation` utilise `waitlistEntry.catalogueItemId` (plus de test sentinel).
- **Task 5**: `live.ts` — import sentinel supprimé, waitlist lookup par `catalogueItemId` pour catalogue, promotion utilise `firstInWaitlist.catalogueItemId` directement.
- **Task 6**: 4 fichiers de tests mis à jour (addToWaitlist.test.ts, reservation-ttl.test.ts, webhook-processor.test.ts, live.test.ts). 0 référence résiduelle à `CATALOGUE_SESSION_SENTINEL` dans le codebase. 504 tests passent.

### Change Log
- 2026-02-12: Story 9.1 implémentée — suppression complète du workaround CATALOGUE_SESSION_SENTINEL, ajout catalogueItemId nullable sur Waitlist, migration données, refactoring 4 fichiers source + 4 fichiers tests.
- 2026-02-12: Code Review (CR) — 5 findings corrigés :
  - [H1] CHECK constraint rendue exclusive (XOR live/catalogue)
  - [M1] FK catalogue_item_id changée de ON DELETE SET NULL → ON DELETE CASCADE + directive Prisma onDelete: Cascade
  - [M2] Naked block `{ }` supprimé dans live.ts
  - [L1] tenantId ajouté aux waitlist lookups dans reservation-ttl.ts et live.ts (defense-in-depth)
  - [L2] liveSessionId → null dans l'appel addToWaitlist pour catalogue dans webhook-processor.ts + test mis à jour

### File List
- `prisma/schema.prisma` (modifié — modèle Waitlist + relation CatalogueItem)
- `prisma/migrations/20260212000000_story_9_1_waitlist_catalogue_item_id/migration.sql` (nouveau)
- `src/server/waitlist/addToWaitlist.ts` (modifié — refactoring complet)
- `src/server/workers/webhook-processor.ts` (modifié — suppression sentinel)
- `src/server/workers/reservation-ttl.ts` (modifié — suppression sentinel)
- `src/server/api/routers/live.ts` (modifié — suppression sentinel)
- `src/server/waitlist/addToWaitlist.test.ts` (modifié — tests catalogue sans sentinel)
- `src/server/workers/reservation-ttl.test.ts` (modifié — tests catalogue sans sentinel)
- `src/server/workers/webhook-processor.test.ts` (modifié — test addToWaitlist call signature)
- `src/server/api/routers/live.test.ts` (modifié — test promotion catalogue sans sentinel)
- `generated/prisma/schema.prisma` (regénéré)
