/**
 * Tests d'intégration pour le worker outbox-sender (Story 2.4)
 *
 * - Worker outbox-sender avec message réel → envoi (simulé) Twilio réussi
 * - Échec Twilio → retry avec backoff → DLQ après N échecs
 *
 * Nécessite DATABASE_URL. Twilio est mocké (pas d'appel réel).
 * Pour exécuter : RUN_INTEGRATION_TESTS=true npm test -- outbox-sender.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "~/server/db";
import { writeToOutbox } from "~/server/messaging/outbox";
import {
  processOutboxBatch,
} from "~/server/workers/outbox-sender";

const mockSend = vi.fn();

vi.mock("~/server/messaging/providers/twilio/adapter", () => ({
  TwilioAdapter: class {
    send = mockSend;
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logMessageSent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/env", () => ({
  env: {
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_ACCOUNT_SID: "test-sid",
    TWILIO_WHATSAPP_NUMBER: "+14155238886",
  },
}));

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)(
  "outbox-sender integration",
  () => {
    let testTenantId: string;

    beforeAll(async () => {
      const tenant = await db.tenant.create({
        data: { name: "Test Tenant Outbox Integration" },
      });
      testTenantId = tenant.id;
    });

    afterAll(async () => {
      await db.messageOut.deleteMany({ where: { tenantId: testTenantId } });
      await db.deadLetterJob.deleteMany({ where: { tenantId: testTenantId } });
      await db.tenant.delete({ where: { id: testTenantId } });
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mockSend.mockReset();
    });

    it("worker outbox-sender with real message → Twilio send success (mock)", async () => {
      const correlationId = `corr-int-success-${Date.now()}`;
      await writeToOutbox({
        tenantId: testTenantId,
        to: "+33612345678",
        body: "Integration test message",
        correlationId,
      });

      mockSend.mockResolvedValue({
        success: true,
        providerMessageId: "SM-INTEGRATION-SUCCESS",
      });

      const processed = await processOutboxBatch(1);
      expect(processed).toBe(1);

      const updated = await db.messageOut.findFirst({
        where: { tenantId: testTenantId, correlationId },
      });
      expect(updated).toBeDefined();
      expect(updated!.status).toBe("sent");
      expect(updated!.providerMessageId).toBe("SM-INTEGRATION-SUCCESS");
    });

    it("Twilio failure → retry with backoff → DLQ after N failures", async () => {
      const correlationId = `corr-int-dlq-${Date.now()}`;
      await writeToOutbox({
        tenantId: testTenantId,
        to: "+33698765432",
        body: "Message that will fail",
        correlationId,
      });

      mockSend.mockResolvedValue({
        success: false,
        error: "Twilio error (simulated)",
      });

      const MAX_RETRIES = 5;
      for (let i = 0; i < MAX_RETRIES; i++) {
        if (i > 0) {
          await db.messageOut.updateMany({
            where: { tenantId: testTenantId, correlationId, status: "failed" },
            data: { nextAttemptAt: new Date(0) },
          });
        }
        await processOutboxBatch(1);
      }

      const dlq = await db.deadLetterJob.findFirst({
        where: { tenantId: testTenantId, jobType: "message_out" },
      });
      expect(dlq).toBeDefined();
      const payload = dlq!.payload as { message_out_id: string; to: string; body: string; correlation_id: string };
      expect(payload.correlation_id).toBe(correlationId);
      expect(payload.to).toBe("+33698765432");
      expect(payload.body).toBe("Message that will fail");
      expect(dlq!.errorMessage).toContain("Twilio error");
      expect(dlq!.attempts).toBe(MAX_RETRIES);

      const messageOut = await db.messageOut.findFirst({
        where: { tenantId: testTenantId, correlationId },
      });
      expect(messageOut!.status).toBe("failed");
    });
  },
);
