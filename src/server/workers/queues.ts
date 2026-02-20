import { PgBoss, type Job as PgBossJobType } from "pg-boss";
import { env } from "~/env";

/**
 * pg-boss instance — backend de queue sur Postgres (Neon).
 *
 * IMPORTANT : Neon nécessite l'URL directe (non-pooler).
 * L'URL pooler (-pooler.) utilise PgBouncer transaction mode,
 * incompatible avec pg-boss (advisory locks, session state).
 *
 * Contexte serverless (Vercel) : pg-boss v12 supporte send() sans start().
 * send() fait un INSERT direct via le pool de connexions du constructeur.
 * start() n'est nécessaire que pour work() (consommation de jobs) — appelé
 * uniquement dans start-worker.ts (Railway).
 */
export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  max: 5,
});

boss.on("error", (error) => {
  console.error("[pg-boss] error:", error);
});

/** Noms de queues (centralisés pour éviter les typos) */
export const QUEUE = {
  WEBHOOK_PROCESSING: "webhook-processing",
  OUTBOX_SEND: "outbox-send",
  OUTBOX_DLQ: "outbox-dlq",
} as const;

/**
 * Crée les queues pg-boss avec leurs options.
 * À appeler après boss.start() dans le worker.
 */
export async function ensureQueues(): Promise<void> {
  await boss.createQueue(QUEUE.OUTBOX_DLQ, {
    deleteAfterSeconds: 604800, // 7 jours
  });

  await boss.createQueue(QUEUE.WEBHOOK_PROCESSING, {
    retryLimit: 2,
    retryDelay: 2,
    retryBackoff: true,
    deleteAfterSeconds: 3600,
  });

  await boss.createQueue(QUEUE.OUTBOX_SEND, {
    retryLimit: 5,
    retryDelay: 1,
    retryBackoff: true,
    deleteAfterSeconds: 3600,
    deadLetter: QUEUE.OUTBOX_DLQ,
  });
}

/** Re-export du type Job pg-boss pour usage dans les workers */
export type PgBossJob<T extends object = object> = PgBossJobType<T>;
