# Guide de Test - Epic 2 : Réception et envoi WhatsApp

**Stories testées:**
- ✅ 2.1: Route webhook réception, vérification signature, idempotence, 200 < 1s
- ✅ 2.2: Attribuer le message au tenant et router vendeur vs client
- ✅ 2.3: Event Log minimal (webhook_received, message_sent, idempotent_ignored)

**Date:** 2026-02-05

---

## 📋 Prérequis

### 1. Environnement de développement

```bash
# Vérifier que les variables d'environnement sont configurées
cat .env | grep -E "(DATABASE_URL|REDIS_URL|TWILIO_)"
```

**Variables requises:**
- `DATABASE_URL` - PostgreSQL (Neon ou local)
- `REDIS_URL` - Redis (Upstash ou local)
- `REDIS_TOKEN` - Token Redis (si requis)
- `TWILIO_ACCOUNT_SID` - Compte Twilio
- `TWILIO_AUTH_TOKEN` - Token Twilio
- `TWILIO_WEBHOOK_SECRET` - Secret pour vérification signature (optionnel en dev)

### 2. Base de données

```bash
# Vérifier que toutes les migrations sont appliquées
npx prisma migrate status

# Si migrations en attente:
npx prisma migrate deploy
```

**Tables requises:**
- `tenants` - Au moins un tenant de test
- `users` - Au moins un utilisateur
- `messages_in` - Pour vérifier idempotence
- `seller_phones` - Pour tester routing vendeur vs client
- `event_log` - Pour vérifier Event Log (Story 2.3)

### 3. Services démarrés

**Terminal 1 - Next.js (webhook):**
```bash
npm run dev
# Le webhook sera accessible sur http://localhost:3000/api/webhooks/twilio
```

**Terminal 2 - Worker (traitement messages):**
```bash
npm run dev:worker
# ou
npx tsx scripts/start-worker.ts
```

### 4. Tests automatisés (optionnel)

**Exécuter tous les tests unitaires:**
```bash
npm test
```

**Exécuter les tests en mode watch:**
```bash
npm test -- --watch
```

**Exécuter un fichier de test spécifique:**
```bash
npm test -- src/server/events/eventLog.test.ts
npm test -- src/app/api/webhooks/twilio/route.integration.test.ts
```

**Note:** Les tests d'intégration nécessitent `RUN_INTEGRATION_TESTS=true` ; selon le test : `REDIS_URL` (webhook-processor) ou `DATABASE_URL` (outbox-sender, STOP → OptOut → message bloqué). Pour le test Story 2.5 STOP : `RUN_INTEGRATION_TESTS=true pnpm test -- stop-optout-blocked.integration.test.ts`

---

## 🧪 Tests Story 2.1 : Webhook Réception

### Test 1.1 : Webhook répond < 1s

**Objectif:** Vérifier que le webhook répond rapidement (< 1s)

**Prérequis:**
- Next.js démarré (`npm run dev`)
- Webhook configuré dans Twilio Console pointant vers votre URL (ex: ngrok)

**Test manuel:**
1. Envoyer un message WhatsApp depuis un numéro de test vers le numéro Twilio configuré
2. Vérifier les logs Next.js pour le temps de réponse
3. Vérifier que la réponse HTTP 200 est retournée rapidement

**Vérification dans les logs:**
```bash
# Chercher dans les logs Next.js:
grep "elapsedMs" logs
# Doit afficher: elapsedMs: < 1000
```

**Test automatisé (curl):**
```bash
# Simuler un webhook Twilio (en développement, signature peut être ignorée)
curl -X POST http://localhost:3000/api/webhooks/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: test-signature" \
  -d "MessageSid=SM1234567890abcdef&From=whatsapp:+33612345678&Body=Test&To=whatsapp:+1234567890"
```

**Résultat attendu:**
- ✅ Réponse HTTP 200
- ✅ Temps de réponse < 1000ms dans les logs
- ✅ MessageIn créé en DB

---

### Test 1.2 : Idempotence (doublon détecté)

**Objectif:** Vérifier qu'un message dupliqué retourne 200 sans retraitement

**Prérequis:**
- Un MessageIn existe déjà avec (tenant_id, provider_message_id)

**Test:**
1. Envoyer le même message deux fois (même MessageSid)
2. Vérifier que le deuxième appel retourne 200 immédiatement
3. Vérifier qu'un seul MessageIn existe en DB

**Vérification DB:**
```sql
-- Vérifier qu'un seul MessageIn existe pour ce MessageSid
SELECT COUNT(*) FROM messages_in 
WHERE provider_message_id = 'SM1234567890abcdef' 
AND tenant_id = '<tenant-id>';
-- Résultat attendu: 1
```

**Vérification logs:**
```bash
# Chercher dans les logs:
grep "Duplicate message detected" logs
# Doit apparaître pour le deuxième appel
```

**Résultat attendu:**
- ✅ Deuxième appel retourne 200 immédiatement
- ✅ Un seul MessageIn en DB
- ✅ Log "Duplicate message detected" pour le deuxième appel
- ✅ Event Log `idempotent_ignored` créé (Story 2.3)

---

### Test 1.3 : Vérification signature (production)

**Objectif:** Vérifier que les requêtes sans signature valide sont rejetées en production

**Note:** En développement (`NODE_ENV=development`), la vérification peut être assouplie pour faciliter les tests.

**Test production:**
```bash
# Requête sans signature (doit être rejetée en production)
curl -X POST https://your-app.vercel.app/api/webhooks/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=SM123&From=whatsapp:+33612345678&Body=Test&To=whatsapp:+1234567890"
```

**Résultat attendu (production):**
- ✅ Réponse HTTP 401 (Invalid signature)
- ✅ MessageIn non créé

---

### Test 1.4 : Job enqueued dans BullMQ

**Objectif:** Vérifier qu'un job est bien enqueued après réception webhook

**Vérification Upstash Dashboard:**
1. Aller sur [Upstash Console](https://console.upstash.com)
2. Sélectionner votre Redis instance
3. Vérifier la queue `webhook-processing`
4. Vérifier qu'un job est présent avec le payload normalisé

**Vérification logs:**
```bash
# Chercher dans les logs Next.js:
grep "Job enqueued in BullMQ" logs
# Doit afficher: jobId, correlationId, tenantId
```

**Vérification programmatique (optionnel):**
```typescript
// Dans un script de test
import { webhookProcessingQueue } from "~/server/workers/queues";

const waitingCount = await webhookProcessingQueue.getWaitingCount();
console.log(`Jobs en attente: ${waitingCount}`);
```

**Résultat attendu:**
- ✅ Job présent dans la queue `webhook-processing`
- ✅ Payload contient: tenantId, providerMessageId, from, body, correlationId
- ✅ Log "Job enqueued in BullMQ" présent

---

## 🧪 Tests Story 2.2 : Routing Vendeur vs Client

### Test 2.1 : Message Client (numéro non vendeur)

**Objectif:** Vérifier qu'un message depuis un numéro non enregistré comme vendeur est traité comme client

**Prérequis:**
- Worker démarré (`npm run dev:worker`)
- Tenant créé avec `whatsappPhoneNumber` configuré
- Aucun `seller_phone` enregistré pour ce tenant (ou numéro différent)

**Setup DB:**
```sql
-- Vérifier qu'aucun seller_phone n'existe pour ce tenant
SELECT * FROM seller_phones WHERE tenant_id = '<tenant-id>';
-- Résultat: vide ou numéro différent
```

**Test:**
1. Envoyer un message WhatsApp depuis un numéro client (ex: `+33698765432`)
2. Vérifier que le worker traite le job
3. Vérifier les logs pour `messageType: "client"`

**Vérification logs worker:**
```bash
# Chercher dans les logs worker:
grep "Message type determined" logs
# Doit afficher: messageType: "client"
```

**Résultat attendu:**
- ✅ Worker traite le job avec succès
- ✅ Log "Message type determined" avec `messageType: "client"`
- ✅ Job complété dans BullMQ

---

### Test 2.2 : Message Vendeur (numéro enregistré)

**Objectif:** Vérifier qu'un message depuis un numéro vendeur enregistré est traité comme vendeur

**Prérequis:**
- Seller phone enregistré pour le tenant

**Setup DB:**
```sql
-- Ajouter un seller_phone pour le tenant
INSERT INTO seller_phones (id, tenant_id, phone_number, created_at)
VALUES (
  gen_random_uuid()::text,
  '<tenant-id>',
  '+33612345678', -- Numéro du vendeur
  NOW()
);
```

**Test:**
1. Envoyer un message WhatsApp depuis `+33612345678` (numéro vendeur)
2. Vérifier que le worker traite le job
3. Vérifier les logs pour `messageType: "seller"`

**Vérification logs worker:**
```bash
# Chercher dans les logs worker:
grep "Message type determined" logs
# Doit afficher: messageType: "seller"
```

**Résultat attendu:**
- ✅ Worker traite le job avec succès
- ✅ Log "Message type determined" avec `messageType: "seller"`
- ✅ Job complété dans BullMQ

---

### Test 2.3 : Normalisation numéros (préfixe whatsapp:)

**Objectif:** Vérifier que la normalisation fonctionne avec/sans préfixe `whatsapp:`

**Setup DB:**
```sql
-- Seller phone enregistré SANS préfixe whatsapp:
INSERT INTO seller_phones (id, tenant_id, phone_number, created_at)
VALUES (
  gen_random_uuid()::text,
  '<tenant-id>',
  '+33612345678', -- Sans préfixe
  NOW()
);
```

**Test:**
1. Envoyer un message depuis `whatsapp:+33612345678` (avec préfixe)
2. Vérifier que le worker reconnaît le numéro comme vendeur

**Résultat attendu:**
- ✅ Worker reconnaît le numéro malgré le préfixe `whatsapp:`
- ✅ `messageType: "seller"` dans les logs

---

## 🧪 Tests Story 2.3 : Event Log

### Test 3.1 : Event webhook_received créé

**Objectif:** Vérifier qu'un événement `webhook_received` est créé dans event_log après persist MessageIn

**Test:**
1. Envoyer un nouveau message WhatsApp (non dupliqué)
2. Vérifier qu'un enregistrement existe dans `event_log`

**Vérification DB:**
```sql
-- Vérifier l'événement webhook_received
SELECT 
  id,
  tenant_id,
  event_type,
  entity_type,
  entity_id,
  correlation_id,
  actor_type,
  payload,
  created_at
FROM event_log
WHERE event_type = 'webhook_received'
ORDER BY created_at DESC
LIMIT 1;
```

**Résultat attendu:**
- ✅ `event_type = 'webhook_received'`
- ✅ `entity_type = 'message_in'`
- ✅ `entity_id` = ID du MessageIn créé
- ✅ `correlation_id` présent (UUID ou MessageSid)
- ✅ `payload` contient `message_in_id` et `provider_message_id` (pas de PII)

---

### Test 3.2 : Event idempotent_ignored créé

**Objectif:** Vérifier qu'un événement `idempotent_ignored` est créé quand doublon détecté

**Test:**
1. Envoyer un message (première fois)
2. Envoyer le même message (deuxième fois - doublon)
3. Vérifier qu'un événement `idempotent_ignored` est créé

**Vérification DB:**
```sql
-- Vérifier l'événement idempotent_ignored
SELECT 
  id,
  tenant_id,
  event_type,
  entity_type,
  entity_id,
  correlation_id,
  payload
FROM event_log
WHERE event_type = 'idempotent_ignored'
ORDER BY created_at DESC
LIMIT 1;
```

**Résultat attendu:**
- ✅ `event_type = 'idempotent_ignored'`
- ✅ `entity_type = 'message_in'`
- ✅ `entity_id` = NULL (pas d'entité créée)
- ✅ `payload` contient `provider_message_id` et `reason: "duplicate_detected"`

---

### Test 3.3 : CorrelationId propagé correctement

**Objectif:** Vérifier que le même `correlation_id` est utilisé pour tous les événements d'un même flux

**Test:**
1. Envoyer un message (webhook_received créé)
2. Vérifier que le `correlation_id` du MessageIn correspond à celui de l'event_log

**Vérification DB:**
```sql
-- Vérifier la correspondance correlation_id
SELECT 
  mi.id as message_in_id,
  mi.correlation_id as message_correlation_id,
  el.correlation_id as event_correlation_id,
  el.event_type
FROM messages_in mi
JOIN event_log el ON el.entity_id = mi.id::text
WHERE mi.provider_message_id = 'SM1234567890abcdef'
AND el.event_type = 'webhook_received';
```

**Résultat attendu:**
- ✅ `message_correlation_id` = `event_correlation_id`
- ✅ Même correlationId pour tous les événements du même flux

---

### Test 3.4 : Payload sans PII (validation)

**Objectif:** Vérifier que le payload ne contient pas de données sensibles brutes

**Vérification DB:**
```sql
-- Vérifier le payload d'un événement
SELECT 
  event_type,
  payload
FROM event_log
WHERE event_type = 'webhook_received'
ORDER BY created_at DESC
LIMIT 1;
```

**Résultat attendu:**
- ✅ Payload contient uniquement: `message_in_id`, `provider_message_id`
- ✅ Pas de numéro de téléphone complet
- ✅ Pas d'email complet
- ✅ Pas de corps de message complet

**Test de validation (rejet PII):**
```typescript
// Test unitaire déjà présent dans eventLog.test.ts
// Vérifie que payload avec PII est rejeté
```

---

### Test 3.5 : Race condition correlationId

**Objectif:** Vérifier que le correlationId du message existant est utilisé en cas de race condition

**Test:**
1. Envoyer deux requêtes simultanées avec le même MessageSid (race condition)
2. Vérifier que l'événement `idempotent_ignored` utilise le correlationId du message existant

**Vérification DB:**
```sql
-- Vérifier correlationId dans idempotent_ignored après race condition
SELECT 
  el.correlation_id as event_correlation_id,
  mi.correlation_id as message_correlation_id
FROM event_log el
JOIN messages_in mi ON mi.provider_message_id = (el.payload->>'provider_message_id')
WHERE el.event_type = 'idempotent_ignored'
AND el.payload->>'reason' = 'duplicate_detected'
ORDER BY el.created_at DESC
LIMIT 1;
```

**Résultat attendu:**
- ✅ `event_correlation_id` = `message_correlation_id` (correlationId du message existant)

---

## 🔍 Tests End-to-End Complets

### Test E2E 1 : Flux complet message client

**Scénario:** Un client envoie un message, le système le traite et logge les événements

**Étapes:**
1. ✅ Webhook reçoit le message → MessageIn créé → Job enqueued → 200 < 1s
2. ✅ Worker traite le job → messageType = "client"
3. ✅ Event Log: `webhook_received` créé avec correlationId
4. ✅ Vérifier traçabilité bout en bout

**Vérification complète:**
```sql
-- Vérifier le flux complet
SELECT 
  mi.id as message_in_id,
  mi.correlation_id,
  mi.from,
  mi.body,
  mi.created_at as message_created,
  el.event_type,
  el.created_at as event_created
FROM messages_in mi
LEFT JOIN event_log el ON el.entity_id = mi.id::text 
  AND el.event_type = 'webhook_received'
WHERE mi.tenant_id = '<tenant-id>'
ORDER BY mi.created_at DESC
LIMIT 5;
```

---

### Test E2E 2 : Flux doublon (idempotence)

**Scénario:** Un message est envoyé deux fois, le système détecte le doublon

**Étapes:**
1. ✅ Premier message → MessageIn créé → `webhook_received` loggé
2. ✅ Deuxième message (même MessageSid) → 200 immédiat → `idempotent_ignored` loggé
3. ✅ Un seul MessageIn en DB
4. ✅ Deux événements dans event_log (webhook_received + idempotent_ignored)

**Vérification:**
```sql
-- Vérifier idempotence et event log
SELECT 
  COUNT(*) as message_count,
  (SELECT COUNT(*) FROM event_log 
   WHERE entity_id = mi.id::text 
   AND event_type = 'webhook_received') as webhook_received_count,
  (SELECT COUNT(*) FROM event_log 
   WHERE payload->>'provider_message_id' = mi.provider_message_id
   AND event_type = 'idempotent_ignored') as idempotent_ignored_count
FROM messages_in mi
WHERE mi.provider_message_id = 'SM1234567890abcdef'
AND mi.tenant_id = '<tenant-id>';
```

**Résultat attendu:**
- ✅ `message_count` = 1 (un seul MessageIn)
- ✅ `webhook_received_count` = 1
- ✅ `idempotent_ignored_count` = 1 (pour le deuxième appel)

---

## 📊 Vérifications de Performance

### Performance Webhook (< 1s)

**Test:**
```bash
# Mesurer le temps de réponse du webhook
time curl -X POST http://localhost:3000/api/webhooks/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: test" \
  -d "MessageSid=SM123&From=whatsapp:+33612345678&Body=Test&To=whatsapp:+1234567890"
```

**Résultat attendu:**
- ✅ Temps total < 1 seconde
- ✅ Logs montrent `elapsedMs < 1000`

---

### Performance Worker

**Vérification logs:**
```bash
# Chercher les temps de traitement
grep "processingTimeMs" logs
```

**Résultat attendu:**
- ✅ Temps de traitement < 500ms (normal)
- ✅ Métriques loggées toutes les 100 jobs ou 5 minutes

---

## 🛠️ Outils de Debug

### Vérifier la queue BullMQ

**Via Upstash Dashboard:**
1. Aller sur [Upstash Console](https://console.upstash.com)
2. Sélectionner votre Redis instance
3. Vérifier la queue `webhook-processing`
4. Voir les jobs: waiting, active, completed, failed

**Via CLI (si Redis local):**
```bash
redis-cli
> KEYS bull:webhook-processing:*
> LLEN bull:webhook-processing:waiting
```

---

### Vérifier les Event Logs

**Requête SQL utile:**
```sql
-- Voir tous les événements récents pour un tenant
SELECT 
  event_type,
  entity_type,
  correlation_id,
  payload,
  created_at
FROM event_log
WHERE tenant_id = '<tenant-id>'
ORDER BY created_at DESC
LIMIT 20;

-- Voir tous les événements d'un flux (même correlation_id)
SELECT 
  event_type,
  entity_type,
  entity_id,
  payload,
  created_at
FROM event_log
WHERE correlation_id = '<correlation-id>'
ORDER BY created_at ASC;
```

---

### Vérifier les Messages In

**Requête SQL utile:**
```sql
-- Voir les messages entrants récents
SELECT 
  id,
  tenant_id,
  provider_message_id,
  from,
  body,
  correlation_id,
  created_at
FROM messages_in
WHERE tenant_id = '<tenant-id>'
ORDER BY created_at DESC
LIMIT 10;

-- Vérifier idempotence (ne doit pas y avoir de doublons)
SELECT 
  provider_message_id,
  COUNT(*) as count
FROM messages_in
WHERE tenant_id = '<tenant-id>'
GROUP BY provider_message_id
HAVING COUNT(*) > 1;
-- Résultat attendu: 0 lignes (pas de doublons)
```

---

## ✅ Checklist de Validation Epic 2

### Story 2.1 ✅
- [ ] Webhook répond < 1s
- [ ] MessageIn persisté correctement
- [ ] Job enqueued dans BullMQ
- [ ] Idempotence fonctionne (doublon → 200 sans retraitement)
- [ ] Vérification signature (production)
- [ ] Tests unitaires passent (`npm test`)

### Story 2.2 ✅
- [ ] Routing client fonctionne (numéro non vendeur → messageType = "client")
- [ ] Routing vendeur fonctionne (numéro vendeur → messageType = "seller")
- [ ] Normalisation numéros (préfixe whatsapp: géré)
- [ ] Worker traite les jobs correctement
- [ ] Tests unitaires passent (`npm test`)

### Story 2.3 ✅
- [ ] Event `webhook_received` créé après persist MessageIn
- [ ] Event `idempotent_ignored` créé quand doublon détecté
- [ ] CorrelationId propagé correctement dans tous les événements
- [ ] Payload sans PII (validation fonctionne)
- [ ] Race condition correlationId corrigée
- [ ] Tests unitaires passent (`npm test -- src/server/events/eventLog.test.ts`)

---

## 🚨 Troubleshooting

### Webhook ne répond pas

**Vérifications:**
1. Next.js démarré (`npm run dev`)
2. URL webhook accessible (ngrok si local)
3. Variables d'environnement configurées
4. Logs Next.js pour erreurs

**Solution:**
```bash
# Vérifier que le serveur écoute
curl http://localhost:3000/api/webhooks/twilio
# Doit retourner 405 (Method Not Allowed) ou erreur, pas de timeout
```

---

### Worker ne traite pas les jobs

**Vérifications:**
1. Worker démarré (`npm run dev:worker`)
2. REDIS_URL configurée et accessible
3. Jobs présents dans la queue (Upstash dashboard)
4. Logs worker pour erreurs

**Solution:**
```bash
# Vérifier connexion Redis
node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
redis.ping().then(() => console.log('Redis OK')).catch(console.error);
"
```

---

### Event Log non créé

**Vérifications:**
1. Migration `20260209000000_add_event_log` appliquée
2. Table `event_log` existe en DB
3. Logs webhook/worker pour erreurs event_log

**Solution:**
```sql
-- Vérifier que la table existe
SELECT * FROM event_log LIMIT 1;

-- Vérifier les permissions
\dt event_log
```

---

## 📝 Notes de Test

**Environnement de test recommandé:**
- Base de données de test séparée (pas production)
- Redis de test séparé (ou namespace différent)
- Numéros WhatsApp de test Twilio

**Données de test:**
- Créer un tenant de test avec `whatsappPhoneNumber` configuré
- Ajouter des seller_phones de test
- Utiliser des MessageSid de test pour idempotence

**Nettoyage après tests:**
```sql
-- Nettoyer les données de test (optionnel)
DELETE FROM event_log WHERE tenant_id = '<test-tenant-id>';
DELETE FROM messages_in WHERE tenant_id = '<test-tenant-id>';
DELETE FROM seller_phones WHERE tenant_id = '<test-tenant-id>';
```

---

## 🎯 Prochaines Stories (non testées)

- **Story 2.4:** Envoi sortant via outbox + retries + DLQ (backlog)
- **Story 2.5:** Respect du STOP scope tenant (backlog)
- **Story 2.6:** Création et fermeture automatiques de la session live (backlog)

Ces stories seront testées lors de leur implémentation.

---

## 📚 Ressources Utiles

### Documentation
- **DEPLOYMENT.md** - Guide de déploiement pour Stories 2.1 & 2.2
- **src/server/workers/README.md** - Documentation technique du worker
- **Architecture** - Voir `_bmad-output/planning-artifacts/architecture.md`

### Commandes Utiles

**Prisma Studio (interface graphique DB):**
```bash
npm run db:studio
# Ouvre http://localhost:5555 pour explorer la base de données
```

**Vérifier le statut des migrations:**
```bash
npx prisma migrate status
```

**Générer les types Prisma:**
```bash
npm run db:generate
```

**Type checking:**
```bash
npm run typecheck
```

**Build de production:**
```bash
npm run build
```

### Liens Externes
- [Upstash Console](https://console.upstash.com) - Monitoring Redis/BullMQ
- [Neon Console](https://console.neon.tech) - Monitoring PostgreSQL
- [Twilio Console](https://console.twilio.com) - Configuration webhooks WhatsApp
