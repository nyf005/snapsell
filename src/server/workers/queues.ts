import { PgBoss, type Job as PgBossJobType } from "pg-boss";
import { env } from "~/env";

/**
 * pg-boss instance — backend de queue sur Postgres (Neon).
 *
 * IMPORTANT : Neon nécessite l'URL directe (non-pooler).
 * L'URL pooler (-pooler.) utilise PgBouncer transaction mode,
 * incompatible avec pg-boss (advisory locks, session state).
 *
 * Contexte serverless (Vercel) : boss.send() requiert boss.start() même en
 * mode producer-only. On utilise une initialisation lazy (ensureBossReady)
 * appelée avant chaque send() dans le webhook route.
 * start() pour work() (consommation de jobs) est appelé dans start-worker.ts (Railway).
 */
export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  max: 5,
});

boss.on("error", (error) => {
  console.error("[pg-boss] error:", error);
});

/**
 * Initialisation lazy du boss pour les contextes serverless (Vercel).
 * Idempotent : le second appel retourne immédiatement si déjà démarré.
 * À appeler avant boss.send() dans le webhook route.
 */
let _bossReady: Promise<void> | null = null;
export function ensureBossReady(): Promise<void> {
  if (!_bossReady) {
    _bossReady = boss.start().then(() => undefined);
  }
  return _bossReady;
}

/** Noms de queues (centralisés pour éviter les typos) */
export const QUEUE = {
  WEBHOOK_PROCESSING: "webhook-processing",
  // Compatibilité : OUTBOX_SEND conservé pour le fallback pg-boss en développement local
  OUTBOX_SEND: "outbox-send",
  // Crons pg-boss (schedule names)
  CRON_RESERVATION_TTL: "cron-reservation-ttl",
  CRON_CLOSE_SESSIONS: "cron-close-sessions",
  CRON_DEPOSIT_EXPIRY: "cron-deposit-expiry",
  CRON_META_CATALOGUE_SYNC: "cron-meta-catalogue-sync",
} as const;

/**
 * Crée les queues pg-boss avec leurs options.
 * À appeler après boss.start() dans le worker.
 * Note: OUTBOX_SEND est uniquement créé pour le fallback dev (QStash en production).
 */
export async function ensureQueues(): Promise<void> {
  await boss.createQueue(QUEUE.WEBHOOK_PROCESSING, {
    retryLimit: 2,
    retryDelay: 2,
    retryBackoff: true,
    deleteAfterSeconds: 3600,
  });

  // Fallback dev uniquement
  await boss.createQueue(QUEUE.OUTBOX_SEND, {
    retryLimit: 5,
    retryDelay: 1,
    retryBackoff: true,
    deleteAfterSeconds: 3600,
  });

  // Queues pour les crons pg-boss (reservation-ttl et close-sessions)
  await boss.createQueue(QUEUE.CRON_RESERVATION_TTL, {
    deleteAfterSeconds: 3600,
  });
  await boss.createQueue(QUEUE.CRON_CLOSE_SESSIONS, {
    deleteAfterSeconds: 3600,
  });

  await boss.createQueue(QUEUE.CRON_DEPOSIT_EXPIRY, {
    deleteAfterSeconds: 3600,
  });

  await boss.createQueue(QUEUE.CRON_META_CATALOGUE_SYNC, {
    deleteAfterSeconds: 3600,
  });
}

/** Re-export du type Job pg-boss pour usage dans les workers */
export type PgBossJob<T extends object = object> = PgBossJobType<T>;
