import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies - define mocks first
const mockMessageOutUpdate = vi.fn();
const mockMessageOutFindUnique = vi.fn();
const mockMessageOutUpdateMany = vi.fn();
const mockMessageOutFindMany = vi.fn();
const mockDeadLetterJobCreate = vi.fn();
const mockSend = vi.fn();

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
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  },
}));

// Mock TwilioAdapter as a class
vi.mock("~/server/messaging/providers/twilio/adapter", () => ({
  TwilioAdapter: class {
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
    mockCheckOptOut.mockResolvedValue(false); // par défaut pas d'opt-out
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

    it("should send message when OptOut does not exist", async () => {
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
        providerMessageId: "SM123456",
      });

      mockMessageOutUpdate.mockResolvedValue({} as never);
      vi.mocked(logMessageSent).mockResolvedValue();

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe("SM123456");
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
          providerMessageId: "SM123456",
          updatedAt: expect.any(Date),
        },
      });
      expect(logMessageSent).toHaveBeenCalledWith(
        messageOut.tenantId,
        messageOut.id,
        messageOut.correlationId,
        "SM123456",
      );
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
        error: "Twilio error",
      });

      mockMessageOutUpdate.mockResolvedValue({
        ...messageOut,
        status: "failed",
        attempts: 1,
      } as never);

      const result = await processOutboundMessage(messageOut as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Twilio error");
      expect(mockMessageOutUpdate).toHaveBeenCalledWith({
        where: { id: messageOut.id },
        data: {
          status: "failed",
          attempts: 1,
          nextAttemptAt: expect.any(Date),
          lastError: "Twilio error",
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
        error: "Twilio error",
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
        lastError: "Twilio error",
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
