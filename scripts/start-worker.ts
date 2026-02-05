#!/usr/bin/env tsx
/**
 * Entry point pour démarrer les workers sur Railway
 * 
 * Workers démarrés:
 *   - webhook-processor: Traite les messages entrants (routing vendeur vs client)
 *   - outbox-sender: Envoie les messages sortants via outbox + retries + DLQ
 * 
 * Usage:
 *   tsx scripts/start-worker.ts
 * 
 * Variables d'environnement requises:
 *   - DATABASE_URL: URL de connexion PostgreSQL (Neon)
 *   - REDIS_URL: URL de connexion Redis (Upstash)
 *   - REDIS_TOKEN: Token d'authentification Redis (si requis)
 *   - TWILIO_ACCOUNT_SID: Account SID Twilio
 *   - TWILIO_AUTH_TOKEN: Auth Token Twilio
 *   - TWILIO_WHATSAPP_NUMBER: Numéro WhatsApp Twilio (format E.164, ex. +14155238886)
 * 
 * Les workers gèrent automatiquement:
 *   - Graceful shutdown (SIGTERM/SIGINT)
 *   - Retry automatique des jobs échoués (via BullMQ pour webhook-processor, polling DB pour outbox-sender)
 *   - Logging structuré avec correlationId
 */

import { startWebhookProcessorWorker } from "~/server/workers/webhook-processor";
import { startOutboxSenderWorker, stopOutboxSenderWorker } from "~/server/workers/outbox-sender";
import {
  startCloseInactiveLiveSessionsWorker,
  stopCloseInactiveLiveSessionsWorker,
} from "~/server/workers/close-inactive-live-sessions";
import { workerLogger } from "~/lib/logger";
import type { Worker } from "bullmq";

// Stocker les références pour graceful shutdown
let webhookWorker: Worker | null = null;
let webhookMetricsInterval: NodeJS.Timeout | null = null;
let outboxSenderInterval: NodeJS.Timeout | null = null;
let closeLiveSessionsInterval: NodeJS.Timeout | null = null;

/**
 * Gestion graceful shutdown
 * Ferme les workers proprement en attendant la fin des jobs en cours
 */
async function gracefulShutdown(signal: string): Promise<void> {
  workerLogger.info(`Received ${signal}, starting graceful shutdown...`);

  // Arrêter l'interval de métriques webhook-processor
  if (webhookMetricsInterval) {
    clearInterval(webhookMetricsInterval);
    webhookMetricsInterval = null;
    workerLogger.info("Webhook processor metrics interval stopped");
  }

  // Arrêter le worker outbox-sender
  if (outboxSenderInterval) {
    stopOutboxSenderWorker(outboxSenderInterval);
    outboxSenderInterval = null;
    workerLogger.info("Outbox sender worker stopped");
  }

  // Arrêter le worker close-inactive-live-sessions (Story 2.6)
  if (closeLiveSessionsInterval) {
    stopCloseInactiveLiveSessionsWorker(closeLiveSessionsInterval);
    closeLiveSessionsInterval = null;
    workerLogger.info("Close inactive live sessions worker stopped");
  }

  // Fermer le worker webhook-processor
  if (webhookWorker) {
    try {
      // Fermer le worker (arrête de consommer de nouveaux jobs, attend fin des jobs en cours)
      // BullMQ attend automatiquement la fin des jobs en cours (max 30s par défaut)
      await webhookWorker.close();
      workerLogger.info("Webhook processor worker closed successfully");
    } catch (error) {
      workerLogger.error("Error closing webhook processor worker", error);
    }
  }

  // Donner un peu de temps pour les logs avant de quitter
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

// Handlers pour signaux de shutdown
process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

// Handler pour erreurs non capturées
process.on("uncaughtException", (error) => {
  workerLogger.error("Uncaught exception", error);
  void gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  workerLogger.error("Unhandled rejection", reason, { promise });
  void gracefulShutdown("unhandledRejection");
});

// Démarrer les workers
try {
  // Démarrer webhook-processor worker
  workerLogger.info("Starting webhook processor worker...");
  const { worker: startedWebhookWorker, metricsInterval: startedWebhookInterval } =
    startWebhookProcessorWorker();
  webhookWorker = startedWebhookWorker;
  webhookMetricsInterval = startedWebhookInterval;
  workerLogger.info("Webhook processor worker started successfully with metrics monitoring");

  // Démarrer outbox-sender worker (polling DB toutes les 5s, batch de 10 messages)
  workerLogger.info("Starting outbox sender worker...");
  outboxSenderInterval = startOutboxSenderWorker(5000, 10);
  workerLogger.info("Outbox sender worker started successfully");

  // Démarrer close-inactive-live-sessions (Story 2.6) - toutes les 10 min
  workerLogger.info("Starting close-inactive-live-sessions worker...");
  closeLiveSessionsInterval = startCloseInactiveLiveSessionsWorker(10 * 60 * 1000);
  workerLogger.info("Close inactive live sessions worker started successfully");
} catch (error) {
  workerLogger.error("Failed to start workers", error);
  process.exit(1);
}
