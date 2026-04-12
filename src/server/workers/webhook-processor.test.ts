import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizePhoneNumber,
  determineMessageType,
  processWebhookJob,
  isStopMessage,
  shouldReadSession,
  parseCreateItemIntent,
  parseOffLiveCreateItemIntent,
  parseClientCodeIntent,
  isConfirmOui,
} from "./webhook-processor";
import type { InboundMessage } from "../messaging/types";
import { db } from "~/server/db";
import type { PgBossJob } from "./queues";

// Mock Prisma client
vi.mock("~/server/db", () => ({
  db: {
    sellerPhone: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    optOut: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    conversationState: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    catalogueItem: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("~/server/conversation/sellerVariantConfig", () => ({
  SELLER_VARIANT_CONFIG_STATE: "seller_config_variants",
  startSellerVariantConfig: vi.fn(),
  handleSellerVariantConfigReply: vi.fn(),
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
  getCurrentSessionReadOnly: vi.fn(),
}));

vi.mock("~/server/catalogue/findOrderableItemByCode", () => ({
  findOrderableItemByCode: vi.fn(),
}));

vi.mock("~/server/catalogue/findOrCreateOrderableItemByCode", () => ({
  findOrCreateOrderableItemByCode: vi.fn(),
}));

vi.mock("~/server/catalogue/upsertCatalogueItemFromWebhook", () => ({
  upsertCatalogueItemFromWebhook: vi.fn().mockResolvedValue({
    success: true,
    created: true,
    catalogueItemId: "cat-1",
  }),
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
    amount: 5000,
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

vi.mock("~/server/media/uploadMediaToCatalogueItem", () => ({
  uploadMediaToCatalogueItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/media/r2-client", () => ({
  isR2Configured: vi.fn().mockReturnValue(true),
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

  describe("shouldReadSession", () => {
    it("should return true for seller regardless of body", () => {
      expect(shouldReadSession("seller", "hello")).toBe(true);
      expect(shouldReadSession("seller", "A12")).toBe(true);
      expect(shouldReadSession("seller", "  ")).toBe(false); // empty trimmed
    });

    it("should return true for client when body matches code pattern (letter(s) + digit(s))", () => {
      expect(shouldReadSession("client", "A12")).toBe(true);
      expect(shouldReadSession("client", "B7")).toBe(true);
      expect(shouldReadSession("client", "AB123")).toBe(true);
    });

    it("should return false for client when body does not match code pattern", () => {
      expect(shouldReadSession("client", "hello")).toBe(false);
      expect(shouldReadSession("client", "salut")).toBe(false);
      expect(shouldReadSession("client", "12A")).toBe(false); // digits then letter
    });

    it("should return false for STOP message", () => {
      expect(shouldReadSession("client", "stop")).toBe(false);
      expect(shouldReadSession("client", "STOP")).toBe(false);
    });

    it("should return false for empty or whitespace body", () => {
      expect(shouldReadSession("seller", "")).toBe(false);
      expect(shouldReadSession("client", "   ")).toBe(false);
    });
  });

  describe("parseClientCodeIntent (Story 4.2)", () => {
    it("retourne { code, isTypo: false, quantity: 1 } pour code strict (A12, B7)", () => {
      expect(parseClientCodeIntent("A12")).toEqual({ code: "A12", isTypo: false, quantity: 1 });
      expect(parseClientCodeIntent("B7")).toEqual({ code: "B7", isTypo: false, quantity: 1 });
      expect(parseClientCodeIntent("  A12  ")).toEqual({ code: "A12", isTypo: false, quantity: 1 });
    });

    it("retourne { code, isTypo: true, quantity: 1 } pour typo (A12A, B7x)", () => {
      expect(parseClientCodeIntent("A12A")).toEqual({ code: "A12", isTypo: true, quantity: 1 });
      expect(parseClientCodeIntent("B7x")).toEqual({ code: "B7", isTypo: true, quantity: 1 });
      expect(parseClientCodeIntent("A12B")).toEqual({ code: "A12", isTypo: true, quantity: 1 });
    });

    it("retourne null pour non-code", () => {
      expect(parseClientCodeIntent("hello")).toBeNull();
      expect(parseClientCodeIntent("12 rue de la Paix")).toBeNull();
      expect(parseClientCodeIntent("")).toBeNull();
      expect(parseClientCodeIntent("   ")).toBeNull();
    });

    it("utilise la vraie normalisation (trim + uppercase) sans mock normalizeCode", async () => {
      const realCreateLiveItem = await vi.importActual<typeof import("~/server/live-item/createLiveItem")>(
        "~/server/live-item/createLiveItem",
      );
      const createMod = await import("~/server/live-item/createLiveItem");
      vi.mocked(createMod.normalizeCode).mockImplementation(realCreateLiveItem.normalizeCode);
      expect(parseClientCodeIntent("  a12  ")).toEqual({ code: "A12", isTypo: false, quantity: 1 });
      expect(parseClientCodeIntent("a12b")).toEqual({ code: "A12", isTypo: true, quantity: 1 });
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
      expect(parseCreateItemIntent("ajout A12")).toBeNull();
      expect(parseCreateItemIntent("MODIF A12")).toBeNull();
      expect(parseCreateItemIntent("")).toBeNull();
      expect(parseCreateItemIntent("   ")).toBeNull();
    });
  });

  describe("parseOffLiveCreateItemIntent", () => {
    it("parses explicit off-live commands", () => {
      expect(parseOffLiveCreateItemIntent("ajout A12")).toEqual({ code: "A12", quantity: 1 });
      expect(parseOffLiveCreateItemIntent("ajout A12 x1")).toEqual({ code: "A12", quantity: 1 });
      expect(parseOffLiveCreateItemIntent("ajout B7 x 3")).toEqual({ code: "B7", quantity: 3 });
    });

    it("returns null for implicit or invalid off-live commands", () => {
      expect(parseOffLiveCreateItemIntent("A12")).toBeNull();
      expect(parseOffLiveCreateItemIntent("B7 x3")).toBeNull();
      expect(parseOffLiveCreateItemIntent("hello")).toBeNull();
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
      } as PgBossJob<InboundMessage>;

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

    it("should re-throw errors for pg-boss retry handling", async () => {
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
      } as PgBossJob<InboundMessage>;

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
      } as PgBossJob<InboundMessage>;

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
      } as PgBossJob<InboundMessage>;

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
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(db.optOut.create).not.toHaveBeenCalled();
    });

    it("Story 8.3: should read session (not create) when seller sends message", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("seller");
      expect(result.liveSessionId).toBe("live-session-1");
      expect(getCurrentSessionReadOnly).toHaveBeenCalledWith(tenantId);
    });

    it("Story 8.3: should NOT create session when seller sends message without active session", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);

      const job = {
        id: "job-live-new",
        data: {
          tenantId,
          providerMessageId: "SMlive-new",
          from,
          body: "code",
          correlationId: "corr-live-new",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("seller");
      expect(result.liveSessionId).toBeUndefined();
      expect(getCurrentSessionReadOnly).toHaveBeenCalledWith(tenantId);
    });

    it("Story 8.1: when client sends non-code body, uses getCurrentSessionReadOnly (for address/recap flow)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]); // client
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-hello",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(getCurrentSessionReadOnly).toHaveBeenCalledWith(tenantId);
      expect(result.liveSessionId).toBe("live-session-hello");
    });

    it("Story 8.1: should call getCurrentSessionReadOnly when client sends code-like body (A12)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]); // client
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(result.liveSessionId).toBe("live-session-client");
      expect(getCurrentSessionReadOnly).toHaveBeenCalledWith(tenantId);
    });

    it("Story 8.1: when client sends code A12 and catalogue item exists (session active), findOrCreateOrderableItemByCode then createReservation, sends Réservé", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { findOrCreateOrderableItemByCode } = await import("~/server/catalogue/findOrCreateOrderableItemByCode");
      vi.mocked(findOrCreateOrderableItemByCode).mockResolvedValue({
        id: "cat-item-1",
        tenantId,
        code: "A12",
        amount: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
        mediaStorageKey: null,
        origin: "dashboard",
        createdInLive: false, attributes: undefined, hasVariants: false,
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
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(findOrCreateOrderableItemByCode).toHaveBeenCalledWith(tenantId, "A12");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { createReservation } = await import("~/server/reservation/service");
      expect(createReservation).toHaveBeenCalledWith(
        tenantId,
        "live-session-client",
        null,
        "+33612345678",
        "corr-a12",
        { catalogueItemId: "cat-item-1", liveSessionId: "live-session-client", quantity: 1 },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          body: expect.stringContaining("L'article *A12* est réservé pour toi"),
          correlationId: "corr-a12",
        }),
      );
    });

    it("Story 8.1: when client sends code and catalogue item already exists, findOrCreateOrderableItemByCode then createReservation", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { findOrCreateOrderableItemByCode } = await import("~/server/catalogue/findOrCreateOrderableItemByCode");
      vi.mocked(findOrCreateOrderableItemByCode).mockResolvedValue({
        id: "cat-item-existing",
        tenantId,
        code: "A12",
        amount: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
        mediaStorageKey: null,
        origin: "dashboard",
        createdInLive: false, attributes: undefined, hasVariants: false,
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
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(findOrCreateOrderableItemByCode).toHaveBeenCalledWith(tenantId, "A12");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { createReservation } = await import("~/server/reservation/service");
      expect(createReservation).toHaveBeenCalledWith(
        tenantId,
        "live-session-client",
        null,
        "+33612345678",
        "corr-a12-2",
        { catalogueItemId: "cat-item-existing", liveSessionId: "live-session-client", quantity: 1 },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining("L'article *A12* est réservé pour toi") }),
      );
    });

    it("Story 8.1: when client sends code and catalogue item is exhausted (free <= 0), adds to waitlist and sends File #N", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { findOrCreateOrderableItemByCode } = await import("~/server/catalogue/findOrCreateOrderableItemByCode");
      vi.mocked(findOrCreateOrderableItemByCode).mockResolvedValue({
        id: "cat-item-exhausted",
        tenantId,
        code: "A12",
        amount: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 1,
        mediaStorageKey: null,
        origin: "dashboard",
        createdInLive: false, attributes: undefined, hasVariants: false,
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
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { createReservation } = await import("~/server/reservation/service");
      expect(createReservation).not.toHaveBeenCalled();
      // Story 9.1: catalogueItemId passed via options, liveItemId = null, liveSessionId = null
      expect(addToWaitlist).toHaveBeenCalledWith(
        tenantId,
        null,
        null,
        from,
        "corr-ex",
        { table: "catalogue_items", catalogueItemId: "cat-item-exhausted" },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("position #2"),
          to: from,
          correlationId: "corr-ex",
        }),
      );
    });

    it("Story 8.1: when client sends code and createReservation returns exhausted, sends Épuisé", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { findOrCreateOrderableItemByCode } = await import("~/server/catalogue/findOrCreateOrderableItemByCode");
      vi.mocked(findOrCreateOrderableItemByCode).mockResolvedValue({
        id: "cat-item-b7",
        tenantId,
        code: "B7",
        amount: 3000,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0,
        mediaStorageKey: null,
        origin: "dashboard",
        createdInLive: false, attributes: undefined, hasVariants: false,
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
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("vient d'être épuisé"),
          to: from,
          correlationId: "corr-race",
        }),
      );
    });

    it("Story 8.1: client sends valid code A12 but catalogue item not found → Code inconnu, no create", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { findOrCreateOrderableItemByCode } = await import("~/server/catalogue/findOrCreateOrderableItemByCode");
      vi.mocked(findOrCreateOrderableItemByCode).mockResolvedValue(null);

      const job = {
        id: "job-unknown-code",
        data: {
          tenantId,
          providerMessageId: "SMuk",
          from,
          body: "A12",
          correlationId: "corr-uk",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(findOrCreateOrderableItemByCode).toHaveBeenCalledWith(tenantId, "A12");
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

    it("Story 8.1: client sends typo A12A, catalogue item A12 not found → Code inconnu (ex: A12)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { findOrCreateOrderableItemByCode } = await import("~/server/catalogue/findOrCreateOrderableItemByCode");
      vi.mocked(findOrCreateOrderableItemByCode).mockResolvedValue(null);

      const job = {
        id: "job-typo-no-suggestion",
        data: {
          tenantId,
          providerMessageId: "SMtypo",
          from,
          body: "A12A",
          correlationId: "corr-typo",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(findOrCreateOrderableItemByCode).toHaveBeenCalledWith(tenantId, "A12");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Code inconnu (ex: A12). Vérifie et renvoie.",
          correlationId: "corr-typo",
        }),
      );
    });

    it("Story 8.1: client sends typo A12A, catalogue item A12 exists → suggestion Tu voulais dire A12 ?", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { findOrCreateOrderableItemByCode } = await import("~/server/catalogue/findOrCreateOrderableItemByCode");
      vi.mocked(findOrCreateOrderableItemByCode).mockResolvedValue({
        id: "cat-item-a12",
        tenantId,
        code: "A12",
        amount: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
        mediaStorageKey: null,
        origin: "dashboard",
        createdInLive: false, attributes: undefined, hasVariants: false,
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
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(findOrCreateOrderableItemByCode).toHaveBeenCalledWith(tenantId, "A12");
      expect(createReservation).not.toHaveBeenCalled();
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("Tu voulais dire *A12*"),
          interactive: expect.objectContaining({
            type: "buttons",
          }),
          correlationId: "corr-typo2",
        }),
      );
    });

    it("Story 8.1: never reply Épuisé when code does not exist in catalogue", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-client",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { findOrCreateOrderableItemByCode } = await import("~/server/catalogue/findOrCreateOrderableItemByCode");
      vi.mocked(findOrCreateOrderableItemByCode).mockResolvedValue(null);

      const job = {
        id: "job-no-epuise",
        data: {
          tenantId,
          providerMessageId: "SMno",
          from,
          body: "Z99",
          correlationId: "corr-no",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const outboxCalls = vi.mocked(writeToOutbox).mock.calls;
      const bodies = outboxCalls.map((c) => c[0].body);
      expect(bodies).not.toContain("Oh non, cet article vient d'être épuisé 😔");
      expect(bodies.some((b) => b.includes("Code inconnu"))).toBe(true);
    });

    it("Story 8.1: when client sends address and has reserved reservation, collects address and sends récap + OUI", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const addressText = "12 rue de la Paix, Cocody";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
        liveItemId: null,
        catalogueItemId: "cat-item-1",
        clientPhone: from,
        address: null,
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(collectAddress).mockResolvedValue({
        success: true,
        reservation: {
          id: "res-1",
          item: { code: "A12", amount: 5000, quantity: 1 },
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
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("client");
      expect(result.liveSessionId).toBe("live-session-1");
      expect(getActiveReservationForClient).toHaveBeenCalledWith(
        tenantId,
        from,
      );
      expect(collectAddress).toHaveBeenCalledWith(
        tenantId,
        from,
        addressText,
      );
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          correlationId: "corr-addr",
          body: expect.stringContaining("Voici le récap de ta commande"),
          interactive: expect.objectContaining({
            type: "buttons",
          }),
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
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
          amount: 5000,
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
      } as PgBossJob<InboundMessage>;

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
          body: expect.stringContaining("Ta commande est bien enregistrée"),
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
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
          amount: 5000,
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
      } as PgBossJob<InboundMessage>;

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
          body: expect.stringContaining("on a besoin d'un acompte"),
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
          amount: 5000,
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
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
      } as PgBossJob<InboundMessage>;
      const job2 = {
        id: "job-oui-2",
        data: {
          tenantId,
          providerMessageId: "SMoui2",
          from,
          body: "oui",
          correlationId: "corr-oui",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

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
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      vi.mocked(createLiveItem).mockResolvedValue({
        success: true,
        liveItem: {
          id: "item-1",
          code: "A12",
          liveSessionId: "live-session-1",
          amount: 5000,
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
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("seller");
      expect(createLiveItem).toHaveBeenCalledWith(tenantId, "A12", { quantity: 1 });
      expect(writeToOutbox).toHaveBeenCalledWith({
        tenantId,
        to: from,
        body: "✅ *A12* ajouté — 1 en stock",
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
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
      } as PgBossJob<InboundMessage>;

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
      const mediaUrl = "https://example.com/media/test-image.jpg";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      vi.mocked(createLiveItem).mockResolvedValue({
        success: true,
        liveItem: {
          id: "item-1",
          code: "A12",
          liveSessionId: "live-session-1",
          amount: 5000,
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
      } as PgBossJob<InboundMessage>;

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
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
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
      } as PgBossJob<InboundMessage>;

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

    it("Story 3.5: vendeur envoie photo seule → demande d'ajouter le code en légende", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://example.com/media/test-image.jpg";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const { uploadMediaAndLinkToLiveItem } = await import(
        "~/server/media/uploadMediaToLiveItem"
      );

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
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).not.toHaveBeenCalled();
      expect(uploadMediaAndLinkToLiveItem).not.toHaveBeenCalled();
      expect(writeToOutbox).toHaveBeenCalledWith({
        tenantId,
        to: from,
        body: expect.stringContaining("Photo reçue, mais je ne sais pas à quel article la lier"),
        correlationId: "corr-photo",
      });
    });

    it("Story 3.5: vendeur envoie photo seule sans code → même guidage caption/code", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://example.com/media/test-image.jpg";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
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
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).not.toHaveBeenCalled();
      expect(writeToOutbox).toHaveBeenCalledWith({
        tenantId,
        to: from,
        body: expect.stringContaining("Photo reçue, mais je ne sais pas à quel article la lier"),
        correlationId: "corr-photo2",
      });
    });

    it("Story 3.5: vendeur envoie photo seule, même avec ancien contexte → guidage caption/code", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://example.com/media/test-image.jpg";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
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
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).not.toHaveBeenCalled();
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("Photo reçue, mais je ne sais pas à quel article la lier"),
          correlationId: "corr-photo3",
        }),
      );
    });

    it("Story 3.4 unchanged: message A12 x5 + mediaUrl → item créé et photo liée (pas branche 3.5)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const mediaUrl = "https://example.com/media/test-image.jpg";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      vi.mocked(createLiveItem).mockResolvedValue({
        success: true,
        liveItem: {
          id: "item-1",
          code: "A12",
          liveSessionId: "live-session-1",
          amount: 5000,
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
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      expect(createLiveItem).toHaveBeenCalledWith(tenantId, "A12", { quantity: 5 });
      expect(getLastEditedLiveItemInWindow).not.toHaveBeenCalled();
    });

    it("Story 8.2 AC#5: seller sends explicit ajout command without active session → catalogue upsert only, no LiveItem, sends 'Ajouté au catalogue'", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null); // Pas de session active

      const { upsertCatalogueItemFromWebhook } = await import("~/server/catalogue/upsertCatalogueItemFromWebhook");
      vi.mocked(upsertCatalogueItemFromWebhook).mockResolvedValue({
        success: true,
        created: true,
        catalogueItemId: "cat-new-1",
      });

      const { createLiveItem } = await import("~/server/live-item/createLiveItem");
      const { writeToOutbox } = await import("~/server/messaging/outbox");

      const job = {
        id: "job-seller-no-session",
        data: {
          tenantId,
          providerMessageId: "SMnoSession",
          from,
          body: "ajout B7 x3",
          correlationId: "corr-nosession",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("seller");
      expect(result.liveSessionId).toBeUndefined();
      expect(upsertCatalogueItemFromWebhook).toHaveBeenCalledWith(tenantId, "B7", 3, {
        createdInLive: false,
        origin: "seller_whatsapp",
      });
      expect(createLiveItem).not.toHaveBeenCalled();
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          body: "✅ *B7* ajouté au catalogue — 3 en stock",
          correlationId: "corr-nosession",
        }),
      );
    });

    it("seller sends code without active session → no creation, sends off-live instruction", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
      ] as never);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);

      const { upsertCatalogueItemFromWebhook } = await import("~/server/catalogue/upsertCatalogueItemFromWebhook");
      const { writeToOutbox } = await import("~/server/messaging/outbox");

      const job = {
        id: "job-seller-no-session-implicit",
        data: {
          tenantId,
          providerMessageId: "SMnoSessionImplicit",
          from,
          body: "B7 x3",
          correlationId: "corr-nosession-implicit",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      const result = await processWebhookJob(job);

      expect(result.messageType).toBe("seller");
      expect(result.liveSessionId).toBeUndefined();
      expect(upsertCatalogueItemFromWebhook).not.toHaveBeenCalled();
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          body: "Hors live, utilise *ajout A12* ou *ajout A12 x3* pour créer un article.",
          correlationId: "corr-nosession-implicit",
        }),
      );
    });

    describe("Story 9.3: vendeur photo + code → upload catalogue", () => {
      it("AC#1: vendeur photo + code existant → uploadMediaToCatalogueItem fire-and-forget + confirmation 'Photo ajoutée'", async () => {
        const tenantId = "tenant-123";
        const from = "+33612345678";
        const mediaUrl = "https://example.com/media/test-image.jpg";

        vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
          { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
        ] as never);
        const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
        vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null); // Pas de session active

        const { upsertCatalogueItemFromWebhook } = await import(
          "~/server/catalogue/upsertCatalogueItemFromWebhook"
        );
        vi.mocked(upsertCatalogueItemFromWebhook).mockResolvedValue({
          success: true,
          created: false,
          catalogueItemId: "cat-item-a12",
        });

        const { uploadMediaToCatalogueItem } = await import(
          "~/server/media/uploadMediaToCatalogueItem"
        );
        const { logCatalogueItemPhotoLinked } = await import("~/server/events/eventLog");
        const { writeToOutbox } = await import("~/server/messaging/outbox");

        const job = {
          id: "job-photo-cat",
          data: {
            tenantId,
            providerMessageId: "SMphotocat",
            from,
            body: "ajout A12",
            mediaUrl,
            correlationId: "corr-photocat",
          } as InboundMessage,
        } as PgBossJob<InboundMessage>;

        await processWebhookJob(job);

        expect(uploadMediaToCatalogueItem).toHaveBeenCalledWith(
          tenantId,
          "cat-item-a12",
          mediaUrl,
          "corr-photocat",
        );
        expect(logCatalogueItemPhotoLinked).toHaveBeenCalledWith(
          tenantId,
          "cat-item-a12",
          "A12",
          "corr-photocat",
        );
        expect(writeToOutbox).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId,
            to: normalizePhoneNumber(from),
            body: expect.stringContaining("✅ *A12* ajouté au catalogue"),
            interactive: expect.objectContaining({
              type: "buttons",
              buttons: expect.arrayContaining([
                expect.objectContaining({ id: "configure_variants:A12", title: "Variantes" }),
              ]),
            }),
          }),
        );

        const outboxPayload = vi.mocked(writeToOutbox).mock.calls.at(-1)?.[0];
        const variantButton = outboxPayload?.interactive?.type === "buttons"
          ? outboxPayload.interactive.buttons.find((btn) => btn.id === "configure_variants:A12")
          : undefined;
        expect(variantButton?.title.length).toBeLessThanOrEqual(20);
      });

      it("AC#2: vendeur photo + code introuvable (upsert échoue) → message 'Code introuvable'", async () => {
        const tenantId = "tenant-123";
        const from = "+33612345678";
        const mediaUrl = "https://example.com/media/test-image.jpg";

        vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
          { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
        ] as never);
        const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
        vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);

        const { upsertCatalogueItemFromWebhook } = await import(
          "~/server/catalogue/upsertCatalogueItemFromWebhook"
        );
        vi.mocked(upsertCatalogueItemFromWebhook).mockResolvedValue({
          success: false,
          reason: "no_price_for_letter",
        } as never);

        const { uploadMediaToCatalogueItem } = await import(
          "~/server/media/uploadMediaToCatalogueItem"
        );
        const { writeToOutbox } = await import("~/server/messaging/outbox");

        const job = {
          id: "job-photo-unknown",
          data: {
            tenantId,
            providerMessageId: "SMphotounknown",
            from,
            body: "ajout Z99",
            mediaUrl,
            correlationId: "corr-photounknown",
          } as InboundMessage,
        } as PgBossJob<InboundMessage>;

        await processWebhookJob(job);

        expect(uploadMediaToCatalogueItem).not.toHaveBeenCalled();
        expect(writeToOutbox).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId,
            to: from,
            body: expect.stringContaining("Le code *Z99* n'existe pas dans ton catalogue"),
            correlationId: "corr-photounknown",
          }),
        );
      });

      it("AC#3: vendeur photo SANS code (body vide) + session active → guidage caption/code, pas d'upload direct", async () => {
        const tenantId = "tenant-123";
        const from = "+33612345678";
        const mediaUrl = "https://example.com/media/test-image.jpg";

        vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
          { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
        ] as never);

        const { uploadMediaToCatalogueItem } = await import(
          "~/server/media/uploadMediaToCatalogueItem"
        );
        const { uploadMediaAndLinkToLiveItem } = await import(
          "~/server/media/uploadMediaToLiveItem"
        );
        const { writeToOutbox } = await import("~/server/messaging/outbox");

        const job = {
          id: "job-photo-seule-93",
          data: {
            tenantId,
            providerMessageId: "SMphotoseule93",
            from,
            body: "",
            mediaUrl,
            correlationId: "corr-photoseule93",
          } as InboundMessage,
        } as PgBossJob<InboundMessage>;

        await processWebhookJob(job);

        // Story 9.3 n'intervient PAS (pas de code dans body)
        expect(uploadMediaToCatalogueItem).not.toHaveBeenCalled();
        expect(uploadMediaAndLinkToLiveItem).not.toHaveBeenCalled();
        expect(writeToOutbox).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.stringContaining("Photo reçue, mais je ne sais pas à quel article la lier"),
          }),
        );
      });

      it("AC#4: vendeur photo + code + session live active → photo vers CatalogueItem + message consolidé unique", async () => {
        const tenantId = "tenant-123";
        const from = "+33612345678";
        const mediaUrl = "https://example.com/media/test-image.jpg";

        vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
          { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
        ] as never);
        const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
        vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
          id: "live-session-1",
          status: "active",
          lastActivityAt: new Date(),
        createdAt: new Date(),
        });

        const { upsertCatalogueItemFromWebhook } = await import(
          "~/server/catalogue/upsertCatalogueItemFromWebhook"
        );
        vi.mocked(upsertCatalogueItemFromWebhook).mockResolvedValue({
          success: true,
          created: false,
          catalogueItemId: "cat-item-a12",
        });

        const { createLiveItem } = await import("~/server/live-item/createLiveItem");
        vi.mocked(createLiveItem).mockResolvedValue({
          success: true,
          liveItem: {
            id: "item-1",
            code: "A12",
            liveSessionId: "live-session-1",
            amount: 5000,
            quantity: 1,
            availableQty: 1,
            reservedQty: 0,
          },
        });

        const { uploadMediaToCatalogueItem } = await import(
          "~/server/media/uploadMediaToCatalogueItem"
        );
        const { uploadMediaAndLinkToLiveItem } = await import(
          "~/server/media/uploadMediaToLiveItem"
        );
        const { logCatalogueItemPhotoLinked } = await import("~/server/events/eventLog");
        const { writeToOutbox } = await import("~/server/messaging/outbox");

        const job = {
          id: "job-photo-live",
          data: {
            tenantId,
            providerMessageId: "SMphotolive",
            from,
            body: "A12",
            mediaUrl,
            correlationId: "corr-photolive",
          } as InboundMessage,
        } as PgBossJob<InboundMessage>;

        await processWebhookJob(job);

        // Photo → CatalogueItem (persistant, priorité catalogue)
        expect(uploadMediaToCatalogueItem).toHaveBeenCalledWith(
          tenantId,
          "cat-item-a12",
          mediaUrl,
          "corr-photolive",
        );
        expect(logCatalogueItemPhotoLinked).toHaveBeenCalledWith(
          tenantId,
          "cat-item-a12",
          "A12",
          "corr-photolive",
        );
        // M1 fix: UN SEUL message consolidé (pas deux messages séparés)
        expect(writeToOutbox).toHaveBeenCalledTimes(1);
        expect(writeToOutbox).toHaveBeenCalledWith(
          expect.objectContaining({
            body: "✅ *A12* ajouté — 1 en stock 📸",
            correlationId: "corr-photolive",
          }),
        );
        // LiveItem aussi créé + photo LiveItem aussi uploadée (flux existant Story 3.4)
        expect(createLiveItem).toHaveBeenCalledWith(tenantId, "A12", { quantity: 1 });
        expect(uploadMediaAndLinkToLiveItem).toHaveBeenCalledWith(
          tenantId,
          "item-1",
          mediaUrl,
          "corr-photolive",
        );
      });

      it("AC#5: vendeur renvoie photo + même code → nouvelle photo remplace l'ancienne (même clé R2 déterministe)", async () => {
        const tenantId = "tenant-123";
        const from = "+33612345678";
        const mediaUrl = "https://example.com/media/test-image.jpg2";

        vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
          { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
        ] as never);
        const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
        vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);

        const { upsertCatalogueItemFromWebhook } = await import(
          "~/server/catalogue/upsertCatalogueItemFromWebhook"
        );
        vi.mocked(upsertCatalogueItemFromWebhook).mockResolvedValue({
          success: true,
          created: false,
          catalogueItemId: "cat-item-a12",
        });

        const { uploadMediaToCatalogueItem } = await import(
          "~/server/media/uploadMediaToCatalogueItem"
        );

        const job = {
          id: "job-photo-replace",
          data: {
            tenantId,
            providerMessageId: "SMphotoreplace",
            from,
            body: "ajout A12",
            mediaUrl,
            correlationId: "corr-photoreplace",
          } as InboundMessage,
        } as PgBossJob<InboundMessage>;

        await processWebhookJob(job);

        // uploadMediaToCatalogueItem est appelé avec le même catalogueItemId
        // La clé R2 est déterministe (tenants/{tenantId}/catalogue-items/{itemId}/photo)
        // donc la nouvelle photo remplace l'ancienne
        expect(uploadMediaToCatalogueItem).toHaveBeenCalledWith(
          tenantId,
          "cat-item-a12",
          mediaUrl,
          "corr-photoreplace",
        );
      });

      it("AC#6+7: vendeur code sans photo → pas d'upload catalogue photo (flux normal préservé)", async () => {
        const tenantId = "tenant-123";
        const from = "+33612345678";

        vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
          { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
        ] as never);
        const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
        vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);

        const { upsertCatalogueItemFromWebhook } = await import(
          "~/server/catalogue/upsertCatalogueItemFromWebhook"
        );
        vi.mocked(upsertCatalogueItemFromWebhook).mockResolvedValue({
          success: true,
          created: true,
          catalogueItemId: "cat-new",
        });

        const { uploadMediaToCatalogueItem } = await import(
          "~/server/media/uploadMediaToCatalogueItem"
        );
        const { logCatalogueItemPhotoLinked } = await import("~/server/events/eventLog");

        const job = {
          id: "job-no-photo",
          data: {
            tenantId,
            providerMessageId: "SMnophoto",
            from,
            body: "ajout A12 x3",
            // PAS de mediaUrl
            correlationId: "corr-nophoto",
          } as InboundMessage,
        } as PgBossJob<InboundMessage>;

        await processWebhookJob(job);

        expect(uploadMediaToCatalogueItem).not.toHaveBeenCalled();
        expect(logCatalogueItemPhotoLinked).not.toHaveBeenCalled();
      });

      it("H1 fix: vendeur photo + code mais R2 non configuré → pas d'upload ni de confirmation photo", async () => {
        const tenantId = "tenant-123";
        const from = "+33612345678";
        const mediaUrl = "https://example.com/media/test-image.jpg";

        vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
          { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
        ] as never);
        const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
        vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);

        const { upsertCatalogueItemFromWebhook } = await import(
          "~/server/catalogue/upsertCatalogueItemFromWebhook"
        );
        vi.mocked(upsertCatalogueItemFromWebhook).mockResolvedValue({
          success: true,
          created: false,
          catalogueItemId: "cat-item-a12",
        });

        // R2 non configuré
        const { isR2Configured } = await import("~/server/media/r2-client");
        vi.mocked(isR2Configured).mockReturnValue(false);

        const { uploadMediaToCatalogueItem } = await import(
          "~/server/media/uploadMediaToCatalogueItem"
        );
        const { logCatalogueItemPhotoLinked } = await import("~/server/events/eventLog");
        const { writeToOutbox } = await import("~/server/messaging/outbox");

        const job = {
          id: "job-photo-nor2",
          data: {
            tenantId,
            providerMessageId: "SMphotonor2",
            from,
            body: "ajout A12",
            mediaUrl,
            correlationId: "corr-photonor2",
          } as InboundMessage,
        } as PgBossJob<InboundMessage>;

        await processWebhookJob(job);

        // Pas d'upload ni d'event log (R2 non configuré)
        expect(uploadMediaToCatalogueItem).not.toHaveBeenCalled();
        expect(logCatalogueItemPhotoLinked).not.toHaveBeenCalled();
        // Message catalogue standard (sans mention photo)
        expect(writeToOutbox).toHaveBeenCalledWith(
          expect.objectContaining({
            body: "✅ *A12* ajouté au catalogue — 1 en stock",
          }),
        );
      });

      it("M3 fix: vendeur photo + code avec prix non configuré → message 'pas de prix' au lieu de 'code introuvable'", async () => {
        const tenantId = "tenant-123";
        const from = "+33612345678";
        const mediaUrl = "https://example.com/media/test-image.jpg";

        vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
          { id: "sp1", tenantId, phoneNumber: from, createdAt: new Date() },
        ] as never);
        const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
        vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);

        const { upsertCatalogueItemFromWebhook } = await import(
          "~/server/catalogue/upsertCatalogueItemFromWebhook"
        );
        vi.mocked(upsertCatalogueItemFromWebhook).mockResolvedValue({
          success: false,
          reason: "no_price",
        });

        const { writeToOutbox } = await import("~/server/messaging/outbox");

        const job = {
          id: "job-photo-noprice",
          data: {
            tenantId,
            providerMessageId: "SMphotonoprice",
            from,
            body: "ajout Z99",
            mediaUrl,
            correlationId: "corr-photonoprice",
          } as InboundMessage,
        } as PgBossJob<InboundMessage>;

        await processWebhookJob(job);

        expect(writeToOutbox).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.stringContaining("Aucun prix configuré pour la catégorie *Z*"),
          }),
        );
      });
    });
  });

  describe("Story 9.4: Photo dans messages WhatsApp récap", () => {
    it("AC #1: récap avec photo catalogue (mediaStorageKey non null) → writeToOutbox avec mediaUrl", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";
      const addressText = "Cocody, Abidjan";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);
      const { getActiveReservationForClient, collectAddress } = await import(
        "~/server/reservation/service"
      );
      vi.mocked(getActiveReservationForClient).mockResolvedValue({
        id: "res-photo",
        status: "reserved",
        tenantId,
        liveSessionId: null,
        liveItemId: null,
        catalogueItemId: "cat-item-photo",
        clientPhone: from,
        address: null,
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(collectAddress).mockResolvedValue({
        success: true,
        reservation: {
          id: "res-photo",
          item: {
            code: "A12",
            amount: 5000,
            quantity: 1,
            variantLabel: null,
            catalogueItemId: "cat-item-photo",
            mediaStorageKey: "tenants/t1/catalogue-items/ci1/photo",
          },
        },
      });

      const job = {
        id: "job-photo-recap",
        data: {
          tenantId,
          providerMessageId: "SM-photo",
          from,
          body: addressText,
          correlationId: "corr-photo",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      const { writeToOutbox } = await import("~/server/messaging/outbox");
      // H1 fix: storageKey brut passé à writeToOutbox (signé dans outbox-sender)
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          body: expect.stringContaining("Voici le récap de ta commande"),
          mediaUrl: "tenants/t1/catalogue-items/ci1/photo",
          correlationId: "corr-photo",
          interactive: expect.objectContaining({
            type: "buttons",
          }),
        }),
      );
    });

    it("AC #2: récap sans photo (mediaStorageKey null) → writeToOutbox sans mediaUrl", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);
      const { getActiveReservationForClient, collectAddress } = await import(
        "~/server/reservation/service"
      );
      vi.mocked(getActiveReservationForClient).mockResolvedValue({
        id: "res-no-photo",
        status: "reserved",
        tenantId,
        liveSessionId: null,
        liveItemId: null,
        catalogueItemId: "cat-item-no-photo",
        clientPhone: from,
        address: null,
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(collectAddress).mockResolvedValue({
        success: true,
        reservation: {
          id: "res-no-photo",
          item: {
            code: "B5",
            amount: 10000,
            quantity: 1,
            variantLabel: null,
            catalogueItemId: "cat-item-no-photo",
            mediaStorageKey: null,
          },
        },
      });

      const job = {
        id: "job-no-photo",
        data: {
          tenantId,
          providerMessageId: "SM-no-photo",
          from,
          body: "Mon adresse ici",
          correlationId: "corr-no-photo",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      const { writeToOutbox } = await import("~/server/messaging/outbox");
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          to: from,
          body: expect.stringContaining("Voici le récap de ta commande"),
        }),
      );
      // Pas de mediaUrl
      const writeCall = vi.mocked(writeToOutbox).mock.calls.find(
        (c) => (c[0] as { body: string }).body.includes("Voici le récap"),
      );
      expect(writeCall?.[0]).not.toHaveProperty("mediaUrl");
    });

    it("AC #4: mediaStorageKey présent → storageKey passé à writeToOutbox (fallback signé dans outbox-sender)", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);
      const { getActiveReservationForClient, collectAddress } = await import(
        "~/server/reservation/service"
      );
      vi.mocked(getActiveReservationForClient).mockResolvedValue({
        id: "res-key",
        status: "reserved",
        tenantId,
        liveSessionId: null,
        liveItemId: null,
        catalogueItemId: "cat-key",
        clientPhone: from,
        address: null,
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(collectAddress).mockResolvedValue({
        success: true,
        reservation: {
          id: "res-key",
          item: {
            code: "C3",
            amount: 7500,
            quantity: 1,
            variantLabel: null,
            catalogueItemId: "cat-key",
            mediaStorageKey: "tenants/t1/catalogue-items/key/photo",
          },
        },
      });

      const job = {
        id: "job-key",
        data: {
          tenantId,
          providerMessageId: "SM-key",
          from,
          body: "Mon adresse",
          correlationId: "corr-key",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const writeCall = vi.mocked(writeToOutbox).mock.calls.find(
        (c) => (c[0] as { body: string }).body.includes("Voici le récap"),
      );
      // H1 fix: storageKey brut passé (signé dans outbox-sender, fallback géré là-bas)
      expect(writeCall?.[0]).toHaveProperty("mediaUrl", "tenants/t1/catalogue-items/key/photo");
    });

    it("AC #5: récap LiveItem (pas de catalogueItemId) → texte uniquement, pas de photo", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue({
        id: "live-session-1",
        status: "active",
        lastActivityAt: new Date(),
      createdAt: new Date(),
      });
      const { getActiveReservationForClient, collectAddress } = await import(
        "~/server/reservation/service"
      );
      vi.mocked(getActiveReservationForClient).mockResolvedValue({
        id: "res-live",
        status: "reserved",
        tenantId,
        liveSessionId: "live-session-1",
        liveItemId: "live-item-1",
        catalogueItemId: null,
        clientPhone: from,
        address: null,
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(collectAddress).mockResolvedValue({
        success: true,
        reservation: {
          id: "res-live",
          item: { code: "D1", amount: 3000, quantity: 1 },
        },
      });

      const job = {
        id: "job-live",
        data: {
          tenantId,
          providerMessageId: "SM-live",
          from,
          body: "Adresse live",
          correlationId: "corr-live",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      const { writeToOutbox } = await import("~/server/messaging/outbox");
      const writeCall = vi.mocked(writeToOutbox).mock.calls.find(
        (c) => (c[0] as { body: string }).body.includes("Voici le récap"),
      );
      // LiveItem (pas de mediaStorageKey) → pas de mediaUrl
      expect(writeCall?.[0]).not.toHaveProperty("mediaUrl");
    });

    it("AC #3: confirmation OUI pour article avec photo → texte uniquement, pas de mediaUrl", async () => {
      const tenantId = "tenant-123";
      const from = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);
      const { getCurrentSessionReadOnly } = await import("~/server/live-session/service");
      vi.mocked(getCurrentSessionReadOnly).mockResolvedValue(null);
      const { getActiveReservationForClient, collectAddress } = await import(
        "~/server/reservation/service"
      );
      // OUI → pas de code intent, reservation en address_collected
      vi.mocked(getActiveReservationForClient).mockResolvedValue({
        id: "res-oui-photo",
        status: "address_collected",
        tenantId,
        liveSessionId: null,
        liveItemId: null,
        catalogueItemId: "cat-with-photo",
        clientPhone: from,
        address: "Cocody",
        expiresAt: null,
        correlationId: "corr-prev",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      // collectAddress ne sera pas appelé (status !== "reserved")
      vi.mocked(collectAddress).mockResolvedValue({ success: false, reason: "already_collected" });

      vi.mocked(db.tenant.findUnique).mockResolvedValue({ requireDeposit: false } as never);
      const { createOrderFromReservation } = await import(
        "~/server/order/createOrderFromReservation"
      );
      vi.mocked(createOrderFromReservation).mockResolvedValue({
        success: true,
        order: { id: "order-1", humanId: "SS-0001" },
      } as never);

      const job = {
        id: "job-oui-photo",
        data: {
          tenantId,
          providerMessageId: "SM-oui",
          from,
          body: "oui",
          correlationId: "corr-oui-photo",
        } as InboundMessage,
      } as PgBossJob<InboundMessage>;

      await processWebhookJob(job);

      const { writeToOutbox } = await import("~/server/messaging/outbox");
      // Le message de confirmation doit être texte uniquement (pas de photo en double)
      const confirmCall = vi.mocked(writeToOutbox).mock.calls.find(
        (c) => (c[0] as { body: string }).body.includes("Ta commande est bien enregistrée"),
      );
      expect(confirmCall).toBeDefined();
      expect(confirmCall?.[0]).not.toHaveProperty("mediaUrl");
    });
  });
});
