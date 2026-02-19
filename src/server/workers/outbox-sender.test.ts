import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies - define mocks first
const mockMessageOutUpdate = vi.fn();
const mockMessageOutFindUnique = vi.fn();
const mockMessageOutUpdateMany = vi.fn();
const mockMessageOutFindMany = vi.fn();
const mockDeadLetterJobCreate = vi.fn();
const mockTenantFindUnique = vi.fn();
const mockSend = vi.fn();
let lastAdapterArgs: { phoneNumberId: string; accessToken: string } | null = null;

const mockTx = {
  messageOut: {
    update: mockMessageOutUpdate,
    findUnique: mockMessageOutFindUnique,
    updateMany: mockMessageOutUpdateMany,
    findMany: mockMessageOutFindMany,
  },
  deadLetterJob: { create: mockDeadLetterJobCreate },
};

vi.mock("~/server/db", () => ({
  db: {
    messageOut: {
      get update() {
        return mockMessageOutUpdate;
      },
      get findUnique() {
        return mockMessageOutFindUnique;
      },
      get updateMany() {
        return mockMessageOutUpdateMany;
      },
      get findMany() {
        return mockMessageOutFindMany;
      },
    },
    deadLetterJob: {
      get create() {
        return mockDeadLetterJobCreate;
      },
    },
    tenant: {
      get findUnique() {
        return mockTenantFindUnique;
      },
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  },
}));

// Mock MetaCloudAdapter as a class (Task 2.1) — captures constructor args (L2 fix)
vi.mock("~/server/messaging/providers/meta/adapter", () => ({
  MetaCloudAdapter: class {
    constructor(phoneNumberId: string, accessToken: string) {
      lastAdapterArgs = { phoneNumberId, accessToken };
    }
    send = mockSend;
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logMessageSent: vi.fn(),
  logMessageBlockedOptOut: vi.fn(),
}));

const mockCheckOptOut = vi.fn();
vi.mock("~/server/messaging/optout", () => ({
  checkOptOut: (...args: unknown[]) => mockCheckOptOut(...args),
}));

const mockGenerateSignedR2Url = vi.fn();
vi.mock("~/server/media/r2-signed-url", () => ({
  generateSignedR2Url: (...args: unknown[]) => mockGenerateSignedR2Url(...args),
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Seules les vars outbox sont nécessaires (pas de vars provider dans le worker)
vi.mock("~/env", () => ({
  env: {
    OUTBOX_MAX_RETRIES: 5,
    OUTBOX_BACKOFF_MAX_MS: 30000,
  },
}));

// Import after mocks
import { logMessageSent } from "~/server/events/eventLog";
import { logMessageBlockedOptOut } from "~/server/events/eventLog";
import {
  processOutboundMessage,
  createDeadLetterJob,
} from "./outbox-sender";

describe("outbox-sender worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    mockMessageOutUpdate.mockReset();
    mockMessageOutFindUnique.mockReset();
    mockMessageOutUpdateMany.mockReset();
    mockMessageOutFindMany.mockReset();
    mockDeadLetterJobCreate.mockReset();
    mockTenantFindUnique.mockReset();
    lastAdapterArgs = null;
    mockCheckOptOut.mockResolvedValue(false); // par défaut pas d'opt-out
    mockGenerateSignedR2Url.mockReset();
    // Task 2.2: mock tenant valide par défaut
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123456",
      metaAccessToken: "token-test",
    });
  });

  describe("processOutboundMessage", () => {
    it("should block message when OptOut exists (Story 2.5)", async () => {
      const messageOut = {
        id: "msg-out-blocked",
        tenantId: "tenant-123",
        to: "+33612345678",
        body: "Hello",
        status: "pending",
        attempts: 0,
        correlationId: "corr-blocked",
      };

      mockCheckOptOut.mockResolvedValue(true);
      mockMessageOutUpdate.mockResolvedValue({} as never);
      vi.mocked(logMessageBlockedOptOut).mockResolvedValue();

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(true);
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockMessageOutUpdate).toHaveBeenCalledWith({
        where: { id: messageOut.id },
        data: {
          status: "blocked",
          updatedAt: expect.any(Date),
        },
      });
      expect(logMessageBlockedOptOut).toHaveBeenCalledWith(
        messageOut.tenantId,
        messageOut.id,
        messageOut.correlationId,
      );
    });

    it("should send message via MetaCloudAdapter when tenant config valid (AC #1)", async () => {
      const messageOut = {
        id: "msg-out-123",
        tenantId: "tenant-123",
        to: "+33612345678",
        body: "Hello World",
        status: "pending",
        attempts: 0,
        correlationId: "corr-123",
      };

      mockCheckOptOut.mockResolvedValue(false);
      mockSend.mockResolvedValue({
        success: true,
        providerMessageId: "wamid.abc123",
      });

      mockMessageOutUpdate.mockResolvedValue({} as never);
      vi.mocked(logMessageSent).mockResolvedValue();

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe("wamid.abc123");
      // Verify tenant lookup (AC #1)
      expect(mockTenantFindUnique).toHaveBeenCalledWith({
        where: { id: messageOut.tenantId },
        select: { metaPhoneNumberId: true, metaAccessToken: true },
      });
      expect(mockCheckOptOut).toHaveBeenCalledWith(messageOut.tenantId, messageOut.to);
      expect(mockSend).toHaveBeenCalledWith({
        tenantId: messageOut.tenantId,
        to: messageOut.to,
        body: messageOut.body,
        correlationId: messageOut.correlationId,
      });
      expect(mockMessageOutUpdate).toHaveBeenCalledWith({
        where: { id: messageOut.id },
        data: {
          status: "sent",
          providerMessageId: "wamid.abc123",
          updatedAt: expect.any(Date),
        },
      });
      expect(logMessageSent).toHaveBeenCalledWith(
        messageOut.tenantId,
        messageOut.id,
        messageOut.correlationId,
        "wamid.abc123",
      );
      // L2 fix: verify MetaCloudAdapter constructor received correct tenant config
      expect(lastAdapterArgs).toEqual({
        phoneNumberId: "123456",
        accessToken: "token-test",
      });
    });

    it("should handle send failure and update status to failed with retry", async () => {
      const messageOut = {
        id: "msg-out-123",
        tenantId: "tenant-123",
        to: "+33612345678",
        body: "Hello World",
        status: "pending",
        attempts: 0,
        correlationId: "corr-123",
      };

      mockSend.mockResolvedValue({
        success: false,
        error: "Meta API error",
      });

      mockMessageOutUpdate.mockResolvedValue({
        ...messageOut,
        status: "failed",
        attempts: 1,
      } as never);

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Meta API error");
      expect(mockMessageOutUpdate).toHaveBeenCalledWith({
        where: { id: messageOut.id },
        data: {
          status: "failed",
          attempts: 1,
          nextAttemptAt: expect.any(Date),
          lastError: "Meta API error",
          updatedAt: expect.any(Date),
        },
      });
    });

    it("should calculate next_attempt_at with exponential backoff", async () => {
      const messageOut = {
        id: "msg-out-123",
        tenantId: "tenant-123",
        to: "+33612345678",
        body: "Hello World",
        status: "failed",
        attempts: 2, // 3rd attempt
        correlationId: "corr-123",
      };

      mockSend.mockResolvedValue({
        success: false,
        error: "Meta API error",
      });

      mockMessageOutUpdate.mockResolvedValue({
        ...messageOut,
        attempts: 3,
      } as never);

      const beforeTime = Date.now();
      await processOutboundMessage(messageOut as never);
      const afterTime = Date.now();

      const updateCall = mockMessageOutUpdate.mock.calls[0];
      expect(updateCall).toBeDefined();

      const nextAttemptAt = updateCall![0]?.data?.nextAttemptAt as Date;

      // Backoff: newAttempts = 3 → 1000 * 2^(3-1) = 4000ms (4s) — spec 1s, 2s, 4s, 8s, 16s
      const expectedBackoff = 4000;
      const actualBackoff = nextAttemptAt.getTime() - beforeTime;

      expect(actualBackoff).toBeGreaterThanOrEqual(expectedBackoff - 100); // Allow 100ms tolerance
      expect(actualBackoff).toBeLessThanOrEqual(expectedBackoff + 100);
      expect(updateCall![0]?.data?.attempts).toBe(3);
    });

    // Task 2.3: Tenant sans config Meta → erreur gracieuse (AC #3)
    it("AC #3: should fail gracefully when tenant has no Meta config (meta_config_missing)", async () => {
      const messageOut = {
        id: "msg-no-meta",
        tenantId: "tenant-no-meta",
        to: "+33612345678",
        body: "Hello",
        status: "pending",
        attempts: 0,
        correlationId: "corr-no-meta",
      };

      // Tenant exists but no Meta config
      mockTenantFindUnique.mockResolvedValue({
        metaPhoneNumberId: null,
        metaAccessToken: null,
      });
      mockMessageOutUpdate.mockResolvedValue({} as never);

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("meta_config_missing");
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockMessageOutUpdate).toHaveBeenCalledWith({
        where: { id: messageOut.id },
        data: {
          status: "failed",
          attempts: 1,
          nextAttemptAt: expect.any(Date),
          lastError: "meta_config_missing",
          updatedAt: expect.any(Date),
        },
      });
      // L3 fix: verify workerLogger.error called for observability
      const { workerLogger } = await import("~/lib/logger");
      expect(workerLogger.error).toHaveBeenCalledWith(
        "Cannot send message: tenant Meta config missing",
        expect.any(Error),
        expect.objectContaining({ messageOutId: "msg-no-meta", tenantId: "tenant-no-meta" }),
      );
    });

    // Task 2.4: Tenant introuvable → erreur gracieuse (AC #4)
    it("AC #4: should fail gracefully when tenant not found (tenant_not_found)", async () => {
      const messageOut = {
        id: "msg-no-tenant",
        tenantId: "tenant-ghost",
        to: "+33612345678",
        body: "Hello",
        status: "pending",
        attempts: 0,
        correlationId: "corr-no-tenant",
      };

      mockTenantFindUnique.mockResolvedValue(null);
      mockMessageOutUpdate.mockResolvedValue({} as never);

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("tenant_not_found");
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockMessageOutUpdate).toHaveBeenCalledWith({
        where: { id: messageOut.id },
        data: {
          status: "failed",
          attempts: 1,
          nextAttemptAt: expect.any(Date),
          lastError: "tenant_not_found",
          updatedAt: expect.any(Date),
        },
      });
      // L3 fix: verify workerLogger.error called for observability
      const { workerLogger } = await import("~/lib/logger");
      expect(workerLogger.error).toHaveBeenCalledWith(
        "Cannot send message: tenant Meta config missing",
        expect.any(Error),
        expect.objectContaining({ messageOutId: "msg-no-tenant", tenantId: "tenant-ghost" }),
      );
    });

    // Task 2.3 variant: partial config (only phoneNumberId, missing accessToken)
    it("AC #3: should fail gracefully when tenant has partial Meta config", async () => {
      const messageOut = {
        id: "msg-partial",
        tenantId: "tenant-partial",
        to: "+33612345678",
        body: "Hello",
        status: "pending",
        attempts: 0,
        correlationId: "corr-partial",
      };

      mockTenantFindUnique.mockResolvedValue({
        metaPhoneNumberId: "123456",
        metaAccessToken: null,
      });
      mockMessageOutUpdate.mockResolvedValue({} as never);

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("meta_config_missing");
      expect(mockSend).not.toHaveBeenCalled();
    });

    // L1 fix: DB error during tenant lookup → catch generique → failed + retry
    it("should handle DB error during tenant lookup gracefully", async () => {
      const messageOut = {
        id: "msg-db-error",
        tenantId: "tenant-db-err",
        to: "+33612345678",
        body: "Hello",
        status: "pending",
        attempts: 0,
        correlationId: "corr-db-err",
      };

      mockTenantFindUnique.mockRejectedValue(new Error("ECONNREFUSED"));
      mockMessageOutUpdate.mockResolvedValue({} as never);

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("ECONNREFUSED");
      expect(mockSend).not.toHaveBeenCalled();
      expect(mockMessageOutUpdate).toHaveBeenCalledWith({
        where: { id: messageOut.id },
        data: {
          status: "failed",
          attempts: 1,
          nextAttemptAt: expect.any(Date),
          lastError: "ECONNREFUSED",
          updatedAt: expect.any(Date),
        },
      });
    });

    it("Story 9.4: should sign storageKey and pass mediaUrl to provider (AC #6)", async () => {
      const messageOut = {
        id: "msg-media-1",
        tenantId: "tenant-123",
        to: "+2250101020304",
        body: "Récap : A12 — 50 FCFA",
        mediaUrl: "tenants/t1/catalogue-items/ci1/photo",
        status: "pending",
        attempts: 0,
        correlationId: "corr-media",
      };

      mockCheckOptOut.mockResolvedValue(false);
      mockGenerateSignedR2Url.mockResolvedValue("https://r2.example.com/signed-url");
      mockSend.mockResolvedValue({ success: true, providerMessageId: "SM-MEDIA" });
      mockMessageOutUpdate.mockResolvedValue({} as never);
      vi.mocked(logMessageSent).mockResolvedValue();

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(true);
      expect(mockGenerateSignedR2Url).toHaveBeenCalledWith(
        "tenants/t1/catalogue-items/ci1/photo",
        "corr-media",
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: "https://r2.example.com/signed-url",
        }),
      );
    });

    it("Story 9.4: should pass through http mediaUrl without signing", async () => {
      const messageOut = {
        id: "msg-http-url",
        tenantId: "tenant-123",
        to: "+2250101020304",
        body: "Message",
        mediaUrl: "https://external.example.com/image.jpg",
        status: "pending",
        attempts: 0,
        correlationId: "corr-http",
      };

      mockCheckOptOut.mockResolvedValue(false);
      mockSend.mockResolvedValue({ success: true, providerMessageId: "SM-HTTP" });
      mockMessageOutUpdate.mockResolvedValue({} as never);
      vi.mocked(logMessageSent).mockResolvedValue();

      await processOutboundMessage(messageOut as never);

      expect(mockGenerateSignedR2Url).not.toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrl: "https://external.example.com/image.jpg",
        }),
      );
    });

    it("Story 9.4: should skip mediaUrl when signing fails (AC #4 fallback)", async () => {
      const messageOut = {
        id: "msg-sign-fail",
        tenantId: "tenant-123",
        to: "+2250101020304",
        body: "Récap : C3 — 75 FCFA",
        mediaUrl: "tenants/t1/catalogue-items/fail/photo",
        status: "pending",
        attempts: 0,
        correlationId: "corr-sign-fail",
      };

      mockCheckOptOut.mockResolvedValue(false);
      mockGenerateSignedR2Url.mockResolvedValue(null);
      mockSend.mockResolvedValue({ success: true, providerMessageId: "SM-NOPIC" });
      mockMessageOutUpdate.mockResolvedValue({} as never);
      vi.mocked(logMessageSent).mockResolvedValue();

      await processOutboundMessage(messageOut as never);

      const callArg = mockSend.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty("mediaUrl");
    });

    it("Story 9.4: should NOT include mediaUrl when null (AC #7 regression)", async () => {
      const messageOut = {
        id: "msg-no-media",
        tenantId: "tenant-123",
        to: "+2250101020304",
        body: "Text only",
        mediaUrl: null,
        status: "pending",
        attempts: 0,
        correlationId: "corr-no-media",
      };

      mockCheckOptOut.mockResolvedValue(false);
      mockSend.mockResolvedValue({ success: true, providerMessageId: "SM-TEXT" });
      mockMessageOutUpdate.mockResolvedValue({} as never);
      vi.mocked(logMessageSent).mockResolvedValue();

      await processOutboundMessage(messageOut as never);

      expect(mockGenerateSignedR2Url).not.toHaveBeenCalled();
      const callArg = mockSend.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty("mediaUrl");
    });
  });

  describe("createDeadLetterJob", () => {
    it("should create DeadLetterJob after N failures", async () => {
      const messageOut = {
        id: "msg-out-123",
        tenantId: "tenant-123",
        to: "+33612345678",
        body: "Hello World",
        status: "failed",
        attempts: 5, // Max retries reached
        lastError: "Meta API error",
        correlationId: "corr-123",
      };

      const mockDeadLetterJob = {
        id: "dlq-123",
        tenantId: messageOut.tenantId,
        jobType: "message_out",
        payload: {},
        errorMessage: messageOut.lastError,
        attempts: messageOut.attempts,
      };

      mockDeadLetterJobCreate.mockResolvedValue(mockDeadLetterJob as never);
      mockMessageOutUpdate.mockResolvedValue({} as never);

      await createDeadLetterJob(messageOut as never);

      expect(mockDeadLetterJobCreate).toHaveBeenCalledWith({
        data: {
          tenantId: messageOut.tenantId,
          jobType: "message_out",
          payload: {
            message_out_id: messageOut.id,
            to: messageOut.to,
            body: messageOut.body,
            correlation_id: messageOut.correlationId,
          },
          errorMessage: messageOut.lastError,
          attempts: messageOut.attempts,
        },
      });

      expect(mockMessageOutUpdate).toHaveBeenCalledWith({
        where: { id: messageOut.id },
        data: {
          status: "failed",
          updatedAt: expect.any(Date),
        },
      });
    });

  });
});
