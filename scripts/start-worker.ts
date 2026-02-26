#!/usr/bin/env tsx
/**
 * Entry point pour démarrer les workers sur Railway
 *
 * Workers démarrés:
 *   - webhook-processor: Traite les messages entrants (routing vendeur vs client) — pg-boss
 *   - outbox-sender: Envoie les messages sortants via outbox + retries + DLQ — pg-boss
 *   - close-inactive-live-sessions: Ferme les sessions live inactives — polling setInterval
 *   - reservation-ttl: Expire les réservations TTL — polling setInterval
 *
 * Usage:
 *   tsx scripts/start-worker.ts
 *
 * Variables d'environnement requises:
 *   - DATABASE_URL: URL de connexion PostgreSQL directe (Neon, non-pooler)
 */

import "./runtime-env";

import { boss, ensureQueues } from "~/server/workers/queues";
import { startWebhookProcessorWorker } from "~/server/workers/webhook-processor";
import { startOutboxSenderWorker } from "~/server/workers/outbox-sender";
import {
  startCloseInactiveLiveSessionsWorker,
  stopCloseInactiveLiveSessionsWorker,
} from "~/server/workers/close-inactive-live-sessions";
import {
  startReservationTtlWorker,
  stopReservationTtlWorker,
} from "~/server/workers/reservation-ttl";
import { workerLogger } from "~/lib/logger";

// Stocker les références pour graceful shutdown
let closeLiveSessionsInterval: NodeJS.Timeout | null = null;
let reservationTtlInterval: NodeJS.Timeout | null = null;

/**
 * Gestion graceful shutdown
 * Ferme les workers proprement en attendant la fin des jobs en cours
 */
async function gracefulShutdown(signal: string): Promise<void> {
  workerLogger.info(`Received ${signal}, starting graceful shutdown...`);

  // Arrêter le worker close-inactive-live-sessions (Story 2.6)
  if (closeLiveSessionsInterval) {
    stopCloseInactiveLiveSessionsWorker(closeLiveSessionsInterval);
    closeLiveSessionsInterval = null;
    workerLogger.info("Close inactive live sessions worker stopped");
  }

  // Arrêter le worker reservation TTL (Story 4.3)
  if (reservationTtlInterval) {
    stopReservationTtlWorker(reservationTtlInterval);
    reservationTtlInterval = null;
    workerLogger.info("Reservation TTL worker stopped");
  }

  // Arrêter pg-boss (attend la fin des jobs en cours)
  try {
    await boss.stop({ graceful: true, timeout: 30000 });
    workerLogger.info("pg-boss stopped gracefully");
  } catch (error) {
    workerLogger.error("Error stopping pg-boss", error);
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
async function main(): Promise<void> {
  try {
    // Démarrer pg-boss (crée le schéma pgboss automatiquement)
    workerLogger.info("Starting pg-boss...");
    await boss.start();
    workerLogger.info("pg-boss started successfully");

    // Créer les queues avec leurs options
    await ensureQueues();
    workerLogger.info("pg-boss queues created");

    // Démarrer webhook-processor worker (pg-boss)
    workerLogger.info("Starting webhook processor worker...");
    await startWebhookProcessorWorker();
    workerLogger.info("Webhook processor worker started successfully");

    // Démarrer outbox-sender worker (pg-boss)
    workerLogger.info("Starting outbox sender worker...");
    await startOutboxSenderWorker();
    workerLogger.info("Outbox sender worker started successfully");

    // Démarrer close-inactive-live-sessions (Story 2.6) - toutes les 10 min
    workerLogger.info("Starting close-inactive-live-sessions worker...");
    closeLiveSessionsInterval = startCloseInactiveLiveSessionsWorker(10 * 60 * 1000);
    workerLogger.info("Close inactive live sessions worker started successfully");

    // Démarrer reservation TTL (Story 4.3) - toutes les 1 min
    workerLogger.info("Starting reservation TTL worker...");
    reservationTtlInterval = startReservationTtlWorker(60 * 1000);
    workerLogger.info("Reservation TTL worker started successfully");
  } catch (error) {
    workerLogger.error("Failed to start workers", error);
    process.exit(1);
  }
}

void main();
