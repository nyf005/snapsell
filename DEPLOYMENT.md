# Guide de Déploiement - Stories 2.1, 2.2 & 2.4

**Stories:** 
- 2.1: Route webhook réception, vérification signature, idempotence, 200 < 1s
- 2.2: Attribuer le message au tenant et router vendeur vs client
- 2.4: Envoi sortant via outbox + retries + DLQ

---

## 🗺️ Répartition des runtimes

| Runtime | Ce qui y tourne | Pourquoi |
|---|---|---|
| **Vercel** | App Next.js, tRPC, webhook Meta entrant, routes `/api/qstash/*`, fallbacks `/api/cron/*` | HTTP, request-scoped |
| **Railway** (`webhook-worker`) | Consommation pg-boss de `webhook-processing` + les 5 crons métier | Process long-running : `boss.work()` est un poller persistant qui exige une connexion Neon **directe** et des advisory locks — incompatible avec le serverless |
| **QStash** (Upstash) | Envoi sortant : retries, backoff, DLQ | Push-based, idempotent, tolérant à la latence |
| **Neon** | Postgres applicatif **+ backend de queue pg-boss** | — |

Le webhook Vercel ne fait qu'un `boss.send()` ; tout le traitement métier des messages entrants se fait sur Railway.

---

## 📋 Prérequis

- ✅ Compte Railway ([railway.app](https://railway.app))
- ✅ Compte Vercel (déjà configuré pour Story 2.1)
- ✅ Compte Upstash (QStash pour l'outbox ; Redis REST optionnel pour le rate limiting tRPC)
- ✅ Compte Meta Business (WhatsApp Cloud API)
- ✅ Variables d'environnement — la liste faisant foi est [src/env.js](src/env.js) :
  - `DATABASE_URL` (Neon PostgreSQL, URL **directe** non-pooler)
  - `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` (requis en production)
  - `QSTASH_TOKEN`, `NEXT_PUBLIC_APP_URL` (envoi sortant)
  - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (optionnel : rate limiting tRPC)

---

## 🚀 Déploiement Story 2.1 (Webhook Vercel)

**Status:** ✅ Déjà déployé

**Vérifications:**
- [ ] Webhook répond < 1s
- [ ] Jobs sont enqueued dans la queue `webhook-processing`
- [ ] Logs Vercel montrent les jobs créés

**Aucune action requise** - Le webhook fonctionne déjà.

---

## 🔗 URLs à mettre à jour après déploiement réussi

Une fois l’app déployée sur Vercel, mets à jour les URLs suivantes.

| Où | Variable / Champ | Valeur à mettre |
|----|------------------|-----------------|
| **Vercel** (Dashboard → Project → Settings → Environment Variables) | `AUTH_URL` *(optionnel)* | URL publique de l’app, ex. `https://snapsell.vercel.app` ou ton domaine custom. Si tu n’ajoutes rien, Vercel fournit déjà `VERCEL_URL` et NextAuth peut s’en servir pour les callbacks. À définir si tu utilises un **domaine personnalisé** (ex. `https://app.snapsell.com`). |
| **Meta App Dashboard** → WhatsApp → Configuration → **Webhook** | Callback URL + Verify token | `https://<TON_DOMAINE_VERCEL>/api/webhooks/meta` + la valeur de `META_VERIFY_TOKEN` |

**Récap :**
- **NEXT_PUBLIC_APP_URL** (Vercel **et** Railway) : à définir en prod, ex. `https://snapsell-nine.vercel.app` — utilisé pour les callbacks Paystack, les liens, **et l'URL de callback QStash de l'outbox**.
- **Meta** : obligatoire — Callback URL = `https://snapsell-nine.vercel.app/api/webhooks/meta`, avec `META_VERIFY_TOKEN` identique des deux côtés.
- **Paystack** (Dashboard) : Webhook URL = `https://snapsell-nine.vercel.app/api/webhooks/paystack` ; Callback URL (si demandé) = `https://snapsell-nine.vercel.app/parametres/abonnement?payment=callback`
- **AUTH_URL** : optionnel — utile si domaine personnalisé.

### ⚠️ Paystack Webhook (Story 7A.2) — obligatoire pour mettre à jour l’abonnement

Sans cette URL, après un paiement réussi le **plan du tenant ne sera pas mis à jour** et l’historique restera en « pending ».

1. Va sur [Paystack Dashboard](https://dashboard.paystack.com) → **Settings** → **API Keys & Webhooks** (ou **Webhooks**).
2. Définis l’**URL de webhook** : `https://snapsell-nine.vercel.app/api/webhooks/paystack`
3. **Callback URL** (redirection après paiement, si le dashboard le propose) : `https://snapsell-nine.vercel.app/parametres/abonnement?payment=callback`
4. Paystack enverra un `POST` sur cette URL à chaque événement (ex. `charge.success`, `subscription.create`). Vercel doit pouvoir recevoir ces requêtes (pas de restriction par IP côté app).

Après configuration, refais un paiement test : le plan doit passer à Starter/Pro et l’historique doit afficher une ligne « success ».

### Créer une Payment Page personnalisée (Paystack) — une seule page

Dans Paystack, **une Subscription Payment Page = un seul plan**. Pour avoir « une seule page » côté Paystack qui couvre tes abonnements, tu crées **une** page liée à **un** plan (ex. Starter). Pour Pro, soit une deuxième Payment Page, soit tu gardes le lien app `/api/payment/subscribe?plan=pro`.

#### Étape 1 — Créer les plans (si pas déjà faits)

1. Va sur [Paystack Dashboard](https://dashboard.paystack.com) → **Plans** ([dashboard.paystack.com/#/plans](https://dashboard.paystack.com/#/plans)).
2. Clique sur **New Plan**.
3. Pour **Starter** :
   - **Plan Name** : `SnapSell Starter` (ou équivalent).
   - **Plan Amount** : montant en **centimes** (ex. 9 900 = 99 FCFA si tu factures en FCFA avec 2 décimales ; pour XOF Paystack utilise souvent les unités — vérifie la doc Paystack pour XOF).
   - **Interval** : `Monthly`.
   - Optionnel : coche **Create a Subscription Page for this Plan** si tu veux que Paystack crée une page en même temps.
4. Clique sur **Create**.
5. Répète pour **Pro** si besoin. Note les **plan codes** (ex. `PLN_xxxx`) : ils doivent être dans ton `.env` (`PAYSTACK_PLAN_STARTER`, `PAYSTACK_PLAN_PRO`).

#### Étape 2 — Créer une seule Payment Page (type Subscription)

1. Va sur **Payment Pages** ([dashboard.paystack.com/#/pages](https://dashboard.paystack.com/#/pages)).
2. Clique sur **New Page**.
3. Dans la popup, choisis **Subscription Payment**.
4. Choisis **One of my existing plans** puis sélectionne **un** plan (ex. Starter).  
   *(Une page = un plan ; pour Pro tu feras une 2e page ou tu utiliseras l’app.)*
5. Remplis :
   - **Page Name** : ex. `SnapSell Abonnement Starter`.
   - **Description** : court texte pour le client (optionnel).
6. Clique sur **Show advanced options** et configure :
   - **Redirect after payment** : `https://<TON_DOMAINE>/parametres/abonnement?payment=callback` (remplace `<TON_DOMAINE>` par ton domaine réel).
   - **Success message** : personnalise si tu veux.
7. Clique sur **Create**.
8. Copie l’**URL de la page** (ex. `https://checkout.paystack.com/xxxx` ou ton custom link).

#### Étape 3 — Webhook (déjà configuré)

Le webhook global (`/api/webhooks/paystack`) reçoit déjà les événements Paystack ; pas besoin de configurer un webhook spécifique par Payment Page.

#### Étape 4 — Utiliser cette page

- Pour **Starter** : tu peux remplacer le lien actuel `/api/payment/subscribe?plan=starter` par l’URL de cette Payment Page (l’utilisateur atterrit directement sur ta page personnalisée Paystack).
- Pour **Pro** : soit tu crées une 2e Payment Page (même procédure, plan Pro), soit tu gardes le lien app `/api/payment/subscribe?plan=pro`.

**Résumé :** Une seule page Paystack = un plan. Pour « une seule page » côté expérience, tu peux n’avoir qu’une Payment Page (Starter) et garder Pro via l’app ; ou deux Payment Pages (Starter + Pro) et une seule page « hub » dans ton app (Tarifs / Abonnement) qui affiche les deux options et envoie vers la bonne URL Paystack.

---

## 🚀 Déploiement Story 2.2 (Worker Railway)

### 1. Migration Base de Données (OBLIGATOIRE)

**Migration:** `20260208000000_add_seller_phones`

**En production:**
```bash
# Via Railway Shell (recommandé)
npm run db:migrate

# OU via CLI locale
DATABASE_URL=<production-url> npx prisma migrate deploy
```

⚠️ **IMPORTANT:** Appliquer AVANT le démarrage du worker.

### 2. Créer le Service Railway

1. Aller sur [Railway](https://railway.app)
2. Créer un nouveau projet → "Deploy from GitHub repo"
3. Sélectionner votre repository `SnapSell`
4. Créer un nouveau service → "Empty Service"
5. Nommer: `webhook-worker`

**Configuration automatique:** Le fichier `railway.json` est déjà configuré.

**Réglage Railway important:** pour `webhook-worker`, laisser le service en mode worker classique.
- `Enable Serverless` doit être **OFF**
- le service doit rester connecté au repo `nyf005/snapsell` sur la branche `main`

### 3. Variables d'Environnement Railway

Dans l'onglet **"Variables"** du service, ajouter :

```bash
# --- Requis (la validation env échoue au démarrage sans ces variables en production) ---
NODE_ENV=production
DATABASE_URL=<url-neon-DIRECTE>   # NON-pooler : pg-boss est incompatible avec PgBouncer
AUTH_SECRET=<secret-nextauth>     # Requis par la validation env en prod. Générer : openssl rand -base64 32
ENCRYPTION_KEY=<hex-64-caracteres># Requis en prod. Déchiffre metaAccessToken. Doit être IDENTIQUE à Vercel
CRON_SECRET=<secret-partage>      # Requis en prod par la validation env

# --- Requis fonctionnellement pour que les messages sortants partent ---
QSTASH_TOKEN=<token-upstash-qstash>
NEXT_PUBLIC_APP_URL=https://<votre-domaine-vercel>

# --- Recommandé (sinon dégradation silencieuse de fonctionnalités) ---
R2_ACCOUNT_ID=<...>               # Sans R2, l'upload média des messages entrants est ignoré
R2_ACCESS_KEY_ID=<...>
R2_SECRET_ACCESS_KEY=<...>
R2_BUCKET_NAME=<...>
AI_API_KEY=<cle-groq>             # Sans clé, l'analyse d'intention IA est désactivée
SENTRY_DSN=<dsn-sentry>           # Optionnel, remontée des erreurs worker
```

⚠️ **`NEXT_PUBLIC_APP_URL` est obligatoire sur le worker, ce n'est pas qu'une variable front.**
`enqueueOutboxSend()` ([outbox.ts](src/server/messaging/outbox.ts)) exige **à la fois** `QSTASH_TOKEN` **et** `NEXT_PUBLIC_APP_URL` pour publier vers QStash. Si l'une des deux manque, les messages restent en `status = 'pending'` et ne partent jamais.

Depuis le 2026-07-28, cet état n'est plus silencieux : en production, une erreur explicite nommant la variable manquante est journalisée en `error` à chaque message. Chercher `Outbox non configuré` ou `message stuck in 'pending'` dans les logs.

**Note provider WhatsApp:**
- l'envoi passe par **Meta WhatsApp Cloud API**, avec des credentials **par tenant stockés en base** (`metaPhoneNumberId`, `metaAccessToken` chiffré) — il n'y a donc pas de variable d'environnement de provider à définir sur Railway
- `META_APP_ID` / `META_APP_SECRET` / `META_VERIFY_TOKEN` servent au webhook et à l'embedded signup, côté Vercel

**Note QStash:**
- le worker Railway n'a besoin que de `QSTASH_TOKEN` (+ `NEXT_PUBLIC_APP_URL`) pour publier les jobs outbox
- `QSTASH_CURRENT_SIGNING_KEY` et `QSTASH_NEXT_SIGNING_KEY` sont requises sur les routes HTTP QStash (`/api/qstash/*`), donc côté Vercel uniquement

**Note crons métier Railway:**
- les crons métier tournent dans le worker Railway via pg-boss : `reservation-ttl`, `close-sessions`, `deposit-expiry`, `meta-catalogue-sync`, `credits-monthly-reset`, `subscription-expired`
- les routes HTTP `/api/cron/*` restent uniquement des fallbacks manuels / ops et exigent `Authorization: Bearer <CRON_SECRET>`
- définir `CRON_SECRET` en production sur Vercel et Railway, car la validation d'environnement production le requiert

> 🚨 **Ne pas activer de crons Vercel tant que le worker Railway tourne.**
> Les schedules pg-boss de [start-worker.ts](scripts/start-worker.ts) et les routes [/api/cron/*](src/app/api/cron) exécutent **la même logique métier**. `vercel.json` doit rester sans clé `crons` : ajouter des crons Vercel ferait tourner chaque job **deux fois en parallèle**, sur deux runtimes qui ne partagent aucun verrou — avec à la clé des expirations de réservations et des relances clients en double.
>
> Historique : cette bascule a déjà été tentée deux fois puis annulée (`c64837d`, `46e06e5`). Le passage à un plan Vercel payant lève la limite de granularité des crons, **mais ne change rien à ce risque de double exécution**.

**Où trouver les valeurs:**
- **DATABASE_URL:** [Neon Console](https://console.neon.tech) → Connection string (bien prendre l'URL **directe**, pas celle contenant `-pooler.`)
- **QSTASH_TOKEN:** [Upstash Console](https://console.upstash.com) → QStash → Token
- **R2_\*:** [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 → API Tokens
- **AI_API_KEY:** [Groq Console](https://console.groq.com) → API Keys
- **ENCRYPTION_KEY:** générer avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — **réutiliser exactement la même valeur que sur Vercel**, sinon les tokens Meta chiffrés en base seront illisibles par le worker

### 4. Déployer

Railway détectera automatiquement les changements et déploiera. Sinon, cliquer sur **"Deploy"**.

### 5. Vérifier le Déploiement

**Dans les logs Railway, rechercher:**
```
[INFO] [Worker] pg-boss started successfully
[INFO] [Worker] pg-boss queues created
[INFO] [Worker] Starting webhook processor worker...
[INFO] [Worker] Webhook processor worker started successfully
[INFO] [Worker] Periodic jobs scheduled via pg-boss (reservation-ttl: 1min, close-sessions: 10min, deposit-expiry: 5min, meta-catalogue-sync: 1h, credits-monthly-reset: 1h, subscription-expired: daily)
```

> ℹ️ Il n'y a **pas** de ligne « Outbox sender worker started » : l'envoi sortant ne tourne plus sur Railway (voir section Story 2.4 ci-dessous).

**Vérifications externes:**
- Base de données : table `pgboss.job` — la profondeur de la queue `webhook-processing` doit redescendre
- Base de données : tables `seller_phones`, `messages_out`, `dead_letter_jobs` existent
- Base de données : aucun `messages_out` ne doit rester bloqué en `status = 'pending'` (symptôme typique de `NEXT_PUBLIC_APP_URL` ou `QSTASH_TOKEN` manquant sur le worker)

---

## 🚀 Déploiement Story 2.4 (Envoi sortant / Outbox)

**Status:** ✅ Externalisé sur QStash + Vercel — **ne tourne plus sur Railway**

L'envoi sortant a été sorti du worker Railway. Le chemin actuel est entièrement push-based :

```
writeToOutbox()                    → INSERT messages_out (status = 'pending')
  └─ enqueueOutboxSend()           → QStash publish  [src/server/messaging/outbox.ts]
       └─ POST /api/qstash/outbox-send   (Vercel, signature QStash vérifiée)
            └─ processOutboundMessage()  → Meta WhatsApp Cloud API
       └─ échec après 5 retries → POST /api/qstash/outbox-dlq
```

- **Retries / backoff / DLQ :** gérés par QStash (`retries: 5`, `failureCallback`), plus par pg-boss
- **Provider :** Meta WhatsApp Cloud API, credentials **par tenant en base** (`metaPhoneNumberId`, `metaAccessToken` chiffré via `ENCRYPTION_KEY`)
- **Rôle de Railway :** uniquement **publier** le job QStash depuis le webhook-processor — d'où la nécessité de `QSTASH_TOKEN` et `NEXT_PUBLIC_APP_URL` sur le service

> ⚠️ **Code résiduel :** `startOutboxSenderWorker()` ([outbox-sender.ts](src/server/workers/outbox-sender.ts)) et la queue pg-boss `outbox-send` existent encore comme fallback de développement local, mais **`start-worker.ts` ne les démarre jamais**. En pratique, si QStash n'est pas configuré, les jobs `outbox-send` s'empilent sans consommateur. Voir la section Développement local ci-dessous.

### 1. Migration Base de Données (OBLIGATOIRE)

**Migration:** `20260205171901_add_message_out_and_dead_letter_job`

**En production:**
```bash
# Via Railway Shell (recommandé)
npm run db:migrate

# OU via CLI locale
DATABASE_URL=<production-url> npx prisma migrate deploy
```

⚠️ **IMPORTANT:** Appliquer AVANT le démarrage du worker.

### 2. Variables d'Environnement

**Sur Vercel** (les routes `/api/qstash/*` vérifient la signature) :
```bash
QSTASH_TOKEN=<token-upstash-qstash>
QSTASH_CURRENT_SIGNING_KEY=<current-signing-key>
QSTASH_NEXT_SIGNING_KEY=<next-signing-key>
ENCRYPTION_KEY=<meme-valeur-que-railway>
NEXT_PUBLIC_APP_URL=https://<votre-domaine-vercel>
```

**Sur Railway** (publication uniquement) : `QSTASH_TOKEN` + `NEXT_PUBLIC_APP_URL` — voir section 3 plus haut.

Les credentials WhatsApp ne sont **pas** des variables d'environnement : ils sont configurés par tenant depuis les réglages business (embedded signup Meta).

### 3. Vérifier le Déploiement

- **[Upstash Console](https://console.upstash.com) → QStash → Logs :** les messages publiés doivent passer en `DELIVERED`
- **Base de données :** `messages_out` passe de `pending` à `sent` ; aucun blocage durable en `pending`
- **Logs Vercel** (fonction `/api/qstash/outbox-send`) : `Message sent successfully`
- **DLQ :** `dead_letter_jobs` doit rester vide ; s'il se remplit, vérifier `lastError` (`meta_config_missing` = tenant sans credentials Meta)

### 4. Développement local

Sans `QSTASH_TOKEN` / `NEXT_PUBLIC_APP_URL`, `enqueueOutboxSend()` bascule sur pg-boss — mais aucun worker ne consomme cette queue. Deux options :

- **Recommandé :** configurer `QSTASH_TOKEN` + un tunnel public (`NEXT_PUBLIC_APP_URL`) pour recevoir les callbacks QStash
- **Sinon :** garder à l'esprit que les messages sortants resteront en `pending` en local

---

## 🧪 Tests Post-Déploiement

### Test 1: Message Client
1. Envoyer un message WhatsApp depuis un numéro non enregistré
2. Vérifier dans les logs Railway: `messageType: "client"`

### Test 2: Message Vendeur
1. Ajouter un seller_phone en DB:
   ```sql
   INSERT INTO seller_phones (id, tenant_id, phone_number, created_at)
   VALUES (gen_random_uuid()::text, '<tenant-id>', '+33612345678', NOW());
   ```
2. Envoyer un message depuis ce numéro
3. Vérifier dans les logs: `messageType: "seller"`

### Test 3: Envoi Message Sortant (Story 2.4)
1. Écrire un message dans l'outbox (via `writeToOutbox()` ou directement en DB):
   ```sql
   INSERT INTO messages_out (id, tenant_id, "to", body, status, attempts, correlation_id, created_at, updated_at)
   VALUES (
     gen_random_uuid()::text,
     '<tenant-id>',
     '+33612345678',
     'Test message',
     'pending',
     0,
     gen_random_uuid()::text,
     NOW(),
     NOW()
   );
   ```
2. Attendre max 5 secondes (polling interval)
3. Vérifier dans les logs Railway: `Message sent successfully`
4. Vérifier en DB: `messages_out.status = 'sent'` et `provider_message_id` renseigné
5. Vérifier `event_log`: événement `message_sent` créé

---

## 🐛 Troubleshooting

**Worker ne démarre pas:**
- Vérifier `DATABASE_URL` (format `postgresql://`)
- Vérifier que c'est bien l'URL Neon **directe** : une URL contenant `-pooler.` fait échouer pg-boss (PgBouncer en transaction mode est incompatible avec les advisory locks)
- Vérifier `ENCRYPTION_KEY` (hex de 64 caractères) et `CRON_SECRET`, exigés en production par [src/env.js](src/env.js)

**"Can't reach database server at localhost:5432":**
- La variable **DATABASE_URL** n'est pas définie (ou pas appliquée) sur le service Railway. Ajouter dans Variables l'URL Neon (ex. `postgresql://...@ep-xxx.aws.neon.tech/neondb?sslmode=require`). Vérifier que la variable est bien attachée au service qui exécute le worker.

**"AUTH_SECRET is required in production":**
- La validation env (src/env.js) exige **AUTH_SECRET** en production. Ajouter dans Variables du service webhook-worker une valeur secrète (ex. `openssl rand -base64 32`). Tu peux réutiliser le même AUTH_SECRET que sur Vercel.

**Jobs non traités:**
- Vérifier que le worker démarre (logs "Webhook processor worker started successfully")
- Vérifier la table `pgboss.job` : des jobs `webhook-processing` en `created` qui ne bougent pas = aucun consommateur actif
- Vérifier que Vercel et Railway pointent sur la **même** `DATABASE_URL` (la queue vit dans Postgres, pas dans Redis)
- Vérifier logs Railway pour erreurs

**Migration non appliquée:**
- Erreur: `relation "seller_phones" does not exist` ou `relation "messages_out" does not exist`
- Solution: Ouvrir Railway Shell → `npm run db:migrate` → Redémarrer worker

**Messages sortants ne sont pas envoyés (`messages_out` bloqué en `pending`):**
1. **Cause la plus fréquente :** `QSTASH_TOKEN` ou `NEXT_PUBLIC_APP_URL` absent sur le service qui appelle `writeToOutbox()`. `enqueueOutboxSend()` bascule alors sur la queue pg-boss `outbox-send`, **que personne ne consomme** — sans aucune erreur dans les logs.
2. Vérifier la [console QStash](https://console.upstash.com) : le message a-t-il été publié ? Est-il `DELIVERED` ou en échec ?
3. Vérifier les logs Vercel de `/api/qstash/outbox-send` — un **401** signifie `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` absentes ou incorrectes, un **503** signifie une config de signature incomplète en production.
4. Vérifier que le tenant a bien `metaPhoneNumberId` et `metaAccessToken` en base (`lastError = "meta_config_missing"` sinon).
5. Vérifier que `ENCRYPTION_KEY` est **identique** sur Vercel et Railway — sinon `metaAccessToken` est indéchiffrable.

**« J'envoie des messages mais je ne reçois rien » (messages entrants) :**

1. **Webhook Meta**
   Dans [Meta App Dashboard](https://developers.facebook.com) → WhatsApp → Configuration, la **Callback URL** doit être exactement `https://<ton-domaine>/api/webhooks/meta` (en `https`, sans slash final), et le **Verify token** doit correspondre à `META_VERIFY_TOKEN`. Vérifier aussi que le champ `messages` est bien souscrit.

2. **Résolution du tenant**
   Le webhook retrouve le tenant via `phone_number_id` (payload Meta) → `tenant.metaPhoneNumberId` en base ([route.ts:140](src/app/api/webhooks/meta/route.ts)). Si aucun tenant ne correspond, le message est persisté avec `tenantId = null` et **aucun job n'est créé** — chercher `Tenant not found for Meta phone_number_id` dans les logs Vercel. Reconnecter le numéro via **Paramètres → Connexion WhatsApp**.

3. **Signature du webhook (production)**
   La signature HMAC-SHA256 est vérifiée avec `META_APP_SECRET` **avant** la résolution du tenant. Si elle est invalide, la requête est rejetée. Vérifier que `META_APP_SECRET` correspond bien à l'app Meta configurée.

4. **Queue partagée (Vercel + Railway)**
   Le webhook (Vercel) enqueue via `boss.send()` **dans Postgres** (`pgboss.job`), et le worker (Railway) consomme. Les deux doivent donc utiliser la **même `DATABASE_URL`**. ⚠️ Il ne s'agit **pas** de Redis : `UPSTASH_REDIS_REST_*` ne sert qu'au rate limiting tRPC et n'a aucun rôle dans la queue.

5. **Réponses automatiques**
   Le webhook-processor répond automatiquement via `writeToOutbox()` (réservations, waitlist, sélection de variantes, FAQ…). Si les messages entrants sont bien traités mais qu'aucune réponse n'arrive, le problème est **en aval** : voir « Messages sortants ne sont pas envoyés » ci-dessus.

---

## 📊 Monitoring

**Métriques à surveiller:**
- Queue depth: < 10 jobs (normal), > 100 (alerte)
- Success rate: > 95% (normal), < 90% (alerte)
- Processing time: < 500ms (normal), > 2s (alerte)

**Métriques périodiques:** Loggées toutes les 5 min ou 100 jobs dans les logs Railway.

---

## ✅ Checklist Finale

**Story 2.2:**
- [x] Migration `20260208000000_add_seller_phones` appliquée en production (Neon, 18 migrations déployées)
- [x] Service Railway créé et configuré (webhook-worker, repo connecté, Serverless OFF)
- [x] Variables d'environnement configurées (NODE_ENV, DATABASE_URL directe, AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET)
- [x] Worker démarre sans erreur (logs : pg-boss started + webhook processor + schedules pg-boss)
- [x] Jobs sont traités (logs : messageType "client" observé)
- [ ] Tests vendeur/client fonctionnent (à valider : envoyer message client + ajouter seller_phone et tester vendeur)
- [ ] `QSTASH_TOKEN` **et** `NEXT_PUBLIC_APP_URL` définis sur Railway (sinon les messages sortants restent en `pending`)
- [ ] `ENCRYPTION_KEY` strictement identique entre Vercel et Railway
- [ ] `vercel.json` ne contient **pas** de clé `crons` (risque de double exécution avec les schedules pg-boss)

**Story 2.4 (envoi sortant via QStash + Vercel):**
- [x] Migration `20260205171901_add_message_out_and_dead_letter_job` appliquée en production
- [x] `QSTASH_CURRENT_SIGNING_KEY` et `QSTASH_NEXT_SIGNING_KEY` configurées sur Vercel
- [ ] Test envoi message sortant fonctionne (`messages_out` passe de `pending` à `sent` → reçu sur WhatsApp)
- [ ] Callback visible en `DELIVERED` dans la console QStash
- [ ] Event log créé après envoi réussi

---

## 👤 Créer un utilisateur OPS en production (Story 7B.1)

Les utilisateurs OPS ont accès à la console ops multi-tenant (`/ops/logs`).
Ils ont `role = OPS` et `tenant_id = NULL` (mutuellement exclusif avec les rôles tenant).

### 1. Générer le hash du mot de passe (en local)

```bash
node -e "require('bcrypt').hash('MOT_DE_PASSE_FORT', 10).then(h => console.log(h))"
```

### 2. Insérer le user OPS via la console SQL Neon

Dashboard Neon → SQL Editor → exécuter :

```sql
INSERT INTO users (id, email, password_hash, name, role, tenant_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'ops@snapsell.com',
  '$2b$10$HASH_GENERE_CI_DESSUS',
  'Ops SnapSell',
  'OPS',
  NULL,
  NOW(),
  NOW()
);
```

### 3. Vérifier

Se connecter sur `/login` avec l'email/mot de passe → redirection automatique vers `/ops/logs`.

---

## 📝 Notes

- **Seller_phones:** Ajout manuel en DB pour l'instant (API tRPC à venir Story 1.6)
- **Envoi sortant:** event-driven via QStash (plus aucun polling). `writeToOutbox()` publie un job QStash consommé par `/api/qstash/outbox-send` sur Vercel
- **Retries:** gérés par QStash (`retries: 5`, backoff exponentiel). La route doit renvoyer un 5xx pour déclencher un retry
- **DLQ:** après épuisement des retries, QStash appelle `/api/qstash/outbox-dlq` qui enregistre dans `dead_letter_jobs` pour traçabilité ops
- **Rate limiting webhook (Story 2.1 complément):** Par IP, configurable via `WEBHOOK_RATE_LIMIT_MAX` (défaut 120) et `WEBHOOK_RATE_LIMIT_WINDOW_MS` (défaut 60000). En cas de dépassement : réponse 200 + log (pas de 429, pour éviter que Meta ne relance le webhook).
- **Sentry:** `@sentry/nextjs` est **déjà installé** (voir `package.json`). Si `SENTRY_DSN` est défini, les erreurs critiques du webhook et des workers sont remontées via [`src/lib/sentry.ts`](src/lib/sentry.ts). L'initialisation complète (traces, erreurs non gérées, source maps) n'est **pas** en place : elle nécessiterait `src/instrumentation.ts` et une config client/serveur selon la [doc Sentry Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/). En l'état, seule la capture explicite via `captureException()` fonctionne.
- **Scaling:** Augmenter les instances Railway selon la profondeur de la queue `webhook-processing` (`pgboss.job`). ⚠️ Le worker tourne en `localConcurrency: 5` et les machines à états conversationnelles (`ConversationState`, sélection de variantes) font du read-modify-write sans verrou : augmenter la concurrence ou le nombre d'instances accroît le risque de course sur un même couple `tenantId + phone`. Monter en charge en gardant ce point en tête.
- **Envoi sortant:** ne se scale pas via Railway — il passe par QStash + les fonctions Vercel.
