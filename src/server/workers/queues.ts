import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "~/env";
import type { InboundMessage } from "../messaging/types";

/**
 * Client Redis (Upstash) pour BullMQ
 * Upstash supporte le protocole Redis standard via ioredis
 */
const createRedisConnection = () => {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required for BullMQ");
  }

  const url = new URL(env.REDIS_URL);
  const isUpstash = url.hostname.includes("upstash.io");
  const useTls = url.protocol === "rediss:" || isUpstash;

  return new Redis({
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: env.REDIS_TOKEN || url.password || undefined,
    tls: useTls ? {} : undefined,
    maxRetriesPerRequest: null, // Requis pour BullMQ
    enableReadyCheck: false, // Upstash peut avoir des problèmes avec ready check
  });
};

/**
 * Queue BullMQ pour traitement asynchrone des messages entrants
 * Payload normalisé : InboundMessage (tenantId, providerMessageId, from, body, correlationId)
 * Worker consommateur : Story 2.2 (hors scope Story 2.1)
 */
export const webhookProcessingQueue = new Queue<InboundMessage>(
  "webhook-processing",
  {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 3600, // Garder 1h pour debug
        count: 1000,
      },
      removeOnFail: {
        age: 86400, // Garder 24h pour analyse
      },
    },
  },
);
