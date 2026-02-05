/**
 * Tests d'intégration pour le worker webhook-processor
 * 
 * Ces tests vérifient que le worker fonctionne correctement avec une vraie queue BullMQ.
 * 
 * Note: Ces tests nécessitent une connexion Redis. En CI/CD, utiliser un service Redis de test.
 * Pour exécuter localement: REDIS_URL=redis://localhost:6379 npm test -- webhook-processor.integration.test.ts
 * 
 * ⚠️ Ces tests sont désactivés par défaut (skip) car ils nécessitent Redis.
 * Pour les activer: supprimer `.skip` ou utiliser variable d'environnement RUN_INTEGRATION_TESTS=true
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { processWebhookJob, createWebhookProcessorWorker } from "./webhook-processor";
import type { InboundMessage, EnrichedInboundMessage } from "../messaging/types";
import { db } from "~/server/db";

// Mock Prisma pour éviter les vraies connexions DB dans les tests d'intégration
vi.mock("~/server/db", () => ({
  db: {
    sellerPhone: {
      findMany: vi.fn(),
    },
  },
}));

// Mock logger pour éviter le bruit dans les logs
vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock queues pour éviter la validation env
vi.mock("./queues", () => ({
  webhookProcessingQueue: {
    opts: {
      connection: {},
    },
  },
}));

const shouldRunIntegrationTests =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.REDIS_URL;

describe.skipIf(!shouldRunIntegrationTests)(
  "webhook-processor integration",
  () => {
    let redis: Redis;
    let testQueue: Queue<InboundMessage>;
    let worker: Worker<InboundMessage, EnrichedInboundMessage>;
    const queueName = "webhook-processing-test";

    beforeAll(async () => {
      // Créer connexion Redis pour les tests
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw new Error("REDIS_URL is required for integration tests");
      }

      const url = new URL(redisUrl);
      const isUpstash = url.hostname.includes("upstash.io");
      const useTls = url.protocol === "rediss:" || isUpstash;

      redis = new Redis({
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: process.env.REDIS_TOKEN || url.password || undefined,
        tls: useTls ? {} : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      // Créer queue de test
      testQueue = new Queue<InboundMessage>(queueName, {
        connection: redis,
      });

      // Créer worker de test
      worker = new Worker<InboundMessage, EnrichedInboundMessage>(
        queueName,
        processWebhookJob,
        {
          connection: redis,
          concurrency: 1, // Traiter un job à la fois pour les tests
        },
      );
    });

    afterAll(async () => {
      // Nettoyer: fermer worker et queue
      await worker.close();
      await testQueue.close();
      await redis.quit();
    });

    beforeEach(async () => {
      // Nettoyer la queue avant chaque test
      await testQueue.obliterate({ force: true });
      vi.clearAllMocks();
    });

    it("should process job from queue and determine message type as seller", async () => {
      const tenantId = "tenant-integration-1";
      const sellerPhoneNumber = "+33612345678";

      // Mock seller_phone trouvé
      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        {
          id: "seller-phone-1",
          tenantId,
          phoneNumber: sellerPhoneNumber,
          createdAt: new Date(),
        },
      ]);

      const jobData: InboundMessage = {
        tenantId,
        providerMessageId: "SM-INTEGRATION-1",
        from: `whatsapp:${sellerPhoneNumber}`,
        body: "A12",
        correlationId: "corr-integration-1",
      };

      // Ajouter job à la queue
      const job = await testQueue.add("test-job", jobData, {
        jobId: `test-${Date.now()}`,
      });

      // Attendre que le worker traite le job (max 5s)
      const result = await new Promise<EnrichedInboundMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Job processing timeout"));
        }, 5000);

        worker.on("completed", async (completedJob) => {
          if (completedJob.id === job.id) {
            clearTimeout(timeout);
            const jobResult = await completedJob.returnvalue;
            if (jobResult) {
              resolve(jobResult);
            } else {
              reject(new Error("Job completed but no return value"));
            }
          }
        });

        worker.on("failed", async (failedJob, err) => {
          if (failedJob.id === job.id) {
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      // Vérifier le résultat
      expect(result.messageType).toBe("seller");
      expect(result.tenantId).toBe(tenantId);
      expect(result.providerMessageId).toBe("SM-INTEGRATION-1");
    });

    it("should process job from queue and determine message type as client", async () => {
      const tenantId = "tenant-integration-2";
      const clientPhoneNumber = "+33698765432";

      // Mock seller_phone non trouvé
      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);

      const jobData: InboundMessage = {
        tenantId,
        providerMessageId: "SM-INTEGRATION-2",
        from: `whatsapp:${clientPhoneNumber}`,
        body: "Je veux réserver A12",
        correlationId: "corr-integration-2",
      };

      // Ajouter job à la queue
      const job = await testQueue.add("test-job", jobData, {
        jobId: `test-${Date.now()}`,
      });

      // Attendre que le worker traite le job
      const result = await new Promise<EnrichedInboundMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Job processing timeout"));
        }, 5000);

        worker.on("completed", async (completedJob) => {
          if (completedJob.id === job.id) {
            clearTimeout(timeout);
            const jobResult = await completedJob.returnvalue;
            if (jobResult) {
              resolve(jobResult);
            } else {
              reject(new Error("Job completed but no return value"));
            }
          }
        });

        worker.on("failed", async (failedJob, err) => {
          if (failedJob.id === job.id) {
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      // Vérifier le résultat
      expect(result.messageType).toBe("client");
      expect(result.tenantId).toBe(tenantId);
    });
  },
);
