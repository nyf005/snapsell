---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-02-03'
inputDocuments:
  - prd.md
  - product-brief-SnapSell-2026-02-03.md
  - user-brief-SnapSell-2026-02-03.md
  - ux-design-specification.md
project_name: 'SnapSell'
user_name: 'Fabrice'
date: '2026-02-03'
---

# Architecture Decision Document

_Ce document fixe les décisions d'architecture pour SnapSell MVP afin d'éviter les hypothèses dangereuses pendant l'implémentation._

> ## ⚠️ État du document
>
> Rédigé le **2026-02-03**, avant implémentation. Trois évolutions structurantes sont intervenues depuis et **ont été répercutées ici** :
>
> | Évolution | Commit | Effet |
> |---|---|---|
> | **Twilio → Meta WhatsApp Cloud API** | `4960480`, `6c2926e` (Epic 10) | Le BSP a changé. L'abstraction `MessagingProvider` du §7.1 a permis la bascule sans toucher au métier — la décision **G** est validée par les faits. |
> | **BullMQ + Redis → pg-boss + Postgres** | `4ef1a49` (Story 11.1) | La queue vit désormais **dans Neon**. Redis ne sert plus qu'au rate limiting tRPC. |
> | **Crons Vercel → schedules pg-boss** | `c64837d`, `46e06e5` | Les crons métier tournent dans le worker Railway. `vercel.json` ne contient **aucune** clé `crons`. |
>
> Les sections ci-dessous décrivent l'architecture **telle qu'implémentée**. Là où la conception d'origine diffère, c'est signalé par une note « _Conception d'origine :_ » afin de préserver le raisonnement sans induire en erreur.
>
> **Source de vérité opérationnelle :** [DEPLOYMENT.md](../../DEPLOYMENT.md) pour le déploiement et les variables d'environnement, [src/env.js](../../src/env.js) pour la liste exacte des variables.

---

## Ouverture (positionnement système)

- SnapSell est un système **event-driven** centré WhatsApp (Meta Cloud API) avec une console web ops.
- Le webhook entrant est **ultra-léger** (verify + dedupe + persist + enqueue) afin de garantir **&lt; 1 s**.
- Toute logique métier (intent parsing, réservation/file/TTL, création commande, envoi outbox) est exécutée dans des **workers**.
- La cohérence métier est garantie par **transactions DB + verrous ciblés** + contraintes d'unicité, avec audit trail et correlationId.

---

## 1. Architecture Goals & Non-Goals

### Goals

- **P95 bot &lt; 2 s** : temps message client (code) → réponse bot (réservé / file / expiré).
- **Webhook &lt; 1 s** : réponse HTTP 200 au webhook Meta sans bloquer au-delà.
- **0 double attribution** sur pièces uniques (audit).
- **Multi-tenant strict** : isolation complète des données et accès par tenant.
- **Audit** : correlationId, event log, traçabilité des actions sensibles.

### Non-Goals MVP

- Temps réel WebSocket sur le dashboard (polling 30–60 s suffit).
- Multi-canaux (TikTok/IG/Snap checkout) — vision post-MVP.
- Billing / facturation complète (entitlements simples, manuel au besoin).
- Analytics avancés (volumes, no-show, etc. en post-MVP).

---

## 2. System Overview

### Rôle des canaux

- **WhatsApp (Meta Cloud API)** = moteur d'interaction : checkout, réservation, confirmation, suivi client.
- **Web** = console ops : config, commandes, preuves, Live Ops, paramètres.

### Vue C4 (niveau 1/2)

- **Meta Cloud API** ⇄ **Webhook API** (réception messages, réponse 200 rapide).
- **Webhook API** ⇄ **DB** (persist MessageIn, idempotence).
- **Webhook API** → **Queue pg-boss** (enqueue dans Postgres pour le worker Railway).
- **Worker(s)** ⇄ **DB** (logique métier, outbox, réservations, commandes).
- **Worker(s)** → **QStash** → **route Vercel** → **Meta Cloud API** (envoi messages sortants).
- **Web App** ⇄ **API** (dashboard, paramètres, Proofs, Live Ops).

_L'envoi sortant ne part pas directement du worker : celui-ci publie un job QStash, consommé par `/api/qstash/outbox-send` sur Vercel qui appelle Meta. Voir §11.2._

_À détailler : diagramme C4 niveau 1 (contexte) et niveau 2 (conteneur) dans un artefact dédié si besoin._

---

## 3. Core Domain Model

- **Tenants, Users, Roles** : tenant = vendeur/boutique ; rôles Owner, Manager, Vendeur, Agent ; délégation par invitation.
- **LiveSession (auto)** : créée à la première action live, fermée après inactivité ; `last_activity_at`, statut active/closed.
- **LiveItem / PreparedStockItem** : item en session (code, catégorie, prix, qty pour stock préparé) ; lien vers session.
- **Reservation + Waitlist** : réservation liée à un live_item ; file d'attente par item ; TTL, rappel, expiration, promotion auto.
- **Order + PaymentProof** : commande (SS-XXXX) issue d'une réservation confirmée ; statuts ; preuve acompte (image/texte) avec états pending/approved/rejected.
- **MessageIn / MessageOut (Outbox)** : MessageIn pour idempotence (tenant_id, message_sid) ; MessageOut pour envoi avec retries + DLQ.
- **EventLog (audit)** : événements horodatés (création item, réservation, promotion waitlist, confirmation, preuves, changements statuts, overrides).

---

## 4. Key Flows

### 4.1 Inbound message pipeline

1. **Meta Cloud API** → `POST /api/webhooks/meta` (Vercel).
2. Vérification signature Meta (HMAC-SHA256 via `META_APP_SECRET`), **avant** toute résolution de tenant.
3. Résolution du tenant : `phone_number_id` du payload → `tenant.metaPhoneNumberId`. Si aucun tenant ne correspond, le message est persisté avec `tenantId = null` et aucun job n'est créé.
4. Idempotence : lookup `(tenant_id, provider_message_id)` ; si déjà traité → 200 sans retraitement.
5. Persist **MessageIn**.
6. Enqueue job pg-boss sur la queue `webhook-processing` (dans Postgres).
7. Réponse **200** (&lt; 1 s).
8. **Worker Railway** : routing vendeur vs client → intent parsing → action (réservation, confirmation, création item, etc.) → écriture MessageOut (outbox) → publication QStash pour l'envoi.

### 4.2 Reserve → waitlist → promote

- Client envoie code → réservation si dispo, sinon placement en file.
- TTL sur réservation ; rappel T-2 min ; à expiration : promotion automatique du premier en file.
- Unicité et ordre garantis par transactions + contraintes (voir § 5).

### 4.3 Confirm (OUI + address) → create order → acompte state

- Après collecte adresse, client envoie OUI (ou choix du code si plusieurs réservations).
- Création commande (SS-XXXX) ; état `confirmed_pending_deposit` ou `confirmed` selon config acompte.
- Si acompte activé : demande preuve ; TTL acompte (ex. 15–30 min) ; états deposit_received / approved / rejected.

### 4.4 Stock decrement at confirmation

- **Réservation** : ne décrémente pas le stock ; pour stock &gt; 1, on « hold » une unité (reserved_qty += 1).
- **Confirmation** : reserved_qty -= 1, available_qty -= 1.
- **Expiration** : reserved_qty -= 1 (pas de décrément available).

### 4.5 Outbound messaging via outbox + retries + DLQ

- Tout envoi sortant écrit d'abord dans **MessageOut** (outbox) avec statut pending.
- `enqueueOutboxSend()` publie un job **QStash** ; la route `/api/qstash/outbox-send` (Vercel) appelle Meta et met à jour le statut (sent / failed).
- Retries avec backoff : gérés par **QStash** (5 tentatives) ; après épuisement, `failureCallback` → `/api/qstash/outbox-dlq` → `dead_letter_jobs` ; traçabilité et file d'erreurs pour ops.

> _Conception d'origine :_ un worker outbound long-running lisait l'outbox en polling et appelait le BSP directement. L'envoi a été externalisé sur QStash + Vercel car il est idempotent, tolérant à la latence et bénéficie des retries managés. Le worker Railway ne fait plus que **publier** le job.

---

## 5. Consistency & Concurrency

- **Transactions et verrous** : réservation, confirmation et promotion waitlist dans des transactions avec locks ciblés.
- **Contraintes d'unicité** : `(tenant_id, message_sid)` sur messages_in ; clés idempotentes pour actions sensibles (voir § 2 décisions B).
- **Réservation atomique (item unique qty=1)** : `SELECT ... FOR UPDATE` sur live_item (ou row stock) ; vérifier statut ; créer réservation ; mettre à jour statut item.
- **Waitlist** : insertion avec position = max(position)+1 sous lock (ou séquence par item) pour garantir l'ordre et éviter les doublons.
- **Idempotence de bout en bout** : message in (MessageSid) + reservation_attempt_key + confirmation_key pour éviter double réservation / double confirmation en cas de rejeu ou spam.
- **Transaction globale confirmation → création Order** : la confirmation (décrément stock via `confirmReservation`) et la création de commande (`order.create`) sont dans une seule `db.$transaction` atomique Prisma. Si l'Order ne peut être créé après le décrément stock, tout est rollback (stock intact, pas de commande fantôme). `confirmReservation` accepte un `tx` optionnel pour participer à la transaction externe.

---

## 6. Live Session Auto

### Règles recommandées (décision figée)

- **Session courante** : `current_live_session(tenant)` = session `active` la plus récente avec `last_activity_at &gt; now - INACTIVITY_WINDOW`.
- **Création auto** : au 1er message « code » (client) OU à la 1ère action vendeur (stock prep / création code).
- **Fermeture auto** : job périodique qui ferme les sessions inactives (last_activity_at &lt; now - INACTIVITY_WINDOW).
- **INACTIVITY_WINDOW MVP** : 30–60 min (valeur à choisir et documenter dans la config tenant).

---

## 7. Messaging & Templates

- **Contrat de messages** : types (réservé, file, promotion, expiration, acompte demandé, preuve reçue/refusée, etc.) ; clés de copy (templates) ; locale (plus tard).
- **Rate limiting / backoff** : respect des limites Meta Cloud API ; backoff sur erreurs d'envoi (délégué à QStash) ; pas de flood côté SnapSell.
- **STOP** : politique explicite par tenant (scope = tenant) ; après STOP, seuls les messages transactionnels stricts autorisés ou aucun, selon règle produit (FR46).

### 7.1 Messaging provider-agnostic (BSP interchangeable)

L’architecture est **provider-agnostic**. **Cette décision a été validée en pratique** : la bascule Twilio → Meta Cloud API (Epic 10) n'a demandé qu'un nouvel adapteur et une nouvelle route webhook, **sans toucher à la logique réservation / file / stock**.

**BSP actuel : Meta WhatsApp Cloud API.** Adapteur dans [`src/server/messaging/providers/meta/`](../../src/server/messaging/providers/meta/).

- **Interface MessagingProvider (ou BspAdapter)** :
  - **Parse inbound** : le webhook BSP est traité par un adapteur qui valide la requête, vérifie la signature, et produit un **type normalisé** (`InboundMessage` : `tenantId`, `providerMessageId`, `from`, `body`, `mediaUrl?`, `correlationId`). Ce type est le seul consommé par la couche métier.
  - **Send** : la couche métier écrit dans l’**outbox** avec un payload normalisé (destinataire, corps, type de message). `processOutboundMessage()` appelle `provider.send(message)` ; l’adapteur traduit vers l’API du fournisseur.
  - **Verify webhook** : `verifySignature(req, secret)` propre à chaque BSP, appelé avant parse inbound.
- **Outbox** : schéma en DB indépendant du BSP (tenant_id, to, body, status, correlation_id, etc.) ; pas de champs obligatoires spécifiques au fournisseur. Les adapteurs font la traduction outbox → API BSP.
- **Idempotence** : clé unique sur `(tenant_id, provider_message_id)` où `provider_message_id` est l’ID fourni par le BSP (aujourd'hui le `wamid` Meta). Même sémantique pour tout BSP.
- **Mapping tenant** : le tenant est toujours identifié par `tenant_id` ; la config BSP vit **par tenant en base** — `metaPhoneNumberId` et `metaAccessToken` (chiffré AES-256-GCM) sur le modèle `Tenant`, jamais en variable d'environnement ni codée en dur dans le métier.
- **Métier** : la logique réservation, file d’attente, stock, confirmation, commandes ne dépend que des types normalisés (InboundMessage, écriture outbox) et jamais des SDK ou types du fournisseur. Ajouter un second BSP = nouvelle route webhook + nouvel adapteur implémentant MessagingProvider, sans toucher aux workers métier.

**Messages interactifs :** l'outbox supporte, au-delà du texte brut, les payloads `buttons`, `list`, `product` et `product_list` (validés par Zod dans [`outbox.ts`](../../src/server/messaging/outbox.ts)). Les templates métier les utilisent largement — voir [`templates.ts`](../../src/server/messaging/templates.ts).

---

## 8. Data Storage

- **Schéma DB** : tables (tenants, users, roles, live_sessions, live_items, reservations, waitlist, orders, payment_proofs, messages_in, messages_out, event_log) ; index sur (tenant_id, message_sid), (tenant_id, live_session_id), (reservation_id), etc. ; contraintes d'unicité et clés étrangères.
- **Stock préparé** : champs reserved_qty, available_qty ; contraintes pour éviter available &lt; 0 et incohérences.
- **Media (preuves/photos)** : **Cloudflare R2** (S3-compatible) avec chemins en DB ; **signed URLs** pour consultation sécurisée par le dashboard (Proofs Inbox).
- **Rétention** : politique de rétention des données (numéros, adresses, preuves) alignée RGPD si applicable ; documentée dans la section Security / Compliance.

---

## 9. Observability & Ops

- **Observabilité (MVP)** : **Sentry** (erreurs + traces), notamment webhook et workers.
- **correlationId** : propagé de MessageIn à tous les événements et logs (réservation, commande, outbox) pour diagnostic bout en bout.
- **Métriques** : latence webhook, latence bot (P95), échecs d'envoi, précision TTL (expirations à l'heure), taux de doublons évités (idempotence), profondeur des queues (outbox, DLQ).
- **File d'erreurs (admin)** : sémantique claire : messages en échec après retries, erreurs media, etc. ; consultation par tenant pour ops/support.

---

## 10. Security

- **Vérification signature Meta** : rejet des requêtes webhook non authentiques (HMAC-SHA256).
- **Isolation tenant + RBAC** : toutes les requêtes et requêtes DB filtrées par tenant_id ; rôles Owner/Manager/Vendeur/Agent avec permissions définies.
- **Secrets** : clés API, secrets d'app en gestion sécurisée (env vars / secret manager) ; jamais en clair dans le code ou le repo.
- **PII** : numéros, adresses, preuves — accès restreint, chiffrement au repos et en transit ; durée de conservation et droits d'accès/suppression (RGPD) documentés.
- **Chiffrement at-rest `metaAccessToken`** : `AES-256-GCM` via `src/lib/crypto.ts` ; clé 32 octets (64 hex) dans `ENCRYPTION_KEY` ; format `enc:<iv>:<authTag>:<ciphertext>` ; décryptage transparent à la lecture ; dégradation gracieuse (plaintext) en dev sans clé.
- **Session revocation (tokenVersion)** : colonne `token_version` sur `users` ; incrémenté pour invalider toutes les sessions actives ; re-check DB toutes les heures dans le JWT callback ; durée de session réduite à 7 jours.
- **Rate limiting tRPC** : Upstash Redis sliding window 20 req/min par userId via `src/lib/trpc-rate-limit.ts` ; désactivé si `UPSTASH_REDIS_REST_URL` absent (dev).

---

## 11. Deployment & Runtime

### 11.1 Stack plateformes (web-first, figée)

**Décision :** **Vercel (web + webhook + callbacks QStash) + Neon (Postgres + queue) + Upstash (QStash outbox + Redis rate limit) + Railway (worker entrant + crons) + Cloudflare R2 (médias) + Sentry (observabilité).**

| Composant | Plateforme | Rôle |
|-----------|------------|------|
| Web (landing, subscription, dashboard) + API tRPC | **Vercel** | Next.js/T3 ; auth, pages publiques, dashboard ; très bon DX. |
| Crons métier | **pg-boss** sur **Railway** | `reservation-ttl` (1 min), `deposit-expiry` (5 min), `close-sessions` (10 min), `meta-catalogue-sync` (1 h), `subscription-expired` (quotidien) ; `boss.schedule()` dans `scripts/start-worker.ts`. Verrou distribué en DB. |
| Queue outbox (envoi sortant) | **Upstash QStash** | Event-driven, serverless-native ; retries automatiques (×5, backoff exponentiel) ; failure callback DLQ. |
| Queue webhook-processor | **pg-boss** (Postgres) | Queue métier in-DB ; pas de Redis requis ; worker long-running sur Railway. |
| Rate limiting tRPC | **Upstash Redis** | Sliding window 20 req/min par userId ; désactivé si clé absente (dev). **Seul usage de Redis dans le système.** |
| Base de données | **Neon** | Postgres ; source de vérité applicative **et** backend de queue pg-boss. |
| Worker | **Railway** | Traitement métier entrant (intent parsing, réservation, commandes, event log) + les 5 crons ; seul process long-running. |
| Stockage médias (preuves acompte, photos) | **Cloudflare R2** | S3-compatible ; bon coût, signed URLs pour Proofs Inbox. |
| Observabilité | **Sentry** | Erreurs + traces (webhook, workers). |

> ⚠️ **Les crons ne sont pas sur Vercel Cron.** La bascule a été tentée deux fois puis annulée (`c64837d` : plan Hobby limité à 1 exécution/jour ; `46e06e5` : retour au worker). `vercel.json` doit rester **sans clé `crons`** : les routes `/api/cron/*` exécutent la même logique métier que les schedules pg-boss, et les activer en parallèle ferait tourner chaque job deux fois sans verrou partagé.

### 11.2 Répartition des responsabilités

**Sur Vercel :**
- Landing marketing, subscription (billing manuel MVP), dashboard (Commandes, Proofs inbox, Live Ops, Paramètres), API tRPC.
- **Webhook** `/api/webhooks/meta` — **léger uniquement**, réponse &lt; 1 s :
  1. Vérif signature Meta (HMAC-SHA256)
  2. Resolve tenant + vendeur/client (mapping)
  3. Idempotence (tenant_id + provider_message_id)
  4. Enqueue job pg-boss
  5. `200 OK`
- **Outbox send** `/api/qstash/outbox-send` — callback QStash pour envoi sortant Meta ; retours 503 déclenchent retry QStash.
- **Outbox DLQ** `/api/qstash/outbox-dlq` — failure callback QStash après épuisement des retries ; persist `DeadLetterJob`.
- **Routes cron** `/api/cron/*` (`reservation-ttl`, `close-sessions`, `deposit-expiry`, `meta-catalogue-sync`, `subscription-expired`) — **fallbacks manuels / ops uniquement**, protégés par `Authorization: Bearer <CRON_SECRET>`. Elles ne sont **pas** déclenchées automatiquement : les schedules réels sont sur Railway.
- **Health check** `/api/healthz` — ping DB, retourne 200 `{status:"ok"}` ou 503 `{status:"degraded"}`.

**Sur Railway (worker — un seul process) :**
- Consommation de la queue pg-boss `webhook-processing` (`localConcurrency: 5`)
- Intent parsing + règles métier (réservation, file, TTL, variantes, waitlist)
- Création commande SS-XXXX + statuts
- Décrément stock **à la confirmation** (pas à la réservation)
- Écriture MessageOut (outbox) → `enqueueOutboxSend` → QStash publie vers `/api/qstash/outbox-send`
- Téléchargement médias Meta → upload R2 → lien sécurisé en DB
- **Les 5 crons métier** via `boss.schedule()`

### 11.3 Variables d'environnement

> La liste faisant foi est [`src/env.js`](../../src/env.js). Les noms ci-dessous en sont extraits.

**Vercel (web) :**
`DATABASE_URL` (Neon), `AUTH_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `PAYSTACK_*`, `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL_NAME`, `SENTRY_DSN` (optionnel), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_META_*`.

**Vercel — sécurité & infra :**
`ENCRYPTION_KEY` (64 hex, requis en prod — chiffrement AES-256-GCM `metaAccessToken`), `CRON_SECRET` (requis en prod ; Bearer des routes cron de secours), `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (rate limiting tRPC).

**Railway (worker) :**
`NODE_ENV=production`, `DATABASE_URL` (Neon, **URL directe non-pooler** — pg-boss est incompatible avec PgBouncer), `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` (ces trois-là exigés par la validation env en prod, même si le worker ne les utilise pas fonctionnellement), `QSTASH_TOKEN` **et** `NEXT_PUBLIC_APP_URL` (requis **ensemble** pour publier l'outbox), `R2_*`, `AI_API_KEY`, `SENTRY_DSN`.

⚠️ **Piège :** si `QSTASH_TOKEN` **ou** `NEXT_PUBLIC_APP_URL` manque sur Railway, `enqueueOutboxSend()` bascule silencieusement sur la queue pg-boss `outbox-send` — **que rien ne consomme**. Les messages restent en `pending` sans erreur dans les logs.

❌ **N'existent pas** (présentes dans d'anciennes versions de ce document) : `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `META_WEBHOOK_SECRET`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `REDIS_URL`, `REDIS_TOKEN`, `TWILIO_*`.

### 11.4 Runbooks

- **Webhook service** : garder la réponse &lt; 1 s (pas de logique lourde sur Vercel).
- **Workers** : scaling selon la profondeur de la queue ; un worker peut traiter plusieurs tenants (isolation par job).
- **Runbooks** : incident Meta Cloud API down (retries QStash, DLQ, pas de perte de MessageIn) ; croissance DLQ (alerte, traitement manuel ou réingestion) ; dérive TTL (vérifier les schedules pg-boss et les horloges) ; worker Railway arrêté (la queue `pgboss.job` s'accumule — les messages entrants sont persistés mais non traités).

---

## Décisions techniques figées (résumé)

| Décision | Recommandation |
|----------|----------------|
| **A) Pipeline webhook &lt; 1 s + bot P95 &lt; 2 s** | Webhook : verify → resolve tenant → idempotence check → persist MessageIn → enqueue pg-boss → 200. Worker : traitement métier + écriture outbox + publication QStash. |
| **B) Idempotence message in + actions métier** | Unique (tenant_id, message_sid) sur messages_in. Clés idempotentes : reservation_attempt_key (tenant_id + client_phone + live_item_id + session_id), confirmation_key (tenant_id + client_phone + reservation_id). |
| **C) Concurrence réservation / 0 double attribution** | Transaction + SELECT FOR UPDATE sur live_item ; création réservation + update statut. Waitlist : position = max(position)+1 sous lock. |
| **D) Stock : bloquer à la réservation, décrémenter à la confirmation** | Réservation : reserved_qty += 1 (pas de décrément available). Confirmation : reserved_qty -= 1, available_qty -= 1. Expiration : reserved_qty -= 1. |
| **E) Live session auto** | current_live_session = active + last_activity_at &gt; now - INACTIVITY_WINDOW ; création au 1er code client ou 1ère action vendeur ; job de fermeture ; fenêtre 30–60 min. |
| **F) Acompte recommandé** | États : confirmed_pending_deposit, confirmed (si deposit off), deposit_received. TTL acompte ex. 15–30 min. Preuve : payment_proofs + pending/approved/rejected. |
| **G) Messaging provider-agnostic** | Interface MessagingProvider (parse inbound, send, verify signature). Outbox + idempotence + mapping tenant en types normalisés. Métier (réservation/file/stock) ne dépend pas du BSP. **Validé en pratique** : bascule Twilio → Meta (Epic 10) sans réécriture du métier. |
| **H) Stack plateformes (web-first)** | Vercel (web + webhook + callbacks QStash) + Neon (Postgres applicatif **et** queue pg-boss) + Upstash (QStash outbox + Redis rate limit) + Railway (worker entrant **+ crons métier**) + Cloudflare R2 (médias) + Sentry. Répartition : Vercel = landing, dashboard, tRPC, webhook &lt; 1 s, outbox send/DLQ ; Railway = consommation queue, intent parsing, métier, écriture outbox, schedules pg-boss. **Pas de cron Vercel.** |
| **J) Chiffrement at-rest** | `metaAccessToken` chiffré AES-256-GCM en DB (`src/lib/crypto.ts`). ENCRYPTION_KEY 32 octets (64 hex). Format `enc:<iv>:<authTag>:<ciphertext>`. Script idempotent `scripts/encrypt-existing-tokens.ts` pour migration. |
| **K) Session revocation** | `token_version` sur `users` ; incrémenté pour invalider sessions. Re-check DB toutes les heures dans JWT callback. Durée de session 7 jours. |
| **L) Rate limiting** | Upstash Redis sliding window 20 req/min par userId sur `protectedProcedure`. Désactivé si clés absentes (dev/test). |
| **I) Transaction globale confirmation + Order** | `db.$transaction` Prisma englobant `confirmReservation` (décrément stock) + `reservation.update` (statut confirmed) + `order.create` (SS-XXXX). Rollback atomique si une étape échoue. `confirmReservation` accepte un `tx` optionnel (rétrocompatible sans tx). Retry P2002 order_number au niveau de la transaction entière. |

---

## Pièges à éviter (explicites pour l’implémentation)

- **Routage vendeur vs client** : ne jamais traiter un message vendeur comme client (sinon auto-réservations incorrectes). Le numéro vendeur = seller_phone(s) enregistré côté tenant ; un message « A12 » du vendeur doit déclencher « Tu veux créer l'article A12 ? » et non une réservation cliente.
- **Code inconnu vs épuisé** : erreur de saisie (typo, code inexistant) ≠ rupture de stock. Message clair « Code inconnu (ex: A12). Vérifie et renvoie. » ; « Épuisé » uniquement si le code existe et stock = 0 / déjà vendu.
- **WhatsApp ordering** : les messages peuvent arriver hors ordre. Le moteur doit être tolérant : state machine par conversation (client + session) ; pas d'hypothèse sur l'ordre strict des messages.
- **Media download** : le fetch des médias Meta (photos preuve) peut être lent et exige un token Bearer déchiffré. Toujours traiter en **async** ; ne pas bloquer le webhook sur un téléchargement media.
- **Couplage BSP** : ne pas faire dépendre la logique réservation/file/stock de types ou SDK du fournisseur. Passer par l’interface MessagingProvider et des types normalisés (InboundMessage, outbox) pour garder la possibilité de changer de BSP sans réécrire le métier.
- **État conversationnel et concurrence** : le worker tourne en `localConcurrency: 5`. Les machines à états (`ConversationState`, sélection de variantes, config vendeur) faisaient du read-modify-write **sans verrou**, si bien que deux messages rapprochés d'un même couple `tenantId + phone` pouvaient se marcher dessus. Depuis le 2026-07-28, `handleVariantChoice` et `handleSellerVariantConfigReply` prennent un `FOR UPDATE` sur `conversation_states` — même motif que `reserveUnits` et `checkAndConsumeCredit`. **Toute nouvelle machine à états conversationnelle doit adopter ce motif.**

---

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack** (web dashboard + API webhook + workers) d'après le document d'architecture et la spec UX.

### Starter Options Considered

- **Create T3 App** (`npm create t3-app@latest`) — Full-stack TypeScript, Next.js, tRPC, Prisma ou Drizzle, Tailwind, NextAuth ; modulaire. Référence pour projets typesafe Next.js ; couche workers à ajouter.
- **create-next-app** (`npx create-next-app@latest`) — Next.js minimal avec options `--ts`, `--tailwind`, `--app`, `--api` ; base légère, tout le reste (DB, auth, queue) à intégrer manuellement.

### Selected Starter: Create T3 App

**Rationale for Selection:**  
Aligné avec l'archi (Postgres, API type-safe, Tailwind pour la console ops). tRPC pour l'API dashboard ; **Prisma** retenu pour le schéma (transactions, contraintes). La couche workers (outbox, jobs) a été ajoutée juste après.

> _Retenu à l'implémentation :_ **Prisma** (pas Drizzle), **Vitest** pour les tests, et **pg-boss sur Postgres** pour la queue — la piste BullMQ/Redis évaluée ici a été abandonnée en Story 11.1 pour supprimer la dépendance Redis.

**Initialization Command:**

```bash
npm create t3-app@latest
```

(Choisir au prompt : App Router, Prisma ou Drizzle, NextAuth si besoin, Tailwind.)

**Architectural Decisions Provided by Starter:**

- **Language & Runtime:** TypeScript strict ; Node.js ; Next.js (App Router).
- **Styling:** shadcn/ui + Tailwind CSS comme base pour toutes les interfaces (formulaires, dashboard, console ops). Utiliser les composants shadcn (Input, Button, Label, Card, etc.) pour cohérence et accessibilité.
- **Build:** Next.js (Turbopack en dev) ; pas de config custom requise pour le MVP.
- **Testing:** **Vitest** (retenu) — configs `vitest.config.ts` (unitaires/serveur) et `vitest.config.ui.ts` (composants, jsdom). Tests co-localisés en `*.test.ts` à côté du code, pas dans un dossier `tests/` séparé.
- **Code Organization:** Structure T3 (src/app, src/server, src/components) ; couche tRPC pour l'API ; DB via Prisma ou Drizzle.
- **Development Experience:** Hot reload, variables d'env documentées, scripts prêts (dev, build, db push / migrate).

**Note:** L'initialisation du projet avec cette commande a été la première story d'implémentation (Story 1.1). La couche workers (queue + traitement webhook) a été ajoutée immédiatement après — d'abord sur BullMQ + Redis, puis migrée vers **pg-boss + Postgres** en Story 11.1.

---

## Core Architectural Decisions

### Data Architecture (Catégorie 1 — MVP SnapSell)

#### 1) ORM : Prisma ✅

- **Choix :** Prisma (avec T3, « default safe » pour livrer vite).
- Mature, très bon DX, migrations outillées, Prisma Studio utile en ops/debug.
- Bon fit avec Postgres + transactions (0 double attribution).
- Un peu plus « heavy » que Drizzle, acceptable en MVP.

#### 2) Migrations : Prisma Migrate (dev + deploy) ✅

- **Dev :** `prisma migrate dev` (versions contrôlées, reproductible).
- **Prod :** `prisma migrate deploy` (aucun drift, pas d’auto-génération).
- **Seed :** `prisma db seed` (tenant demo + catégories A/B/C + frais par défaut).

#### 3) Modèle de données : tables core + outbox + DLQ (DB-first) ✅

- Postgres = source de vérité **et** backend de queue (pg-boss). Redis n'intervient pas dans la persistance ni dans les files.
- **Outbox** (`message_outbox` ou `messages_out` avec champs outbox) :
  - `status`: pending | sending | sent | failed
  - `attempts`, `next_attempt_at`, `last_error`
  - `correlation_id`, `tenant_id`
- **DLQ** (`dead_letter_jobs` ou `dlq_events`) :
  - payload original + error + timestamps
- **Audit** (`event_log`) :
  - `event_type`, `entity_type`, `entity_id`, `correlation_id`, `actor_type`, `payload`

#### 4) Concurrence & contraintes : Postgres « hard guarantees » ✅

- **Unicité code :** `UNIQUE (tenant_id, live_session_id, code)`.
- **Idempotence webhook :** `UNIQUE (tenant_id, message_sid)` sur `messages_in`.
- **Stock préparé (hold sans décrément définitif) :**
  - `prepared_stock.available_qty`
  - `prepared_stock.reserved_qty`
  - Réservation : `reserved_qty += 1` (si `available_qty - reserved_qty > 0`).
  - Expiration : `reserved_qty -= 1`.
  - Confirmation : `reserved_qty -= 1` puis `available_qty -= 1`.

#### 5) Validation : Zod partout ✅

- **tRPC :** Zod déjà standard.
- **Webhook Meta :** schéma Zod « minimum payload » + normalisation (trim, uppercase code).
- **Jobs (pg-boss) :** Zod pour valider le payload au démarrage du worker.

#### 6) Cache : pas de cache applicatif MVP ✅

- Pas de cache métier (codes/items) en MVP : DB + index suffisent.
- **Redis (Upstash REST)** ne sert qu'au **rate limiting tRPC**, et se désactive proprement si les clés sont absentes. Aucune queue, aucun cache applicatif.

### Résumé des décisions Data (MVP)

| Décision | Choix |
|----------|--------|
| ORM | Prisma |
| Migrations | Prisma Migrate (dev/deploy) + seed |
| Validation | Zod (tRPC + webhook + jobs) |
| Fiabilité données | Outbox + DLQ en DB |
| Concurrence | Transactions Postgres + contraintes uniques |
| Stock préparé | Hold via `reserved_qty`, décrément définitif à la confirmation |
| Queue | **pg-boss sur Postgres** (Neon, URL directe non-pooler) |
| Redis | **Rate limiting tRPC uniquement** — ni queue, ni cache |

---

## Implementation Patterns & Consistency Rules

_Règles pour que plusieurs agents IA produisent du code cohérent et compatible._

### Naming Patterns

**Base de données (Prisma / Postgres) :**

- Tables : **snake_case** (ex. `messages_in`, `message_outbox`, `event_log`, `prepared_stock`). Prisma : `@@map("table_name")` si modèle en camelCase.
- Colonnes : **snake_case** en DB (ex. `tenant_id`, `message_sid`, `live_session_id`, `correlation_id`, `reserved_qty`, `available_qty`). Prisma : `@map("column_name")` pour garder camelCase en TS.
- Contraintes uniques : nom explicite (ex. `messages_in_tenant_message_sid_key`).

**API (tRPC) :**

- Procedures : **camelCase** (ex. `getOrders`, `validateProof`).
- Input/Output : types TypeScript ; schémas Zod en camelCase pour le runtime.

**Code (TypeScript / React) :**

- Composants React : **PascalCase** (ex. `OrderRowWithProof`, `LiveOpsSessionView`).
- Fichiers composants : **PascalCase** (ex. `OrderRowWithProof.tsx`).
- Fonctions, variables : **camelCase**.
- Fichiers utilités / helpers : **camelCase** ou kebab-case selon convention du dossier (ex. `parseIntent.ts`).

### Structure Patterns

**Organisation projet (T3 + SnapSell) :**

- `src/app` : routes Next.js (dashboard, auth).
- `src/server` : tRPC router(s), Prisma client, logique partagée serveur.
- `src/components` : composants UI (listes, Proofs inbox, Live Ops).
- `src/server/workers/` : consommateurs pg-boss (traitement webhook) + jobs cron.
- Route webhook Meta : `src/app/api/webhooks/meta/route.ts` (léger : verify signature, resolve tenant, dedupe, persist MessageIn, enqueue job, 200).
- Prisma : `prisma/schema.prisma` ; migrations dans `prisma/migrations`.

**Fichiers :**

- Config : `.env` (jamais commité), `.env.example` documenté.
- Constantes partagées : `src/constants` ou dans le module concerné.

### Format Patterns

**API (tRPC) :**

- Pas de wrapper générique : le type de retour de la procedure = payload.
- Erreurs : `TRPCError` avec `code` (BAD_REQUEST, NOT_FOUND, UNAUTHORIZED, etc.) et `message` lisible.
- Tenant : `tenantId` (ou `tenant_id` selon convention choisie) passé en contexte tRPC, jamais depuis le body client.

**Webhook Meta :**

- Réponse : **200** dans tous les cas après persist + enqueue (même en cas d’erreur métier traitée côté worker) pour éviter les relances Meta inutiles. C'est aussi pourquoi le rate limiting webhook répond 200 + log plutôt que 429.
- Payload entrant : validé par Zod (champs minimum) ; normalisation (trim, uppercase pour code) avant enqueue.

**Données (JSON / DB) :**

- En DB : snake_case (aligné Prisma @map).
- En TypeScript / front : camelCase (Prisma client génère camelCase par défaut).
- Dates : **ISO 8601** en JSON et dans les logs ; Postgres `timestamptz`.

**Events (event_log) :**

- `event_type` : verbe ou nom explicite (ex. `reservation.created`, `waitlist.promoted`, `order.confirmed`).
- `correlation_id` : identifiant de trace (ex. message_sid ou id de MessageIn) ; propagé à tous les événements d’un même flux.
- Payload : JSON structuré ; pas de données sensibles brutes (PII) sans nécessité.

### Process Patterns

**Gestion d’erreurs :**

- Webhook : jamais de throw non catché ; log + 200 après persist + enqueue.
- Workers : catch par job ; log avec correlationId ; écriture DLQ après N échecs ; pas de crash silencieux.
- tRPC : TRPCError ; message utilisateur lisible ; détail technique en log côté serveur.

**Chargement (front) :**

- États : `isLoading`, `isError`, `data` (pattern React Query / tRPC useQuery).
- Pas de blocage global : chargement par vue ou par liste (skeleton ou spinner ciblé).

**Idempotence :**

- Message in : unique `(tenant_id, message_sid)` ; si déjà présent → 200 sans retraitement.
- Actions métier : clés idempotentes (reservation_attempt_key, confirmation_key) comme dans le doc d’archi ; refus silencieux ou message clair si doublon.

### Enforcement Guidelines

**Tous les agents / devs doivent :**

- Respecter snake_case en DB (Prisma @map si besoin) et les contraintes uniques du schéma.
- Propager `correlationId` dans les logs et dans `event_log` / outbox.
- Valider entrées (webhook, jobs) avec Zod avant logique métier.
- Ne jamais traiter un message vendeur comme client (routage explicite par numéro).

**Vérification :**

- Lint / format (ESLint, Prettier) sur le repo.
- Revue de code sur schéma Prisma (migrations) et nouvelles routes/workers.
- Runbooks mis à jour si nouveaux patterns (DLQ, outbox, TTL).

### Exemples

**Bon :**  
- Table `messages_in` avec `tenant_id`, `message_sid`, `correlation_id` ; contrainte UNIQUE (tenant_id, message_sid).  
- Procedure tRPC `orders.list` avec `tenantId` depuis le contexte, filtre par statut.  
- Worker : Zod parse du job payload → puis traitement → écriture outbox avec même `correlationId`.

**À éviter :**  
- Réponse webhook 5xx ou timeout (> 1 s) ; traitement métier lourd dans la route webhook.  
- Colonnes ou tables en camelCase en DB sans @map.  
- Logs sans correlationId sur les chemins réservation / commande / outbox.

---

## Project Structure & Boundaries

_Structure physique du projet SnapSell (T3 + webhook Meta + worker pg-boss)._

> Arborescence **réelle** (mise à jour). Le découpage `src/server/<domaine>/` par module métier a émergé à l'implémentation : il n'était pas prévu dans la conception d'origine, qui plaçait toute la logique dans `workers/` et `whatsapp/`.

### Complete Project Directory Structure

```
snapsell/
├── README.md
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── .env.local
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── scripts/
│   ├── start-worker.ts          # entrypoint Railway (pg-boss + crons)
│   └── runtime-env.ts
├── src/
│   ├── app/
│   │   ├── (auth)/              # login, signup, invite/accept
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/       # accueil, audit, catalogue, live, orders, proofs
│   │   │   └── parametres/      # prix, livraison, team, whatsapp,
│   │   │                        #   whatsapp-business, faq, reponses, abonnement
│   │   ├── (ops)/ops/           # logs, errors
│   │   ├── tarifs/ conditions-utilisation/ politique-confidentialite/
│   │   └── api/
│   │       ├── trpc/[trpc]/
│   │       ├── webhooks/meta/       # webhook WhatsApp entrant
│   │       ├── webhooks/paystack/   # webhook paiement
│   │       ├── qstash/outbox-send/  # envoi sortant (callback QStash)
│   │       ├── qstash/outbox-dlq/
│   │       ├── cron/*/              # 5 routes — fallbacks ops uniquement
│   │       ├── media/ catalogue/ proofs/ payment/ invitations/
│   │       └── healthz/
│   ├── components/              # auth/, ui/ (shadcn)
│   ├── server/
│   │   ├── api/                 # root.ts, trpc.ts, routers/ (16 routers)
│   │   ├── db.ts
│   │   ├── workers/             # webhook-processor, queues (pg-boss),
│   │   │                        #   reservation-ttl, deposit-expiry,
│   │   │                        #   close-inactive-live-sessions,
│   │   │                        #   meta-catalogue-sync, subscription-expired,
│   │   │                        #   outbox-sender (fallback dev, non démarré)
│   │   ├── messaging/           # types.ts, outbox.ts, templates.ts,
│   │   │   └── providers/meta/  #   ai-service.ts + adapteur Meta Cloud API
│   │   ├── conversation/        # conversationState, variantSelection,
│   │   │                        #   sellerVariantConfig
│   │   ├── reservation/ order/ catalogue/ live-item/ live-session/
│   │   ├── credits/ subscription/ payment/ delivery/ pricing/
│   │   ├── proof/ media/ waitlist/ events/ qstash/ cron/
│   ├── lib/                     # crypto.ts, logger.ts, rbac.ts, sentry.ts,
│   │                            #   rate-limit.ts, trpc-rate-limit.ts,
│   │                            #   validations/, zod/, copy/, pricing/, delivery/
│   ├── hooks/ trpc/ types/ styles/
│   └── env.js
└── public/

# Tests : co-localisés en `*.test.ts` / `*.integration.test.ts` à côté du code,
#         pas de dossier tests/ séparé. Vitest (vitest.config.ts + vitest.config.ui.ts).
```

### Architectural Boundaries

**API Boundaries :**

- **Externe :** `POST /api/webhooks/meta` — webhook Meta ; vérif signature HMAC, resolve tenant, persist MessageIn, enqueue job pg-boss, 200 &lt; 1 s. `POST /api/webhooks/paystack` — événements de paiement.
- **Callbacks QStash :** `/api/qstash/outbox-send` et `/api/qstash/outbox-dlq` — signature vérifiée via `Receiver` Upstash.
- **Interne (dashboard) :** tRPC via `src/server/api/routers/*` ; contexte tenant + auth ; pas d’API REST publique en MVP.
- **Données :** accès via Prisma (`src/server/db.ts`) ; toutes les requêtes filtrées par `tenantId` en contexte.

**Component Boundaries :**

- **Frontend :** pages sous `src/app/(dashboard)/*` et `src/app/(ops)/*` ; composants sous `src/components/` (ui shadcn, auth) et `src/app/_components/`.
- **State :** tRPC useQuery/useMutation ; pas de store global métier en MVP.
- **Workers :** consommateurs pg-boss dans `src/server/workers/` ; lisent la queue, appellent la logique métier des modules `src/server/<domaine>/` + écriture outbox.

**Data Boundaries :**

- **DB :** Postgres (**Neon**) ; schéma dans `prisma/schema.prisma` ; 46 migrations dans `prisma/migrations/`.
- **Queue :** **pg-boss sur Postgres** ; définitions dans `src/server/workers/queues.ts`. Exige l'URL Neon **directe** (non-pooler) : PgBouncer en transaction mode casse les advisory locks.
- **Pas de cache applicatif** ; Redis (Upstash REST) = rate limiting tRPC seulement. **Worker** déployé sur **Railway**.

### Requirements to Structure Mapping

| Domaine / FR | Emplacement principal |
|--------------|------------------------|
| Webhook / Messaging (FR6–FR10) | `src/app/api/webhooks/meta/route.ts` (délègue à `messaging/providers/meta/`) + `src/server/workers/webhook-processor.ts` (types normalisés) |
| Idempotence MessageIn | `prisma/schema.prisma` (`MessageIn`), `src/app/api/webhooks/meta/route.ts` |
| Live session auto (FR39) | `src/server/live-session/service.ts`, `src/server/workers/close-inactive-live-sessions.ts`, `src/server/api/routers/live.ts` |
| Pricing / codes (FR11–FR13) | `src/server/pricing/`, `src/server/live-item/createLiveItem.ts`, Prisma (`LiveItem`, `CategoryPrice`) |
| Stock préparé (FR14–FR17) | Prisma (`LiveItem`, `CatalogueItem`, `ItemVariant`), `src/server/reservation/service.ts` |
| Réservations / waitlist (FR18–FR22) | `src/server/reservation/`, `src/server/waitlist/`, `src/server/workers/reservation-ttl.ts` |
| Commandes / preuves (FR23–FR27) | `src/server/order/`, `src/server/proof/`, routers `orders.ts` / `proofs.ts`, Prisma (`Order`, `PaymentProof`) |
| Dashboard (FR29–FR34) | `src/app/(dashboard)/dashboard/{orders,proofs,live,catalogue,audit}/` + `src/app/(ops)/ops/` |
| Outbox / DLQ | Prisma (`MessageOut`, `DeadLetterJob`), `src/server/messaging/outbox.ts`, `src/app/api/qstash/` |
| Variantes / quantités | `src/server/conversation/variantSelection.ts`, `sellerVariantConfig.ts`, Prisma (`ItemVariant`, `Reservation.quantity`) |
| Crédits / abonnement | `src/server/credits/service.ts`, `src/server/subscription/`, Prisma (`Tenant.credits*`, `ConversationWindow`, `SubscriptionPayment`) |
| Audit (event_log) | `src/server/events/eventLog.ts`, Prisma (`EventLog`) |

### Integration Points

- **Webhook → Worker :** route webhook persist MessageIn + `boss.send()` sur `webhook-processing` (payload : `InboundMessage` normalisé avec correlationId) ; le worker Railway lit le job, traite l'intent, écrit outbox / event_log. **Vercel et Railway doivent partager la même `DATABASE_URL`** — la queue vit dans Postgres.
- **Worker → BSP :** écriture outbox → `enqueueOutboxSend()` publie sur QStash → `/api/qstash/outbox-send` appelle `processOutboundMessage()` → adapteur `messaging/providers/meta/` ; mise à jour statut (sent/failed) ; retries QStash + DLQ. Le métier ne dépend que de l’interface, jamais du fournisseur.
- **Dashboard → API :** tRPC (orders.list, proofs.list, live.currentSession, etc.) ; tenantId depuis session auth.

### File Organization

- **Config :** `.env` / `.env.example` — voir §11.3 ; **`src/env.js` fait foi** pour la liste et les contraintes (certaines variables sont obligatoires en production).
- **Source :** T3 (app, server, components) ; webhook et worker comme ci-dessus.
- **Tests :** **co-localisés** en `*.test.ts` / `*.integration.test.ts` à côté du code testé. Les tests d'intégration exigent `RUN_INTEGRATION_TESTS=true` + `DATABASE_URL`.
- **Assets :** `public/` ; preuves/media stockés via **Cloudflare R2** (S3-compatible) avec chemins en DB, pas dans public.

### Development Workflow

- **Dev :** `npm run dev` (Next.js + Turbopack) ; worker à lancer séparément avec `npm run dev:worker`.
- **DB :** `npm run db:migrate` (`prisma migrate deploy`) ou `prisma migrate dev` ; `npm run db:generate` après changement de schéma.
- **Tests :** `npm test` (Vitest) ; `npm run test:ui` pour les composants ; `npm run typecheck`.
- **Build :** `npm run build` ; déploiement **Vercel** (web + webhook + callbacks QStash) ; **Railway** (worker pg-boss + crons, `npm run worker:start`) ; médias = **Cloudflare R2**.
- **Package manager :** **npm** (`packageManager: npm@10.9.2`, Node 22.x).

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**  
Stack T3 (Next.js, tRPC, Prisma, Tailwind) + pg-boss + Postgres est cohérent. Prisma pour transactions et contraintes ; Zod pour validation (tRPC, webhook, jobs) ; outbox + DLQ en DB alignés avec la fiabilité requise. Pas de conflit entre décisions.

**Pattern Consistency:**  
Naming (DB snake_case, code camelCase/PascalCase), structure (T3 + webhook + workers), formats (tRPC, webhook 200, event_log, ISO dates) et process (erreurs, idempotence, correlationId) sont alignés avec l’archi et le stack.

**Structure Alignment:**  
L’arborescence (app/api/webhooks/meta, server/workers, modules métier par domaine, routers tRPC) supporte les flows et les frontières (webhook &lt; 1 s, worker métier, dashboard tRPC).

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**  
Webhook (FR6–FR10), live session (FR39), pricing/codes (FR11–FR13), stock (FR14–FR17), réservations/waitlist (FR18–FR22), commandes/preuves (FR23–FR27), dashboard (FR29–FR34), outbox/DLQ, audit : tous couverts par les décisions (pipeline, Prisma, workers, tRPC, structure).

**Non-Functional Requirements Coverage:**  
Performance (P95 &lt; 2 s, webhook &lt; 1 s) : pipeline léger + enqueue ; Sécurité : signature Meta HMAC, isolation tenant, RBAC, chiffrement at-rest, rate limiting ; Fiabilité : idempotence, outbox, DLQ ; Scalabilité : worker horizontal — **sous réserve du point « état conversationnel et concurrence » listé dans les pièges**.

### Implementation Readiness Validation ✅

**Decision Completeness:**  
Goals/Non-Goals, flows, décisions techniques (A–F), Data (ORM, migrations, outbox, contraintes, Zod, Redis), patterns (naming, structure, formats, process) et structure projet sont documentés avec emplacements et exemples.

**Structure Completeness:**  
Arborescence détaillée ; mapping FR → dossiers/fichiers ; frontières API / composants / données ; points d’intégration et workflow dev/build définis.

**Pattern Completeness:**  
Conflits potentiels (naming, structure, formats, process) adressés ; règles pour agents et anti-patterns documentés.

### Gap Analysis Results

- **À détailler en implémentation :** diagramme C4, runbooks (Meta down, DLQ, TTL). _Le schéma Prisma est désormais complet : 30 modèles et enums, 46 migrations._
- **Post-MVP :** WebSocket Live Ops, multi-canaux, analytics, cache applicatif.

**Dettes traitées le 2026-07-28 :**
- ~~Fallback outbox silencieux~~ → échoue désormais explicitement en production.
- ~~Absence de verrou sur `ConversationState`~~ → `FOR UPDATE` sur les deux machines à états concernées.
- ~~Race sur la consommation de crédits~~ → `FOR UPDATE` sur la ligne tenant.
- ~~Crédits jamais renouvelés / `conversation_windows` jamais purgées~~ → cron `credits-monthly-reset`.
- ~~P2002 outbox non rattrapé, empêchant tout rejeu d'aboutir~~ → conflit traité comme idempotent.
- ~~Facturation au dépassement morte et basée sur la mauvaise dimension~~ → supprimée.

**Dettes restantes :**
- `startOutboxSenderWorker()` n'est démarré par aucun entrypoint : la queue pg-boss `outbox-send` reste sans consommateur (fallback dev uniquement, désormais signalé).
- `pnpm-lock.yaml` et `package-lock.json` coexistent alors que le projet est en npm.
- `processWebhookJob` fait ~740 lignes et 84 branches : point de concentration du risque.

Aucun gap bloquant.

### Architecture Completeness Checklist

**✅ Requirements Analysis** — Contexte projet, scale, contraintes et cross-cutting concerns mappés.

**✅ Architectural Decisions** — Goals/Non-Goals, flows, décisions A–L, Data (Prisma, Migrate, outbox, Zod, pg-boss) documentés.

**✅ Implementation Patterns** — Naming, structure, formats, process, enforcement et exemples définis.

**✅ Project Structure** — Arborescence, frontières, mapping FR → structure, intégration et workflow dev documentés.

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — cohérence, couverture des FR/NFR et patterns suffisants pour guider les agents.

**Key Strengths:**  
Pipeline webhook &lt; 1 s + workers, idempotence et contraintes Postgres, outbox + DLQ en DB, correlationId et audit, structure T3 + webhook + workers claire.

**Areas for Future Enhancement:**  
Schéma DB détaillé, C4, runbooks, tests (unit/integration/e2e) alignés aux parcours critiques.

### Implementation Handoff

**AI Agent Guidelines:**

- Suivre les décisions d’architecture et les patterns (naming, structure, formats, process) tels que documentés.
- Respecter la structure projet et les frontières (webhook léger, workers métier, tRPC dashboard).
- Utiliser ce document comme référence pour toute question d’architecture.

**First Implementation Priority:** _(historique — réalisé)_  
`npm create t3-app@latest` (Prisma, Tailwind, App Router) ; puis ajout de la couche workers et de la route webhook.

---

_Document d'architecture SnapSell — mis à jour le 2026-07-28 pour refléter l'architecture réellement déployée (Meta Cloud API, pg-boss/Postgres, crons Railway). Toute nouvelle migration de plateforme ou de fournisseur doit être répercutée ici **et** dans [DEPLOYMENT.md](../../DEPLOYMENT.md) dans le même commit._
