/**
 * Test d'intégration : webhook STOP → OptOut créé → message suivant bloqué (Story 2.5)
 *
 * 1. Simule le traitement d'un message STOP (processWebhookJob) → OptOut créé pour (tenant_id, phone).
 * 2. Met un message en outbox vers ce numéro.
 * 3. Traite l'outbox (processOutboxBatch) → le message n'est pas envoyé (status = 'blocked').
 * 4. Vérifie que l'événement message_blocked_optout est loggé.
 *
 * Nécessite DATABASE_URL. Exécutable en CI avec une DB de test.
 * Pour exécuter : RUN_INTEGRATION_TESTS=true pnpm test -- stop-optout-blocked.integration.test.ts
 *
 * Import dynamique de db/processors pour ne pas déclencher la validation env quand le test est skip.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Job } from "bullmq";
import type { InboundMessage } from "~/server/messaging/types";

const mockLogOptOutRecorded = vi.fn().mockResolvedValue(undefined);
const mockLogMessageBlockedOptOut = vi.fn().mockResolvedValue(undefined);
const mockLogMessageSent = vi.fn().mockResolvedValue(undefined);

vi.mock("~/server/events/eventLog", () => ({
  logOptOutRecorded: (...args: unknown[]) => mockLogOptOutRecorded(...args),
  logMessageBlockedOptOut: (...args: unknown[]) => mockLogMessageBlockedOptOut(...args),
  logMessageSent: (...args: unknown[]) => mockLogMessageSent(...args),
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/server/messaging/providers/twilio/adapter", () => ({
  TwilioAdapter: class {
    send = vi.fn().mockResolvedValue({ success: true, providerMessageId: "SM-mock" });
  },
}));

vi.mock("~/server/live-session/service", () => ({
  getOrCreateCurrentSession: vi.fn().mockRejectedValue(new Error("mock: no live session in test")),
}));

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)(
  "STOP → OptOut created → next message blocked (Story 2.5)",
  () => {
    const testPhone = "+33612000099";
    let testTenantId: string;
    let db: typeof import("~/server/db").db;
    let processWebhookJob: typeof import("../webhook-processor").processWebhookJob;
    let writeToOutbox: typeof import("~/server/messaging/outbox").writeToOutbox;
    let processOutboxBatch: typeof import("../outbox-sender").processOutboxBatch;

    beforeAll(async () => {
      const dbMod = await import("~/server/db");
      db = dbMod.db;
      const wp = await import("../webhook-processor");
      processWebhookJob = wp.processWebhookJob;
      const outboxMod = await import("~/server/messaging/outbox");
      writeToOutbox = outboxMod.writeToOutbox;
      const osMod = await import("../outbox-sender");
      processOutboxBatch = osMod.processOutboxBatch;

      const tenant = await db.tenant.create({
        data: { name: "Test Tenant STOP Integration" },
      });
      testTenantId = tenant.id;
    });

    afterAll(async () => {
      if (!db || !testTenantId) return;
      await db.messageOut.deleteMany({ where: { tenantId: testTenantId } });
      await db.optOut.deleteMany({ where: { tenantId: testTenantId } });
      await db.eventLog.deleteMany({ where: { tenantId: testTenantId } });
      await db.tenant.delete({ where: { id: testTenantId } });
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mockLogOptOutRecorded.mockResolvedValue(undefined);
      mockLogMessageBlockedOptOut.mockResolvedValue(undefined);
    });

    it("webhook STOP → OptOut created → outbox message to same number is blocked", async () => {
      const correlationIdStop = `corr-stop-${Date.now()}`;
      const correlationIdOutbox = `corr-outbox-${Date.now()}`;

      // 1. Simuler réception STOP : exécuter le job processor comme le ferait le worker
      const stopJob = {
        id: "job-stop-1",
        data: {
          tenantId: testTenantId,
          providerMessageId: `SM-stop-${Date.now()}`,
          from: testPhone,
          body: "STOP",
          mediaUrl: null,
          correlationId: correlationIdStop,
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(stopJob);

      // 2. Vérifier qu'un OptOut a été créé pour (tenant_id, phone_number)
      const optOut = await db.optOut.findUnique({
        where: {
          tenantId_phoneNumber: { tenantId: testTenantId, phoneNumber: testPhone },
        },
      });
      expect(optOut).toBeDefined();
      expect(optOut!.tenantId).toBe(testTenantId);
      expect(optOut!.phoneNumber).toBe(testPhone);
      expect(mockLogOptOutRecorded).toHaveBeenCalledWith(
        testTenantId,
        optOut!.id,
        correlationIdStop,
      );

      // 3. Mettre un message en outbox vers ce numéro
      await writeToOutbox({
        tenantId: testTenantId,
        to: testPhone,
        body: "Message after STOP (should be blocked)",
        correlationId: correlationIdOutbox,
      });

      // 4. Traiter l'outbox → le message doit être bloqué (status = 'blocked')
      const processed = await processOutboxBatch(1);
      expect(processed).toBe(1);

      const messageOut = await db.messageOut.findFirst({
        where: { tenantId: testTenantId, correlationId: correlationIdOutbox },
      });
      expect(messageOut).toBeDefined();
      expect(messageOut!.status).toBe("blocked");

      // 5. Vérifier que l'événement message_blocked_optout a été loggé
      expect(mockLogMessageBlockedOptOut).toHaveBeenCalledWith(
        testTenantId,
        messageOut!.id,
        correlationIdOutbox,
      );
    });
  },
);
