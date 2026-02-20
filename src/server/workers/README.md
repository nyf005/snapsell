# Workers - Documentation Technique

Ce dossier contient les workers qui traitent les jobs de manière asynchrone.

## Worker: webhook-processor

Le worker `webhook-processor` consomme la queue `webhook-processing` et détermine si un message entrant provient d'un vendeur ou d'un client.

### Architecture

- **Queue:** `webhook-processing` (pg-boss sur Postgres/Neon)
- **Payload:** `InboundMessage` normalisé (tenantId, providerMessageId, from, body, correlationId)
- **Output:** `EnrichedInboundMessage` avec `messageType: 'seller' | 'client'`, `liveSessionId` (optionnel)
- **Plateforme:** Railway - séparé du webhook Vercel

### Démarrage local

```bash
npm run dev:worker
# ou
npx tsx scripts/start-worker.ts
```

**Variables d'environnement requises:**
- `DATABASE_URL` - URL PostgreSQL directe Neon (non-pooler, obligatoire pour pg-boss)
- `LIVE_SESSION_INACTIVITY_WINDOW_MINUTES` - (optionnel, défaut 45) Fenêtre d'inactivité en min pour fermeture auto des sessions live

### Déploiement

Voir `DEPLOYMENT.md` à la racine du projet pour le guide complet de déploiement sur Railway.

### Monitoring

Le worker logge les événements suivants:
- `Processing webhook job` - Job en cours de traitement
- `Message type determined` - Type vendeur/client déterminé
- `Job failed` - Job échoué (retry automatique via pg-boss)

**Logs structurés:**
- Tous les logs incluent `correlationId` pour traçabilité
- Format: `[timestamp] [LEVEL] [Worker] message {context}`

**Métriques exposées:**
- Temps de traitement par job (`processingTimeMs`)
- Compteurs locaux: jobs complétés, jobs échoués

**Intégration Sentry (optionnel):**
Configurer `SENTRY_DSN` dans env pour remonter les erreurs critiques.

### Graceful Shutdown

Le worker gère automatiquement:
- **SIGTERM/SIGINT:** Arrêt propre via `boss.stop({ graceful: true, timeout: 30000 })`
- **Erreurs non capturées:** Log et shutdown propre

### Scaling

- **Concurrency:** 5 jobs en parallèle (configurable via `localConcurrency`)
- **Scaling Railway:** Augmenter le nombre d'instances selon la charge
- **Isolation:** Chaque job est isolé par tenant (pas de partage d'état)

### Troubleshooting

**Worker ne démarre pas:**
- Vérifier variables d'environnement (`DATABASE_URL`)
- Vérifier que l'URL est l'URL **directe** Neon (pas l'URL pooler `-pooler.`)
- Vérifier logs Railway pour erreurs de connexion

**Jobs ne sont pas traités:**
- Vérifier que le worker est démarré (logs "Worker started successfully")
- Vérifier les tables pg-boss (`pgboss.job`) pour les jobs en attente
- Vérifier les logs pour erreurs de traitement

**Jobs échouent:**
- Vérifier logs avec `correlationId` pour traçabilité
- Vérifier connexion DB (seller_phone lookup)
- Vérifier format des numéros (E.164 normalisé)

### Architecture Compliance

- **§4.1:** Routing dans worker (pas dans webhook) pour respecter contrainte < 1s
- **§7.1:** Utilise uniquement types normalisés (InboundMessage), pas de dépendance SDK BSP
- **§11.2:** Worker sur Railway, séparé du webhook Vercel
- **§255:** Ne jamais traiter vendeur comme client (routing correct via seller_phone lookup)

---

## Worker: outbox-sender

Le worker `outbox-sender` traite les messages sortants via pg-boss queue `outbox-send` avec retries et DLQ.

### Architecture

- **Queue:** `outbox-send` (pg-boss, `localConcurrency: 3`)
- **Pattern:** Event-driven via pg-boss (plus de polling setInterval)
- **Provider:** Meta WhatsApp Cloud API via MetaCloudAdapter (credentials per-tenant en DB)
- **DLQ:** Queue `outbox-dlq` (pg-boss deadLetter natif après 5 retries)
- **Plateforme:** Railway - même service que webhook-processor

### Fonctionnalités

- **Outbox Pattern:** Tout message sortant écrit d'abord dans `MessageOut` avec `status = 'pending'`, puis enqueued via `boss.send("outbox-send", { messageOutId })`
- **Retries:** pg-boss natif (retryLimit: 5, retryBackoff: true)
- **DLQ:** pg-boss deadLetter natif vers `outbox-dlq`
- **Event Log:** Intégration `logMessageSent()` après envoi réussi
- **Isolation tenant:** Filtrage strict par `tenant_id`

### Monitoring

Le worker logge les événements suivants:
- `Processing outbound message` - Début traitement message
- `Message sent successfully` - Envoi réussi via Meta WhatsApp Cloud API
- `Message send failed` - Échec (pg-boss gère le retry)
- `Message blocked (opt-out)` - Message bloqué par opt-out

**Logs structurés:**
- Tous les logs incluent `correlationId` pour traçabilité bout en bout

### Troubleshooting

**Messages ne sont pas envoyés:**
- Vérifier que le worker est démarré (logs "Outbox sender worker started")
- Vérifier table `messages_out` pour messages avec `status = 'pending'`
- Vérifier que le tenant a `metaPhoneNumberId` et `metaAccessToken` configurés en base

**Messages échouent systématiquement:**
- Si `lastError = "meta_config_missing"` → le tenant n'a pas configuré ses credentials Meta
- Si `lastError = "tenant_not_found"` → le tenantId ne correspond à aucun tenant
- Vérifier format numéro WhatsApp (E.164)

### Architecture Compliance

- **§4.5:** Outbound messaging via outbox + retries + DLQ
- **§7.1:** Provider-agnostic via MetaCloudAdapter
- **§11.2:** Worker sur Railway

---

## Worker: close-inactive-live-sessions (Story 2.6)

Le worker ferme périodiquement les sessions live inactives (last_activity_at < now - INACTIVITY_WINDOW).

### Architecture

- **Pattern:** setInterval (ex. toutes les 10 min), une passe par exécution
- **Logique:** Sélectionne les LiveSession avec status = active et last_activity_at < cutoff ; met status = closed ; log event live_session.closed (EventLog)
- **Batch:** Au plus 100 sessions fermées par run (CLOSE_BATCH_LIMIT)
- **Plateforme:** Railway - démarré avec les autres workers dans `scripts/start-worker.ts`

### Variables d'environnement

- `LIVE_SESSION_INACTIVITY_WINDOW_MINUTES` - (optionnel, défaut 45) Fenêtre d'inactivité en minutes.

### Architecture Compliance

- **§6:** Live Session Auto - fermeture après inactivité (T_inactive configurable)
- **§11.2:** Cron clôture live session auto sur Railway
