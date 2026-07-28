# Story 6.5: Export CSV (manager) et affichage audit trail

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **manager**,
I want **exporter les données (ex. commandes) en CSV et consulter / filtrer / exporter l'audit trail (Event Log)**,
so that **je puisse les utiliser pour la compta ou l'analyse et diagnostiquer les flux (correlationId)**.

## Acceptance Criteria

1. **Given** je suis connecté en tant que manager  
   **When** je demande un export CSV des commandes (avec filtres optionnels : statut, plage de dates)  
   **Then** un fichier CSV est généré et téléchargé (FR34)  
   **And** FR34 couvert

2. **Given** je suis connecté au dashboard (manager ou vendeur/agent selon règle produit)  
   **When** j'accède à l'affichage de l'audit trail (Event Log)  
   **Then** je vois les événements avec filtres (type, plage de dates, correlationId optionnel) et je peux exporter l'audit en CSV (FR45)  
   **And** la création des événements est déjà en place (Epic 2, 4) ; cette story fournit l'affichage, filtres et export  
   **And** FR45 couvert

## Tasks / Subtasks

- [x] Task 1 : Export CSV commandes (AC: #1)
  - [x] Procédure tRPC ou route API dédiée pour export commandes : réutiliser les mêmes critères de filtre que `orders.list` (statut, dateFrom, dateTo), requête filtrée par `tenantId` (session). Générer un CSV avec colonnes pertinentes (orderNumber, status, depositStatus, createdAt, clientPhone masqué ou tronqué pour PII, code article, etc.). Retourner le fichier en téléchargement (Content-Disposition: attachment; filename=commandes-YYYY-MM-DD.csv) ou stream. Ne pas exposer de PII inutiles (ex. masquer clientPhone en ***1234 si besoin conformément aux autres vues).
  - [x] Côté UI : bouton « Exporter en CSV » sur la page Commandes (ou dans le header de la liste), réservé au rôle manager (ou selon RBAC). Au clic : appel de la procédure / route d'export puis déclenchement du téléchargement côté client.
  - [x] Subtask 1.1 : Définir le format CSV (séparateur, encodage UTF-8, en-têtes) et les colonnes exportées (alignées avec la liste commandes : orderNumber, status, depositStatus, createdAt, clientPhone masqué, liveItemCode, etc.).

- [x] Task 2 : Audit trail — API et données (AC: #2)
  - [x] Procédure(s) tRPC pour l'Event Log : `eventLog.list` (ou `audit.list`) avec input : `tenantId` depuis session, filtres optionnels `eventType`, `dateFrom`, `dateTo`, `correlationId` (optionnel). Requête sur `event_log` avec index existants (tenantId, eventType, createdAt). Retourner les champs : id, eventType, entityType, entityId, correlationId, actorType, payload (JSON), createdAt. Pagination recommandée (limit/offset ou cursor) pour ne pas charger des milliers de lignes en une fois.
  - [x] Créer un router tRPC dédié (ex. `eventLog` ou `audit`) dans `src/server/api/routers/`, schémas Zod dans `eventLog.schema.ts`, enregistrer dans `root.ts`. Isolation tenant stricte sur toutes les requêtes.

- [x] Task 3 : Audit trail — Export CSV (AC: #2)
  - [x] Procédure ou route d'export CSV pour l'audit trail : mêmes filtres que `eventLog.list`, génération CSV (eventType, entityType, entityId, correlationId, actorType, createdAt, payload sérialisé ou colonnes extraites). Téléchargement avec nom de fichier ex. `audit-trail-YYYY-MM-DD.csv`. Filtrage par tenantId obligatoire.

- [x] Task 4 : Audit trail — UI (AC: #2)
  - [x] Page ou section « Audit trail » / « Journal d'événements » dans le dashboard (ex. `src/app/(dashboard)/dashboard/audit/page.tsx` ou sous-section dans Paramètres / Ops). Affichage tableau : colonnes eventType, entityType, correlationId, actorType, createdAt, payload (résumé ou tooltip). Filtres : type d'événement, plage de dates, optionnellement correlationId (champ recherche). Utiliser composants shadcn (Table, Badge, Select, Calendar/DatePicker) et design system existant (orders, proofs, live).
  - [x] Bouton « Exporter en CSV » pour la vue audit trail, déclenchant l'export avec les filtres courants. Accessibilité : labels, structure sémantique.

- [x] Task 5 : Tests (AC: #1, #2)
  - [x] Tests export CSV commandes : génération avec filtres (tenant, statut, dates) ; contenu CSV valide (en-têtes, lignes) ; isolation tenant (un tenant ne reçoit pas les commandes d'un autre). Si export via tRPC : tester la procédure ; si route API : tester la route avec session mock.
  - [x] Tests eventLog.list : filtres (eventType, dateFrom, dateTo, correlationId), pagination, isolation tenant.
  - [x] Tests export CSV audit : mêmes filtres que list, contenu cohérent, isolation tenant.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 6, Story 6.5 ; FR34, FR45.
- **Contexte :** La création des événements dans `event_log` est déjà implémentée (Epic 2, 4) via `~/server/events/eventLog.ts`. Cette story ajoute uniquement la **lecture, filtres et export** côté dashboard. Export commandes : le router `orders.list` existe déjà avec filtres ; il s'agit d'ajouter un export CSV (même critères) et le bouton côté UI.
- **RBAC :** FR34 précise « le manager peut exporter » ; vérifier si le rôle Agent peut aussi exporter ou uniquement Manager/Owner. En cas de doute, restreindre l'export commandes au rôle manager (ou owner) ; l'audit trail peut être visible par manager et éventuellement agent selon politique produit.

### Project Structure Notes

- **Fichiers à créer / modifier :**
  - `src/server/api/routers/orders.ts` : ajouter une procédure `exportCsv` (ou `getCsvExport`) retournant le CSV en string ou stream, avec mêmes filtres que `list`. Alternative : route API GET `src/app/api/orders/export/route.ts` qui appelle la logique d'export et retourne le fichier (session requise).
  - `src/server/api/routers/eventLog.ts` (ou `audit.ts`) : `list` (avec filtres + pagination), `exportCsv` (ou route API dédiée). `src/server/api/routers/eventLog.schema.ts` : schémas Zod pour list input (eventType?, dateFrom?, dateTo?, correlationId?, limit?, cursor?).
  - `src/server/api/root.ts` : enregistrer le router eventLog (ou audit).
  - `src/app/(dashboard)/dashboard/orders/` : ajouter bouton « Exporter en CSV » (visible pour manager), déclenchant téléchargement (lien ou fetch + blob).
  - `src/app/(dashboard)/dashboard/audit/page.tsx` (ou `event-log/page.tsx`) : page Audit trail avec tableau, filtres, bouton Export CSV. Optionnel : `_components/audit-trail-content.tsx` pour la logique client (tRPC, état, filtres).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] — §9 Observability (correlationId, event_log), §3 Core Domain (EventLog) ; [Source: _bmad-output/implementation-artifacts/6-4-*.md] pour patterns UI (filtres, tableau, bouton export).

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR34 :** Le manager peut exporter les données (ex. commandes) en CSV pour compta ou analyse.
- **FR45 :** Le système enregistre un audit trail minimal horodaté (création item, réservation, promotion waitlist, confirmation, preuves, changements statuts, overrides). Cette story ajoute l'**affichage, filtres et export** de cet audit trail côté dashboard ; la création des événements est déjà en place.
- **État actuel :** Aucun export CSV commandes ni vue audit trail. `event_log` en base avec champs eventType, entityType, entityId, correlationId, actorType, payload, createdAt. Index sur (tenantId, correlationId), (tenantId, eventType, createdAt). Router `orders.list` existe avec filtres status, dateFrom, dateTo.

### Technical Requirements

- **Export CSV commandes :** Réutiliser les critères de filtre de `orders.list` (tenantId, status?, dateFrom?, dateTo?). Format CSV : UTF-8, séparateur virgule (ou point-virgule si locale FR), en-têtes. Colonnes suggérées : orderNumber, status, depositStatus, createdAt, clientPhone (masqué ***1234), liveItemCode. Pas de PII complet (aligné avec Live Ops / Proofs).
- **Audit trail :** Lecture seule sur `event_log`. Filtres : eventType (optionnel), dateFrom, dateTo, correlationId (optionnel). Pagination (limit 50–100 par défaut, offset ou cursor). Payload en JSON : afficher en colonne « Détails » ou tooltip (éviter d’exposer du PII déjà interdit dans eventLog.ts).
- **Isolation tenant :** Toutes les requêtes (list, export commandes ; list, export audit) filtrées par `tenantId` issu de la session. Aucune donnée cross-tenant.

### Architecture Compliance

- **Stack :** tRPC pour list et export (ou route API pour téléchargement binaire si préféré). Prisma pour requêtes event_log et orders. Next.js App Router, shadcn/ui. Pas de nouvelle dépendance externe pour CSV (génération manuelle ou lib légère type csv-stringify si déjà présente).
- **Event Log :** Ne pas modifier la structure event_log ni les types dans eventLog.ts pour la création ; uniquement lecture (findMany) avec filtres et pagination.
- **Naming :** DB snake_case (déjà en place) ; API camelCase (eventType, correlationId, createdAt).

### Library / Framework Requirements

- Génération CSV : pas de lib obligatoire ; construire une chaîne CSV (escape guillemets/virgules) ou utiliser un package léger si le projet en a un. Vérifier package.json avant d’ajouter une dépendance.
- tRPC, Prisma, Zod, shadcn déjà utilisés.

### File Structure Requirements

- Nouveau router : `src/server/api/routers/eventLog.ts` + `eventLog.schema.ts`. Modifier `orders.ts` pour ajouter export CSV (ou créer `orders.export.ts` si préféré). Page audit : `src/app/(dashboard)/dashboard/audit/page.tsx` (+ optionnel `_components/audit-trail-content.tsx`). Tests : `eventLog.test.ts`, et tests pour l’export commandes (dans `orders.test.ts` ou fichier dédié).

### Testing Requirements

- **Export commandes :** Avec session manager, appel export avec filtres → CSV contient uniquement les commandes du tenant ; contenu conforme (en-têtes, lignes). Tenant B ne peut pas obtenir les commandes du tenant A.
- **eventLog.list :** Sans filtre → N derniers événements du tenant. Avec eventType, dateFrom, dateTo, correlationId → résultats filtrés. Pagination : limit/offset ou cursor. Isolation : tenant B ne voit pas les événements du tenant A.
- **Export audit :** Mêmes filtres que list, CSV généré avec colonnes attendues, isolation tenant.

---

## Previous Story Intelligence

- **Story 6.4 (Live Ops) :** Router `live` avec getLiveOpsData, releaseReservation. Patterns : tableau, filtres simples, bouton d’action avec confirmation, polling 45 s. Pour 6.5 : même pattern de bouton « Exporter » (sans confirmation si pas d’action destructive), tableau pour l’audit avec filtres (eventType, dates, correlationId).
- **Story 6.3 (Statut commande) :** orders.list avec filtres status, dateFrom, dateTo. Pour 6.5 : réutiliser exactement ces filtres pour l’export CSV commandes ; pas de nouveau schéma de filtre.
- **Story 6.2 (Proofs inbox) :** Liste avec actions. Pour 6.5 : liste audit en lecture seule + action « Exporter CSV ».
- **Story 6.1 (Liste commandes) :** orders.list, OrdersListContent avec filtres et StatusBadge. Pour 6.5 : ajouter un bouton « Exporter en CSV » dans la même page ou le header ; même design system (Button, Card, Table).
- **Backend event_log :** eventLog.ts expose logEvent et de nombreux helpers (logReservationStarted, logOrderCreated, etc.). Pas de procédure de lecture existante ; tout est en écriture. Ajouter uniquement des procédures de lecture (list, export) dans un nouveau router.

---

## Senior Developer Review (AI)

**Date :** 2026-02-09  
**Story :** 6-5-export-csv-manager-et-affichage-audit-trail  
**Statut revue :** Changes Requested (corrections recommandées, pas bloquantes)

**Vérifications :** AC #1 et #2 implémentés. Tâches marquées [x] conformes au code. File List cohérente avec les fichiers applicatifs modifiés/créés (hors _bmad-output). Tests unitaires présents et pertinents.

### Synthèse des écarts Git / File List

- Les fichiers listés dans la story (routers, pages, sidebar) correspondent bien aux changements applicatifs pour la 6-5. D’autres fichiers du repo sont modifiés (autres stories) ; pas de fausse déclaration pour cette story.

### Action Items

| Sévérité | Description | Fichier / zone |
|----------|-------------|----------------|
| HIGH | **Export CSV sans plafond** : `orders.exportCsv` et `eventLog.exportCsv` font un `findMany` sans `take`. Un tenant avec des dizaines de milliers de lignes peut provoquer timeout ou forte consommation mémoire. Recommandation : plafonner (ex. 10 000 lignes) et renvoyer une erreur explicite si dépassement. | `orders.ts` (exportCsv), `eventLog.ts` (exportCsv) |
| MEDIUM | **Erreur d’export non affichée** : en cas d’échec de `exportCsv.fetch`, aucun message n’est montré à l’utilisateur (pas de `catch` avec feedback). Recommandation : afficher un toast ou message inline (et garder `setIsExporting(false)` dans `finally`). | `orders-list-content.tsx` (handleExportCsv), `audit-trail-content.tsx` (handleExportCsv) |
| MEDIUM | **Duplication de la construction du `where`** : dans `eventLog.ts`, la logique dateFrom/dateTo/eventType/correlationId est dupliquée entre `list` et `exportCsv`. Réutiliser une fonction partagée pour réduire la dérive. | `eventLog.ts` |
| LOW | **Accessibilité** : le tableau du journal d’événements n’a pas d’`aria-label` sur le `<Table>`. | `audit-trail-content.tsx` |
| LOW | **Typage** : le type inline de `accumulatedItems` dans l’audit trail est long et peut diverger du retour tRPC ; dériver du type de `api.eventLog.list` si possible. | `audit-trail-content.tsx` |

### Outcome

**Changes Requested** — Implémentation globalement solide et conforme à la story. Les points ci‑dessus (surtout plafond d’export et feedback d’erreur) sont recommandés avant de considérer la story comme « done ».

### Re-review CR 6-5 (2026-02-09)

**Vérifications :** Corrections CR précédentes confirmées en place (plafond 10k, feedback erreur export, `buildEventLogWhere`, aria-label Table audit, typage `EventLogItem`). AC #1 et #2 implémentés. Tous les tests (orders.test.ts, eventLog.test.ts) passent. File List vs git : pas d’écart pour les fichiers 6-5.

**Nouveaux points traités :**

| Sévérité | Description | Fichier | Action |
|----------|-------------|---------|--------|
| MEDIUM | Duplication construction `where` entre `list` et `exportCsv` (même pattern que eventLog). | `orders.ts` | Corrigé : `buildOrdersWhere(tenantId, opts)` partagé. |
| LOW | Table commandes sans `aria-label`. | `orders-list-content.tsx` | Corrigé : `aria-label="Liste des commandes"`. |

**LOW non bloquant :** `eventLog.schema.ts` — enum `eventType` en dur ; à garder en synchro avec les types émis dans `eventLog.ts` lors d’ajouts futurs.

**Outcome re-review :** **Approve** — Tous les HIGH/MEDIUM corrigés. Story considérée done.

---

## Project Context Reference

- **Config :** Aucune config spécifique pour export CSV ou audit trail. Encodage CSV : UTF-8 avec BOM optionnel pour Excel si besoin.
- **Conventions :** TypeScript strict, Prisma, tRPC, shadcn/ui ; tests Vitest (eventLog.test.ts, orders.test.ts ou export dédié).

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

(Optionnel)

### Completion Notes List

- **Task 1** : `orders.exportCsv` tRPC (mêmes filtres que list), RBAC OWNER/MANAGER, CSV UTF-8 BOM, clientPhone masqué ***1234. Bouton « Exporter en CSV » sur la page Commandes (prop `canExportCsv` depuis session serveur), téléchargement via `utils.orders.exportCsv.fetch` + Blob.
- **Task 2** : Router `eventLog` avec `list` (filtres eventType, dateFrom, dateTo, correlationId, pagination cursor limit 50), schémas dans `eventLog.schema.ts`, enregistré dans `root.ts`.
- **Task 3** : `eventLog.exportCsv` avec mêmes filtres que list, retour `{ csv, filename }` audit-trail-YYYY-MM-DD.csv.
- **Task 4** : Page `dashboard/audit` + `AuditTrailContent` (tableau, filtres type/période/correlationId, pagination « Charger la suite », bouton Export CSV). Entrée sidebar « Journal d'événements » sous Commandes.
- **Task 5** : Tests dans `orders.test.ts` (exportCsv OWNER/MANAGER/AGENT, filtres, isolation) et `eventLog.test.ts` (list filtres, cursor, dateFrom>dateTo rejet, exportCsv isolation et filtres).
- **CR 6-5 corrections (2026-02-09)** : Plafond 10k lignes (orders + eventLog) + BAD_REQUEST si dépassement ; feedback erreur export (state + catch + message inline) ; `buildEventLogWhere` partagé ; aria-label sur Table audit ; type `EventLogItem` dérivé de RouterOutputs. Tests plafond ajoutés.
- **CR 6-5 re-review (2026-02-09)** : `buildOrdersWhere` partagé dans orders.ts (list + exportCsv) ; aria-label sur Table commandes.

### File List

- src/server/api/routers/orders.schema.ts
- src/server/api/routers/orders.ts
- src/server/api/routers/orders.test.ts
- src/app/(dashboard)/dashboard/orders/page.tsx
- src/app/(dashboard)/dashboard/orders/_components/orders-list-content.tsx
- src/server/api/routers/eventLog.schema.ts
- src/server/api/routers/eventLog.ts
- src/server/api/routers/eventLog.test.ts
- src/server/api/root.ts
- src/app/(dashboard)/dashboard/audit/page.tsx
- src/app/(dashboard)/dashboard/audit/_components/audit-trail-content.tsx
- src/app/(dashboard)/_components/app-sidebar.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/6-5-export-csv-manager-et-affichage-audit-trail.md

## Change Log

- **2026-02-09** — Code review (CR 6-5) : Changes Requested. 1 HIGH (plafond export CSV), 2 MEDIUM (feedback erreur export, duplication where), 2 LOW (aria-label tableau, typage accumulatedItems). Statut repassé en in-progress.
- **2026-02-09** — Corrections CR appliquées : plafond 10k (orders + eventLog), feedback erreur export (orders + audit), buildEventLogWhere partagé, aria-label Table, typage EventLogItem. Tests plafond ajoutés. Statut repassé en review.
- **2026-02-09** — Re-review CR 6-5 : buildOrdersWhere dans orders.ts, aria-label Table commandes. Statut → done.
