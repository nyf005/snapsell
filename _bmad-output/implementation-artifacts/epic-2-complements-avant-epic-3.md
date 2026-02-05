# Epic 2 – Compléments à faire avant Epic 3

**Objectif** : Réaliser les quatre points laissés en option ou partiellement traités en Epic 2 avant de démarrer l’Epic 3.

**Référence** : Rétrospective Epic 2 (décision Fabrice – tout faire avant Epic 3).

---

## Vue d’ensemble

| # | Origine | Sujet | Statut |
|---|--------|--------|--------|
| 1 | 2.1 | Rate limiting + monitoring structuré (webhook) | Fait |
| 2 | 2.2 | API tRPC pour SellerPhones | Fait |
| 3 | 2.5 | Test d’intégration STOP → OptOut → message bloqué | Fait |
| 4 | 2.6 | Durcir race condition getOrCreateCurrentSession | Fait |

---

## 1. Rate limiting + monitoring structuré (Story 2.1)

**Contexte** : Review 2.1 – items LOW laissés en option (rate limiting, monitoring structuré). Architecture §9 mentionne Sentry ; NFR et PRD évoquent gestion rate limits.

**Périmètre :**

- **Rate limiting sur le webhook**
  - Protéger la route `/api/webhooks/twilio` contre le spam (par IP et/ou par tenant si identifiable).
  - Réutiliser ou créer un mécanisme type `lib/rate-limit` ; réponse 429 ou 200 + log si limite dépassée (selon politique produit pour éviter retries Twilio).
- **Monitoring structuré**
  - Intégrer Sentry (ou équivalent) pour le webhook : erreurs + traces.
  - Exposer des métriques utiles (ex. latence P95, taux d’erreur) si possible (Sentry, ou autre outil déjà prévu).

**Critères de complétion :**

- [x] Rate limiting actif sur la route webhook (configurable, documenté dans README ou DEPLOYMENT).
- [x] Sentry (ou outil choisi) intégré pour le webhook ; erreurs critiques remontées.
- [x] Documentation mise à jour (`.env.example`, DEPLOYMENT.md ou README) pour les nouvelles configs.

**Fichiers livrés :** `src/app/api/webhooks/twilio/route.ts`, `src/lib/rate-limit.ts` (checkWebhookRateLimit, getClientIpFromRequest), `src/lib/sentry.ts` (captureException dynamique), `src/env.js`, `.env.example`, DEPLOYMENT.md.

---

## 2. API tRPC pour SellerPhones (Story 2.2)

**Contexte** : Story 2.2 Task 3 – « API tRPC pour gérer seller_phone(s) (optionnel MVP, peut être fait dans Story 1.6 ou story dédiée) ». Actuellement les numéros vendeur sont en base (SellerPhone) mais pas gérés depuis le dashboard.

**Périmètre :**

- **Router tRPC protégé** (sous `src/server/api/routers/` ou dans `settings`) :
  - `addSellerPhone` : ajouter un numéro (validation E.164, Zod), isolation tenant.
  - `removeSellerPhone` : retirer un numéro.
  - `listSellerPhones` : lister les numéros du tenant.
- **RBAC** : Owner/Manager uniquement (ex. `canManageGrid` ou rôle équivalent).
- **UI minimale** : au moins une page ou section « Paramètres » / « WhatsApp » permettant d’ajouter/supprimer/lister les numéros vendeur (si l’epic 1 a déjà une page config WhatsApp, l’étendre ici).

**Critères de complétion :**

- [x] Router tRPC avec add / remove / list ; validation E.164 ; isolation tenant.
- [x] RBAC appliqué sur les procédures.
- [x] UI (dashboard) permettant de gérer les numéros vendeur pour le tenant.
- [x] Documentation (README ou story) mise à jour.

**Fichiers livrés :** `src/server/api/routers/sellerPhones.ts`, `src/server/api/routers/sellerPhones.test.ts`, `src/server/api/root.ts`, `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`. Validation E.164 via `~/lib/validations/phone.ts`, RBAC `canManageGrid` via `~/lib/rbac`.

---

## 3. Test d’intégration STOP → OptOut → message bloqué (Story 2.5)

**Contexte** : Story 2.5 Task 5 – « Test intégration : webhook STOP → OptOut créé → message suivant bloqué (optionnel MVP) » – non réalisé.

**Périmètre :**

- Un test d’intégration (ou E2E) qui :
  1. Simule la réception d’un message STOP sur le webhook (signature valide, tenant résolu).
  2. Vérifie qu’un enregistrement OptOut est créé pour (tenant_id, phone_number).
  3. Met un message en outbox vers ce numéro (ou simule le flux outbox-sender).
  4. Vérifie que le message n’est pas envoyé (status = 'blocked') et/ou qu’un événement `message.blocked_optout` est loggé dans l’EventLog.

**Critères de complétion :**

- [ ] Test d’intégration ajouté (fichier dédié ou suite existante).
- [x] Test exécutable en CI (ou documenté si besoin Redis/DB de test).
- [x] Story 2.5 mise à jour : case « Test intégration STOP → OptOut → message bloqué » cochée.

**Fichiers livrés :** `src/server/workers/__tests__/stop-optout-blocked.integration.test.ts`. Exécution : `RUN_INTEGRATION_TESTS=true` + `DATABASE_URL` (DB de test) ; import dynamique pour ne pas exiger env en CI quand le test est skip.

---

## 4. Durcir race condition getOrCreateCurrentSession (Story 2.6)

**Contexte** : Story 2.6 – race condition getOrCreateCurrentSession actuellement documentée en JSDoc (« acceptable MVP, durcir si scaling »). Décision : durcir avant Epic 3.

**Périmètre :**

- Éviter la création concurrente de plusieurs sessions actives pour le même tenant lorsque plusieurs jobs traitent des messages en parallèle.
- Moyens possibles (au choix, selon préférence stack) :
  - Transaction DB : dans `getOrCreateCurrentSession`, utiliser une transaction avec `SELECT ... FOR UPDATE` sur la session active (ou sur un verrou tenant) avant de créer une nouvelle session.
  - Ou contrainte unique + retry : une seule session `active` par tenant (contrainte ou règle métier) ; en cas de conflit (creation en parallèle), retry avec lecture de la session créée par l’autre worker.
- Comportement attendu : un seul tenant ne doit jamais se retrouver avec deux sessions actives ; last_activity_at mis à jour de façon cohérente.

**Critères de complétion :**

- [x] Implémentation durcie (transaction ou contrainte + retry) dans `src/server/live-session/service.ts` (ou équivalent).
- [x] Comportement vérifié par un test (unit ou intégration) simulant deux appels concurrents.
- [x] JSDoc / README mis à jour pour refléter le comportement et la garantie.

**Fichiers livrés :** `src/server/live-session/service.ts` (contrainte unique + retry P2002), `prisma/migrations/20260209200000_live_sessions_unique_active_per_tenant/migration.sql`, `src/server/live-session/service.test.ts` (test concurrence P2002), `src/server/workers/README.md` (section Service live-session).

---

## Ordre suggéré

1. **2.2 API tRPC SellerPhones** – débloque l’usage réel des numéros vendeur depuis le dashboard.
2. **2.1 Rate limiting + monitoring** – renforce la prod avant de monter en charge (Epic 3+).
3. **2.5 Test intégration STOP** – validation du flux critique opt-out.
4. **2.6 Race condition** – stabilité du service live-session avant Epic 3 (live_items, réservations).

Tu peux suivre cet ordre ou l’adapter ; l’important est que les quatre points soient cochés avant de créer les stories Epic 3 dans le sprint.

---

## Mise à jour du sprint-status

Quand les quatre compléments sont terminés, mettre à jour (manuellement ou via workflow) :

- Ce fichier : toutes les cases « Fait » → « Fait » et cocher les critères de complétion.
- Optionnel : ajouter une entrée dans `sprint-status.yaml` ou dans la rétro Epic 2 pour tracer que les compléments ont été livrés avant démarrage Epic 3.

---

*Document créé le 2026-02-05 – Compléments Epic 2 avant Epic 3.*
