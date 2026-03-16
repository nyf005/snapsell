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

import { boss, ensureQueues, QUEUE } from "~/server/workers/queues";
import { startWebhookProcessorWorker } from "~/server/workers/webhook-processor";
import { runReservationReminderJob, runReservationTtlJob } from "~/server/workers/reservation-ttl";
import { runCloseInactiveLiveSessions } from "~/server/workers/close-inactive-live-sessions";
import { workerLogger } from "~/lib/logger";

const SCHEDULE = {
  RESERVATION_TTL: QUEUE.CRON_RESERVATION_TTL,
  CLOSE_SESSIONS: QUEUE.CRON_CLOSE_SESSIONS,
} as const;

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

    // Schedules pg-boss : verrou distribué en DB, safe si redémarrage ou scale
    await boss.schedule(SCHEDULE.RESERVATION_TTL, "* * * * *", {});
    await boss.schedule(SCHEDULE.CLOSE_SESSIONS, "*/10 * * * *", {});

    await boss.work(SCHEDULE.RESERVATION_TTL, async () => {
      await runReservationReminderJob();
      await runReservationTtlJob();
    });

    await boss.work(SCHEDULE.CLOSE_SESSIONS, async () => {
      await runCloseInactiveLiveSessions();
    });

    workerLogger.info("Periodic jobs scheduled via pg-boss (reservation-ttl: 1min, close-sessions: 10min)");
  } catch (error) {
    workerLogger.error("Failed to start workers", error);
    process.exit(1);
  }
}

void main();
