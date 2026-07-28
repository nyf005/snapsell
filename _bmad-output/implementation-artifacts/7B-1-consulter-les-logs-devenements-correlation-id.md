# Story 7B.1: Consulter les logs d'événements (correlationId)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant qu’**ops SnapSell**,  
je veux **consulter les logs d’événements (avec correlationId) pour un tenant ou un message**,  
afin de **diagnostiquer rapidement les incidents (messages, réservations, commandes, envois échoués)**.

## Acceptance Criteria

1. **Filtre par tenant**
   - Given je suis connecté en tant qu’ops SnapSell avec accès console ops,  
     When j’ouvre l’écran Logs et que je filtre par un tenant donné (id ou nom lisible),  
     Then je vois la liste des événements de ce tenant (ex. `webhook_received`, `message_sent`, `reservation_started`, `reservation_expired`, `waitlist_promoted`, etc.) avec leur `correlationId`.
2. **Filtre par correlationId**
   - Given je connais un `correlationId` lié à un incident,  
     When je saisis ce `correlationId` dans un champ de recherche dédié,  
     Then la liste des événements est filtrée sur ce `correlationId` et j’obtiens le « film complet » de l’incident (ordre chronologique, horodatage).
3. **Données affichées**
   - Given j’affiche la liste des logs,  
     When la page se charge,  
     Then chaque ligne montre au minimum : `timestamp`, `event_type`, `entity_type`, `entity_id` (si présent), `correlationId`, et un extrait de `payload` non sensible (aucune donnée brute sensible comme numéro complet, adresse complète, preuve brute).
4. **Performance et pagination**
   - Given un tenant actif avec beaucoup d’événements,  
     When je consulte les logs,  
     Then l’affichage est paginé (ou infini scroll) avec un temps de réponse raisonnable (ordre de grandeur < 2–3 s sur dataset MVP) et il est possible de naviguer entre les pages sans recharger toute l’application.
5. **Sécurité et isolation**
   - Given je ne suis pas authentifié comme ops SnapSell,  
     When j’essaie d’accéder à la console des logs,  
     Then l’accès est refusé (redirect ou 403) ; seuls les comptes avec rôle `ops` (ou équivalent) peuvent accéder à l’écran et aux APIs associées.  
   - And les filtres par tenant / correlationId n’exposent jamais de données d’un autre projet que SnapSell (multi-tenant contrôlé côté base).

## Tasks / Subtasks

- [x] **Backend – Modèle et requêtes Event Log**
  - [x] Vérifier / créer le modèle Prisma pour `event_log` (champs : `id`, `created_at`, `event_type`, `entity_type`, `entity_id`, `tenant_id`, `correlation_id`, `actor_type`, `payload` minimal, etc.) en cohérence avec l’architecture.
  - [x] Ajouter les index nécessaires (`tenant_id`, `correlation_id`, `created_at`, éventuellement `(tenant_id, created_at)`).
  - [x] Implémenter une fonction de requête paginée des logs par `tenant_id` + filtres optionnels (`correlationId`, `event_type`, plage de dates).
- [x] **Backend – API / tRPC pour la console ops**
  - [x] Créer une procédure tRPC (ou route API) sécurisée `ops.eventLogs.list` qui prend en entrée : `tenantId` (obligatoire ou restreint à une liste autorisée), `correlationId` optionnel, `page/limit` ou `cursor`.
  - [x] Filtrer strictement par rôle `ops` (middleware d’auth + rôle) et refuser l’accès aux autres rôles.
  - [x] S’assurer que la sérialisation du `payload` masque / tronque les champs sensibles (ex. numéros, adresses complètes, preuves brutes).
- [x] **Frontend – Écran de consultation des logs**
  - [x] Ajouter une vue `Ops / Event Logs` dans le dashboard (ex. route `/ops/logs` ou similaire) accessible uniquement aux comptes `ops`.
  - [x] Afficher un tableau paginé des événements avec colonnes : date/heure, type d’événement, entity_type, entity_id, tenant, correlationId, extrait de payload.
  - [x] Ajouter un champ de filtre par tenant (select / autocomplete) et un champ de recherche par `correlationId`.
  - [x] Gérer l’état de chargement, d’erreur et l’absence de résultats (empty state).
- [x] **Observabilité & DX**
  - [x] Ajouter quelques scénarios de seed de données ou un script de génération de faux events pour tester la console localement.
  - [x] Documenter dans les Dev Notes comment utiliser la console pour diagnostiquer un incident type (ex. message non reçu par cliente, envoi échoué, problème de réservation).

## Dev Notes

- **Architecture générale**
  - Stack décrite dans `architecture.md` : Create T3 App (Next.js App Router) + Prisma + Postgres (Neon) + Redis/BullMQ (Upstash) + workers (Railway) + Event Log pour audit (événements `webhook_received`, `message_sent`, `reservation_started`, `reservation_expired`, `waitlist_promoted`, etc.).
  - L’écran de logs n’écrit pas de nouveaux événements ; il réutilise la table `event_log` déjà alimentée par les epics 2 et 4.
- **Contraintes techniques clés**
  - Respecter l’isolation tenant : toutes les requêtes de logs doivent être filtrées par `tenant_id` et contrôlées côté serveur (pas uniquement par l’UI).
  - Prévoir la montée en charge : pagination côté base (LIMIT/OFFSET ou cursor) et index adaptés sur `tenant_id`, `created_at`, `correlation_id`.
  - Garder le payload minimal côté UI : structurer `payload` en JSON, mais ne rendre que les champs utiles au diagnostic (erreur, type, statut, identifiants métier) sans fuite d’informations sensibles.
- **Sécurité & rôles**
  - Introduire / réutiliser un rôle `ops` dédié, distinct des rôles tenant (vendeur, manager, agent).
  - Mettre en place un garde front (layout / middleware Next) + vérification serveur (tRPC middleware) pour que seules les sessions `ops` puissent appeler les endpoints et voir la vue.
- **Ergonomie**
  - S’aligner sur le design system shadcn/ui + Tailwind déjà utilisé (table, filtres, badges de type d’événement).
  - Penser au mode « suivi d’un incident » : UX optimisée autour de la recherche par `correlationId` + navigation rapide dans les événements.

### Utilisation de la console ops

**Configuration initiale :**
1. Créer un utilisateur avec `role: OPS` et `tenantId: null` en base (un user OPS ne doit pas être un user tenant et inversement).
2. Se connecter avec les identifiants de cet utilisateur.

**Accès :**
- URL : `/ops/logs`
- Seuls les utilisateurs avec `role: OPS` peuvent accéder.
- Les autres utilisateurs sont redirigés vers `/dashboard`.
- Un user OPS qui accède à `/dashboard` est redirigé vers `/ops/logs`.

**Diagnostic d'un incident :**
1. **Par tenant** : Sélectionner le tenant dans le filtre déroulant → voir tous les événements du tenant.
2. **Par correlationId** : Entrer le `correlationId` dans le champ recherche → voir le "film complet" de l'incident (ordre chronologique).
3. **Combinaison** : Filtrer par tenant + correlationId pour isoler un incident spécifique.

**Exemples de cas d'usage :**
- **Message non reçu** : Filtrer par `correlationId` du message → voir `webhook_received`, `message_sent`, `message_blocked_optout` (si bloqué).
- **Réservation expirée** : Filtrer par tenant + `correlationId` → voir `reservation_started`, `reservation_expired`, `waitlist_promoted` (si applicable).
- **Envoi échoué** : Filtrer par tenant + `eventType: message_sent` → voir les payloads d'erreur dans les détails.

**Données masquées automatiquement :**
- Numéros de téléphone : `+33612345678` → `+3****78`
- Adresses complètes : `123 Rue...` → `123 Rue de...`
- Preuves brutes : `[MASQUÉ]`

### Project Structure Notes

- Placer la logique de lecture des logs côté serveur dans un module dédié (ex. `src/server/api/routers/eventLogs.ts` ou équivalent tRPC) pour être réutilisable par d’autres écrans si besoin.
- L’écran React peut vivre dans une section `app/(ops)/ops/logs/page.tsx` (ou similaire) avec composants UI réutilisables (table, filtres).
- Garder les noms de types / enums synchronisés avec ceux déjà utilisés pour l’Event Log et les statuts dans les autres epics (éviter la duplication de chaînes magiques).

### References

- Source fonctionnelle principale : `epics.md` – section **Epic 7B : Ops console (logs, erreurs, DLQ, STOP)**, story **7B.1**.
- Contraintes techniques et stack : `architecture.md` (section Event Log, stack T3 App, workers, BullMQ, Postgres, Redis).
- Liens avec les epics existants : Event Log minimal défini dans les epics 2 (webhook, messages) et 4 (réservations, waitlist).

## Dev Agent Record

### Agent Model Used

Cursor Dev Agent (GPT-5.1)

### Debug Log References

- Voir l’historique git des commits liés à l’introduction de `event_log` et aux workers (epics 2, 4) pour affiner les conventions et noms de tables.

### Completion Notes List

- Story préparée à partir d’Epic 7B.1 avec focus sur la capacité de diagnostic par tenant et par `correlationId`.
- **Implémentation complète** : Console ops multi-tenant avec accès basé sur rôle `OPS` en base (enum Prisma). Users OPS et tenant mutuellement exclusifs.
- **Schema** : Ajout rôle `OPS` à l'enum `Role`. `User.tenantId` rendu nullable (`null` pour les OPS). Session NextAuth adaptée (`tenantId: string | null`).
- **Backend** : Router `ops.eventLogs.list` avec filtres tenantId (optionnel), correlationId (cross-tenant), eventType, dates. Masquage automatique des données sensibles (numéros E.164, adresses, preuves). `buildEventLogWhere` factorisé.
- **Frontend** : Écran `/ops/logs` avec tableau paginé, filtres tenant + correlationId + eventType + dates, debounce 400ms, dates locales (pas UTC), gestion loading/error/empty states.
- **Sécurité** : Middleware `opsProcedure` vérifie `role === OPS`. Layout `/ops` redirige non-ops vers dashboard. Layout dashboard redirige OPS vers `/ops/logs`. Middleware `enforceTenant` bloque les OPS des procédures tenant (tenantId null rejeté).
- **Tests** : 13 tests unitaires couvrant accès ops, filtres par tenant, filtres par correlationId (cross-tenant), masquage données sensibles (phones E.164, non-phones, adresses), erreurs, exclusion mutuelle OPS/tenant.
- **Factorisation** : `buildEventLogWhere` partagé entre `eventLog.ts` et `ops.ts` (évite duplication).
- **Seed** : Script `prisma/seed-ops-events.ts` pour générer des events fictifs en local.
- **Supprimé** : `OPS_EMAILS` de `env.js`, `.env.example` (remplacé par rôle DB).
- **CR fixes** : Cross-tenant date filters, debounce correlationId, safe Prisma types, timezone local dates.

### File List

- `_bmad-output/implementation-artifacts/7B-1-consulter-les-logs-devenements-correlation-id.md`
- `prisma/schema.prisma` (ajout OPS à Role enum, User.tenantId nullable)
- `.env.example` (suppression OPS_EMAILS)
- `src/env.js` (suppression OPS_EMAILS du schéma t3-env)
- `src/server/auth.ts` (session tenantId string|null, callbacks adaptés)
- `src/lib/rbac.ts` (isOpsUser vérifie role au lieu d'email, suppression lazy env singleton)
- `src/server/api/trpc.ts` (ajout enforceTenant middleware, opsProcedure check role)
- `src/server/api/routers/ops.ts` (nouveau router ops multi-tenant)
- `src/server/api/routers/ops.test.ts` (13 tests ops router)
- `src/server/api/routers/eventLog.ts` (refactorisé : utilise buildEventLogWhere partagé)
- `src/server/api/root.ts` (ajout opsRouter)
- `src/server/events/buildEventLogWhere.ts` (nouveau : filtre EventLog partagé)
- `src/hooks/use-debounce.ts` (nouveau : hook debounce)
- `src/app/(ops)/layout.tsx` (layout protection ops via role)
- `src/app/(ops)/ops/logs/page.tsx` (page ops logs)
- `src/app/(ops)/ops/logs/_components/ops-event-logs-content.tsx` (composant UI ops logs)
- `src/app/(dashboard)/layout.tsx` (guard OPS → redirect /ops/logs)
- `prisma/seed-ops-events.ts` (nouveau : seed script faux events)

