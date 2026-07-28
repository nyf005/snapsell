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
- `ENCRYPTION_KEY` - requis en production ; doit être **identique** à celle de Vercel (déchiffrement de `metaAccessToken`)
- `QSTASH_TOKEN` **et** `NEXT_PUBLIC_APP_URL` - requis **ensemble** pour publier les jobs outbox. Si l'un manque, les messages sortants ne partent jamais (voir section Envoi sortant plus bas)
- `AUTH_SECRET`, `CRON_SECRET` - non utilisés fonctionnellement par le worker, mais exigés par la validation d'environnement en production

**Variables optionnelles (dégradation silencieuse si absentes):**
- `R2_*` - sans elles, l'upload média des messages entrants est ignoré
- `AI_API_KEY` - sans elle, l'analyse d'intention IA est désactivée
- `LIVE_SESSION_INACTIVITY_WINDOW_MINUTES` - (défaut 45) fenêtre d'inactivité pour la fermeture auto des sessions live
- `SENTRY_DSN` - remontée des erreurs worker

**Variables non requises sur le worker:**
- `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` — elles vérifient la signature des callbacks QStash sur les routes HTTP `/api/qstash/*`, donc uniquement sur Vercel
- aucune variable de provider WhatsApp : les credentials Meta sont **par tenant, en base**

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
- Vérifier que le service Railway n'est pas en mode `Serverless`

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

## Envoi sortant: outbox (⚠️ ne tourne PAS sur Railway)

L'envoi sortant a été externalisé sur **QStash + Vercel**. Il ne reste rien à démarrer côté worker.

### Architecture

```
writeToOutbox()                  → INSERT messages_out (status = 'pending')
  └─ enqueueOutboxSend()         → QStash publish   [src/server/messaging/outbox.ts]
       └─ POST /api/qstash/outbox-send   (Vercel, signature vérifiée)
            └─ processOutboundMessage()  → Meta WhatsApp Cloud API
       └─ échec après 5 retries → POST /api/qstash/outbox-dlq → dead_letter_jobs
```

- **Transport:** QStash (`retries: 5`, backoff exponentiel, `failureCallback`)
- **Provider:** Meta WhatsApp Cloud API via MetaCloudAdapter (credentials per-tenant en DB, `metaAccessToken` chiffré)
- **Plateforme:** Vercel — **le worker Railway ne fait que publier le job**

### Rôle du worker Railway

Publier, rien de plus. D'où les variables `QSTASH_TOKEN` **et** `NEXT_PUBLIC_APP_URL` sur le service Railway.

### ⚠️ Code résiduel: `startOutboxSenderWorker()`

`startOutboxSenderWorker()` et la queue pg-boss `outbox-send` existent encore comme fallback de développement local, **mais `scripts/start-worker.ts` ne les démarre jamais** : cette queue n'a aucun consommateur.

Depuis le 2026-07-28, la bascule n'est plus silencieuse :
- **en production**, l'absence de `QSTASH_TOKEN` ou `NEXT_PUBLIC_APP_URL` lève une erreur explicite nommant la variable manquante, journalisée en `error` (le `MessageOut` reste en `pending` mais l'incident est visible) ;
- **en développement**, un `warn` explicite rappelle que le message ne partira pas.

En local, soit configurer QStash + un tunnel public, soit accepter que les messages sortants ne partent pas.

### Idempotence de l'outbox

`MessageOut` porte une contrainte `@@unique([tenantId, correlationId, to])` : un même message entrant ne peut produire qu'un message sortant par destinataire.

`writeToOutbox()` **rattrape** désormais la violation P2002 et retourne le message existant sans le ré-enqueuer. C'est ce qui permet à un retry pg-boss d'aboutir : auparavant, un incident transitoire survenu *après* l'écriture du message faisait échouer le rejeu sur ce même conflit, et tout le traitement métier restant (réservation, commande, event log) était perdu définitivement.

Si le message en conflit a un **contenu différent**, c'est que le flux appelant a tenté d'envoyer un second message distinct pour le même message entrant : le message est abandonné et un `error` est journalisé — c'est un défaut de conception du flux, pas un incident transitoire.

### Fonctionnalités

- **Outbox Pattern:** Tout message sortant écrit d'abord dans `MessageOut` avec `status = 'pending'`, puis publié vers QStash
- **Retries / DLQ:** gérés par QStash, plus par pg-boss
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
- ⚠️ **Cause la plus fréquente :** `QSTASH_TOKEN` ou `NEXT_PUBLIC_APP_URL` absent sur le service qui appelle `writeToOutbox()` (Railway **et** Vercel) → bascule silencieuse sur la queue pg-boss non consommée
- Vérifier la console QStash : le message a-t-il été publié ? Est-il en `DELIVERED` ou en échec ?
- Vérifier les logs Vercel de `/api/qstash/outbox-send` (un 401 = clés de signature absentes ou incorrectes)
- Vérifier table `messages_out` pour messages avec `status = 'pending'`
- Vérifier que le tenant a `metaPhoneNumberId` et `metaAccessToken` configurés en base

**Messages échouent systématiquement:**
- Si `lastError = "meta_config_missing"` → le tenant n'a pas configuré ses credentials Meta
- Si `lastError = "tenant_not_found"` → le tenantId ne correspond à aucun tenant
- Vérifier format numéro WhatsApp (E.164)

### Architecture Compliance

- **§4.5:** Outbound messaging via outbox + retries + DLQ
- **§7.1:** Provider-agnostic via MetaCloudAdapter
- **§11.2:** Envoi sortant sur Vercel + QStash (externalisé du worker Railway)

---

## Crons métier (worker Railway)

Planifiés via `boss.schedule()` dans [`scripts/start-worker.ts`](../../../scripts/start-worker.ts) — verrou distribué en base, donc sûrs au redémarrage et au scale.

| Queue | Fréquence | Job |
|---|---|---|
| `cron-reservation-ttl` | `* * * * *` | rappels + expiration des réservations |
| `cron-deposit-expiry` | `*/5 * * * *` | expiration des acomptes |
| `cron-close-sessions` | `*/10 * * * *` | fermeture des sessions live inactives |
| `cron-meta-catalogue-sync` | `0 * * * *` | synchro catalogue Meta Commerce |
| `cron-credits-monthly-reset` | `0 * * * *` | renouvellement mensuel des crédits + purge des `conversation_windows` échues |
| `cron-subscription-expired` | `0 0 * * *` | expiration des abonnements |

### 🚨 Ne pas dupliquer avec Vercel Cron

Les routes [`/api/cron/*`](../../app/api/cron) exécutent **la même logique métier** que ces schedules. Elles sont des **fallbacks manuels / ops uniquement**, protégés par `Authorization: Bearer <CRON_SECRET>`.

`vercel.json` doit rester sans clé `crons`. En ajouter ferait tourner chaque job **deux fois en parallèle**, sur deux runtimes sans verrou partagé (doubles expirations de réservations, doubles relances clients). La bascule a déjà été tentée puis annulée deux fois : `c64837d`, `46e06e5`.

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
