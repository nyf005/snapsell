#!/usr/bin/env tsx
/**
 * Entry point pour démarrer les workers sur Railway
 *
 * Workers démarrés:
 *   - webhook-processor: Traite les messages entrants (routing vendeur vs client) — pg-boss
 *
 * Workers migrés vers Vercel (ne plus démarrer ici):
 *   - outbox-sender: Remplacé par QStash + /api/qstash/outbox-send (Option A)
 *   - close-inactive-live-sessions: Remplacé par Vercel Cron /api/cron/close-sessions
 *   - reservation-ttl: Remplacé par Vercel Cron /api/cron/reservation-ttl
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
import { runReservationReminderJob, runReservationTtlJob } from "~/server/workers/reservation-ttl";
import { runCloseInactiveLiveSessions } from "~/server/workers/close-inactive-live-sessions";
import { workerLogger } from "~/lib/logger";

/**
 * Gestion graceful shutdown
 */
async function gracefulShutdown(signal: string): Promise<void> {
  workerLogger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    await boss.stop({ graceful: true, timeout: 30000 });
    workerLogger.info("pg-boss stopped gracefully");
  } catch (error) {
    workerLogger.error("Error stopping pg-boss", error);
  }

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
process.on("uncaughtException", (error) => {
  workerLogger.error("Uncaught exception", error);
  void gracefulShutdown("uncaughtException");
});
process.on("unhandledRejection", (reason, promise) => {
  workerLogger.error("Unhandled rejection", reason, { promise });
  void gracefulShutdown("unhandledRejection");
});

async function main(): Promise<void> {
  try {
    workerLogger.info("Starting pg-boss...");
    await boss.start();
    workerLogger.info("pg-boss started successfully");

    await ensureQueues();
    workerLogger.info("pg-boss queues created");

    workerLogger.info("Starting webhook processor worker...");
    await startWebhookProcessorWorker();
    workerLogger.info("Webhook processor worker started successfully");

    // Reservation TTL : rappels T-2min + expirations, toutes les minutes
    setInterval(() => {
      void runReservationReminderJob().catch((err: unknown) =>
        workerLogger.error("runReservationReminderJob failed", err, {})
      );
      void runReservationTtlJob().catch((err: unknown) =>
        workerLogger.error("runReservationTtlJob failed", err, {})
      );
    }, 60_000);

    // Fermeture sessions inactives, toutes les 10 minutes
    setInterval(() => {
      void runCloseInactiveLiveSessions().catch((err: unknown) =>
        workerLogger.error("runCloseInactiveLiveSessions failed", err, {})
      );
    }, 10 * 60_000);

    workerLogger.info("Periodic jobs scheduled (reservation-ttl: 1min, close-sessions: 10min)");
  } catch (error) {
    workerLogger.error("Failed to start workers", error);
    process.exit(1);
  }
}

void main();
