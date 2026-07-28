# Story 7B.2: Consulter la file d'erreurs (DLQ, media, envoi échoué)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant qu’**ops SnapSell**,  
je veux **consulter la file d’erreurs (media non attaché, envoi échoué, DLQ)**,  
afin de **diagnostiquer les incidents d’envoi ou de traitement**.

## Acceptance Criteria

1. **Consultation de la file d’erreurs (DLQ)**
   - **Given** je suis connecté en tant qu’ops SnapSell avec accès console ops,  
     **When** j’accède à l’écran File d’erreurs / DLQ (ex. `/ops/errors` ou `/ops/dlq`),  
     **Then** je vois la liste des entrées en échec : **DeadLetterJob** (payload, erreur, timestamp, job_type, tenant) avec possibilité de filtrer par tenant et par statut (non résolu / résolu).
2. **Données affichées par entrée**
   - **Given** j’affiche la liste de la file d’erreurs,  
     **When** la page se charge,  
     **Then** chaque ligne montre au minimum : `timestamp` (createdAt), `job_type`, `tenant_id` (ou nom tenant lisible), `error_message` (extrait), `attempts`, et un accès au payload (masqué si sensible : pas de numéro complet, pas d’adresse complète). Optionnel : `resolved_at` si présent.
3. **MessageOut en échec (outbox failed)**
   - **Given** des messages sortants en statut `failed` (MessageOut non encore passés en DLQ ou en complément),  
     **When** l’ops consulte la file d’erreurs ou une vue dédiée « Envois échoués »,  
     **Then** je vois les entrées pertinentes (to masqué, body tronqué, lastError, attempts, correlationId) pour diagnostic (FR38).
4. **Filtres et pagination**
   - **Given** plusieurs tenants ou beaucoup d’entrées,  
     **When** je consulte la file d’erreurs,  
     **Then** je peux filtrer par tenant (select/autocomplete) et par job_type (ex. `message_out`), et l’affichage est paginé (ou infinite scroll) avec temps de réponse raisonnable (< 2–3 s sur dataset MVP).
5. **Sécurité et isolation**
   - **Given** je ne suis pas authentifié comme ops SnapSell,  
     **When** j’essaie d’accéder à la console file d’erreurs,  
     **Then** l’accès est refusé (redirect ou 403). Seuls les comptes avec rôle `OPS` peuvent accéder. Les données sont filtrées par tenant côté API (isolation multi-tenant).

## Tasks / Subtasks

- [x] **Backend – Requêtes DLQ et MessageOut failed**
  - [x] Exposer une procédure tRPC sécurisée (ex. `ops.dlq.list` ou `ops.errors.list`) qui lit **DeadLetterJob** avec filtres `tenantId` (optionnel), `jobType` (optionnel), `resolved` (true/false/null). Pagination (cursor ou page/limit).
  - [x] Optionnel : procédure ou même endpoint listant les **MessageOut** avec `status = 'failed'` (filtre tenant, pagination) pour vue « envois échoués » complémentaire.
  - [x] Masquer / tronquer les champs sensibles dans le payload (numéros E.164, adresses, corps de message) avant envoi au client, comme pour event logs (7B-1).
- [x] **Backend – API ops**
  - [x] Réutiliser le même middleware `opsProcedure` et rôle `OPS` que pour `/ops/logs` (story 7B-1). Pas de nouveau rôle.
  - [x] S’assurer que toutes les requêtes sont filtrées côté serveur (tenant autorisé ou liste tenants pour OPS).
- [x] **Frontend – Écran File d’erreurs**
  - [x] Ajouter une vue **Ops / File d’erreurs** (ex. route `/ops/errors` ou `/ops/dlq`) dans la section ops, accessible uniquement aux comptes `OPS`.
  - [x] Afficher un tableau paginé des **DeadLetterJob** avec colonnes : date/heure, job_type, tenant, error_message (extrait), attempts, resolved_at, lien vers détail payload (modal ou panneau).
  - [x] Filtres : tenant (select/autocomplete), job_type (ex. message_out), « non résolu uniquement » (resolved_at IS NULL).
  - [x] Gérer états loading, erreur, empty state (aucune entrée).
- [x] **Cohérence avec 7B-1**
  - [x] Réutiliser le layout `(ops)` et la navigation ops (lien « Logs » / « File d’erreurs ») pour que l’ops puisse basculer entre logs et file d’erreurs.
- [x] **Observabilité & DX**
  - [x] Documenter dans les Dev Notes comment utiliser la file d’erreurs pour diagnostiquer un envoi échoué ou un job media (ex. media non attaché).

## Dev Notes

- **Architecture**
  - **Outbox + DLQ** : tout envoi sortant écrit dans **MessageOut** (status pending → sending → sent | failed). Après N échecs (retries + backoff), le job peut être enregistré dans **DeadLetterJob** (payload original + error_message, error_stack, attempts, createdAt, resolvedAt). Voir `architecture.md` §4.5, §9 et schéma Prisma.
  - **Tables existantes** : `messages_out` (MessageOut) avec `status`, `last_error`, `attempts`, `next_attempt_at` ; `dead_letter_jobs` (DeadLetterJob) avec `job_type`, `payload` (Json), `error_message`, `error_stack`, `attempts`, `created_at`, `resolved_at`, `tenant_id`.
  - La console ops **ne modifie pas** les entrées DLQ dans cette story (pas de « marquer résolu » obligatoire ; le champ `resolved_at` peut rester géré manuellement ou en story ultérieure).
- **Contraintes techniques**
  - Isolation tenant : toutes les requêtes filtrent par `tenant_id` ; l’API ops peut autoriser un OPS à voir plusieurs tenants (liste de tenants) mais jamais de données hors périmètre.
  - Masquage PII : même politique que 7B-1 (numéros → masqués, adresses → tronquées, payload message → pas de corps complet si sensible).
- **Sécurité & rôles**
  - Réutiliser **opsProcedure** et layout `(ops)` comme en 7B-1. Pas de nouveau rôle.
- **Ergonomie**
  - Design system **shadcn/ui + Tailwind** (table, filtres, badges). Lien depuis la barre ops vers « File d’erreurs » et « Logs ».

### Project Structure Notes

- **Backend** : étendre le router **ops** existant (`src/server/api/routers/ops.ts`) avec une procédure `dlq.list` (ou `errors.list`) qui interroge `DeadLetterJob` via Prisma. Optionnel : procédure pour `messagesOut` avec `status: 'failed'`.
- **Frontend** : nouvelle page sous `src/app/(ops)/ops/errors/page.tsx` (ou `dlq/page.tsx`) avec composants dédiés (table, filtres, détail payload). Réutiliser le layout `(ops)` et la nav déjà en place pour `/ops/logs`.
- **Cohérence** : même pattern que `ops.eventLogs.list` (filtres, pagination, masquage). Types partagés si besoin (ex. masquage payload dans un helper commun).

### References

- Source fonctionnelle : `epics.md` – **Epic 7B : Ops console (logs, erreurs, DLQ, STOP)**, story **7B.2** ; FR38.
- Architecture : `architecture.md` §4.5 (Outbound messaging via outbox + retries + DLQ), §9 (File d’erreurs admin), schéma Prisma (MessageOut, DeadLetterJob).
- Story précédente (patterns à réutiliser) : `7B-1-consulter-les-logs-devenements-correlation-id.md` (opsProcedure, layout (ops), rôles OPS, masquage PII, structure de l’écran logs).

## Dev Agent Record

### Agent Model Used

claude-4.6-opus (Code Review + Fix)

### Debug Log References

### Completion Notes List

- Backend : `ops.dlq.list` (DeadLetterJob, filtres tenant/jobType/resolved, pagination cursor) + `ops.dlq.failedMessages` (MessageOut status=failed, masquage to/body)
- Masquage PII : sanitizePayload étendu (body > 200 chars tronqué), errorStack tronqué à 10 lignes max
- Frontend : page `/ops/errors` avec 2 onglets (DLQ / Envois échoués), filtres tenant + jobType + checkbox non résolu, pagination cursor, Dialog détail payload/stack
- Layout (ops) : barre nav sticky « Logs » / « File d'erreurs » avec indicateur actif (usePathname)
- Tests : 13 tests ops existants (7B.1) + 12 nouveaux (7B.2) = 25 total (dlq.list : jobType filter, errorStack truncation, resolved true/false, pagination, body truncation, auth ; failedMessages : base, auth, body truncation)
- CR 7B-2 round 1 : fixes H1-H3, M1-M5, L1-L3
- CR 7B-2 round 2 : fixes M1-M3, L1-L3 (assertTenantExists helper, tests jobType/errorStack, sentinelles unifiées, try/catch nettoyés)

### File List

- src/server/api/routers/ops.ts (modified)
- src/server/api/routers/ops.test.ts (modified)
- src/app/(ops)/layout.tsx (modified)
- src/app/(ops)/_components/ops-nav.tsx (new)
- src/app/(ops)/ops/errors/page.tsx (new)
- src/app/(ops)/ops/errors/_components/ops-errors-content.tsx (new)
- src/app/(ops)/ops/logs/_components/ops-event-logs-content.tsx (modified)
- src/components/ui/tabs.tsx (new)
- src/components/ui/checkbox.tsx (new)
