import { PgBoss, type Job as PgBossJobType } from "pg-boss";
import { env } from "~/env";

/**
 * pg-boss instance — backend de queue sur Postgres (Neon).
 *
 * Contexte serverless (Vercel) : boss.send() requiert boss.start() même en
 * mode producer-only. On utilise une initialisation lazy (ensureBossReady)
 * appelée avant chaque send() dans le webhook route.
 * start() pour work() (consommation de jobs) est appelé dans start-worker.ts (Railway).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux processus, deux configurations.
 *
 * Ce module sert Railway et Vercel, et le faisait jusqu'ici avec les mêmes
 * options — au détriment de Vercel :
 *
 * - **Railway** exécute le worker. Il consomme les jobs et porte toute la
 *   maintenance de pg-boss : migration du schéma, supervision, planification
 *   des crons. Ces tâches prennent des verrous consultatifs et s'appuient sur
 *   un état de session. Elles exigent la connexion Neon **directe** — l'URL
 *   pooler passe par PgBouncer en mode transaction, qui ne préserve ni l'un
 *   ni l'autre.
 *
 * - **Vercel** ne fait que publier. Or `boss.start()` déclenchait cette même
 *   maintenance depuis chaque instance serverless, à travers le pooler, et
 *   ouvrait jusqu'à cinq connexions par instance pour de simples insertions.
 *
 * Le rôle vient de `PG_BOSS_ROLE`, avec `producer` par défaut : c'est le cas
 * le plus fréquent et le moins invasif si la variable est oubliée. Guide de
 * déploiement dans DEPLOYMENT.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const isWorker = env.PG_BOSS_ROLE === "worker";

export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  // Un producteur ne fait qu'écrire, et son instance est éphémère.
  max: isWorker ? 5 : 2,
  // Toute la maintenance revient au worker. Conséquence à connaître : sur une
  // base neuve, le schéma pg-boss n'existe qu'une fois le worker démarré au
  // moins une fois — démarrer Railway avant d'ouvrir le webhook.
  supervise: isWorker,
  schedule: isWorker,
  migrate: isWorker,
  createSchema: isWorker,
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
  CRON_SUBSCRIPTION_EXPIRED: "cron-subscription-expired",
  CRON_CREDITS_MONTHLY_RESET: "cron-credits-monthly-reset",
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

  await boss.createQueue(QUEUE.CRON_SUBSCRIPTION_EXPIRED, {
    deleteAfterSeconds: 3600,
  });

  await boss.createQueue(QUEUE.CRON_CREDITS_MONTHLY_RESET, {
    deleteAfterSeconds: 3600,
  });
}

/** Re-export du type Job pg-boss pour usage dans les workers */
export type PgBossJob<T extends object = object> = PgBossJobType<T>;
