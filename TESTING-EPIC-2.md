# Guide de Test - Epic 2 : Réception et envoi WhatsApp

**Stories testées:**
- ✅ 2.1: Route webhook réception, vérification signature, idempotence, 200 < 1s
- ✅ 2.2: Attribuer le message au tenant et router vendeur vs client
- ✅ 2.3: Event Log minimal (webhook_received, message_sent, idempotent_ignored)
- ✅ 2.4: Envoi sortant via outbox + retries + DLQ
- ✅ 2.5: Respect du STOP (scope tenant)

**Rédigé:** 2026-02-05 — **Mis à jour:** 2026-07-28

> ⚠️ **Ce guide a été réécrit.** La version d'origine décrivait Twilio et BullMQ/Redis. Le projet utilise désormais **Meta WhatsApp Cloud API** (Epic 10) et **pg-boss sur Postgres** (Story 11.1). Les payloads, en-têtes et commandes ci-dessous sont ceux du code actuel.

---

## 📋 Prérequis

### 1. Environnement de développement

```bash
grep -E "^(DATABASE_URL|META_|ENCRYPTION_KEY|QSTASH_|AI_)" .env
```

**Variables requises pour Epic 2 :**

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Postgres — applicatif **et** queue pg-boss. En local, une URL directe (non-pooler). |
| `META_APP_SECRET` | Vérification de la signature HMAC-SHA256 du webhook |
| `META_VERIFY_TOKEN` | Challenge de vérification Meta (requête GET) |
| `ENCRYPTION_KEY` | 64 caractères hex — déchiffrement de `metaAccessToken` |
| `QSTASH_TOKEN` + `NEXT_PUBLIC_APP_URL` | **Ensemble**, pour que l'envoi sortant parte réellement |

> ℹ️ Il n'y a **pas** de variable de provider WhatsApp : les credentials Meta (`metaPhoneNumberId`, `metaAccessToken`) sont stockés **par tenant en base**, via **Paramètres → Connexion WhatsApp**.

⚠️ **Sans `QSTASH_TOKEN` + `NEXT_PUBLIC_APP_URL`**, `enqueueOutboxSend()` bascule sur la queue pg-boss `outbox-send` que **rien ne consomme** : les messages restent en `pending` sans erreur. C'est normal en dev, mais empêche de tester l'envoi sortant de bout en bout.

### 2. Base de données

```bash
npx prisma migrate status
```

```bash
npm run db:migrate
```

**Tables utilisées par Epic 2 :** `tenants`, `users`, `messages_in`, `messages_out`, `seller_phones`, `event_log`, `dead_letter_jobs`, `opt_outs`, plus le schéma `pgboss` (créé automatiquement au premier démarrage du worker).

### 3. Services démarrés

**Terminal 1 — Next.js (webhook + routes QStash) :**
```bash
npm run dev
```
Le webhook est exposé sur `http://localhost:3000/api/webhooks/meta`.

**Terminal 2 — Worker (traitement des messages + crons) :**
```bash
npm run dev:worker
```

Au démarrage, le worker doit logger :
```
[INFO] [Worker] pg-boss started successfully
[INFO] [Worker] pg-boss queues created
[INFO] [Worker] Webhook processor worker started successfully
[INFO] [Worker] Periodic jobs scheduled via pg-boss (...)
```

### 4. Tests automatisés

```bash
npm test
```

```bash
npm test -- --watch
```

**Fichiers de test pertinents pour Epic 2 :**
```bash
npm test -- src/app/api/webhooks/meta/route.test.ts
npm test -- src/server/workers/webhook-processor.test.ts
npm test -- src/server/events/eventLog.test.ts
npm test -- src/server/messaging/outbox.test.ts
npm test -- src/server/messaging/optout.test.ts
```

**Tests d'intégration** — conditionnels, exigent `RUN_INTEGRATION_TESTS=true` et `DATABASE_URL` :
```bash
RUN_INTEGRATION_TESTS=true npm test -- src/server/workers/webhook-processor.integration.test.ts
```

```bash
RUN_INTEGRATION_TESTS=true npm test -- src/server/workers/__tests__/stop-optout-blocked.integration.test.ts
```

> Le projet utilise **npm** (`packageManager: npm@10.9.2`), pas pnpm.

---

## 🔧 Outil : signer une requête webhook

Meta signe le corps brut en HMAC-SHA256 avec `META_APP_SECRET`, dans l'en-tête `X-Hub-Signature-256` au format `sha256=<hex>`. Sans signature valide, la route rejette la requête.

Créer `/tmp/send-webhook.sh` :

```bash
#!/usr/bin/env bash
# Usage: ./send-webhook.sh '<json-payload>'
set -euo pipefail

SECRET="${META_APP_SECRET:?META_APP_SECRET manquant}"
URL="${WEBHOOK_URL:-http://localhost:3000/api/webhooks/meta}"
BODY="$1"

SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -s -o /dev/null -w "HTTP %{http_code} — %{time_total}s\n" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=${SIG}" \
  -d "$BODY"
```

```bash
chmod +x /tmp/send-webhook.sh
```

**Payload de référence** (remplacer `PHONE_NUMBER_ID` par le `metaPhoneNumberId` du tenant de test) :

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID_TEST",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "22500000000",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{ "profile": { "name": "Test" }, "wa_id": "22507000001" }],
        "messages": [{
          "from": "22507000001",
          "id": "wamid.TEST0001",
          "timestamp": "1738713600",
          "type": "text",
          "text": { "body": "A12" }
        }]
      }
    }]
  }]
}
```

Récupérer le `phone_number_id` du tenant de test :
```bash
npx prisma studio
```

---

## 🧪 Tests Story 2.1 : Webhook Réception

### Test 1.1 : Challenge de vérification (GET)

Meta appelle la route en GET pour valider l'abonnement.

```bash
curl -i "http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=$META_VERIFY_TOKEN&hub.challenge=test123"
```

**Résultat attendu :**
- ✅ HTTP 200, corps = `test123`
- ✅ Avec un mauvais token → HTTP 403

### Test 1.2 : Webhook répond < 1s

```bash
/tmp/send-webhook.sh '{"object":"whatsapp_business_account","entry":[{"id":"W","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"22500000000","phone_number_id":"PHONE_NUMBER_ID"},"messages":[{"from":"22507000001","id":"wamid.PERF001","timestamp":"1738713600","type":"text","text":{"body":"A12"}}]}}]}]}'
```

**Résultat attendu :**
- ✅ HTTP 200 en moins de 1 s (affiché par le script)
- ✅ `MessageIn` créé en DB
- ✅ Log Next.js avec `elapsedMs < 1000`

### Test 1.3 : Idempotence (doublon détecté)

Rejouer **exactement la même commande** que le test 1.2 (même `wamid`).

**Résultat attendu :**
- ✅ HTTP 200 à nouveau
- ✅ **Aucun** second `MessageIn` (contrainte unique `(tenant_id, provider_message_id)`)
- ✅ Event `idempotent_ignored` créé dans `event_log`
- ✅ Aucun nouveau job pg-boss

### Test 1.4 : Signature invalide rejetée

```bash
curl -i -X POST http://localhost:3000/api/webhooks/meta \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=deadbeef" \
  -d '{"object":"whatsapp_business_account","entry":[]}'
```

**Résultat attendu :**
- ✅ Requête rejetée (pas de 200 avec traitement)
- ✅ La vérification a lieu **avant** la résolution du tenant
- ✅ Aucun `MessageIn` créé

### Test 1.5 : Tenant non résolu

Envoyer un payload avec un `phone_number_id` inconnu.

**Résultat attendu :**
- ✅ HTTP 200 (pas d'erreur renvoyée à Meta)
- ✅ `MessageIn` persisté avec `tenantId = null`
- ✅ Log `Tenant not found for Meta phone_number_id`
- ✅ **Aucun job créé** — le message n'est pas traité

### Test 1.6 : Job enqueued dans pg-boss

Après un webhook valide :

```sql
SELECT id, name, state, created_on
FROM pgboss.job
WHERE name = 'webhook-processing'
ORDER BY created_on DESC
LIMIT 5;
```

**Résultat attendu :**
- ✅ Un job `webhook-processing` apparaît
- ✅ Il passe de `created` à `completed` une fois le worker passé
- ✅ S'il reste en `created`, le worker n'est pas démarré

---

## 🧪 Tests Story 2.2 : Routing Vendeur vs Client

### Test 2.1 : Message Client (numéro non vendeur)

Envoyer depuis un numéro **absent** de `seller_phones`.

**Résultat attendu :**
- ✅ Logs worker : `messageType: "client"`
- ✅ Traitement comme intention cliente (réservation, FAQ, etc.)

### Test 2.2 : Message Vendeur (numéro enregistré)

Ajouter d'abord le numéro dans `seller_phones` (via Prisma Studio ou le dashboard), puis renvoyer le même code.

**Résultat attendu :**
- ✅ Logs worker : `messageType: "seller"`
- ✅ Le code déclenche une **création d'article**, pas une réservation

> 🚨 **Piège critique de l'architecture :** ne jamais traiter un vendeur comme un client, sous peine d'auto-réservations. C'est le test le plus important de la Story 2.2.

### Test 2.3 : Normalisation des numéros

Meta renvoie les numéros **sans** préfixe `whatsapp:` ni `+` (ex. `22507000001`). Vérifier que `normalizeIncomingPhone()` produit bien un E.164 cohérent avec le format stocké dans `seller_phones`.

**Résultat attendu :**
- ✅ Un vendeur enregistré en `+22507000001` est reconnu quand Meta envoie `22507000001`

---

## 🧪 Tests Story 2.3 : Event Log

### Test 3.1 : Event `webhook_received`

```sql
SELECT event_type, entity_type, correlation_id, actor_type, created_at
FROM event_log
ORDER BY created_at DESC
LIMIT 10;
```

**Résultat attendu :** une ligne `webhook_received` avec `entity_type = 'message_in'`.

### Test 3.2 : Event `idempotent_ignored`

Après le test 1.3, une ligne `idempotent_ignored` doit exister.

### Test 3.3 : CorrelationId propagé

```sql
SELECT event_type, entity_type, created_at
FROM event_log
WHERE correlation_id = '<correlation_id_du_flux>'
ORDER BY created_at;
```

**Résultat attendu :** tous les événements d'un même message partagent le `correlation_id`, du webhook jusqu'à l'envoi sortant.

### Test 3.4 : Absence de PII dans le payload

```sql
SELECT payload FROM event_log ORDER BY created_at DESC LIMIT 20;
```

**Résultat attendu :** pas de numéro complet, d'adresse ni de contenu de message brut dans `payload`.

---

## 🧪 Tests Story 2.4 : Envoi sortant (outbox)

L'envoi sortant ne tourne **pas** dans le worker. Chemin réel :

```
writeToOutbox()  →  INSERT messages_out (pending)
  └─ enqueueOutboxSend()  →  QStash publish
       └─ POST /api/qstash/outbox-send  →  Meta Cloud API
       └─ échec ×5  →  POST /api/qstash/outbox-dlq  →  dead_letter_jobs
```

### Test 4.1 : Message écrit dans l'outbox

Déclencher une réponse du bot (ex. réservation), puis :

```sql
SELECT id, status, attempts, last_error, created_at
FROM messages_out
ORDER BY created_at DESC
LIMIT 10;
```

**Résultat attendu :**
- ✅ Ligne créée en `pending`
- ✅ Puis `sent` avec un `provider_message_id` renseigné

### Test 4.2 : Diagnostic « bloqué en pending »

Si `status` reste `pending` :

1. `QSTASH_TOKEN` ou `NEXT_PUBLIC_APP_URL` manquant → bascule silencieuse sur pg-boss sans consommateur
2. Console QStash : le message a-t-il été publié ? statut `DELIVERED` ?
3. Logs de `/api/qstash/outbox-send` : un **401** = clés de signature absentes/incorrectes, un **503** = config incomplète en production
4. `last_error = "meta_config_missing"` → le tenant n'a pas ses credentials Meta

### Test 4.3 : DLQ

```sql
SELECT * FROM dead_letter_jobs ORDER BY created_at DESC LIMIT 10;
```

**Résultat attendu :** vide en fonctionnement normal ; alimenté après épuisement des 5 tentatives QStash.

---

## 🧪 Tests Story 2.5 : STOP (opt-out)

### Test 5.1 : STOP enregistré

Envoyer `STOP` depuis un numéro client.

```sql
SELECT * FROM opt_outs ORDER BY opted_out_at DESC LIMIT 5;
```

**Résultat attendu :**
- ✅ Ligne créée avec le bon `tenant_id` (le scope est **par tenant**)
- ✅ Event `opt_out_recorded` dans `event_log`

### Test 5.2 : Message bloqué après STOP

Après un STOP, déclencher un message sortant vers ce numéro.

**Résultat attendu :**
- ✅ Log `Message blocked (opt-out)`
- ✅ Aucun appel à Meta

Test automatisé correspondant :
```bash
RUN_INTEGRATION_TESTS=true npm test -- src/server/workers/__tests__/stop-optout-blocked.integration.test.ts
```

---

## 🔍 Tests End-to-End

### Test E2E 1 : Flux complet message client

1. Créer une session live et un article (code `A12`) côté vendeur
2. Envoyer `A12` depuis un numéro client
3. Vérifier la chaîne :

```sql
SELECT 'messages_in' AS t, COUNT(*) FROM messages_in WHERE provider_message_id = 'wamid.TEST0001'
UNION ALL SELECT 'reservations', COUNT(*) FROM reservations WHERE created_at > now() - interval '5 minutes'
UNION ALL SELECT 'messages_out', COUNT(*) FROM messages_out WHERE created_at > now() - interval '5 minutes';
```

**Résultat attendu :** MessageIn → job traité → réservation créée → MessageOut envoyé → événements corrélés.

### Test E2E 2 : Flux doublon

Rejouer le même `wamid` : une seule réservation, un event `idempotent_ignored`, aucun message sortant supplémentaire.

---

## 📊 Vérifications de Performance

### Webhook (< 1 s)

Le script `/tmp/send-webhook.sh` affiche `time_total`. Répéter 5 fois et vérifier que toutes les valeurs sont sous 1 s.

### Worker

```bash
# Dans les logs worker, chercher :
processingTimeMs
```

Le worker tourne en `localConcurrency: 5`, `batchSize: 1`.

---

## 🛠️ Outils de Debug

### Inspecter la queue pg-boss

```sql
SELECT name, state, COUNT(*)
FROM pgboss.job
GROUP BY name, state
ORDER BY name, state;
```

Jobs en échec :
```sql
SELECT id, name, state, output, created_on
FROM pgboss.job
WHERE state IN ('failed', 'retry')
ORDER BY created_on DESC
LIMIT 20;
```

Schedules cron actifs :
```sql
SELECT name, cron, timezone FROM pgboss.schedule ORDER BY name;
```

### Explorer la base

```bash
npm run db:studio
```

---

## ✅ Checklist de Validation Epic 2

**Story 2.1**
- [ ] Challenge GET répond 200 avec le challenge
- [ ] Webhook répond 200 en < 1 s
- [ ] Signature invalide rejetée avant résolution du tenant
- [ ] Doublon (même `wamid`) ignoré, pas de second MessageIn
- [ ] Tenant inconnu → MessageIn avec `tenantId = null`, aucun job
- [ ] Job `webhook-processing` créé puis complété

**Story 2.2**
- [ ] Message client → `messageType: "client"`
- [ ] Message vendeur → `messageType: "seller"`
- [ ] Numéros Meta (sans `+`) correctement normalisés

**Story 2.3**
- [ ] `webhook_received` créé
- [ ] `idempotent_ignored` créé sur doublon
- [ ] `correlation_id` propagé de bout en bout
- [ ] Aucune PII dans `payload`

**Story 2.4**
- [ ] MessageOut passe de `pending` à `sent`
- [ ] Callback visible en `DELIVERED` dans la console QStash
- [ ] DLQ alimentée après épuisement des retries

**Story 2.5**
- [ ] STOP crée une ligne `opt_outs` scopée au tenant
- [ ] Message sortant bloqué après STOP

---

## 🚨 Troubleshooting

### Webhook ne répond pas

```bash
curl -i "http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x"
```
Un **403** confirme que la route est bien montée.

### Worker ne traite pas les jobs

1. Le worker est-il démarré ? (`npm run dev:worker`)
2. Y a-t-il des jobs en attente ?
   ```sql
   SELECT COUNT(*) FROM pgboss.job WHERE name = 'webhook-processing' AND state = 'created';
   ```
3. **`DATABASE_URL` identique** entre Next.js et le worker ? La queue vit dans Postgres — s'ils pointent sur deux bases différentes, rien n'est consommé.
4. URL Neon **directe** (pas `-pooler.`) ? pg-boss est incompatible avec PgBouncer en transaction mode.

### Messages sortants jamais envoyés

Voir **Test 4.2** — dans la grande majorité des cas, `QSTASH_TOKEN` ou `NEXT_PUBLIC_APP_URL` manque.

### Event Log non créé

Vérifier que le tenant est bien résolu : `event_log.tenant_id` est **NOT NULL**, donc aucun événement n'est écrit pour un message dont le tenant n'a pas pu être identifié.

---

## 📝 Notes de Test

- **Numéros de test :** utiliser des numéros de test Meta (WhatsApp Business Platform) ou un vrai numéro connecté en sandbox.
- **Tunnel local :** pour recevoir de vrais webhooks Meta en local, exposer `localhost:3000` (ngrok ou équivalent) et déclarer l'URL publique dans la configuration du webhook Meta.
- **Signature en local :** la vérification s'appuie sur `META_APP_SECRET` ; le script fourni plus haut évite d'avoir à passer par Meta pour tester.
- **Isolation tenant :** tous les tests doivent être rejoués avec un second tenant pour confirmer qu'aucune donnée ne fuit entre tenants.

---

## 📚 Ressources

**Documentation interne**
- [DEPLOYMENT.md](DEPLOYMENT.md) — déploiement, variables d'environnement, troubleshooting production
- [src/server/workers/README.md](src/server/workers/README.md) — architecture worker, queues, crons
- [_bmad-output/planning-artifacts/architecture.md](_bmad-output/planning-artifacts/architecture.md) — décisions d'architecture

**Commandes utiles**
```bash
npm run dev
```
```bash
npm run dev:worker
```
```bash
npm run db:studio
```
```bash
npm test
```
```bash
npm run typecheck
```

**Liens externes**
- [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) — payloads webhook, envoi de messages
- [Upstash Console](https://console.upstash.com) — QStash (envoi sortant) et Redis (rate limiting)
- [Neon Console](https://console.neon.tech) — base de données et queue pg-boss
