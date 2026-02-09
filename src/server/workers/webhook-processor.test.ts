import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizePhoneNumber,
  determineMessageType,
  processWebhookJob,
  isStopMessage,
  isLiveSignal,
  parseCreateItemIntent,
  parseClientCodeIntent,
  isConfirmOui,
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
    tenant: {
      findUnique: vi.fn(),
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
  logLiveItemCreated: vi.fn(),
  logLiveItemDuplicateRejected: vi.fn(),
  logLiveItemPhotoLinked: vi.fn(),
}));

vi.mock("~/server/live-session/service", () => ({
  getOrCreateCurrentSession: vi.fn(),
}));

vi.mock("~/server/live-item/createLiveItem", () => ({
  createLiveItem: vi.fn(),
  messageCodeAlreadyUsed: vi.fn((code: string) => `Code déjà utilisé, choisis un autre ou envoie MODIF ${code} …`),
  messageCodeUnknown: vi.fn((code: string) => `Code inconnu (ex: ${code}). Vérifie et renvoie.`),
  messageCodeUnknownSuggestion: vi.fn((code: string) => `Code inconnu. Tu voulais dire ${code} ?`),
  normalizeCode: vi.fn((s: string) => s.trim().toUpperCase()),
}));

vi.mock("~/server/live-item/findLiveItemByCode", () => ({
  findLiveItemByCode: vi.fn().mockResolvedValue({
    id: "item-1",
    code: "A12",
    liveSessionId: "session-1",
    amountCents: 5000,
    quantity: 1,
    availableQty: 1,
    reservedQty: 0,
  }),
}));

vi.mock("~/server/live-item/getLastEditedLiveItemInWindow", () => ({
  getLastEditedLiveItemInWindow: vi.fn(),
}));

vi.mock("~/server/reservation/service", () => ({
  createReservation: vi.fn().mockResolvedValue({
    success: true,
    reservation: { id: "res-1", status: "reserved" },
  }),
  getActiveReservationForClient: vi.fn().mockResolvedValue(null),
  collectAddress: vi.fn(),
}));

vi.mock("~/server/waitlist/addToWaitlist", () => ({
  addToWaitlist: vi.fn().mockResolvedValue({ ok: true, position: 1 }),
}));

vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: vi.fn(),
}));

vi.mock("~/server/media/uploadMediaToLiveItem", () => ({
  uploadMediaAndLinkToLiveItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/order/createOrderFromReservation", () => ({
  createOrderFromReservation: vi.fn(),
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

  describe("parseClientCodeIntent (Story 4.2)", () => {
    it("retourne { code, isTypo: false } pour code strict (A12, B7)", () => {
      expect(parseClientCodeIntent("A12")).toEqual({ code: "A12", isTypo: false });
      expect(parseClientCodeIntent("B7")).toEqual({ code: "B7", isTypo: false });
      expect(parseClientCodeIntent("  A12  ")).toEqual({ code: "A12", isTypo: false });
    });

    it("retourne { code, isTypo: true } pour typo (A12A, B7x)", () => {
      expect(parseClientCodeIntent("A12A")).toEqual({ code: "A12", isTypo: true });
      expect(parseClientCodeIntent("B7x")).toEqual({ code: "B7", isTypo: true });
      expect(parseClientCodeIntent("A12B")).toEqual({ code: "A12", isTypo: true });
    });

    it("retourne null pour non-code", () => {
      expect(parseClientCodeIntent("hello")).toBeNull();
      expect(parseClientCodeIntent("12 rue de la Paix")).toBeNull();
      expect(parseClientCodeIntent("")).toBeNull();
      expect(parseClientCodeIntent("   ")).toBeNull();
    });

    it("utilise la vraie normalisation (trim + uppercase) sans mock normalizeCode", async () => {
      const realCreate = await vi.importActual<typeof import("~/server/live-item/createLiveItem")>(
        "~/server/live-item/createLiveItem",
      );
      const createMod = await import("~/server/live-item/createLiveItem");
      vi.mocked(createMod.normalizeCode).mockImplementation(realCreate.normalizeCode);
      expect(parseClientCodeIntent("  a12  ")).toEqual({ code: "A12", isTypo: false });
      expect(parseClientCodeIntent("a12b")).toEqual({ code: "A12", isTypo: true });
    });
  });

  describe("parseCreateItemIntent (Story 3.2)", () => {
    it("parses code only (A12, B7)", () => {
      expect(parseCreateItemIntent("A12")).toEqual({ code: "A12", quantity: 1 });
      expect(parseCreateItemIntent("B7")).toEqual({ code: "B7", quantity: 1 });
    });

    it("parses code x quantity", () => {
      expect(parseCreateItemIntent("A12 x1")).toEqual({ code: "A12", quantity: 1 });
      expect(parseCreateItemIntent("A12 x 2")).toEqual({ code: "A12", quantity: 2 });
      expect(parseCreateItemIntent("B7 x 10")).toEqual({ code: "B7", quantity: 10 });
    });

    it("returns null for non-code body", () => {
      expect(parseCreateItemIntent("hello")).toBeNull();
      expect(parseCreateItemIntent("MODIF A12")).toBeNull();
      expect(parseCreateItemIntent("")).toBeNull();
      expect(parseCreateItemIntent("   ")).toBeNull();
    });
  });

  describe("isConfirmOui (Story 4.5)", () => {
    it("returns true for 'oui' (case-insensitive, trim)", () => {
      expect(isConfirmOui("oui")).toBe(true);
      expect(isConfirmOui("OUI")).toBe(true);
      expect(isConfirmOui("  Oui  ")).toBe(true);
    });

    it("returns false for non-OUI text", () => {
      expect(isConfirmOui("yes")).toBe(false);
      expect(isConfirmOui("ok")).toBe(false);
      expect(isConfirmOui("A12")).toBe(false);
      expect(isConfirmOui("")).toBe(false);
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

    it("Story 4.1: when client sends non-code body, still gets session (for address/recap flow)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]); // client
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-hello",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });

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
      expect(getOrCreateCurrentSession).toHaveBeenCalledWith(tenantId);
      expect(result.liveSessionId).toBe("live-session-hello");
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

    it("Story 3.3/4.1: when client sends code A12 and item exists, findLiveItemByCode then createReservation, sends Réservé", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { findLiveItemByCode } = await import("~/server/live-item/findLiveItemByCode");
      vi.mocked(findLiveItemByCode).mockResolvedValue({
        id: "item-client-1",
        code: "A12",
        liveSessionId: "live-session-client",
        amountCents: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
      });

      const job = {
        id: "job-client-a12",
        data: {
          tenantId,
          providerMessageId: "SMcode",
          from,
          body: "A12",
          correlationId: "corr-a12",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(findLiveItemByCode).toHaveBeenCalledWith(tenantId, "live-session-client", "A12");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { createReservation } = await import("~/server/reservation/service");
      expect(createReservation).toHaveBeenCalledWith(
        tenantId,
        "live-session-client",
        "item-client-1",
        from,
        "corr-a12",
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          body: "Réservé. Envoie ton adresse.",
          correlationId: "corr-a12",
        }),
      );
    });

    it("Story 4.1: when client sends code and item already exists, findLiveItemByCode then createReservation", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { findLiveItemByCode } = await import("~/server/live-item/findLiveItemByCode");
      vi.mocked(findLiveItemByCode).mockResolvedValue({
        id: "item-existing",
        code: "A12",
        liveSessionId: "live-session-client",
        amountCents: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
      });

      const job = {
        id: "job-client-a12-again",
        data: {
          tenantId,
          providerMessageId: "SMcode2",
          from,
          body: "A12",
          correlationId: "corr-a12-2",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(findLiveItemByCode).toHaveBeenCalledWith(tenantId, "live-session-client", "A12");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { createReservation } = await import("~/server/reservation/service");
      expect(createReservation).toHaveBeenCalledWith(
        tenantId,
        "live-session-client",
        "item-existing",
        from,
        "corr-a12-2",
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({ body: "Réservé. Envoie ton adresse." }),
      );
    });

    it("Story 4.3: when client sends code and item is exhausted (free <= 0), adds to waitlist and sends File #N", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        created: false,
      });
      const { findLiveItemByCode } = await import("~/server/live-item/findLiveItemByCode");
      vi.mocked(findLiveItemByCode).mockResolvedValue({
        id: "item-exhausted",
        code: "A12",
        liveSessionId: "live-session-client",
        amountCents: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 1,
      });
      const { addToWaitlist } = await import("~/server/waitlist/addToWaitlist");
      vi.mocked(addToWaitlist).mockResolvedValue({ ok: true, position: 2 });

      const job = {
        id: "job-exhausted",
        data: {
          tenantId,
          providerMessageId: "SMex",
          from,
          body: "A12",
          correlationId: "corr-ex",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { createReservation } = await import("~/server/reservation/service");
      expect(createReservation).not.toHaveBeenCalled();
      expect(addToWaitlist).toHaveBeenCalledWith(
        tenantId,
        "live-session-client",
        "item-exhausted",
        from,
        "corr-ex",
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Tu es en file #2. On te prévient quand une place se libère.",
          to: from,
          correlationId: "corr-ex",
        }),
      );
    });

    it("Story 4.1: when client sends code and createReservation returns exhausted, sends Épuisé", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        created: false,
      });
      const { findLiveItemByCode } = await import("~/server/live-item/findLiveItemByCode");
      vi.mocked(findLiveItemByCode).mockResolvedValue({
        id: "item-1",
        code: "B7",
        liveSessionId: "live-session-client",
        amountCents: 3000,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0,
      });
      const { createReservation } = await import("~/server/reservation/service");
      vi.mocked(createReservation).mockResolvedValue({ success: false, reason: "exhausted" });

      const job = {
        id: "job-race",
        data: {
          tenantId,
          providerMessageId: "SMrace",
          from,
          body: "B7",
          correlationId: "corr-race",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({ body: "Épuisé.", to: from, correlationId: "corr-race" }),
      );
    });

    it("Story 4.2: client sends valid code A12 but no LiveItem in session → Code inconnu, no create", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { findLiveItemByCode } = await import("~/server/live-item/findLiveItemByCode");
      vi.mocked(findLiveItemByCode).mockResolvedValue(null);

      const job = {
        id: "job-unknown-code",
        data: {
          tenantId,
          providerMessageId: "SMuk",
          from,
          body: "A12",
          correlationId: "corr-uk",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(findLiveItemByCode).toHaveBeenCalledWith(tenantId, "live-session-client", "A12");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { createReservation } = await import("~/server/reservation/service");
      expect(createReservation).not.toHaveBeenCalled();
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Code inconnu (ex: A12). Vérifie et renvoie.",
          to: from,
          correlationId: "corr-uk",
        }),
      );
    });

    it("Story 4.2: client sends typo A12A, no LiveItem A12 in session → Code inconnu (ex: A12)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { findLiveItemByCode } = await import("~/server/live-item/findLiveItemByCode");
      vi.mocked(findLiveItemByCode).mockResolvedValue(null);

      const job = {
        id: "job-typo-no-suggestion",
        data: {
          tenantId,
          providerMessageId: "SMtypo",
          from,
          body: "A12A",
          correlationId: "corr-typo",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(findLiveItemByCode).toHaveBeenCalledWith(tenantId, "live-session-client", "A12");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Code inconnu (ex: A12). Vérifie et renvoie.",
          correlationId: "corr-typo",
        }),
      );
    });

    it("Story 4.2: client sends typo A12A, LiveItem A12 exists → suggestion Tu voulais dire A12 ?", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { findLiveItemByCode } = await import("~/server/live-item/findLiveItemByCode");
      vi.mocked(findLiveItemByCode).mockResolvedValue({
        id: "item-a12",
        code: "A12",
        liveSessionId: "live-session-client",
        amountCents: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
      });
      const { createReservation } = await import("~/server/reservation/service");

      const job = {
        id: "job-typo-suggestion",
        data: {
          tenantId,
          providerMessageId: "SMtypo2",
          from,
          body: "A12A",
          correlationId: "corr-typo2",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(findLiveItemByCode).toHaveBeenCalledWith(tenantId, "live-session-client", "A12");
      expect(createReservation).not.toHaveBeenCalled();
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Code inconnu. Tu voulais dire A12 ?",
          correlationId: "corr-typo2",
        }),
      );
    });

    it("Story 4.2: never reply Épuisé when code does not exist in session", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { findLiveItemByCode } = await import("~/server/live-item/findLiveItemByCode");
      vi.mocked(findLiveItemByCode).mockResolvedValue(null);

      const job = {
        id: "job-no-epuise",
        data: {
          tenantId,
          providerMessageId: "SMno",
          from,
          body: "Z99",
          correlationId: "corr-no",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const outboxCalls = vi.mocked(writeToOutbox).mock.calls;
      const bodies = outboxCalls.map((c) => c[0].body);
      expect(bodies).not.toContain("Épuisé.");
      expect(bodies.some((b) => b.includes("Code inconnu"))).toBe(true);
    });

    it("Story 4.1: when client sends address and has reserved reservation, collects address and sends récap + OUI", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const addressText = "12 rue de la Paix, Cocody";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const {
        getActiveReservationForClient,
        collectAddress,
      } = await import("~/server/reservation/service");
      vi.mocked(getActiveReservationForClient).mockResolvedValue({
        id: "res-1",
        status: "reserved",
        tenantId,
        liveSessionId: "live-session-1",
        liveItemId: "item-1",
        clientPhone: from,
        address: null,
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
        liveItem: {
          id: "item-1",
          code: "A12",
          amountCents: 5000,
          quantity: 1,
          availableQty: 0,
          reservedQty: 1,
          liveSessionId: "live-session-1",
          tenantId,
          mediaStorageKey: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      } as never);
      vi.mocked(collectAddress).mockResolvedValue({
        success: true,
        reservation: {
          id: "res-1",
          liveItem: { code: "A12", amountCents: 5000 },
        },
      });

      const job = {
        id: "job-address",
        data: {
          tenantId,
          providerMessageId: "SMaddr",
          from,
          body: addressText,
          correlationId: "corr-addr",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(result.liveSessionId).toBe("live-session-1");
      expect(getActiveReservationForClient).toHaveBeenCalledWith(
        tenantId,
        "live-session-1",
        from,
      );
      expect(collectAddress).toHaveBeenCalledWith(
        tenantId,
        "live-session-1",
        from,
        addressText,
      );
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          correlationId: "corr-addr",
          body: "Récap : A12 — 50.00 € — Total : 50.00 €. Réponds OUI pour confirmer.",
        }),
      );
    });

    describe("Story 5.1 AC#1: OUI → order SS-XXXX from confirmed reservation", () => {
    it("Story 4.5: when client sends OUI and has address_collected reservation without acompte, creates Order confirmed and sends ack", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        requireDeposit: false,
      } as never);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { getActiveReservationForClient } = await import("~/server/reservation/service");
      vi.mocked(getActiveReservationForClient).mockResolvedValue({
        id: "res-1",
        status: "address_collected",
        tenantId,
        liveSessionId: "live-session-1",
        liveItemId: "item-1",
        clientPhone: from,
        address: "12 rue de la Paix",
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
        liveItem: {
          id: "item-1",
          code: "A12",
          amountCents: 5000,
          quantity: 1,
          availableQty: 0,
          reservedQty: 1,
          liveSessionId: "live-session-1",
          tenantId,
          mediaStorageKey: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      } as never);
      const { createOrderFromReservation } = await import("~/server/order/createOrderFromReservation");
      vi.mocked(createOrderFromReservation).mockResolvedValue({
        success: true,
        order: {
          id: "order-1",
          orderNumber: "SS-0001",
          status: "confirmed",
          depositStatus: "no_deposit",
        },
      });

      const job = {
        id: "job-oui",
        data: {
          tenantId,
          providerMessageId: "SMoui",
          from,
          body: "OUI",
          correlationId: "corr-oui",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(db.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: tenantId },
        select: { requireDeposit: true },
      });
      expect(createOrderFromReservation).toHaveBeenCalledWith(
        tenantId,
        "res-1",
        false,
        from,
        "corr-oui",
      );
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          correlationId: "corr-oui",
          body: "Commande confirmée. Merci !",
        }),
      );
    });

    it("Story 4.5: when client sends OUI with acompte enabled, creates Order confirmed_pending_deposit and sends deposit message + ack", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        requireDeposit: true,
      } as never);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { getActiveReservationForClient } = await import("~/server/reservation/service");
      vi.mocked(getActiveReservationForClient).mockResolvedValue({
        id: "res-1",
        status: "address_collected",
        tenantId,
        liveSessionId: "live-session-1",
        liveItemId: "item-1",
        clientPhone: from,
        address: "12 rue de la Paix",
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
        liveItem: {
          id: "item-1",
          code: "A12",
          amountCents: 5000,
          quantity: 1,
          availableQty: 0,
          reservedQty: 1,
          liveSessionId: "live-session-1",
          tenantId,
          mediaStorageKey: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      } as never);
      const { createOrderFromReservation } = await import("~/server/order/createOrderFromReservation");
      vi.mocked(createOrderFromReservation).mockResolvedValue({
        success: true,
        order: {
          id: "order-1",
          orderNumber: "SS-0001",
          status: "confirmed_pending_deposit",
          depositStatus: "deposit_pending",
        },
      });

      const job = {
        id: "job-oui",
        data: {
          tenantId,
          providerMessageId: "SMoui",
          from,
          body: "  oui  ",
          correlationId: "corr-oui",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(createOrderFromReservation).toHaveBeenCalledWith(
        tenantId,
        "res-1",
        true,
        from,
        "corr-oui",
      );
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          correlationId: "corr-oui",
          body: "Commande enregistrée.",
        }),
      );
    });

    it("Story 4.5: idempotence — double OUI for same reservation; createOrderFromReservation called twice, returns existing order on second call", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const reservationAddressCollected = {
        id: "res-1",
        status: "address_collected" as const,
        tenantId,
        liveSessionId: "live-session-1",
        liveItemId: "item-1",
        clientPhone: from,
        address: "12 rue de la Paix",
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
        liveItem: {
          id: "item-1",
          code: "A12",
          amountCents: 5000,
          quantity: 1,
          availableQty: 0,
          reservedQty: 1,
          liveSessionId: "live-session-1",
          tenantId,
          mediaStorageKey: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        requireDeposit: false,
      } as never);
      const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
      vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
        created: false,
      });
      const { getActiveReservationForClient } = await import("~/server/reservation/service");
      vi.mocked(getActiveReservationForClient).mockResolvedValue(reservationAddressCollected as never);
      const { createOrderFromReservation } = await import("~/server/order/createOrderFromReservation");
      vi.mocked(createOrderFromReservation)
        .mockResolvedValueOnce({
          success: true,
          order: {
            id: "order-1",
            orderNumber: "SS-0001",
            status: "confirmed",
            depositStatus: "no_deposit",
          },
        })
        .mockResolvedValueOnce({
          success: true,
          order: {
            id: "order-1",
            orderNumber: "SS-0001",
            status: "confirmed",
            depositStatus: "no_deposit",
          },
        });

      const job1 = {
        id: "job-oui-1",
        data: {
          tenantId,
          providerMessageId: "SMoui1",
          from,
          body: "OUI",
          correlationId: "corr-oui",
        } as InboundMessage,
      } as Job<InboundMessage>;
      const job2 = {
        id: "job-oui-2",
        data: {
          tenantId,
          providerMessageId: "SMoui2",
          from,
          body: "oui",
          correlationId: "corr-oui",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job1);
      await processWebhookJob(job2);

      expect(createOrderFromReservation).toHaveBeenCalledTimes(2);
      expect(createOrderFromReservation).toHaveBeenNthCalledWith(
        1,
        tenantId,
        "res-1",
        false,
        from,
        "corr-oui",
      );
      expect(createOrderFromReservation).toHaveBeenNthCalledWith(
        2,
        tenantId,
        "res-1",
        false,
        from,
        "corr-oui",
      );
    });
    });

    it("should create live item and write confirmation to outbox when seller sends code (Story 3.2)", async () => {
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
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      vi.mocked(createLiveItem).mockResolvedValue({
        success: true,
        liveItem: {
          id: "item-1",
          code: "A12",
          liveSessionId: "live-session-1",
          amountCents: 5000,
          quantity: 1,
          availableQty: 1,
          reservedQty: 0,
        },
      });
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      vi.mocked(writeToOutbox).mockResolvedValue({
        id: "msg-1",
        tenantId,
        to: from,
        body: "Créé : A12 (x1).",
        status: "pending",
        attempts: 0,
        correlationId: "corr-a12",
        createdAt: new Date(),
      });
      const { logLiveItemCreated } = await import("~/server/events/eventLog");
      vi.mocked(logLiveItemCreated).mockResolvedValue();

      const job = {
        id: "job-seller-a12",
        data: {
          tenantId,
          providerMessageId: "SMa12",
          from,
          body: "A12",
          correlationId: "corr-a12",
        } as InboundMessage,
      } as Job<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("seller");
      expect(createLiveItem).toHaveBeenCalledWith(tenantId, "A12", { quantity: 1 });
      expect(writeToOutbox).toHaveBeenCalledWith({
        tenantId,
        to: from,
        body: "Créé : A12 (x1).",
        correlationId: "corr-a12",
      });
      expect(logLiveItemCreated).toHaveBeenCalledWith(tenantId, "item-1", "corr-a12", {
        code: "A12",
        live_session_id: "live-session-1",
        quantity: 1,
        available_qty: 1,
        has_media: false,
      });
    });

    it("should write FR40 duplicate message to outbox when seller re-sends same code (Story 3.2)", async () => {
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
      const { createLiveItem, messageCodeAlreadyUsed } = await import(
        "~/server/live-item/createLiveItem"
      );
      vi.mocked(createLiveItem).mockResolvedValue({ success: false, duplicate: true });
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      vi.mocked(writeToOutbox).mockResolvedValue({
        id: "msg-dup",
        tenantId,
        to: from,
        body: "Code déjà utilisé, choisis un autre ou envoie MODIF A12 …",
        status: "pending",
        attempts: 0,
        correlationId: "corr-dup",
        createdAt: new Date(),
      });
      const { logLiveItemDuplicateRejected } = await import("~/server/events/eventLog");
      vi.mocked(logLiveItemDuplicateRejected).mockResolvedValue();

      const job = {
        id: "job-seller-dup",
        data: {
          tenantId,
          providerMessageId: "SMdup",
          from,
          body: "A12",
          correlationId: "corr-dup",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).toHaveBeenCalledWith(tenantId, "A12", { quantity: 1 });
      expect(messageCodeAlreadyUsed).toHaveBeenCalledWith("A12");
      expect(writeToOutbox).toHaveBeenCalledWith({
        tenantId,
        to: from,
        body: "Code déjà utilisé, choisis un autre ou envoie MODIF A12 …",
        correlationId: "corr-dup",
      });
      expect(logLiveItemDuplicateRejected).toHaveBeenCalledWith(
        tenantId,
        "A12",
        "corr-dup",
      );
    });

    it("Story 3.4: when seller sends A12 x5 with mediaUrl, creates item and calls uploadMediaAndLinkToLiveItem", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://api.twilio.com/2010-04-01/Accounts/ACx/Messages/MMx/Media/MEx";

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
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      vi.mocked(createLiveItem).mockResolvedValue({
        success: true,
        liveItem: {
          id: "item-1",
          code: "A12",
          liveSessionId: "live-session-1",
          amountCents: 5000,
          quantity: 5,
          availableQty: 5,
          reservedQty: 0,
        },
      });
      const { uploadMediaAndLinkToLiveItem } = await import(
        "~/server/media/uploadMediaToLiveItem"
      );

      const job = {
        id: "job-seller-a12-media",
        data: {
          tenantId,
          providerMessageId: "SMa12m",
          from,
          body: "A12 x5",
          mediaUrl,
          correlationId: "corr-a12m",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).toHaveBeenCalledWith(tenantId, "A12", { quantity: 5 });
      expect(uploadMediaAndLinkToLiveItem).toHaveBeenCalledWith(
        tenantId,
        "item-1",
        mediaUrl,
        "corr-a12m",
      );
    });

    it("Story 3.4: vendeur renvoie A12 x3 alors que A12 existe déjà → pas de mise à jour, message FR40", async () => {
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
      const { createLiveItem, messageCodeAlreadyUsed } = await import(
        "~/server/live-item/createLiveItem"
      );
      vi.mocked(createLiveItem).mockResolvedValue({ success: false, duplicate: true });
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      vi.mocked(writeToOutbox).mockResolvedValue({} as never);

      const job = {
        id: "job-dup-a12x3",
        data: {
          tenantId,
          providerMessageId: "SMdup3",
          from,
          body: "A12 x3",
          correlationId: "corr-dup3",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).toHaveBeenCalledWith(tenantId, "A12", { quantity: 3 });
      expect(messageCodeAlreadyUsed).toHaveBeenCalledWith("A12");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          body: expect.stringMatching(/Code déjà utilisé.*MODIF A12/),
          correlationId: "corr-dup3",
        }),
      );
    });

    it("Story 3.5: vendeur envoie photo seule, dernier code créé il y a 1 min → photo liée, réponse « Photo ajoutée à [code]. »", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://api.twilio.com/2010-04-01/Accounts/ACx/Messages/MMx/Media/MEx";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      const { getLastEditedLiveItemInWindow } = await import(
        "~/server/live-item/getLastEditedLiveItemInWindow"
      );
      vi.mocked(getLastEditedLiveItemInWindow).mockResolvedValue({
        id: "item-a12",
        code: "A12",
        liveSessionId: "live-session-1",
      });
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { uploadMediaAndLinkToLiveItem } = await import(
        "~/server/media/uploadMediaToLiveItem"
      );
      const { logLiveItemPhotoLinked } = await import("~/server/events/eventLog");

      const job = {
        id: "job-photo-seule",
        data: {
          tenantId,
          providerMessageId: "SMphoto",
          from,
          body: "",
          mediaUrl,
          correlationId: "corr-photo",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).not.toHaveBeenCalled();
      expect(getLastEditedLiveItemInWindow).toHaveBeenCalledWith(
        tenantId,
        2 * 60 * 1000,
      );
      expect(uploadMediaAndLinkToLiveItem).toHaveBeenCalledWith(
        tenantId,
        "item-a12",
        mediaUrl,
        "corr-photo",
      );
      expect(writeToOutbox).toHaveBeenCalledWith({
        tenantId,
        to: from,
        body: "Photo ajoutée à A12.",
        correlationId: "corr-photo",
      });
      expect(logLiveItemPhotoLinked).toHaveBeenCalledWith(
        tenantId,
        "item-a12",
        "A12",
        "corr-photo",
      );
    });

    it("Story 3.5: vendeur envoie photo seule sans code récent → « Envoie d'abord CODE PRIX »", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://api.twilio.com/2010-04-01/Accounts/ACx/Messages/MMx/Media/MEx";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      const { getLastEditedLiveItemInWindow } = await import(
        "~/server/live-item/getLastEditedLiveItemInWindow"
      );
      vi.mocked(getLastEditedLiveItemInWindow).mockResolvedValue(null);
      const { writeToOutbox } = await import("~/server/messaging/outbox");

      const job = {
        id: "job-photo-sans-code",
        data: {
          tenantId,
          providerMessageId: "SMphoto2",
          from,
          body: "",
          mediaUrl,
          correlationId: "corr-photo2",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).not.toHaveBeenCalled();
      expect(getLastEditedLiveItemInWindow).toHaveBeenCalledWith(
        tenantId,
        2 * 60 * 1000,
      );
      expect(writeToOutbox).toHaveBeenCalledWith({
        tenantId,
        to: from,
        body: "Envoie d'abord CODE PRIX",
        correlationId: "corr-photo2",
      });
    });

    it("Story 3.5: vendeur envoie photo seule, dernier code il y a 3 min → « Envoie d'abord CODE PRIX »", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://api.twilio.com/2010-04-01/Accounts/ACx/Messages/MMx/Media/MEx";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      const { getLastEditedLiveItemInWindow } = await import(
        "~/server/live-item/getLastEditedLiveItemInWindow"
      );
      vi.mocked(getLastEditedLiveItemInWindow).mockResolvedValue(null);
      const { writeToOutbox } = await import("~/server/messaging/outbox");

      const job = {
        id: "job-photo-3min",
        data: {
          tenantId,
          providerMessageId: "SMphoto3",
          from,
          body: "",
          mediaUrl,
          correlationId: "corr-photo3",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).not.toHaveBeenCalled();
      expect(getLastEditedLiveItemInWindow).toHaveBeenCalled();
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Envoie d'abord CODE PRIX",
          correlationId: "corr-photo3",
        }),
      );
    });

    it("Story 3.4 unchanged: message A12 x5 + mediaUrl → item créé et photo liée (pas branche 3.5)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://api.twilio.com/2010-04-01/Accounts/ACx/Messages/MMx/Media/MEx";

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
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      vi.mocked(createLiveItem).mockResolvedValue({
        success: true,
        liveItem: {
          id: "item-1",
          code: "A12",
          liveSessionId: "live-session-1",
          amountCents: 5000,
          quantity: 5,
          availableQty: 5,
          reservedQty: 0,
        },
      });
      const { getLastEditedLiveItemInWindow } = await import(
        "~/server/live-item/getLastEditedLiveItemInWindow"
      );

      const job = {
        id: "job-a12x5-media",
        data: {
          tenantId,
          providerMessageId: "SMa12m",
          from,
          body: "A12 x5",
          mediaUrl,
          correlationId: "corr-a12m",
        } as InboundMessage,
      } as Job<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).toHaveBeenCalledWith(tenantId, "A12", { quantity: 5 });
      expect(getLastEditedLiveItemInWindow).not.toHaveBeenCalled();
    });
  });
});
