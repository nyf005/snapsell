import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizePhoneNumber,
  determineMessageType,
  processWebhookJob,
  isStopMessage,
  isLiveSignal,
} from "./webhook-processor";
import type { InboundMessage } from "../messaging/types";
import { db } from "~/server/db";
import type { Job } from "bullmq";

// Mock Prisma client
vi.mock("~/server/db", () => ({
  db: {
    sellerPhone: {
      findMany: vi.fn(),
    },
    optOut: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock queues to avoid env validation
vi.mock("./queues", () => ({
  webhookProcessingQueue: {
    opts: {
      connection: {},
    },
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logOptOutRecorded: vi.fn(),
  logLiveSessionCreated: vi.fn(),
}));

vi.mock("~/server/live-session/service", () => ({
  getOrCreateCurrentSession: vi.fn(),
}));

describe("webhook-processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isStopMessage", () => {
    it("should return true for 'stop' (case-insensitive)", () => {
      expect(isStopMessage("stop")).toBe(true);
      expect(isStopMessage("STOP")).toBe(true);
      expect(isStopMessage("  Stop  ")).toBe(true);
    });

    it("should return true for 'arrêt' and 'arret'", () => {
      expect(isStopMessage("arrêt")).toBe(true);
      expect(isStopMessage("arret")).toBe(true);
    });

    it("should return true for unsubscribe / optout", () => {
      expect(isStopMessage("unsubscribe")).toBe(true);
      expect(isStopMessage("optout")).toBe(true);
      expect(isStopMessage("opt-out")).toBe(true);
    });

    it("should return false for non-STOP text", () => {
      expect(isStopMessage("hello")).toBe(false);
      expect(isStopMessage("stoppe")).toBe(false);
      expect(isStopMessage("")).toBe(false);
    });

    it("should accept trailing punctuation (stop., STOP!)", () => {
      expect(isStopMessage("stop.")).toBe(true);
      expect(isStopMessage("STOP!")).toBe(true);
      expect(isStopMessage("  arrêt.  ")).toBe(true);
    });
  });

  describe("isLiveSignal", () => {
    it("should return true for seller regardless of body", () => {
      expect(isLiveSignal("seller", "hello")).toBe(true);
      expect(isLiveSignal("seller", "A12")).toBe(true);
      expect(isLiveSignal("seller", "  ")).toBe(false); // empty trimmed
    });

    it("should return true for client when body matches code pattern (letter(s) + digit(s))", () => {
      expect(isLiveSignal("client", "A12")).toBe(true);
      expect(isLiveSignal("client", "B7")).toBe(true);
      expect(isLiveSignal("client", "AB123")).toBe(true);
    });

    it("should return false for client when body does not match code pattern", () => {
      expect(isLiveSignal("client", "hello")).toBe(false);
      expect(isLiveSignal("client", "salut")).toBe(false);
      expect(isLiveSignal("client", "12A")).toBe(false); // digits then letter
    });

    it("should return false for STOP message", () => {
      expect(isLiveSignal("client", "stop")).toBe(false);
      expect(isLiveSignal("client", "STOP")).toBe(false);
    });

    it("should return false for empty or whitespace body", () => {
      expect(isLiveSignal("seller", "")).toBe(false);
      expect(isLiveSignal("client", "   ")).toBe(false);
    });
  });

  describe("normalizePhoneNumber", () => {
    it("should remove 'whatsapp:' prefix", () => {
      expect(normalizePhoneNumber("whatsapp:+33612345678")).toBe("+33612345678");
    });

    it("should handle phone number without prefix", () => {
      expect(normalizePhoneNumber("+33612345678")).toBe("+33612345678");
    });

    it("should handle case-insensitive prefix", () => {
      expect(normalizePhoneNumber("WHATSAPP:+33612345678")).toBe("+33612345678");
      expect(normalizePhoneNumber("WhatsApp:+33612345678")).toBe("+33612345678");
    });

    it("should not remove 'whatsapp:' if not at start", () => {
      expect(normalizePhoneNumber("prefix-whatsapp:+33612345678")).toBe(
        "prefix-whatsapp:+33612345678",
      );
    });
  });

  describe("determineMessageType", () => {
    it("should return 'seller' when from matches seller_phone", async () => {
      const tenantId = "tenant-123";
      const sellerPhoneNumber = "+33612345678";
      const from = `whatsapp:${sellerPhoneNumber}`;

      // Mock seller_phone found
      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        {
          id: "seller-phone-1",
          tenantId,
          phoneNumber: sellerPhoneNumber,
          createdAt: new Date(),
        },
      ]);

      const result = await determineMessageType(tenantId, from);

      expect(result).toBe("seller");
      expect(db.sellerPhone.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
        },
      });
    });

    it("should return 'client' when from does not match seller_phone", async () => {
      const tenantId = "tenant-123";
      const clientPhoneNumber = "+33698765432";
      const from = `whatsapp:${clientPhoneNumber}`;

      // Mock seller_phone not found
      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);

      const result = await determineMessageType(tenantId, from);

      expect(result).toBe("client");
      expect(db.sellerPhone.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
        },
      });
    });

    it("should normalize phone number by removing 'whatsapp:' prefix", async () => {
      const tenantId = "tenant-123";
      const phoneNumber = "+33612345678";
      const fromWithPrefix = `whatsapp:${phoneNumber}`;
      const fromWithoutPrefix = phoneNumber;

      // Mock seller_phone found
      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        {
          id: "seller-phone-1",
          tenantId,
          phoneNumber,
          createdAt: new Date(),
        },
      ]);

      // Test avec préfixe
      const result1 = await determineMessageType(tenantId, fromWithPrefix);
      expect(result1).toBe("seller");
      expect(db.sellerPhone.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
        },
      });

      // Test sans préfixe
      vi.clearAllMocks();
      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        {
          id: "seller-phone-1",
          tenantId,
          phoneNumber,
          createdAt: new Date(),
        },
      ]);
      const result2 = await determineMessageType(tenantId, fromWithoutPrefix);
      expect(result2).toBe("seller");
      expect(db.sellerPhone.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
        },
      });
    });

    it("should return 'client' when tenantId is null", async () => {
      const from = "whatsapp:+33612345678";

      const result = await determineMessageType(null, from);

      expect(result).toBe("client");
      // Ne doit pas appeler findMany si tenantId est null
      expect(db.sellerPhone.findMany).not.toHaveBeenCalled();
    });

    it("should handle case-insensitive 'whatsapp:' prefix", async () => {
      const tenantId = "tenant-123";
      const phoneNumber = "+33612345678";
      const fromUpperCase = `WHATSAPP:${phoneNumber}`;
      const fromMixedCase = `WhatsApp:${phoneNumber}`;

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        {
          id: "seller-phone-1",
          tenantId,
          phoneNumber,
          createdAt: new Date(),
        },
      ]);

      // Test avec préfixe majuscule
      const result1 = await determineMessageType(tenantId, fromUpperCase);
      expect(result1).toBe("seller");
      expect(db.sellerPhone.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
        },
      });

      // Test avec préfixe mixed case
      vi.clearAllMocks();
      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        {
          id: "seller-phone-1",
          tenantId,
          phoneNumber,
          createdAt: new Date(),
        },
      ]);
      const result2 = await determineMessageType(tenantId, fromMixedCase);
      expect(result2).toBe("seller");
      expect(db.sellerPhone.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
        },
      });
    });
  });

  describe("processWebhookJob", () => {
    it("should enrich message with messageType and preserve all original fields", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://example.com/media.jpg";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]); // Client

      const job = {
        id: "job-200",
        data: {
          tenantId,
          providerMessageId: "SM200",
          from,
          body: "Je veux réserver",
          mediaUrl,
          correlationId: "corr-200",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result).toMatchObject({
        tenantId,
        providerMessageId: "SM200",
        from,
        body: "Je veux réserver",
        mediaUrl,
        correlationId: "corr-200",
        messageType: "client",
      });
    });

    it("should re-throw errors for BullMQ retry handling", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      // Mock database error
      const dbError = new Error("Database connection failed");
      vi.mocked(db.sellerPhone.findMany).mockRejectedValue(dbError);

      const job = {
        id: "job-300",
        data: {
          tenantId,
          providerMessageId: "SM300",
          from,
          body: "Test",
          correlationId: "corr-300",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await expect(processWebhookJob(job)).rejects.toThrow("Database connection failed");
    });

    it("should create OptOut when client sends STOP (Story 2.5)", async () => {
      const tenantId = "tenant-123";
      const from = "+33698765432";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]); // client
      vi.mocked(db.optOut.findUnique).mockResolvedValue(null); // pas encore d'opt-out
      vi.mocked(db.optOut.create).mockResolvedValue({
        id: "optout-1",
        tenantId,
        phoneNumber: from,
        optedOutAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      const { logOptOutRecorded } = await import("~/server/events/eventLog");
      vi.mocked(logOptOutRecorded).mockResolvedValue();

      const job = {
        id: "job-stop",
        data: {
          tenantId,
          providerMessageId: "SMstop",
          from,
          body: "STOP",
          correlationId: "corr-stop",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(db.optOut.findUnique).toHaveBeenCalledWith({
        where: { tenantId_phoneNumber: { tenantId, phoneNumber: from } },
      });
      expect(db.optOut.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          phoneNumber: from,
          optedOutAt: expect.any(Date),
        },
      });
      expect(logOptOutRecorded).toHaveBeenCalledWith(tenantId, "optout-1", "corr-stop");
    });

    it("should not create duplicate OptOut when client sends STOP twice (idempotence)", async () => {
      const tenantId = "tenant-123";
      const from = "+33698765432";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      vi.mocked(db.optOut.findUnique).mockResolvedValue({
        id: "optout-existing",
        tenantId,
        phoneNumber: from,
        optedOutAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never); // déjà enregistré

      const job = {
        id: "job-stop2",
        data: {
          tenantId,
          providerMessageId: "SMstop2",
          from,
          body: "stop",
          correlationId: "corr-stop2",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(db.optOut.findUnique).toHaveBeenCalledWith({
        where: { tenantId_phoneNumber: { tenantId, phoneNumber: from } },
      });
      expect(db.optOut.create).not.toHaveBeenCalled();
    });

    it("should not create OptOut when client sends STOP but from is invalid E.164 (catch, job succeeds)", async () => {
      const tenantId = "tenant-123";
      const from = "not-valid-e164"; // normalizeAndValidatePhoneNumber will throw

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]); // client
      vi.mocked(db.optOut.findUnique).mockResolvedValue(null);

      const job = {
        id: "job-stop-invalid-from",
        data: {
          tenantId,
          providerMessageId: "SMstop-invalid",
          from,
          body: "STOP",
          correlationId: "corr-stop-invalid",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(db.optOut.create).not.toHaveBeenCalled();
    });

    it("should call getOrCreateCurrentSession and set liveSessionId when seller sends message (Story 2.6)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });

      const job = {
        id: "job-live",
        data: {
          tenantId,
          providerMessageId: "SMlive",
          from,
          body: "hello",
          correlationId: "corr-live",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("seller");
      expect(result.liveSessionId).toBe("live-session-1");
      expect(getOrCreateCurrentSession).toHaveBeenCalledWith(tenantId);
    });

    it("should call logLiveSessionCreated when session is newly created (Story 2.6)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      const { logLiveSessionCreated } = await import("~/server/events/eventLog");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-new",
        status: "active",
        lastActivityAt: new Date(),
        created: true,
      });
      vi.mocked(logLiveSessionCreated).mockResolvedValue();

      const job = {
        id: "job-live-new",
        data: {
          tenantId,
          providerMessageId: "SMlive-new",
          from,
          body: "code",
          correlationId: "corr-live-new",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(logLiveSessionCreated).toHaveBeenCalledWith(tenantId, "live-session-new", "corr-live-new");
    });

    it("should not call getOrCreateCurrentSession when client sends non-code body", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]); // client
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");

      const job = {
        id: "job-client-hello",
        data: {
          tenantId,
          providerMessageId: "SMhello",
          from,
          body: "salut",
          correlationId: "corr-hello",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(result.liveSessionId).toBeUndefined();
      expect(getOrCreateCurrentSession).not.toHaveBeenCalled();
    });

    it("should call getOrCreateCurrentSession when client sends code-like body (A12)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]); // client
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
        created: true,
      });

      const job = {
        id: "job-client-code",
        data: {
          tenantId,
          providerMessageId: "SMcode",
          from,
          body: "A12",
          correlationId: "corr-code",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(result.liveSessionId).toBe("live-session-client");
      expect(getOrCreateCurrentSession).toHaveBeenCalledWith(tenantId);
    });
  });
});
