# Guide de Déploiement - Stories 2.1, 2.2 & 2.4

**Stories:** 
- 2.1: Route webhook réception, vérification signature, idempotence, 200 < 1s
- 2.2: Attribuer le message au tenant et router vendeur vs client
- 2.4: Envoi sortant via outbox + retries + DLQ

---

## 📋 Prérequis

- ✅ Compte Railway ([railway.app](https://railway.app))
- ✅ Compte Vercel (déjà configuré pour Story 2.1)
- ✅ Variables d'environnement :
  - `DATABASE_URL` (Neon PostgreSQL)
  - `REDIS_URL` (Upstash Redis)
  - `REDIS_TOKEN` (si requis)
  - `TWILIO_*` (Account SID, Auth Token, Webhook Secret, WhatsApp Number)

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
| **Twilio Console** → [Messaging](https://console.twilio.com) → Try it out → Send a WhatsApp message → **Webhook URL** (ou config du numéro WhatsApp) | Webhook "When a message comes in" | `https://<TON_DOMAINE_VERCEL>/api/webhooks/twilio` — ex. `https://snapsell.vercel.app/api/webhooks/twilio` |

**Récap :**
- **Twilio** : obligatoire — sans cette URL, les messages entrants ne seront pas reçus par l’app.
- **AUTH_URL** : optionnel — utile si login/redirect après connexion pointe vers le mauvais domaine (surtout avec domaine personnalisé).

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

### 3. Variables d'Environnement Railway

Dans l'onglet **"Variables"** du service, ajouter :

```bash
AUTH_SECRET=<secret-nextauth>   # Requis par la validation env en prod. Générer : openssl rand -base64 32
DATABASE_URL=<votre-url-neon>
REDIS_URL=<votre-url-upstash>
NODE_ENV=production
REDIS_TOKEN=<token-si-requis>
TWILIO_ACCOUNT_SID=<votre-account-sid>
TWILIO_AUTH_TOKEN=<votre-auth-token>
TWILIO_WHATSAPP_NUMBER=<votre-numero-whatsapp>  # Format E.164, ex. +14155238886
```

**Où trouver les valeurs:**
- **DATABASE_URL:** [Neon Console](https://console.neon.tech) → Connection string
- **REDIS_URL:** [Upstash Console](https://console.upstash.com) → Redis URL
- **REDIS_TOKEN:** Même page Upstash (si requis)
- **TWILIO_ACCOUNT_SID:** [Twilio Console](https://console.twilio.com) → Account SID
- **TWILIO_AUTH_TOKEN:** Même page Twilio → Auth Token
- **TWILIO_WHATSAPP_NUMBER:** Numéro WhatsApp Twilio (format E.164, ex. +14155238886)

### 4. Déployer

Railway détectera automatiquement les changements et déploiera. Sinon, cliquer sur **"Deploy"**.

### 5. Vérifier le Déploiement

**Dans les logs Railway, rechercher:**
```
[INFO] [Worker] Starting webhook processor worker...
[INFO] [Worker] Webhook processor worker started successfully with metrics monitoring
[INFO] [Worker] Starting outbox sender worker...
[INFO] [Worker] Outbox sender worker started successfully
```

**Vérifications externes:**
- [Upstash Dashboard](https://console.upstash.com): Jobs traités (queue depth diminue)
- Base de données: Tables `seller_phones`, `messages_out`, `dead_letter_jobs` existent

---

## 🚀 Déploiement Story 2.4 (Worker Outbox-Sender)

**Status:** ✅ Intégré dans le même service Railway que Story 2.2

Le worker `outbox-sender` est démarré automatiquement avec `webhook-processor` dans le même service Railway.

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

### 2. Variables d'Environnement Additionnelles

Ajouter dans l'onglet **"Variables"** du service Railway :

```bash
TWILIO_ACCOUNT_SID=<votre-account-sid>
TWILIO_AUTH_TOKEN=<votre-auth-token>
TWILIO_WHATSAPP_NUMBER=<votre-numero-whatsapp>  # Format E.164, ex. +14155238886
```

**Où trouver les valeurs:**
- **TWILIO_ACCOUNT_SID:** [Twilio Console](https://console.twilio.com) → Account SID
- **TWILIO_AUTH_TOKEN:** Même page Twilio → Auth Token
- **TWILIO_WHATSAPP_NUMBER:** Numéro WhatsApp Twilio (format E.164, ex. +14155238886)

### 3. Redéployer

Railway détectera automatiquement les changements et redéploiera. Sinon, cliquer sur **"Deploy"**.

### 4. Vérifier le Déploiement

**Dans les logs Railway, rechercher:**
```
[INFO] [Worker] Outbox sender worker started successfully
```

**Vérifications externes:**
- Base de données: Tables `messages_out` et `dead_letter_jobs` existent
- Logs montrent "Outbox sender worker started successfully"

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
- Vérifier variables d'environnement (DATABASE_URL, REDIS_URL)
- Vérifier format URLs (postgresql://, redis:// ou rediss://)

**"Can't reach database server at localhost:5432":**
- La variable **DATABASE_URL** n'est pas définie (ou pas appliquée) sur le service Railway. Ajouter dans Variables l'URL Neon (ex. `postgresql://...@ep-xxx.aws.neon.tech/neondb?sslmode=require`). Vérifier que la variable est bien attachée au service qui exécute le worker.

**"AUTH_SECRET is required in production":**
- La validation env (src/env.js) exige **AUTH_SECRET** en production. Ajouter dans Variables du service webhook-worker une valeur secrète (ex. `openssl rand -base64 32`). Tu peux réutiliser le même AUTH_SECRET que sur Vercel.

**Jobs non traités:**
- Vérifier que le worker démarre (logs "Worker started successfully")
- Vérifier Upstash dashboard (jobs dans la queue)
- Vérifier logs Railway pour erreurs

**Migration non appliquée:**
- Erreur: `relation "seller_phones" does not exist` ou `relation "messages_out" does not exist`
- Solution: Ouvrir Railway Shell → `npm run db:migrate` → Redémarrer worker

**Messages sortants ne sont pas envoyés:**
- Vérifier variables d'environnement Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)
- Vérifier table `messages_out` pour messages avec `status = 'pending'`
- Vérifier logs Railway pour erreurs Twilio
- Vérifier format numéro WhatsApp (E.164, ex. +33612345678)

**« J'envoie des messages mais je ne reçois rien » (messages entrants / pas de réponse) :**

1. **Webhook Twilio**  
   Dans [Twilio Console](https://console.twilio.com) → Messaging / ton numéro WhatsApp, le champ **« When a message comes in »** doit être exactement l’URL de ton app, par ex.  
   `https://snapsell.vercel.app/api/webhooks/twilio`  
   (sans slash final, en `https`). Si l’URL est vide ou incorrecte, Twilio n’appelle pas ton app → aucun message reçu.

2. **Numéro WhatsApp du tenant**  
   Dans l’app : **Paramètres → Connexion WhatsApp**, le **numéro WhatsApp** enregistré doit être **exactement le numéro Twilio** qui reçoit les messages (celui de `TWILIO_WHATSAPP_NUMBER`), au format E.164, ex. `+14155238886`.  
   C’est ce champ qui permet au webhook de retrouver ton tenant à partir du champ « To » envoyé par Twilio. Si ce numéro n’est pas renseigné ou ne correspond pas, les messages sont ignorés (pas de job traité).

3. **Signature du webhook (production)**  
   En production, si la signature Twilio est invalide, la requête est rejetée (401). Vérifier que l’URL configurée dans Twilio est **exactement** celle utilisée par les requêtes (même domaine, pas de slash en trop). Sur Vercel, l’app utilise l’URL de la requête ; si tu as un domaine custom, l’URL dans Twilio doit être ce domaine.

4. **Redis partagé (Vercel + Railway)**  
   Le webhook (Vercel) enqueue les jobs dans Redis ; le worker (Railway) les consomme. Les deux doivent utiliser la **même** `REDIS_URL` (ex. Upstash). Si la variable diffère ou est absente sur l’un des deux, les jobs restent en file et rien n’est traité.

5. **Pas de réponse automatique**  
   Aujourd’hui, l’app **reçoit** les messages (webhook + worker) et les enregistre, mais il n’y a **pas** de réponse automatique envoyée au client. Pour envoyer une réponse, il faut qu’un autre flux écrive dans l’outbox (`messages_out`). Une UI « envoyer un message » depuis le dashboard n’est pas encore en place.

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
- [x] Service Railway créé et configuré (webhook-worker, repo connecté)
- [x] Variables d'environnement configurées (DATABASE_URL, REDIS_URL, AUTH_SECRET, TWILIO_*, NODE_ENV)
- [x] Worker démarre sans erreur (logs : webhook processor + outbox sender + close-inactive démarrés)
- [x] Jobs sont traités (logs : messageType "client" observé)
- [ ] Tests vendeur/client fonctionnent (à valider : envoyer message client + ajouter seller_phone et tester vendeur)

**Story 2.4:**
- [x] Migration `20260205171901_add_message_out_and_dead_letter_job` appliquée en production
- [x] Variables d'environnement Twilio configurées (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)
- [x] Worker outbox-sender démarre sans erreur (logs "Outbox sender worker started successfully")
- [ ] Test envoi message sortant fonctionne (message écrit dans outbox → envoyé via Twilio)
- [ ] Event log créé après envoi réussi

---

## 📝 Notes

- **Seller_phones:** Ajout manuel en DB pour l'instant (API tRPC à venir Story 1.6)
- **Outbox-sender:** Polling DB toutes les 5 secondes, batch de 10 messages (configurable dans `startOutboxSenderWorker`)
- **Retries:** Backoff exponentiel (1s, 2s, 4s, 8s, 16s, max 30s), max 5 tentatives avant DLQ
- **DLQ:** Messages échoués après 5 tentatives sont créés dans `dead_letter_jobs` pour traçabilité ops
- **Rate limiting webhook (Story 2.1 complément):** Par IP, configurable via `WEBHOOK_RATE_LIMIT_MAX` (défaut 120) et `WEBHOOK_RATE_LIMIT_WINDOW_MS` (défaut 60000). En cas de dépassement : réponse 200 + log (pas de 429 pour éviter les retries Twilio).
- **Sentry:** Optionnel. Si `SENTRY_DSN` est défini et `@sentry/nextjs` installé, les erreurs critiques du webhook sont envoyées via `lib/sentry.ts`. Pour une initialisation complète (traces, erreurs non gérées) : `pnpm add @sentry/nextjs`, puis créer `src/sentry.server.config.ts` et `src/instrumentation.ts` selon la [doc Sentry Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/).
- **Scaling:** Augmenter instances Railway selon profondeur de queue (webhook-processing) et nombre de messages pending (messages_out)
