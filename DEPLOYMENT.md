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
- [ ] Migration `20260208000000_add_seller_phones` appliquée en production
- [ ] Service Railway créé et configuré
- [ ] Variables d'environnement configurées
- [ ] Worker démarre sans erreur
- [ ] Jobs sont traités (vérifier Upstash)
- [ ] Tests vendeur/client fonctionnent

**Story 2.4:**
- [ ] Migration `20260205171901_add_message_out_and_dead_letter_job` appliquée en production
- [ ] Variables d'environnement Twilio configurées (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)
- [ ] Worker outbox-sender démarre sans erreur (logs "Outbox sender worker started successfully")
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
