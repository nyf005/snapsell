/**
 * Tests d'intégration pour le worker webhook-processor (pg-boss)
 *
 * Ces tests vérifient que le worker fonctionne correctement avec pg-boss.
 *
 * Note: Ces tests nécessitent une connexion PostgreSQL (DATABASE_URL).
 * Pour exécuter localement: RUN_INTEGRATION_TESTS=true pnpm test -- webhook-processor.integration.test.ts
 *
 * ⚠️ Ces tests sont désactivés par défaut (skip) car ils nécessitent une DB.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import PgBoss from "pg-boss";
import { processWebhookJob } from "./webhook-processor";
import type { InboundMessage, EnrichedInboundMessage } from "../messaging/types";
import { db } from "~/server/db";
import type { PgBossJob } from "./queues";

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
  boss: { send: vi.fn() },
  QUEUE: { WEBHOOK_PROCESSING: "webhook-processing", OUTBOX_SEND: "outbox-send", OUTBOX_DLQ: "outbox-dlq" },
}));

vi.mock("~/server/events/eventLog", () => ({
  logOptOutRecorded: vi.fn().mockResolvedValue(undefined),
  logLiveItemCreated: vi.fn().mockResolvedValue(undefined),
  logLiveItemDuplicateRejected: vi.fn().mockResolvedValue(undefined),
  logLiveItemPhotoLinked: vi.fn().mockResolvedValue(undefined),
  logCatalogueItemPhotoLinked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/live-session/service", () => ({
  getCurrentSessionReadOnly: vi.fn().mockResolvedValue(null),
}));

vi.mock("~/server/reservation/service", () => ({
  createReservation: vi.fn(),
  getActiveReservationForClient: vi.fn().mockResolvedValue(null),
  collectAddress: vi.fn(),
}));

vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: vi.fn(),
}));

vi.mock("~/server/catalogue/findOrderableItemByCode", () => ({
  findOrderableItemByCode: vi.fn(),
}));

vi.mock("~/server/catalogue/findOrCreateOrderableItemByCode", () => ({
  findOrCreateOrderableItemByCode: vi.fn(),
}));

vi.mock("~/server/catalogue/upsertCatalogueItemFromWebhook", () => ({
  upsertCatalogueItemFromWebhook: vi.fn(),
}));

vi.mock("~/server/live-item/createLiveItem", () => ({
  createLiveItem: vi.fn(),
  messageCodeAlreadyUsed: vi.fn(),
  messageCodeUnknown: vi.fn(),
  messageCodeUnknownSuggestion: vi.fn(),
  normalizeCode: vi.fn((s: string) => s.trim().toUpperCase()),
}));

vi.mock("~/server/live-item/findLiveItemByCode", () => ({
  findLiveItemByCode: vi.fn(),
}));

vi.mock("~/server/live-item/getLastEditedLiveItemInWindow", () => ({
  getLastEditedLiveItemInWindow: vi.fn(),
}));

vi.mock("~/server/media/uploadMediaToLiveItem", () => ({
  uploadMediaAndLinkToLiveItem: vi.fn(),
}));

vi.mock("~/server/media/uploadMediaToCatalogueItem", () => ({
  uploadMediaToCatalogueItem: vi.fn(),
}));

vi.mock("~/server/media/r2-client", () => ({
  isR2Configured: vi.fn().mockReturnValue(false),
}));

vi.mock("~/server/waitlist/addToWaitlist", () => ({
  addToWaitlist: vi.fn(),
}));

vi.mock("~/server/order/createOrderFromReservation", () => ({
  createOrderFromReservation: vi.fn(),
}));

vi.mock("~/lib/sentry", () => ({
  captureException: vi.fn().mockResolvedValue(undefined),
}));

const shouldRunIntegrationTests =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRunIntegrationTests)(
  "webhook-processor integration (pg-boss)",
  () => {
    let testBoss: PgBoss;
    const queueName = "webhook-processing-test";

    beforeAll(async () => {
      testBoss = new PgBoss({
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      });
      await testBoss.start();
      await testBoss.createQueue(queueName, {
        retryLimit: 2,
        retryDelay: 2,
        retryBackoff: true,
        deleteAfterSeconds: 60,
      });
    });

    afterAll(async () => {
      await testBoss.stop({ graceful: true, timeout: 5000 });
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should process job and determine message type as seller", async () => {
      const tenantId = "tenant-integration-1";
      const sellerPhoneNumber = "+33612345678";

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

      // Send job to queue
      const jobId = await testBoss.send(queueName, jobData);
      expect(jobId).toBeTruthy();

      // Process job via handler
      const result = await new Promise<EnrichedInboundMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Job processing timeout"));
        }, 10000);

        void testBoss.work<InboundMessage>(
          queueName,
          { batchSize: 1, localConcurrency: 1 },
          async (job) => {
            clearTimeout(timeout);
            const enriched = await processWebhookJob(job);
            resolve(enriched);
          },
        );
      });

      expect(result.messageType).toBe("seller");
      expect(result.tenantId).toBe(tenantId);
      expect(result.providerMessageId).toBe("SM-INTEGRATION-1");
    });

    it("should process job and determine message type as client", async () => {
      const tenantId = "tenant-integration-2";
      const clientPhoneNumber = "+33698765432";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);

      const jobData: InboundMessage = {
        tenantId,
        providerMessageId: "SM-INTEGRATION-2",
        from: `whatsapp:${clientPhoneNumber}`,
        body: "Bonjour",
        correlationId: "corr-integration-2",
      };

      const jobId = await testBoss.send(queueName, jobData);
      expect(jobId).toBeTruthy();

      const result = await new Promise<EnrichedInboundMessage>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Job processing timeout"));
        }, 10000);

        void testBoss.work<InboundMessage>(
          queueName,
          { batchSize: 1, localConcurrency: 1 },
          async (job) => {
            clearTimeout(timeout);
            const enriched = await processWebhookJob(job);
            resolve(enriched);
          },
        );
      });

      expect(result.messageType).toBe("client");
      expect(result.tenantId).toBe(tenantId);
    });
  },
);
