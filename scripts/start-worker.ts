#!/usr/bin/env tsx
/**
 * Entry point pour démarrer les workers sur Railway
 *
 * Workers démarrés:
 *   - webhook-processor: Traite les messages entrants (routing vendeur vs client) — pg-boss
 *   - crons métier: reservation-ttl, close-sessions, deposit-expiry, meta-catalogue-sync,
 *     subscription-expired, credits-monthly-reset
 *
 * Toujours externalisé:
 *   - outbox-sender: Remplacé par QStash + /api/qstash/outbox-send (Option A)
 *
 * Usage:
 *   tsx scripts/start-worker.ts
 *
 * Variables d'environnement requises:
 *   - DATABASE_URL: URL de connexion PostgreSQL directe (Neon, non-pooler)
 */

import "./runtime-env";
// Doit précéder l'import de `queues`, qui lit le rôle au moment de construire
// l'instance PgBoss.
import "./worker-role";

import { boss, ensureQueues, QUEUE } from "~/server/workers/queues";
import { startWebhookProcessorWorker } from "~/server/workers/webhook-processor";
import { runReservationReminderJob, runReservationTtlJob } from "~/server/workers/reservation-ttl";
import { runCloseInactiveLiveSessions } from "~/server/workers/close-inactive-live-sessions";
import { runDepositExpiryJob } from "~/server/workers/deposit-expiry";
import { runMetaCatalogueSyncJob } from "~/server/workers/meta-catalogue-sync";
import { runSubscriptionExpiredJob } from "~/server/workers/subscription-expired";
import { runCreditsMonthlyResetJob } from "~/server/workers/credits-monthly-reset";
import { workerLogger } from "~/lib/logger";
import { initSentry } from "~/lib/sentry";

const SCHEDULE = {
  RESERVATION_TTL: QUEUE.CRON_RESERVATION_TTL,
  CLOSE_SESSIONS: QUEUE.CRON_CLOSE_SESSIONS,
  DEPOSIT_EXPIRY: QUEUE.CRON_DEPOSIT_EXPIRY,
  META_CATALOGUE_SYNC: QUEUE.CRON_META_CATALOGUE_SYNC,
  SUBSCRIPTION_EXPIRED: QUEUE.CRON_SUBSCRIPTION_EXPIRED,
  CREDITS_MONTHLY_RESET: QUEUE.CRON_CREDITS_MONTHLY_RESET,
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
    // Avant tout le reste : le worker tourne sans personne devant un écran, et
    // Railway Hobby ne garde que 7 jours de logs. Sans cette initialisation,
    // `captureException` s'exécuterait sur un SDK sans client — appelé, mais
    // sans destination.
    await initSentry();
    if (process.env.SENTRY_DSN) {
      workerLogger.info("Sentry actif");
    } else {
      workerLogger.warn("SENTRY_DSN absent — les erreurs ne remonteront nulle part");
    }

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
    await boss.schedule(SCHEDULE.DEPOSIT_EXPIRY, "*/5 * * * *", {});
    await boss.schedule(SCHEDULE.META_CATALOGUE_SYNC, "0 * * * *", {});
    await boss.schedule(SCHEDULE.SUBSCRIPTION_EXPIRED, "0 0 * * *", {});
    // Renouvellement mensuel des crédits + purge des conversation_windows échues.
    // Tourne chaque heure : le job ne traite que les tenants dont usageResetDate est échue,
    // ce qui lisse les renouvellements au lieu de tous les grouper à minuit.
    await boss.schedule(SCHEDULE.CREDITS_MONTHLY_RESET, "0 * * * *", {});

    await boss.work(SCHEDULE.RESERVATION_TTL, async () => {
      await runReservationReminderJob();
      await runReservationTtlJob();
    });

    await boss.work(SCHEDULE.CLOSE_SESSIONS, async () => {
      await runCloseInactiveLiveSessions();
    });

    await boss.work(SCHEDULE.DEPOSIT_EXPIRY, async () => {
      await runDepositExpiryJob();
    });

    await boss.work(SCHEDULE.META_CATALOGUE_SYNC, async () => {
      await runMetaCatalogueSyncJob();
    });

    await boss.work(SCHEDULE.SUBSCRIPTION_EXPIRED, async () => {
      await runSubscriptionExpiredJob();
    });

    await boss.work(SCHEDULE.CREDITS_MONTHLY_RESET, async () => {
      await runCreditsMonthlyResetJob();
    });

    workerLogger.info(
      "Periodic jobs scheduled via pg-boss (reservation-ttl: 1min, close-sessions: 10min, deposit-expiry: 5min, meta-catalogue-sync: 1h, credits-monthly-reset: 1h, subscription-expired: daily)",
    );
  } catch (error) {
    workerLogger.error("Failed to start workers", error);
    process.exit(1);
  }
}

void main();
