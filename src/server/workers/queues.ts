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
  // Compatibilité : OUTBOX_SEND conservé pour le fallback pg-boss en développement local
  OUTBOX_SEND: "outbox-send",
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
}

/** Re-export du type Job pg-boss pour usage dans les workers */
export type PgBossJob<T extends object = object> = PgBossJobType<T>;
