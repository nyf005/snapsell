/**
 * Tests d'integration bout en bout Meta WhatsApp (Story 10.5)
 *
 * Couvre le flux complet:
 * - Inbound: webhook POST -> messageIn DB -> job enqueue BullMQ
 * - Outbound: messageOut pending -> processOutboxBatch -> MetaCloudAdapter.send
 *
 * Vraie DB Prisma. Mock: BullMQ queue, env, logger, eventLog.
 * MetaCloudAdapter: parsing reel (inbound), send() spy (outbound).
 *
 * Pour executer : RUN_INTEGRATION_TESTS=true npx vitest run meta-e2e.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import crypto from "crypto";

// ─── Hoisted refs (avant vi.mock) ───

const { capturedAdapterCtorArgs } = vi.hoisted(() => ({
  capturedAdapterCtorArgs: { calls: [] as Array<[string, string]> },
}));

// ─── Mocks (hoisted) ───

const mockQueueAdd = vi.fn();
vi.mock("~/server/workers/queues", () => ({
  webhookProcessingQueue: { add: mockQueueAdd },
}));

vi.mock("~/server/events/eventLog", () => ({
  logWebhookReceived: vi.fn().mockResolvedValue(undefined),
  logIdempotentIgnored: vi.fn().mockResolvedValue(undefined),
  logMessageSent: vi.fn().mockResolvedValue(undefined),
  logMessageBlockedOptOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/logger", () => ({
  webhookLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("~/lib/sentry", () => ({
  captureException: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/rate-limit", () => ({
  checkWebhookRateLimit: vi.fn().mockReturnValue(true),
  getClientIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock partiel MetaCloudAdapter : preserve les vraies methodes (parseInboundBatch, verifySignature)
// et capture les args constructeur pour verification AC#2 (fix H2)
vi.mock("~/server/messaging/providers/meta/adapter", async (importOriginal) => {
  const mod = await importOriginal<typeof import("~/server/messaging/providers/meta/adapter")>();
  class TrackedMetaCloudAdapter extends mod.MetaCloudAdapter {
    constructor(phoneNumberId: string, accessToken: string) {
      super(phoneNumberId, accessToken);
      capturedAdapterCtorArgs.calls.push([phoneNumberId, accessToken]);
    }
  }
  return { ...mod, MetaCloudAdapter: TrackedMetaCloudAdapter };
});

vi.mock("~/env", () => ({
  env: {
    META_APP_SECRET: "test-e2e-secret",
    META_VERIFY_TOKEN: "test-verify-token",
    NODE_ENV: "production",
    WEBHOOK_RATE_LIMIT_MAX: 120,
    WEBHOOK_RATE_LIMIT_WINDOW_MS: 60000,
    OUTBOX_MAX_RETRIES: 5,
    OUTBOX_BACKOFF_MAX_MS: 30000,
  },
}));

// ─── Helpers ───

function generateSignature(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function makeMetaPayload(
  messages: Array<Record<string, unknown>>,
  phoneNumberId = "e2e-phone-id",
) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA_E2E",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "33612345678",
            phone_number_id: phoneNumberId,
          },
          messages,
          contacts: [{ profile: { name: "E2E Client" }, wa_id: "33698765432" }],
        },
        field: "messages",
      }],
    }],
  };
}

// ─── Test Suite ───

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)(
  "Meta WhatsApp E2E Integration",
  () => {
    let testTenantId: string;
    let db: typeof import("~/server/db").db;
    let POST: typeof import("~/app/api/webhooks/meta/route").POST;
    let processOutboxBatch: typeof import("~/server/workers/outbox-sender").processOutboxBatch;
    let writeToOutbox: typeof import("~/server/messaging/outbox").writeToOutbox;

    beforeAll(async () => {
      const dbMod = await import("~/server/db");
      db = dbMod.db;
      const routeMod = await import("~/app/api/webhooks/meta/route");
      POST = routeMod.POST;
      const outboxSenderMod = await import("~/server/workers/outbox-sender");
      processOutboxBatch = outboxSenderMod.processOutboxBatch;
      const outboxMod = await import("~/server/messaging/outbox");
      writeToOutbox = outboxMod.writeToOutbox;

      const tenant = await db.tenant.create({
        data: {
          name: "Test Tenant Meta E2E",
          metaPhoneNumberId: "e2e-phone-id",
          metaWabaId: "e2e-waba-id",
          metaAccessToken: "e2e-access-token",
        },
      });
      testTenantId = tenant.id;
    });

    afterAll(async () => {
      if (!db || !testTenantId) return;
      await db.messageIn.deleteMany({ where: { tenantId: testTenantId } });
      // Also clean messageIn with null tenantId from this test run (none expected, safety net)
      await db.messageOut.deleteMany({ where: { tenantId: testTenantId } });
      await db.deadLetterJob.deleteMany({ where: { tenantId: testTenantId } });
      await db.tenant.delete({ where: { id: testTenantId } });
    });

    // M3 fix: nettoyage DB entre chaque test pour eviter les effets de bord
    afterEach(async () => {
      if (!db || !testTenantId) return;
      await db.messageIn.deleteMany({ where: { tenantId: testTenantId } });
      await db.messageOut.deleteMany({ where: { tenantId: testTenantId } });
    });

    beforeEach(() => {
      vi.clearAllMocks();
      capturedAdapterCtorArgs.calls = []; // Reset tracking constructeur
    });

    async function postWebhook(body: string, signature?: string) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (signature) headers["X-Hub-Signature-256"] = signature;
      return POST(new Request("http://localhost:3000/api/webhooks/meta", {
        method: "POST",
        headers,
        body,
      }));
    }

    // ─── AC#1: Inbound single message ───

    it("AC#1 — POST webhook → messageIn en DB → job enqueue → correlationId UUID", async () => {
      const payload = makeMetaPayload([
        { from: "33698765432", id: "wamid.e2e-ac1", timestamp: "1708300800", type: "text", text: { body: "A12" } },
      ]);
      const bodyText = JSON.stringify(payload);
      const sig = generateSignature(bodyText, "test-e2e-secret");

      const resp = await postWebhook(bodyText, sig);
      expect(resp.status).toBe(200);

      const messageIn = await db.messageIn.findFirst({
        where: { tenantId: testTenantId, providerMessageId: "wamid.e2e-ac1" },
      });
      expect(messageIn).toBeDefined();
      expect(messageIn!.from).toBe("+33698765432");
      expect(messageIn!.body).toBe("A12");
      expect(messageIn!.tenantId).toBe(testTenantId);

      // correlationId must be the wamid (native provider message ID)
      expect(messageIn!.correlationId).toBe("wamid.e2e-ac1");

      expect(mockQueueAdd).toHaveBeenCalledTimes(1);
      // L1 fix: le meme correlationId doit etre present dans le record DB ET dans le payload BullMQ
      expect(mockQueueAdd).toHaveBeenCalledWith(
        "process-inbound",
        expect.objectContaining({
          tenantId: testTenantId,
          providerMessageId: "wamid.e2e-ac1",
          from: "+33698765432",
          body: "A12",
          correlationId: messageIn!.correlationId,
        }),
        expect.objectContaining({ jobId: `${testTenantId}-wamid.e2e-ac1` }),
      );
    });

    // ─── AC#2: Outbound send success ───

    it("AC#2 — messageOut pending → processOutboxBatch → sent + providerMessageId", async () => {
      const { MetaCloudAdapter } = await import("~/server/messaging/providers/meta/adapter");
      const sendSpy = vi.spyOn(MetaCloudAdapter.prototype, "send").mockResolvedValue({
        success: true,
        providerMessageId: "wamid.e2e-outbound-success",
      });

      try {
        const correlationId = `corr-e2e-ac2-${Date.now()}`;
        await writeToOutbox({
          tenantId: testTenantId,
          to: "+33612345678",
          body: "Test outbound Meta E2E",
          correlationId,
        });

        // H1 fix: batchSize > 1 pour traiter le bon message meme si d'autres pending existent en DB
        await processOutboxBatch(10);

        const messageOut = await db.messageOut.findFirst({
          where: { tenantId: testTenantId, correlationId },
        });
        expect(messageOut).toBeDefined();
        expect(messageOut!.status).toBe("sent");
        expect(messageOut!.providerMessageId).toBe("wamid.e2e-outbound-success");

        // Verify send() called with correct OutboundMessage params
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: testTenantId,
            to: "+33612345678",
            body: "Test outbound Meta E2E",
          }),
        );

        // H2 fix: verifier que MetaCloudAdapter a ete instancie avec les vraies
        // credentials Meta du tenant depuis la DB (phoneNumberId + accessToken)
        const outboundCtorCall = capturedAdapterCtorArgs.calls.find(
          ([phoneNumberId]) => phoneNumberId === "e2e-phone-id",
        );
        expect(outboundCtorCall).toBeDefined();
        expect(outboundCtorCall).toEqual(["e2e-phone-id", "e2e-access-token"]);
      } finally {
        sendSpy.mockRestore();
      }
    });

    // ─── AC#3: Batch 3 messages ───

    it("AC#3 — POST batch 3 messages → 3 messageIn en DB → 3 jobs distincts", async () => {
      const payload = makeMetaPayload([
        { from: "33600000001", id: "wamid.e2e-batch-1", timestamp: "1708300800", type: "text", text: { body: "Msg1" } },
        { from: "33600000002", id: "wamid.e2e-batch-2", timestamp: "1708300801", type: "text", text: { body: "Msg2" } },
        { from: "33600000003", id: "wamid.e2e-batch-3", timestamp: "1708300802", type: "text", text: { body: "Msg3" } },
      ]);
      const bodyText = JSON.stringify(payload);
      const sig = generateSignature(bodyText, "test-e2e-secret");

      const resp = await postWebhook(bodyText, sig);
      expect(resp.status).toBe(200);

      const messagesIn = await db.messageIn.findMany({
        where: {
          tenantId: testTenantId,
          providerMessageId: { in: ["wamid.e2e-batch-1", "wamid.e2e-batch-2", "wamid.e2e-batch-3"] },
        },
      });
      expect(messagesIn).toHaveLength(3);

      // correlationIds must match the wamids of each message
      const msgById = Object.fromEntries(messagesIn.map((m) => [m.providerMessageId, m]));
      expect(msgById["wamid.e2e-batch-1"]!.correlationId).toBe("wamid.e2e-batch-1");
      expect(msgById["wamid.e2e-batch-2"]!.correlationId).toBe("wamid.e2e-batch-2");
      expect(msgById["wamid.e2e-batch-3"]!.correlationId).toBe("wamid.e2e-batch-3");

      // M2 fix: verifier le format `+` prefix du champ `from` et la valeur `body` pour chaque message
      expect(msgById["wamid.e2e-batch-1"]!.from).toBe("+33600000001");
      expect(msgById["wamid.e2e-batch-1"]!.body).toBe("Msg1");
      expect(msgById["wamid.e2e-batch-2"]!.from).toBe("+33600000002");
      expect(msgById["wamid.e2e-batch-2"]!.body).toBe("Msg2");
      expect(msgById["wamid.e2e-batch-3"]!.from).toBe("+33600000003");
      expect(msgById["wamid.e2e-batch-3"]!.body).toBe("Msg3");

      expect(mockQueueAdd).toHaveBeenCalledTimes(3);
    });

    // ─── AC#4: Idempotence ───

    it("AC#4 — doublon rejete → 0 nouveau messageIn, 0 job, log idempotent_ignored, reponse 200", async () => {
      // Pre-insert messageIn to simulate already-processed message
      const existingMessage = await db.messageIn.create({
        data: {
          tenantId: testTenantId,
          providerMessageId: "wamid.e2e-duplicate",
          from: "+33698765432",
          body: "Already exists",
          correlationId: crypto.randomUUID(),
        },
      });

      const countBefore = await db.messageIn.count({
        where: { tenantId: testTenantId },
      });

      const payload = makeMetaPayload([
        { from: "33698765432", id: "wamid.e2e-duplicate", timestamp: "1708300800", type: "text", text: { body: "Already exists" } },
      ]);
      const bodyText = JSON.stringify(payload);
      const sig = generateSignature(bodyText, "test-e2e-secret");

      const resp = await postWebhook(bodyText, sig);
      expect(resp.status).toBe(200);

      // 0 new messageIn
      const countAfter = await db.messageIn.count({
        where: { tenantId: testTenantId },
      });
      expect(countAfter).toBe(countBefore);

      // 0 job enqueued
      expect(mockQueueAdd).not.toHaveBeenCalled();

      // idempotent_ignored logged
      const { logIdempotentIgnored } = await import("~/server/events/eventLog");
      expect(logIdempotentIgnored).toHaveBeenCalledWith(
        testTenantId,
        existingMessage.correlationId,
        "wamid.e2e-duplicate",
      );
    });

    // ─── AC#5: Tenant sans config Meta ───

    it("AC#5 — tenant sans config Meta → failed + lastError meta_config_missing + DLQ after MAX_RETRIES", async () => {
      const tenantNoMeta = await db.tenant.create({
        data: { name: "Test Tenant No Meta Config E2E" },
      });

      try {
        const correlationId = `corr-e2e-ac5-${Date.now()}`;
        await writeToOutbox({
          tenantId: tenantNoMeta.id,
          to: "+33612345678",
          body: "Should fail — no Meta config",
          correlationId,
        });

        const MAX_RETRIES = 5;
        for (let i = 0; i < MAX_RETRIES; i++) {
          if (i > 0) {
            // Reset nextAttemptAt to allow immediate retry
            await db.messageOut.updateMany({
              where: { tenantId: tenantNoMeta.id, correlationId, status: "failed" },
              data: { nextAttemptAt: new Date(0) },
            });
          }
          // H1 fix: batchSize > 1 pour traiter le bon message meme si d'autres pending existent en DB
          await processOutboxBatch(10);
        }

        // Verify status failed + lastError
        const messageOut = await db.messageOut.findFirst({
          where: { tenantId: tenantNoMeta.id, correlationId },
        });
        expect(messageOut).toBeDefined();
        expect(messageOut!.status).toBe("failed");
        expect(messageOut!.lastError).toBe("meta_config_missing");

        // Verify DLQ entry after MAX_RETRIES
        const dlq = await db.deadLetterJob.findFirst({
          where: { tenantId: tenantNoMeta.id, jobType: "message_out" },
        });
        expect(dlq).toBeDefined();
        expect(dlq!.attempts).toBe(MAX_RETRIES);
        expect(dlq!.errorMessage).toContain("meta_config_missing");
      } finally {
        await db.messageOut.deleteMany({ where: { tenantId: tenantNoMeta.id } });
        await db.deadLetterJob.deleteMany({ where: { tenantId: tenantNoMeta.id } });
        await db.tenant.delete({ where: { id: tenantNoMeta.id } });
      }
    });

    // ─── AC#6: Media image inbound ───

    it("AC#6 — POST image Meta → messageIn avec mediaUrl meta-media://{media_id}", async () => {
      const payload = makeMetaPayload([
        {
          from: "33698765432",
          id: "wamid.e2e-image",
          timestamp: "1708300800",
          type: "image",
          image: { mime_type: "image/jpeg", sha256: "abc123hash", id: "img_e2e_001" },
        },
      ]);
      const bodyText = JSON.stringify(payload);
      const sig = generateSignature(bodyText, "test-e2e-secret");

      const resp = await postWebhook(bodyText, sig);
      expect(resp.status).toBe(200);

      const messageIn = await db.messageIn.findFirst({
        where: { tenantId: testTenantId, providerMessageId: "wamid.e2e-image" },
      });
      expect(messageIn).toBeDefined();
      expect(messageIn!.mediaUrl).toBe("meta-media://img_e2e_001");
    });
  },
);
