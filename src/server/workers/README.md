# Workers - Documentation Technique

Ce dossier contient les workers qui traitent les jobs de manière asynchrone.

## Worker: webhook-processor

Le worker `webhook-processor` consomme la queue `webhook-processing` et détermine si un message entrant provient d'un vendeur ou d'un client.

### Architecture

- **Queue:** `webhook-processing` (créée dans Story 2.1)
- **Payload:** `InboundMessage` normalisé (tenantId, providerMessageId, from, body, correlationId)
- **Output:** `EnrichedInboundMessage` avec `messageType: 'seller' | 'client'`, `liveSessionId` (Story 2.6, optionnel)
- **Plateforme:** Railway - séparé du webhook Vercel

### Démarrage local

```bash
npm run dev:worker
# ou
npx tsx scripts/start-worker.ts
```

**Variables d'environnement requises:**
- `DATABASE_URL` - URL PostgreSQL (Neon)
- `REDIS_URL` - URL Redis (Upstash)
- `REDIS_TOKEN` - Token Redis (si requis)
- `TWILIO_ACCOUNT_SID` - Account SID Twilio (pour outbox-sender)
- `TWILIO_AUTH_TOKEN` - Auth Token Twilio (pour outbox-sender)
- `TWILIO_WHATSAPP_NUMBER` - Numéro WhatsApp Twilio (format E.164, ex. +14155238886)
- `LIVE_SESSION_INACTIVITY_WINDOW_MINUTES` - (optionnel, défaut 45) Fenêtre d'inactivité en min pour fermeture auto des sessions live (Story 2.6)

### Déploiement

Voir `DEPLOYMENT.md` à la racine du projet pour le guide complet de déploiement sur Railway.

### Monitoring

Le worker logge les événements suivants:
- `Job completed` - Job traité avec succès
- `Job failed` - Job échoué (retry automatique via BullMQ)
- `Worker error` - Erreur du worker lui-même
- `Worker metrics` - Métriques périodiques (toutes les 100 jobs ou 5 minutes)

**Logs structurés:**
- Tous les logs incluent `correlationId` pour traçabilité
- Format: `[timestamp] [LEVEL] [Worker] message {context}`

**Métriques exposées:**
- Temps de traitement par job (`processingTimeMs`)
- Uptime du worker (`uptimeMs`)
- Compteurs: jobs complétés, jobs échoués
- Taux de succès (`successRate`)
- Profondeur de queue: waiting, active, completed, failed
- Nombre de tentatives pour jobs échoués (`attemptsMade`, `attemptsRemaining`)

**Métriques périodiques:**
Les métriques sont loggées automatiquement:
- Toutes les 100 jobs traités (complétés ou échoués)
- Toutes les 5 minutes (intervalle fixe)

**Intégration Sentry (optionnel):**
L'intégration Sentry est préparée mais désactivée par défaut (voir TODOs dans le code).
Pour activer: installer `@sentry/node`, configurer `SENTRY_DSN` dans env, décommenter les blocs Sentry.

### Graceful Shutdown

Le worker gère automatiquement:
- **SIGTERM/SIGINT:** Arrêt propre en attendant la fin des jobs en cours
- **Timeout:** BullMQ attend max 30s par défaut pour finir les jobs
- **Erreurs non capturées:** Log et shutdown propre

### Scaling

- **Concurrency:** 5 jobs en parallèle par défaut (configurable dans `createWebhookProcessorWorker`)
- **Scaling Railway:** Augmenter le nombre d'instances selon la profondeur de la queue
- **Isolation:** Chaque job est isolé par tenant (pas de partage d'état)

### Troubleshooting

**Worker ne démarre pas:**
- Vérifier variables d'environnement (DATABASE_URL, REDIS_URL)
- Vérifier connexion Redis (Upstash peut nécessiter REDIS_TOKEN)
- Vérifier logs Railway pour erreurs de connexion

**Jobs ne sont pas traités:**
- Vérifier que le worker est démarré (logs "Worker started successfully")
- Vérifier la queue dans Redis/Upstash dashboard
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

Le worker `outbox-sender` traite les messages sortants via le pattern outbox avec retries et DLQ (Story 2.4).

### Architecture

- **Pattern:** Polling DB (lecture directe depuis `messages_out` table)
- **Status:** Lit les messages avec `status = 'pending'` ou `status = 'failed'` avec `next_attempt_at <= now`
- **Provider:** Twilio (via interface MessagingProvider, architecture §7.1)
- **Plateforme:** Railway - même service que webhook-processor

### Fonctionnalités

- **Outbox Pattern:** Tout message sortant écrit d'abord dans `MessageOut` avec `status = 'pending'`
- **Retries avec backoff exponentiel:** 1s, 2s, 4s, 8s, 16s (max 30s)
- **DLQ après N échecs:** Après 5 échecs, création d'un `DeadLetterJob` pour traçabilité ops
- **Event Log:** Intégration `logMessageSent()` après envoi réussi (Story 2.3)
- **Isolation tenant:** Filtrage strict par `tenant_id`

### Démarrage local

Le worker est démarré automatiquement avec `start-worker.ts`:

```bash
npm run dev:worker
# ou
npx tsx scripts/start-worker.ts
```

**Configuration polling:**
- Intervalle: 5 secondes (configurable dans `startOutboxSenderWorker`)
- Batch size: 10 messages par cycle (configurable)

### Déploiement

Voir `DEPLOYMENT.md` à la racine du projet pour le guide complet de déploiement sur Railway.

**Migration requise:** `20260205171901_add_message_out_and_dead_letter_job`

### Monitoring

Le worker logge les événements suivants:
- `Processing outbound message` - Début traitement message
- `Message sent successfully` - Envoi réussi via Twilio
- `Message send failed, will retry` - Échec avec retry programmé
- `Creating DeadLetterJob after max retries` - DLQ créé après N échecs
- `Batch processed` - Batch de messages traité

**Logs structurés:**
- Tous les logs incluent `correlationId` pour traçabilité bout en bout
- Format: `[timestamp] [LEVEL] [Worker] message {context}`

**Métriques à surveiller:**
- Nombre de messages pending dans `messages_out`
- Taux de succès d'envoi (status = 'sent' vs 'failed')
- Nombre de DeadLetterJobs créés
- Temps moyen entre création et envoi réussi

### Troubleshooting

**Messages ne sont pas envoyés:**
- Vérifier que le worker est démarré (logs "Outbox sender worker started successfully")
- Vérifier table `messages_out` pour messages avec `status = 'pending'`
- Vérifier variables d'environnement Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)
- Vérifier logs pour erreurs Twilio

**Messages échouent systématiquement:**
- Vérifier credentials Twilio (Account SID, Auth Token)
- Vérifier format numéro WhatsApp (E.164, ex. +33612345678)
- Vérifier que TWILIO_WHATSAPP_NUMBER est configuré correctement
- Vérifier logs avec `correlationId` pour traçabilité

**DLQ créé trop souvent:**
- Vérifier santé API Twilio
- Vérifier quotas Twilio (rate limiting)
- Vérifier format des messages (body, to)

### Architecture Compliance

- **§4.5:** Outbound messaging via outbox + retries + DLQ - Tout envoi sortant écrit d'abord dans MessageOut (outbox) avec statut pending
- **§7.1:** Messaging provider-agnostic - Worker appelle uniquement l'interface MessagingProvider.send, aucune dépendance directe au SDK BSP dans le métier
- **§11.2:** Worker sur Railway - Envoi WhatsApp sortant via outbox (retries + DLQ)
- **§10:** Isolation tenant stricte - MessageOut et DeadLetterJob filtrés par tenant_id

---

## Worker: close-inactive-live-sessions (Story 2.6)

Le worker ferme périodiquement les sessions live inactives (last_activity_at &lt; now - INACTIVITY_WINDOW).

### Architecture

- **Pattern:** setInterval (ex. toutes les 10 min), une passe par exécution
- **Logique:** Sélectionne les LiveSession avec status = active et last_activity_at < cutoff ; met status = closed ; log event live_session.closed (EventLog)
- **Batch:** Au plus 100 sessions fermées par run (CLOSE_BATCH_LIMIT)
- **Plateforme:** Railway - démarré avec les autres workers dans `scripts/start-worker.ts`

### Variables d'environnement

- `LIVE_SESSION_INACTIVITY_WINDOW_MINUTES` - (optionnel, défaut 45) Fenêtre d'inactivité en minutes. Même valeur pour « session courante » et pour le job de fermeture.

### Démarrage local

Démarré automatiquement avec les autres workers :

```bash
npm run dev:worker
# ou
npx tsx scripts/start-worker.ts
```

### Monitoring

- `Live session closed (inactivity)` - Session fermée
- `Close inactive live sessions run completed` - Fin de passe (closedCount, windowMinutes)

### Architecture Compliance

- **§6:** Live Session Auto - fermeture après inactivité (T_inactive configurable)
- **§11.2:** Cron clôture live session auto sur Railway

### Service live-session (getOrCreateCurrentSession)

Le service `src/server/live-session/service.ts` est utilisé par le webhook-processor pour obtenir ou créer la session live courante du tenant. **Garantie (Story 2.6 durci) :** une seule session active par tenant. Contrainte unique partielle en base (`live_sessions_tenant_id_active_key` sur `(tenant_id) WHERE status = 'active'`) ; en cas de création concurrente (plusieurs jobs en parallèle), un seul `create` réussit, l’autre reçoit P2002 et reprend la session créée (retry). Migration : `20260209200000_live_sessions_unique_active_per_tenant`.
