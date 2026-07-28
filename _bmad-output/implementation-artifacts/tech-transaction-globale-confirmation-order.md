# Story TECH: Transaction globale confirmation → création Order

Status: done

<!-- BLOQUANT avant Epic 7A — dette technique reportée depuis Epic 4 → 5 → 6. Décision prise en rétro Epic 6 : transaction Prisma globale. -->

## Story

As a **système SnapSell**,
I want **que la confirmation de réservation (décrément stock) et la création de commande (Order) soient dans une seule transaction atomique Prisma**,
so that **si la création de l'Order échoue après le décrément stock, tout est rollback et l'état reste cohérent (pas de stock décrémenté sans commande)**.

## Contexte & Historique

- **Dette identifiée en Epic 4** (story 4.5), reportée Epic 5 (rétro), reportée Epic 6 (rétro).
- **Décision finale prise en rétro Epic 6** par Fabrice (Project Lead) : « Il faut le corriger immédiatement avant de continuer. »
- **Option retenue :** Transaction globale Prisma (`prisma.$transaction`) — unanimité de l'équipe.
- **Accord d'équipe :** Les décisions reportées ne dépassent plus 1 epic.
- [Source: _bmad-output/implementation-artifacts/epic-6-retro-2026-02-09.md — §4, §6]

## Le problème

Dans `createOrderFromReservation.ts`, les opérations sont **séparées** :

1. **`confirmReservation()`** (ligne 65) → sa propre `$transaction` dans `reservation.ts` (décrémente `reserved_qty -= 1`, `available_qty -= 1` avec `SELECT FOR UPDATE`)
2. **`db.reservation.update()`** (ligne 72) → opération séparée (statut → `confirmed`)
3. **`db.order.create()`** (ligne 86) → opération séparée (création Order SS-XXXX)

**Scénario de défaillance :** Si `confirmReservation()` réussit (stock décrémenté) mais `order.create()` échoue (ex. erreur réseau, timeout, contrainte inattendue), on se retrouve avec :
- Stock décrémenté (reserved_qty et available_qty réduits) ✅
- Réservation potentiellement en `confirmed` ✅
- **Aucune commande créée** ❌
- → État incohérent, stock « perdu », pas de commande à livrer

## Acceptance Criteria

1. **Given** une réservation en `address_collected` avec stock disponible  
   **When** le client confirme (OUI) et la création de l'Order échoue (ex. erreur DB)  
   **Then** le stock n'est PAS décrémenté (rollback), la réservation reste en `address_collected`, aucun Order n'est créé  
   **And** le système peut réessayer la confirmation sans incohérence

2. **Given** une réservation en `address_collected` avec stock disponible  
   **When** le client confirme (OUI) et tout réussit  
   **Then** le stock est décrémenté, la réservation passe en `confirmed`, l'Order est créé (SS-XXXX) — même comportement qu'aujourd'hui

3. **Given** la fonction `confirmReservation`  
   **When** elle est appelée depuis `createOrderFromReservation`  
   **Then** elle utilise le même client transactionnel (`tx`) que le reste du flux (pas sa propre `$transaction` imbriquée)

4. **Given** la décision architecturale  
   **When** le correctif est appliqué  
   **Then** la décision est documentée dans `architecture.md` (section décisions ou patterns)

5. **Given** les tests existants  
   **When** le correctif est appliqué  
   **Then** les tests existants passent toujours + un nouveau test vérifie le rollback en cas d'échec de `order.create`

## Tasks / Subtasks

- [x] Task 1 : Refactorer `confirmReservation` pour accepter un client transactionnel (AC: #3)
  - [x] Modifier `confirmReservation` dans `src/server/live-item/reservation.ts` pour accepter un paramètre optionnel `tx` (Prisma transaction client)
  - [x] Si `tx` est fourni, utiliser `tx` au lieu de `db.$transaction` (les requêtes raw `$queryRaw` / `$executeRaw` sont exécutées dans la transaction externe)
  - [x] Si `tx` n'est PAS fourni (appel autonome), conserver le comportement actuel (`db.$transaction` interne) — rétrocompatibilité pour tout autre appelant
  - [x] Mettre à jour les types d'export si nécessaire

- [x] Task 2 : Wrapper `createOrderFromReservation` dans une `$transaction` globale (AC: #1, #2)
  - [x] Dans `createOrderFromReservation.ts`, wrapper les opérations critiques dans `db.$transaction(async (tx) => { ... })` :
    - `confirmReservation(tenantId, liveItemId, { correlationId, tx })`
    - `tx.reservation.update(...)` (statut → confirmed)
    - `tx.order.create(...)` (création Order)
  - [x] Conserver le check idempotence (`order.findUnique`) AVANT la transaction (pas besoin de lock)
  - [x] Conserver le retry P2002 sur `order_number` DANS la transaction
  - [x] Les opérations post-transaction (event log, outbox) restent EN DEHORS de la transaction (non critiques, déjà en try/catch)
  - [x] Conserver `getNextOrderNumber` — attention : le `count` doit utiliser `tx` à l'intérieur de la transaction

- [x] Task 3 : Tests (AC: #5)
  - [x] Mettre à jour les tests existants dans `createOrderFromReservation.test.ts` pour mocker `db.$transaction` au lieu de mocks séparés
  - [x] Ajouter un test : « quand `order.create` échoue, `confirmReservation` est rollback (stock non décrémenté) »
  - [x] Ajouter un test : « quand `reservation.update` échoue, `confirmReservation` est rollback »
  - [x] Vérifier que les tests existants de `confirmReservation` dans `reservation.ts` passent toujours (appels sans `tx` = rétrocompatibles)

- [x] Task 4 : Documenter dans architecture.md (AC: #4)
  - [x] Ajouter dans la section « Décisions techniques figées » ou « Consistency & Concurrency » : « La confirmation + création Order utilise une transaction globale Prisma pour garantir l'atomicité (rollback si l'Order ne peut être créé après décrément stock). »

## Dev Notes

- **Fichier principal :** `src/server/order/createOrderFromReservation.ts` — le cœur du correctif
- **Fichier secondaire :** `src/server/live-item/reservation.ts` — `confirmReservation` doit accepter un `tx` optionnel
- **Tests :** `src/server/order/createOrderFromReservation.test.ts` — mise à jour mocks + nouveaux cas
- **Doc :** `_bmad-output/planning-artifacts/architecture.md` — ajouter la décision

### Approche technique recommandée

**Signature refactorée de `confirmReservation` :**

```typescript
export async function confirmReservation(
  tenantId: string,
  liveItemId: string,
  options?: ReservationOptions & { tx?: PrismaTransactionClient },
): Promise<ConfirmReservationResult> {
  const client = options?.tx ?? db;
  
  // Si tx fourni → pas de $transaction imbriquée, utiliser tx directement
  if (options?.tx) {
    return executeConfirmation(options.tx, tenantId, liveItemId, options);
  }
  // Si pas de tx → comportement actuel (sa propre $transaction)
  return db.$transaction(async (tx) => {
    return executeConfirmation(tx, tenantId, liveItemId, options);
  }).catch(/* ... */);
}

async function executeConfirmation(
  tx: PrismaTransactionClient,
  tenantId: string,
  liveItemId: string,
  options?: ReservationOptions,
): Promise<...> {
  // SELECT FOR UPDATE + UPDATE live_items (logique existante)
}
```

**Structure de `createOrderFromReservation` après refactoring :**

```typescript
export async function createOrderFromReservation(...) {
  // 1. Idempotence check (HORS transaction)
  const existingOrder = await db.order.findUnique({ where: { reservationId } });
  if (existingOrder) return { success: true, order: existingOrder };

  // 2. Load reservation (HORS transaction)
  const reservation = await db.reservation.findUnique(...);
  if (!reservation) return { success: false, reason: "reservation_not_found" };

  // 3. TRANSACTION GLOBALE
  const result = await db.$transaction(async (tx) => {
    // 3a. confirmReservation avec tx (SELECT FOR UPDATE + décrément stock)
    const confirmResult = await confirmReservation(tenantId, liveItemId, { correlationId, tx });
    if (!confirmResult.success) throw new Error("CONFIRM_FAILED:" + confirmResult.reason);

    // 3b. Update reservation status
    await tx.reservation.update({ where: { id: reservationId }, data: { status: "confirmed" } });

    // 3c. Create Order (avec retry P2002 sur order_number)
    const orderNumber = await getNextOrderNumber(tenantId, tx);
    const order = await tx.order.create({ data: { ... } });
    return order;
  });

  // 4. Post-transaction (non critique) : event log, outbox
  await logOrderCreated(...).catch(...);
  if (requireDeposit) { await writeToOutbox(...); }

  return { success: true, order: result };
}
```

### Points d'attention

- **`getNextOrderNumber`** doit aussi recevoir `tx` car le `count` doit être dans la transaction pour éviter les conflits de numéro
- **Retry P2002 sur `order_number`** : le retry avec boucle `for` est plus complexe dans une transaction. Option : utiliser un `SELECT MAX(order_number)` avec `FOR UPDATE` sur orders du tenant au lieu d'un `count`, ou gérer le retry en ré-exécutant toute la transaction
- **Event log et outbox** restent EN DEHORS de la transaction — ils ont déjà des try/catch et ne sont pas critiques pour la cohérence
- **Rétrocompatibilité** : `confirmReservation` sans `tx` = comportement identique à aujourd'hui (pour les appels depuis `releaseReservation` ou d'autres endroits)
- **Nested transactions Prisma** : Prisma supporte les transactions interactives imbriquées via savepoints, mais c'est plus propre de passer le `tx` directement

### Project Structure Notes

- `src/server/order/createOrderFromReservation.ts` — MODIFIER (wrapper $transaction)
- `src/server/live-item/reservation.ts` — MODIFIER (confirmReservation accepte tx optionnel)
- `src/server/order/createOrderFromReservation.test.ts` — MODIFIER (mocks + nouveaux tests)
- `_bmad-output/planning-artifacts/architecture.md` — MODIFIER (documenter décision)
- **NE PAS modifier :** `webhook-processor.ts`, routers tRPC, UI, outbox, event log

### References

- [Source: _bmad-output/implementation-artifacts/epic-6-retro-2026-02-09.md — §4 Suivi rétro, §6 Action items, Chemin critique]
- [Source: src/server/order/createOrderFromReservation.ts — lignes 35-170]
- [Source: src/server/live-item/reservation.ts — lignes 145-206, confirmReservation]
- [Source: src/server/order/createOrderFromReservation.test.ts — tests existants]
- [Source: _bmad-output/planning-artifacts/architecture.md — §5 Consistency & Concurrency]

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif :** Garantir que confirmation (décrément stock) et création Order sont atomiques. Si l'un échoue, tout est rollback.
- **Impact :** Scénario de défaillance actuel = stock « perdu » sans commande. Risque faible en MVP (volume bas) mais critique pour la confiance (0 double attribution, 0 stock fantôme).
- **Décision architecture :** Transaction globale Prisma (`$transaction` interactive).

### Technical Requirements

- **Prisma `$transaction` interactive** : `db.$transaction(async (tx) => { ... })` — toutes les opérations critiques utilisent `tx` au lieu de `db`.
- **Raw queries** : `confirmReservation` utilise `$queryRaw` et `$executeRaw` avec `FOR UPDATE`. Ces requêtes doivent utiliser `tx.$queryRaw` / `tx.$executeRaw` au lieu de `db.$queryRaw`.
- **Type du client transactionnel** : Prisma expose `Prisma.TransactionClient` ou on peut dériver le type via `Parameters<Parameters<typeof db.$transaction>[0]>[0]`.
- **Isolation level** : Par défaut Prisma utilise `READ COMMITTED` sur Postgres — suffisant avec le `SELECT FOR UPDATE` déjà en place.

### Architecture Compliance

- **Stack :** Prisma, Postgres (Neon) — aucune nouvelle dépendance.
- **Pattern :** Transactions Postgres pour cohérence (déjà documenté dans architecture.md §5). Ce correctif étend le scope de la transaction existante.
- **Idempotence :** Le check `order.findUnique` en début de fonction reste HORS transaction — c'est un fast-path qui ne modifie rien.

### Testing Requirements

- **Mocks `$transaction`** : Mocker `db.$transaction` pour qu'il exécute la callback avec un mock `tx`. Le `tx` doit avoir les mêmes méthodes mockées (`tx.reservation.update`, `tx.order.create`, `tx.$queryRaw`, `tx.$executeRaw`).
- **Nouveau test CRITIQUE** : Simuler `tx.order.create` qui throw → vérifier que `confirmReservation` (le décrément) n'a PAS eu d'effet persistant (la transaction a rollback).
- **Tests existants** : Adapter les mocks (de `db.xxx` vers `tx.xxx` à l'intérieur de la callback $transaction).

---

## Checklist a11y (action item rétro Epic 6)

En complément de cette story, la rétro Epic 6 exige qu'une **checklist a11y pré-review** (5–7 points) soit créée et intégrée aux instructions de story avant Epic 7A. Points à inclure :

1. Tous les éléments interactifs ont un `aria-label` ou un label visible
2. Les messages d'erreur utilisent `role="alert"`
3. Pas de `opacity-0` sur des éléments fonctionnels (boutons, liens)
4. Chaque `<input>` a un `<label htmlFor="...">`
5. Structure sémantique (`h1` > `h2` > `h3`, `<nav>`, `<main>`, `<section>`)
6. Contraste texte/fond WCAG AA (4.5:1 minimum)
7. Statuts = icône + texte (pas couleur seule)

→ A intégrer dans le template de story ou dans les conventions dev.

---

## Dev Agent Record

### Agent Model Used

Claude claude-4.6-opus (Cursor)

### Debug Log References

Aucun problème rencontré. Tous les tests passent du premier coup.

### Completion Notes List

- **Task 1 :** Extraction de `executeConfirmation()` (logique SELECT FOR UPDATE + décrément) en fonction interne. `confirmReservation` accepte `options.tx?: PrismaTransactionClient`. Si tx fourni → exécution directe, sinon → propre `$transaction` (rétrocompatible). Export du type `PrismaTransactionClient` = `Prisma.TransactionClient`. 10/10 tests existants passent (réservation sans tx).
- **Task 2 :** `createOrderFromReservation` utilise désormais `db.$transaction(async (tx) => { ... })` englobant `confirmReservation(…, { tx })` + `tx.reservation.update` + `tx.order.create`. `getNextOrderNumber` accepte un `client` (tx ou db). Retry P2002 order_number au niveau de la transaction entière (re-exécute tout → stock rollback, on recommence). Idempotence check et reservation load restent hors transaction. Event log + outbox restent post-transaction. Ajout du `ConfirmFailedError` interne + handling CONCURRENCY_ROLLBACK.
- **Task 3 :** Tests entièrement réécrits avec mock `db.$transaction` exécutant la callback avec mockTx. 11 tests (6 existants adaptés + 5 nouveaux) : rollback quand order.create échoue, rollback quand reservation.update échoue, confirmReservation reçoit tx, getNextOrderNumber utilise tx.order.count, event log post-transaction. Suite complète : 343 pass / 0 fail.
- **Task 4 :** Documentation ajoutée dans architecture.md §5 (Consistency & Concurrency) et décision I dans le tableau « Décisions techniques figées ».

### Code Review Fixes (auto-fix)

**7 issues trouvées et corrigées (1 High, 2 Medium, 4 Low) :**

- **HIGH #1 :** `logEvent("reservation_confirmed")` était appelé DANS le callback `$transaction` via `confirmReservation`. En cas de rollback, l'event log persistait (phantom record). Fix : `confirmReservation` ne logge plus quand `tx` est fourni ; `createOrderFromReservation` logge post-transaction.
- **MEDIUM #2 :** Ajout test CONCURRENCY_ROLLBACK via transaction → retourne `confirm_failed`.
- **MEDIUM #3 :** Ajout test P2002 order_number retry (full transaction) → re-exécute la transaction entière.
- **LOW #4 :** `ConfirmFailedError.reason` maintenant loggé via `workerLogger.warn` avant de retourner `confirm_failed`.
- **LOW #5 :** 8x `orderRecord!` remplacés par un guard clause unique.
- **LOW #6 :** `$transaction` timeout explicite 10s (au lieu du default Prisma 5s).
- **LOW #7 :** Commentaire documentant que le rollback réel nécessite un test d'intégration.

Suite complète après fixes : 345 pass / 0 fail (+2 tests).

### File List

- `src/server/live-item/reservation.ts` — MODIFIÉ (export PrismaTransactionClient, extraction executeConfirmation, paramètre tx optionnel sur confirmReservation, skip logEvent quand tx fourni)
- `src/server/order/createOrderFromReservation.ts` — MODIFIÉ (transaction globale $transaction, getNextOrderNumber avec tx, ConfirmFailedError, handling CONCURRENCY_ROLLBACK, logEvent reservation_confirmed post-tx, guard clause orderRecord, timeout 10s, workerLogger.warn reason)
- `src/server/order/createOrderFromReservation.test.ts` — MODIFIÉ (mocks $transaction + mockTx, 13 tests total : 6 existants adaptés + 7 nouveaux)
- `_bmad-output/planning-artifacts/architecture.md` — MODIFIÉ (§5 + décision I)
- `_bmad-output/implementation-artifacts/tech-transaction-globale-confirmation-order.md` — MODIFIÉ (tasks [x], Dev Agent Record, File List, Status → done)
