import { ORDER_STATUS_TEMPLATE_BODY } from "~/lib/whatsapp-template";
/**
 * Tests d'intégration pour le worker outbox-sender (Story 2.4, 10.4, 11.1)
 *
 * - processOutboundMessage avec message réel → envoi (simulé) Meta réussi
 * - Échec Meta → status failed (pg-boss gère retries et DLQ)
 *
 * Nécessite DATABASE_URL. MetaCloudAdapter est mocké (pas d'appel réel).
 * Pour exécuter : RUN_INTEGRATION_TESTS=true pnpm test -- outbox-sender.integration.test.ts
 *
 * Import dynamique de db/processors pour ne pas déclencher la validation env quand le test est skip.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const mockSend = vi.fn();
const mockSendTemplate = vi.fn();

vi.mock("~/server/messaging/providers/meta/adapter", () => ({
  MetaCloudAdapter: class {
    send = mockSend;
    sendTemplate = mockSendTemplate;
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logMessageSent: vi.fn().mockResolvedValue(undefined),
  logMessageBlockedOptOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("~/server/messaging/optout", () => ({
  checkOptOut: vi.fn().mockResolvedValue(false),
}));

vi.mock("~/server/media/r2-signed-url", () => ({
  generateSignedR2Url: vi.fn().mockResolvedValue(null),
}));

vi.mock("~/server/workers/queues", () => ({
  boss: { send: vi.fn(), work: vi.fn() },
  QUEUE: { OUTBOX_SEND: "outbox-send", OUTBOX_DLQ: "outbox-dlq" },
}));

// Chaque test enchaîne des allers-retours vers une base distante ; le défaut
// de 5 s de Vitest est calibré pour des tests en mémoire.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)(
  "outbox-sender integration (pg-boss)",
  () => {
    let testTenantId: string;
    let db: typeof import("~/server/db").db;
    let processOutboundMessage: typeof import("~/server/workers/outbox-sender").processOutboundMessage;

    beforeAll(async () => {
      const dbMod = await import("~/server/db");
      db = dbMod.db;
      const osMod = await import("~/server/workers/outbox-sender");
      processOutboundMessage = osMod.processOutboundMessage;

      const tenant = await db.tenant.create({
        data: {
          assistantEnabled: true, name: "Test Tenant Outbox Integration",
          metaPhoneNumberId: "integration-test-phone-id",
          metaAccessToken: "integration-test-access-token",
        },
      });
      testTenantId = tenant.id;
      await db.messageIn.createMany({ data: ["+33612345678", "+33698765432"].map(phone => ({
        tenantId: testTenantId, from: phone, providerMessageId: `incoming-${phone}`,
        correlationId: `incoming-${phone}`, providerSentAt: new Date(), body: "Bonjour",
      })) });
    });

    afterAll(async () => {
      if (!db || !testTenantId) return;
      await db.messageOut.deleteMany({ where: { tenantId: testTenantId } });
      await db.messageIn.deleteMany({ where: { tenantId: testTenantId } });
      await db.tenant.delete({ where: { id: testTenantId } });
    });

    beforeEach(() => {
      vi.clearAllMocks();
      mockSend.mockReset();
    });

    it("processOutboundMessage with real DB message → Meta send success (mock)", async () => {
      const correlationId = `corr-int-success-${Date.now()}`;

      const messageOut = await db.messageOut.create({
        data: {
          tenantId: testTenantId,
          to: "+33612345678",
          body: "Integration test message",
          status: "pending",
          attempts: 0,
          correlationId,
        },
      });

      mockSend.mockResolvedValue({
        success: true,
        providerMessageId: "SM-INTEGRATION-SUCCESS",
      });

      const result = await processOutboundMessage(messageOut);
      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe("SM-INTEGRATION-SUCCESS");

      const updated = await db.messageOut.findUnique({
        where: { id: messageOut.id },
      });
      expect(updated!.status).toBe("sent");
      expect(updated!.providerMessageId).toBe("SM-INTEGRATION-SUCCESS");
    });

    it("a delayed job is blocked based on the original inbound timestamp", async () => {
      const phone = "+33611223344";
      await db.messageIn.create({ data: {
        tenantId: testTenantId, from: phone, providerMessageId: "old-incoming",
        correlationId: "old-incoming", body: "Bonjour",
        providerSentAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      } });
      const message = await db.messageOut.create({ data: {
        tenantId: testTenantId, to: phone, status: "pending", body: "Rappel retardé", correlationId: "late",
      } });
      await processOutboundMessage(message);
      expect(mockSend).not.toHaveBeenCalled();
      expect(await db.messageOut.findUnique({ where: { id: message.id } })).toMatchObject({ status: "blocked", lastError: "whatsapp_window_closed" });
    });

    it("uses stored consent and a checked template for a late order update", async () => {
      const phone = "+33655443322";
      await db.tenant.update({ where: { id: testTenantId }, data: {
        hasNotificationsOutside24h: true, metaWabaId: "waba-test",
        whatsappTemplateName: "suivi", whatsappTemplateLanguage: "fr",
      } });
      await db.messagingConsent.create({ data: { tenantId: testTenantId, phone, scope: "order_updates", sourceMessageId: "wamid.consent" } });
      const message = await db.messageOut.create({ data: {
        tenantId: testTenantId, to: phone, status: "pending", body: "Commande livrée", correlationId: "late-template",
        notificationContext: { kind: "order_status", orderNumber: "CMD-42", status: "delivered" },
      } });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{
        name: "suivi", language: "fr", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: ORDER_STATUS_TEMPLATE_BODY }],
      }] }) }));
      mockSendTemplate.mockResolvedValue({ success: true, providerMessageId: "wamid.late-template" });
      try {
        await processOutboundMessage(message);
        expect(mockSend).not.toHaveBeenCalled();
        expect(mockSendTemplate).toHaveBeenCalledWith(expect.objectContaining({ to: phone }), "suivi", ["CMD-42", "livrée"], "fr");
        expect(await db.messageOut.findUnique({ where: { id: message.id } })).toMatchObject({ status: "sent" });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("Meta failure → status failed (pg-boss handles retry)", async () => {
      const correlationId = `corr-int-fail-${Date.now()}`;

      const messageOut = await db.messageOut.create({
        data: {
          tenantId: testTenantId,
          to: "+33698765432",
          body: "Message that will fail",
          status: "pending",
          attempts: 0,
          correlationId,
        },
      });

      mockSend.mockResolvedValue({
        success: false,
        error: "Meta API error (simulated)",
      });

      const result = await processOutboundMessage(messageOut);
      expect(result.success).toBe(false);

      const updated = await db.messageOut.findUnique({
        where: { id: messageOut.id },
      });
      expect(updated!.status).toBe("failed");
      expect(updated!.attempts).toBe(1);
      expect(updated!.lastError).toContain("Meta API error");
    });
  },
);
