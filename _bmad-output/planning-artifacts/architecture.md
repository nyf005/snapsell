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

---

## Ouverture (positionnement système)

- SnapSell est un système **event-driven** centré WhatsApp (Twilio) avec une console web ops.
- Le webhook entrant est **ultra-léger** (verify + dedupe + persist + enqueue) afin de garantir **&lt; 1 s**.
- Toute logique métier (intent parsing, réservation/file/TTL, création commande, envoi outbox) est exécutée dans des **workers**.
- La cohérence métier est garantie par **transactions DB + verrous ciblés** + contraintes d'unicité, avec audit trail et correlationId.

---

## 1. Architecture Goals & Non-Goals

### Goals

- **P95 bot &lt; 2 s** : temps message client (code) → réponse bot (réservé / file / expiré).
- **Webhook &lt; 1 s** : réponse HTTP 200 au webhook Twilio sans bloquer au-delà.
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

- **WhatsApp (Twilio)** = moteur d'interaction : checkout, réservation, confirmation, suivi client.
- **Web** = console ops : config, commandes, preuves, Live Ops, paramètres.

### Vue C4 (niveau 1/2)

- **Twilio** ⇄ **Webhook API** (réception messages, réponse 200 rapide).
- **Webhook API** ⇄ **DB** (persist MessageIn, idempotence).
- **Webhook API** → **Queue/Job** (enqueue pour worker).
- **Worker(s)** ⇄ **DB** (logique métier, outbox, réservations, commandes).
- **Worker(s)** → **Twilio** (envoi messages sortants via API).
- **Web App** ⇄ **API** (dashboard, paramètres, Proofs, Live Ops).

_À détailler : diagramme C4 niveau 1 (contexte) et niveau 2 (conteneur) dans un artefact dédié si besoin._

---

## 3. Core Domain Model

- **Tenants, Users, Roles** : tenant = vendeur/boutique ; rôles Owner, Manager, Vendeur, Agent ; délégation par invitation.
- **LiveSession (auto)** : créée à la première action live, fermée après inactivité ; `last_activity_at`, statut active/closed.
- **LiveItem / PreparedStockItem** : item en session (code, catégorie, prix, qty pour stock préparé) ; lien vers session.
- **Reservation + Waitlist** : réservation liée à un live_item ; file d'attente par item ; TTL, rappel, expiration, promotion auto.
- **Order + PaymentProof** : commande (VF-XXXX) issue d'une réservation confirmée ; statuts ; preuve acompte (image/texte) avec états pending/approved/rejected.
- **MessageIn / MessageOut (Outbox)** : MessageIn pour idempotence (tenant_id, message_sid) ; MessageOut pour envoi avec retries + DLQ.
- **EventLog (audit)** : événements horodatés (création item, réservation, promotion waitlist, confirmation, preuves, changements statuts, overrides).

---

## 4. Key Flows

### 4.1 Inbound message pipeline

1. **Twilio** → Webhook API (POST).
2. Vérification signature Twilio.
3. Idempotence : lookup `(tenant_id, message_sid)` ; si déjà traité → 200 sans retraitement.
4. Persist **MessageIn**.
5. Enqueue job (ou process léger + enqueue lourd).
6. Réponse **200** (&lt; 1 s).
7. **Worker** : routing vendeur vs client → intent parsing → action (réservation, confirmation, création item, etc.) → écriture MessageOut (outbox) → envoi Twilio.

### 4.2 Reserve → waitlist → promote

- Client envoie code → réservation si dispo, sinon placement en file.
- TTL sur réservation ; rappel T-2 min ; à expiration : promotion automatique du premier en file.
- Unicité et ordre garantis par transactions + contraintes (voir § 5).

### 4.3 Confirm (OUI + address) → create order → acompte state

- Après collecte adresse, client envoie OUI (ou choix du code si plusieurs réservations).
- Création commande (VF-XXXX) ; état `confirmed_pending_deposit` ou `confirmed` selon config acompte.
- Si acompte activé : demande preuve ; TTL acompte (ex. 15–30 min) ; états deposit_received / approved / rejected.

### 4.4 Stock decrement at confirmation

- **Réservation** : ne décrémente pas le stock ; pour stock &gt; 1, on « hold » une unité (reserved_qty += 1).
- **Confirmation** : reserved_qty -= 1, available_qty -= 1.
- **Expiration** : reserved_qty -= 1 (pas de décrément available).

### 4.5 Outbound messaging via outbox + retries + DLQ

- Tout envoi sortant écrit d'abord dans **MessageOut** (outbox) avec statut pending.
- Worker outbound lit l'outbox, appelle Twilio, met à jour statut (sent / failed).
- Retries avec backoff ; après échec répété → DLQ ; traçabilité et file d'erreurs pour ops.

---

## 5. Consistency & Concurrency

- **Transactions et verrous** : réservation, confirmation et promotion waitlist dans des transactions avec locks ciblés.
- **Contraintes d'unicité** : `(tenant_id, message_sid)` sur messages_in ; clés idempotentes pour actions sensibles (voir § 2 décisions B).
- **Réservation atomique (item unique qty=1)** : `SELECT ... FOR UPDATE` sur live_item (ou row stock) ; vérifier statut ; créer réservation ; mettre à jour statut item.
- **Waitlist** : insertion avec position = max(position)+1 sous lock (ou séquence par item) pour garantir l'ordre et éviter les doublons.
- **Idempotence de bout en bout** : message in (MessageSid) + reservation_attempt_key + confirmation_key pour éviter double réservation / double confirmation en cas de rejeu ou spam.

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
- **Rate limiting / backoff** : respect des limites Twilio ; backoff sur erreurs d'envoi ; pas de flood côté SnapSell.
- **STOP** : politique explicite par tenant (scope = tenant) ; après STOP, seuls les messages transactionnels stricts autorisés ou aucun, selon règle produit (FR46).

### 7.1 Messaging provider-agnostic (BSP interchangeable)

L’architecture reste **provider-agnostic** pour permettre, si besoin, une bascule vers Meta Cloud API direct ou un autre BSP sans réécrire le métier (réservation, file, stock).

- **Interface MessagingProvider (ou BspAdapter)** :
  - **Parse inbound** : le webhook BSP (Twilio, Meta, etc.) est traité par un adapteur qui valide la requête, vérifie la signature, et produit un **type normalisé** (ex. `InboundMessage` : `tenantId`, `providerMessageId`, `from`, `body`, `mediaUrl?`, `correlationId`). Ce type est le seul consommé par la couche métier.
  - **Send** : la couche métier écrit dans l’**outbox** avec un payload normalisé (destinataire, corps, type de message). Un worker lit l’outbox et appelle `provider.send(message)` ; l’adapteur BSP (Twilio, Meta, etc.) traduit vers l’API du fournisseur.
  - **Verify webhook** : `verifySignature(req, secret)` propre à chaque BSP, appelé avant parse inbound.
- **Outbox** : schéma en DB indépendant du BSP (tenant_id, to, body, status, correlation_id, etc.) ; pas de champs obligatoires spécifiques Twilio/Meta. Les adapteurs font la traduction outbox → API BSP.
- **Idempotence** : clé unique sur `(tenant_id, provider_message_id)` où `provider_message_id` est l’ID fourni par le BSP (ex. Twilio MessageSid, Meta message_id). Même sémantique pour tout BSP.
- **Mapping tenant** : le tenant est toujours identifié par `tenant_id` ; la config par BSP (numéro Twilio, credentials Meta, etc.) vit dans la config tenant ou une table dédiée (ex. `tenant_messaging_config`) sans être codée en dur dans le métier.
- **Métier** : la logique réservation, file d’attente, stock, confirmation, commandes ne dépend que des types normalisés (InboundMessage, écriture outbox) et jamais des SDK ou types Twilio/Meta. Ainsi, ajouter un second BSP = nouveau route webhook + nouvel adapteur implémentant MessagingProvider, sans toucher aux workers métier.

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

- **Vérification signature Twilio** : rejet des requêtes webhook non authentiques.
- **Isolation tenant + RBAC** : toutes les requêtes et requêtes DB filtrées par tenant_id ; rôles Owner/Manager/Vendeur/Agent avec permissions définies.
- **Secrets** : clés API Twilio, secrets d'app en gestion sécurisée (env vars / secret manager) ; jamais en clair dans le code ou le repo.
- **PII** : numéros, adresses, preuves — accès restreint, chiffrement au repos et en transit ; durée de conservation et droits d'accès/suppression (RGPD) documentés.

---

## 11. Deployment & Runtime

### 11.1 Stack plateformes (web-first, figée)

**Décision :** **Vercel (web) + Neon (Postgres) + Upstash (Redis/BullMQ) + Railway (workers/jobs) + Cloudflare R2 (médias) + Sentry (observabilité).**

| Composant | Plateforme | Rôle |
|-----------|------------|------|
| Web (landing, subscription, dashboard) + API tRPC | **Vercel** | Next.js/T3 ; auth, pages publiques, dashboard ; très bon DX. |
| Base de données | **Neon** | Postgres ; fit Vercel, scalable, adapté MVP multi-tenant (transactions, verrous). |
| Queue | **Upstash Redis** | BullMQ ; simple, stable, queue + rate limit. |
| Workers (jobs long-running) | **Railway** (ou Fly.io) | Outbox sender, TTL réservations, rappels T-2, expiration T=0, clôture live session auto, media download async. |
| Stockage médias (preuves acompte, photos) | **Cloudflare R2** | S3-compatible ; bon coût, signed URLs pour Proofs Inbox. |
| Observabilité | **Sentry** | Erreurs + traces (webhook, workers). |

### 11.2 Répartition des responsabilités

**Sur Vercel :**
- Landing marketing, subscription (billing manuel MVP), dashboard (Commandes, Proofs inbox, Live Ops, Paramètres), API tRPC.
- **Webhook** (ex. `/api/webhooks/twilio` ou `/webhooks/whatsapp`) — **léger uniquement**, réponse &lt; 1 s :
  1. Vérif signature Twilio
  2. Resolve tenant + vendeur/client (mapping)
  3. Idempotence (tenant_id + MessageSid / provider_message_id)
  4. Enqueue job BullMQ
  5. `200 OK`

**Sur Railway (worker) :**
- Intent parsing + règles métier (réservation, file, TTL)
- Création commande VF-XXXX + statuts
- Décrément stock **à la confirmation** (pas à la réservation)
- Envoi WhatsApp sortant via outbox (retries + DLQ)
- Téléchargement médias Twilio → upload R2 → lien sécurisé en DB
- Cron / schedulers : rappel T-2 min, expiration T=0, clôture live session auto (inactivité)

### 11.3 Variables d'environnement

**Vercel (web) :**  
`DATABASE_URL` (Neon), `REDIS_URL` (Upstash), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` (ou mapping « To »), `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (ou domaine), `SENTRY_DSN` (optionnel MVP).

**Railway (worker) :**  
Les mêmes : `DATABASE_URL`, `REDIS_URL`, `TWILIO_*`, `R2_*`, `SENTRY_DSN`.

### 11.4 Runbooks

- **Webhook service** : garder la réponse &lt; 1 s (pas de logique lourde sur Vercel).
- **Workers** : scaling selon la profondeur de la queue ; un worker peut traiter plusieurs tenants (isolation par job).
- **Runbooks** : incident Twilio down (retries, DLQ, pas de perte de MessageIn) ; croissance DLQ (alerte, traitement manuel ou réingestion) ; dérive TTL (vérifier jobs d'expiration et horloges).

---

## Décisions techniques figées (résumé)

| Décision | Recommandation |
|----------|----------------|
| **A) Pipeline webhook &lt; 1 s + bot P95 &lt; 2 s** | Webhook : verify → idempotence check → persist MessageIn → enqueue job → 200. Worker : traitement métier + outbox + envoi Twilio. |
| **B) Idempotence message in + actions métier** | Unique (tenant_id, message_sid) sur messages_in. Clés idempotentes : reservation_attempt_key (tenant_id + client_phone + live_item_id + session_id), confirmation_key (tenant_id + client_phone + reservation_id). |
| **C) Concurrence réservation / 0 double attribution** | Transaction + SELECT FOR UPDATE sur live_item ; création réservation + update statut. Waitlist : position = max(position)+1 sous lock. |
| **D) Stock : bloquer à la réservation, décrémenter à la confirmation** | Réservation : reserved_qty += 1 (pas de décrément available). Confirmation : reserved_qty -= 1, available_qty -= 1. Expiration : reserved_qty -= 1. |
| **E) Live session auto** | current_live_session = active + last_activity_at &gt; now - INACTIVITY_WINDOW ; création au 1er code client ou 1ère action vendeur ; job de fermeture ; fenêtre 30–60 min. |
| **F) Acompte recommandé** | États : confirmed_pending_deposit, confirmed (si deposit off), deposit_received. TTL acompte ex. 15–30 min. Preuve : payment_proofs + pending/approved/rejected. |
| **G) Messaging provider-agnostic** | Interface MessagingProvider (parse inbound, send, verify signature). Outbox + idempotence + mapping tenant en types normalisés. Métier (réservation/file/stock) ne dépend pas du BSP ; bascule possible vers Meta Cloud API ou autre BSP sans réécrire le métier. |
| **H) Stack plateformes (web-first)** | Vercel (web + webhook léger) + Neon (Postgres) + Upstash (Redis/BullMQ) + Railway (workers) + Cloudflare R2 (médias) + Sentry (observabilité). Répartition : Vercel = landing, dashboard, tRPC, webhook &lt; 1 s ; Railway = métier, outbox, cron (TTL, rappels, clôture live). |

---

## Pièges à éviter (explicites pour l’implémentation)

- **Routage vendeur vs client** : ne jamais traiter un message vendeur comme client (sinon auto-réservations incorrectes). Le numéro vendeur = seller_phone(s) enregistré côté tenant ; un message « A12 » du vendeur doit déclencher « Tu veux créer l'article A12 ? » et non une réservation cliente.
- **Code inconnu vs épuisé** : erreur de saisie (typo, code inexistant) ≠ rupture de stock. Message clair « Code inconnu (ex: A12). Vérifie et renvoie. » ; « Épuisé » uniquement si le code existe et stock = 0 / déjà vendu.
- **WhatsApp ordering** : les messages peuvent arriver hors ordre. Le moteur doit être tolérant : state machine par conversation (client + session) ; pas d'hypothèse sur l'ordre strict des messages.
- **Media download** : le fetch Twilio des médias (photos preuve) peut être lent. Toujours traiter en **async** ; ne pas bloquer le webhook ni le worker principal sur un téléchargement media.
- **Couplage BSP** : ne pas faire dépendre la logique réservation/file/stock de types ou SDK Twilio/Meta. Passer par l’interface MessagingProvider et des types normalisés (InboundMessage, outbox) pour garder la possibilité de basculer vers Meta Cloud API ou un autre BSP sans réécrire le métier.

---

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack** (web dashboard + API webhook + workers) d'après le document d'architecture et la spec UX.

### Starter Options Considered

- **Create T3 App** (`npm create t3-app@latest`) — Full-stack TypeScript, Next.js, tRPC, Prisma ou Drizzle, Tailwind, NextAuth ; modulaire. Référence pour projets typesafe Next.js ; workers à ajouter (BullMQ + Redis ou Inngest).
- **create-next-app** (`npx create-next-app@latest`) — Next.js minimal avec options `--ts`, `--tailwind`, `--app`, `--api` ; base légère, tout le reste (DB, auth, queue) à intégrer manuellement.

### Selected Starter: Create T3 App

**Rationale for Selection:**  
Aligné avec l'archi (Postgres, API type-safe, Tailwind pour la console ops). tRPC pour l'API dashboard ; Prisma ou Drizzle pour le schéma (transactions, contraintes). La couche workers (outbox, jobs) sera ajoutée en premier story d'implémentation (BullMQ ou Inngest).

**Initialization Command:**

```bash
npm create t3-app@latest
```

(Choisir au prompt : App Router, Prisma ou Drizzle, NextAuth si besoin, Tailwind.)

**Architectural Decisions Provided by Starter:**

- **Language & Runtime:** TypeScript strict ; Node.js ; Next.js (App Router).
- **Styling:** shadcn/ui + Tailwind CSS comme base pour toutes les interfaces (formulaires, dashboard, console ops). Utiliser les composants shadcn (Input, Button, Label, Card, etc.) pour cohérence et accessibilité.
- **Build:** Next.js (Turbopack en dev) ; pas de config custom requise pour le MVP.
- **Testing:** À configurer (Vitest ou Jest) ; non inclus par défaut dans T3.
- **Code Organization:** Structure T3 (src/app, src/server, src/components) ; couche tRPC pour l'API ; DB via Prisma ou Drizzle.
- **Development Experience:** Hot reload, variables d'env documentées, scripts prêts (dev, build, db push / migrate).

**Note:** L'initialisation du projet avec cette commande doit être la première story d'implémentation. La couche workers (queue + traitement webhook) sera ajoutée immédiatement après (BullMQ + Redis ou Inngest).

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

- Postgres = source de vérité ; Redis uniquement pour la queue.
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
- **Webhook Twilio :** schéma Zod « minimum payload » + normalisation (trim, uppercase code).
- **Jobs (BullMQ) :** Zod pour valider le payload au démarrage du worker.

#### 6) Cache : pas de cache applicatif MVP, Redis = queue only ✅

- **Redis** requis pour BullMQ.
- Pas de cache métier (codes/items) en MVP : DB + index suffisent.

### Résumé des décisions Data (MVP)

| Décision | Choix |
|----------|--------|
| ORM | Prisma |
| Migrations | Prisma Migrate (dev/deploy) + seed |
| Validation | Zod (tRPC + webhook + jobs) |
| Fiabilité données | Outbox + DLQ en DB |
| Concurrence | Transactions Postgres + contraintes uniques |
| Stock préparé | Hold via `reserved_qty`, décrément définitif à la confirmation |
| Redis | BullMQ only (pas de cache applicatif MVP) |

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
- `src/server/workers` ou `workers/` : consommateurs BullMQ (traitement webhook, outbox send).
- Route webhook Twilio : `src/app/api/webhooks/twilio/route.ts` (léger : verify, dedupe, persist MessageIn, enqueue job, 200).
- Prisma : `prisma/schema.prisma` ; migrations dans `prisma/migrations`.

**Fichiers :**

- Config : `.env` (jamais commité), `.env.example` documenté.
- Constantes partagées : `src/constants` ou dans le module concerné.

### Format Patterns

**API (tRPC) :**

- Pas de wrapper générique : le type de retour de la procedure = payload.
- Erreurs : `TRPCError` avec `code` (BAD_REQUEST, NOT_FOUND, UNAUTHORIZED, etc.) et `message` lisible.
- Tenant : `tenantId` (ou `tenant_id` selon convention choisie) passé en contexte tRPC, jamais depuis le body client.

**Webhook Twilio :**

- Réponse : **200** dans tous les cas après persist + enqueue (même en cas d’erreur métier traitée côté worker) pour éviter les retries Twilio inutiles.
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

_Structure physique du projet SnapSell MVP (T3 + webhook Twilio + workers BullMQ)._

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
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── ...
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── commandes/
│   │   │   ├── live-ops/
│   │   │   ├── proofs/
│   │   │   └── parametres/
│   │   └── api/
│   │       ├── trpc/
│   │       │   └── [trpc]/
│   │       │       └── route.ts
│   │       └── webhooks/
│   │           └── twilio/
│   │               └── route.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── orders/
│   │   │   ├── OrderRowWithProof.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── live-ops/
│   │   │   └── LiveOpsSessionView.tsx
│   │   ├── proofs/
│   │   │   └── ProofsInboxFilter.tsx
│   │   └── layout/
│   ├── server/
│   │   ├── api/
│   │   │   ├── root.ts
│   │   │   ├── trpc.ts
│   │   │   └── routers/
│   │   │       ├── orders.ts
│   │   │       ├── liveOps.ts
│   │   │       ├── proofs.ts
│   │   │       └── tenant.ts
│   │   ├── db.ts
│   │   ├── workers/
│   │   │   ├── webhook-processor.ts
│   │   │   ├── outbox-sender.ts
│   │   │   ├── reservation-ttl.ts
│   │   │   └── queues.ts
│   │   ├── messaging/
│   │   │   ├── types.ts
│   │   │   └── providers/
│   │   │       └── twilio/
│   │   │           ├── adapter.ts
│   │   │           ├── verify.ts
│   │   │           └── send.ts
│   │   ├── whatsapp/
│   │   │   ├── routing.ts
│   │   │   ├── intents.ts
│   │   │   └── templates.ts
│   │   └── events/
│   │       └── eventLog.ts
│   ├── lib/
│   │   ├── zod/
│   │   │   ├── webhook.ts
│   │   │   └── jobs.ts
│   │   └── utils.ts
│   └── env.js
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── public/
```

### Architectural Boundaries

**API Boundaries :**

- **Externe :** `POST /api/webhooks/twilio` — webhook Twilio ; vérif signature, persist MessageIn, enqueue job, 200 &lt; 1 s.
- **Interne (dashboard) :** tRPC via `src/server/api/routers/*` ; contexte tenant + auth ; pas d’API REST publique en MVP.
- **Données :** accès via Prisma (`src/server/db.ts`) ; toutes les requêtes filtrées par `tenantId` en contexte.

**Component Boundaries :**

- **Frontend :** pages sous `src/app/(dashboard)/*` ; composants sous `src/components/` (ui, orders, live-ops, proofs).
- **State :** tRPC useQuery/useMutation ; pas de store global métier en MVP.
- **Workers :** consommateurs BullMQ dans `src/server/workers/` ; lisent la queue, appellent logique métier + outbox + adapteur MessagingProvider (ex. Twilio).

**Data Boundaries :**

- **DB :** Postgres (**Neon**) ; schéma dans `prisma/schema.prisma` ; migrations dans `prisma/migrations/`.
- **Queue :** Redis (**Upstash**) + BullMQ ; définitions dans `src/server/workers/queues.ts`.
- **Pas de cache applicatif** en MVP ; Redis = queue only. **Workers** déployés sur **Railway** (ou Fly.io).

### Requirements to Structure Mapping

| Domaine / FR | Emplacement principal |
|--------------|------------------------|
| Webhook / Messaging (FR6–FR10) | `src/app/api/webhooks/twilio/route.ts` (délègue à `messaging/providers/twilio`) + `src/server/workers/webhook-processor.ts` (types normalisés) |
| Idempotence MessageIn | `prisma/schema.prisma` (messages_in), `src/server/workers/webhook-processor.ts` |
| Live session auto (FR39) | `src/server/workers/webhook-processor.ts`, `src/server/api/routers/liveOps.ts` |
| Pricing / codes (FR11–FR13) | `src/server/whatsapp/intents.ts`, Prisma (live_items, category_prices) |
| Stock préparé (FR14–FR17) | Prisma (prepared_stock), `src/server/workers/webhook-processor.ts` (réservation/confirmation) |
| Réservations / waitlist (FR18–FR22) | `src/server/workers/webhook-processor.ts`, `src/server/workers/reservation-ttl.ts` |
| Commandes / preuves (FR23–FR27) | `src/server/api/routers/orders.ts`, `src/server/api/routers/proofs.ts`, Prisma (orders, payment_proofs) |
| Dashboard (FR29–FR34) | `src/app/(dashboard)/commandes/`, `live-ops/`, `proofs/` + composants associés |
| Outbox / DLQ | Prisma (message_outbox, dead_letter_jobs), `src/server/workers/outbox-sender.ts` |
| Audit (event_log) | `src/server/events/eventLog.ts`, Prisma (event_log) |

### Integration Points

- **Webhook → Worker :** route webhook persist MessageIn + enqueue job (payload : tenantId, messageSid, correlationId) ; worker lit job, traite intent, écrit outbox / event_log.
- **Worker → BSP :** lecture outbox (pending), appel à l’adapteur MessagingProvider (ex. `src/server/messaging/providers/twilio.ts`) pour l’envoi ; mise à jour statut (sent/failed) ; retries + DLQ. Le métier ne dépend que de l’interface, pas de Twilio directement.
- **Dashboard → API :** tRPC (orders.list, proofs.list, liveOps.currentSession, etc.) ; tenantId depuis session auth.

### File Organization

- **Config :** `.env.local` / `.env.example` — DATABASE_URL (Neon), REDIS_URL (Upstash), TWILIO_*, R2_* (Cloudflare R2), NEXTAUTH_*, SENTRY_DSN ; `src/env.js` pour validation.
- **Source :** T3 (app, server, components) ; webhook et workers comme ci-dessus.
- **Tests :** `tests/unit/`, `tests/integration/`, `tests/e2e/` ; à aligner avec les parcours critiques (webhook, réservation, dashboard).
- **Assets :** `public/` ; preuves/media stockés via **Cloudflare R2** (S3-compatible) avec chemins en DB, pas dans public.

### Development Workflow

- **Dev :** `npm run dev` (Next.js + Turbopack) ; workers à lancer séparément (ex. `npm run workers`) ou via un seul process selon setup.
- **DB :** `prisma migrate dev`, `prisma db seed` ; prod : `prisma migrate deploy` (Neon).
- **Build :** `npm run build` ; déploiement **Vercel** (web + webhook) ; **Railway** (workers BullMQ) ; Redis = **Upstash** ; médias = **Cloudflare R2**.

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**  
Stack T3 (Next.js, tRPC, Prisma, Tailwind) + BullMQ + Postgres + Redis est cohérent. Prisma pour transactions et contraintes ; Zod pour validation (tRPC, webhook, jobs) ; outbox + DLQ en DB alignés avec la fiabilité requise. Pas de conflit entre décisions.

**Pattern Consistency:**  
Naming (DB snake_case, code camelCase/PascalCase), structure (T3 + webhook + workers), formats (tRPC, webhook 200, event_log, ISO dates) et process (erreurs, idempotence, correlationId) sont alignés avec l’archi et le stack.

**Structure Alignment:**  
L’arborescence (app/api/webhooks/twilio, server/workers, routers tRPC, composants orders/live-ops/proofs) supporte les flows et les frontières (webhook &lt; 1 s, workers métier, dashboard tRPC).

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**  
Webhook (FR6–FR10), live session (FR39), pricing/codes (FR11–FR13), stock (FR14–FR17), réservations/waitlist (FR18–FR22), commandes/preuves (FR23–FR27), dashboard (FR29–FR34), outbox/DLQ, audit : tous couverts par les décisions (pipeline, Prisma, workers, tRPC, structure).

**Non-Functional Requirements Coverage:**  
Performance (P95 &lt; 2 s, webhook &lt; 1 s) : pipeline léger + enqueue ; Sécurité : vérif Twilio, isolation tenant, RBAC ; Fiabilité : idempotence, outbox, DLQ ; Scalabilité : workers horizontaux, Redis queue.

### Implementation Readiness Validation ✅

**Decision Completeness:**  
Goals/Non-Goals, flows, décisions techniques (A–F), Data (ORM, migrations, outbox, contraintes, Zod, Redis), patterns (naming, structure, formats, process) et structure projet sont documentés avec emplacements et exemples.

**Structure Completeness:**  
Arborescence détaillée ; mapping FR → dossiers/fichiers ; frontières API / composants / données ; points d’intégration et workflow dev/build définis.

**Pattern Completeness:**  
Conflits potentiels (naming, structure, formats, process) adressés ; règles pour agents et anti-patterns documentés.

### Gap Analysis Results

- **À détailler en implémentation :** schéma Prisma complet (tables, index, contraintes), diagramme C4, runbooks (Twilio down, DLQ, TTL).
- **Post-MVP :** WebSocket Live Ops, multi-canaux, analytics, cache applicatif.

Aucun gap bloquant pour démarrer l’implémentation.

### Architecture Completeness Checklist

**✅ Requirements Analysis** — Contexte projet, scale, contraintes et cross-cutting concerns mappés.

**✅ Architectural Decisions** — Goals/Non-Goals, flows, décisions A–F, Data (Prisma, Migrate, outbox, Zod, Redis) documentés.

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

**First Implementation Priority:**  
`npm create t3-app@latest` (Prisma, Tailwind, App Router) ; puis ajout de la couche workers (BullMQ + Redis) et de la route webhook Twilio.

---

_Document d'architecture SnapSell MVP — à faire évoluer avec les décisions de détail (schéma DB, C4, runbooks) au fil de l'implémentation._
