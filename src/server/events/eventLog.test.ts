import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logEvent,
  logWebhookReceived,
  logMessageSent,
  logIdempotentIgnored,
  logLiveSessionCreated,
  logLiveSessionClosed,
} from "./eventLog";
import { db } from "~/server/db";

// Mock Prisma client
vi.mock("~/server/db", () => ({
  db: {
    eventLog: {
      create: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("~/lib/logger", () => ({
  webhookLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("eventLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("logEvent", () => {
    it("should write event to event_log with all required fields", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      const entityId = "msg-789";
      const payload = {
        message_in_id: entityId,
        provider_message_id: "SM123",
      };

      const mockEventLog = {
        id: "event-1",
        tenantId,
        eventType: "webhook_received",
        entityType: "message_in",
        entityId,
        correlationId,
        actorType: "system",
        payload,
        createdAt: new Date(),
      };

      vi.mocked(db.eventLog.create).mockResolvedValue(mockEventLog);

      const result = await logEvent({
        tenantId,
        eventType: "webhook_received",
        entityType: "message_in",
        entityId,
        correlationId,
        actorType: "system",
        payload,
      });

      expect(result).toEqual(mockEventLog);
      expect(db.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventType: "webhook_received",
          entityType: "message_in",
          entityId,
          correlationId,
          actorType: "system",
          payload,
        },
      });
    });

    it("should handle null entityId correctly", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      const payload = {
        provider_message_id: "SM123",
        reason: "duplicate_detected",
      };

      const mockEventLog = {
        id: "event-2",
        tenantId,
        eventType: "idempotent_ignored",
        entityType: "message_in",
        entityId: null,
        correlationId,
        actorType: "system",
        payload,
        createdAt: new Date(),
      };

      vi.mocked(db.eventLog.create).mockResolvedValue(mockEventLog);

      const result = await logEvent({
        tenantId,
        eventType: "idempotent_ignored",
        entityType: "message_in",
        entityId: undefined,
        correlationId,
        actorType: "system",
        payload,
      });

      expect(result).toEqual(mockEventLog);
      expect(db.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventType: "idempotent_ignored",
          entityType: "message_in",
          entityId: null,
          correlationId,
          actorType: "system",
          payload,
        },
      });
    });

    it("should reject payload with sensitive data (phone number)", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      const payload = {
        message_in_id: "msg-789",
        phone_number: "+33612345678", // PII: numéro complet
      };

      await expect(
        logEvent({
          tenantId,
          eventType: "webhook_received",
          entityType: "message_in",
          entityId: "msg-789",
          correlationId,
          actorType: "system",
          payload,
        }),
      ).rejects.toThrow();
    });

    it("should reject payload with sensitive data (email)", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      const payload = {
        message_in_id: "msg-789",
        email: "user@example.com", // PII: email complet
      };

      await expect(
        logEvent({
          tenantId,
          eventType: "webhook_received",
          entityType: "message_in",
          entityId: "msg-789",
          correlationId,
          actorType: "system",
          payload,
        }),
      ).rejects.toThrow();
    });

    it("should accept payload with only IDs and metadata", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      const payload = {
        message_in_id: "msg-789",
        provider_message_id: "SM123", // Métadonnée, pas PII
        tenant_id: tenantId, // ID, pas PII
      };

      const mockEventLog = {
        id: "event-3",
        tenantId,
        eventType: "webhook_received",
        entityType: "message_in",
        entityId: "msg-789",
        correlationId,
        actorType: "system",
        payload,
        createdAt: new Date(),
      };

      vi.mocked(db.eventLog.create).mockResolvedValue(mockEventLog);

      const result = await logEvent({
        tenantId,
        eventType: "webhook_received",
        entityType: "message_in",
        entityId: "msg-789",
        correlationId,
        actorType: "system",
        payload,
      });

      expect(result).toEqual(mockEventLog);
    });

    it("should accept payload with IDs containing 8+ digits (not phone numbers)", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      // ID avec 8+ chiffres mais préfixe texte (pas un numéro de téléphone)
      const payload = {
        message_in_id: "msg12345678", // 8+ chiffres mais préfixe "msg"
        provider_message_id: "SM1234567890", // ID Twilio avec chiffres
        tenant_id: tenantId,
      };

      const mockEventLog = {
        id: "event-4",
        tenantId,
        eventType: "webhook_received",
        entityType: "message_in",
        entityId: "msg12345678",
        correlationId,
        actorType: "system",
        payload,
        createdAt: new Date(),
      };

      vi.mocked(db.eventLog.create).mockResolvedValue(mockEventLog);

      const result = await logEvent({
        tenantId,
        eventType: "webhook_received",
        entityType: "message_in",
        entityId: "msg12345678",
        correlationId,
        actorType: "system",
        payload,
      });

      expect(result).toEqual(mockEventLog);
    });

    it("should re-throw database errors", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      const payload = {
        message_in_id: "msg-789",
      };

      const dbError = new Error("Database connection failed");
      vi.mocked(db.eventLog.create).mockRejectedValue(dbError);

      await expect(
        logEvent({
          tenantId,
          eventType: "webhook_received",
          entityType: "message_in",
          entityId: "msg-789",
          correlationId,
          actorType: "system",
          payload,
        }),
      ).rejects.toThrow("Database connection failed");
    });
  });

  describe("logWebhookReceived", () => {
    it("should log webhook_received event with correct payload", async () => {
      const tenantId = "tenant-123";
      const messageInId = "msg-789";
      const correlationId = "corr-456";
      const providerMessageId = "SM123";

      const mockEventLog = {
        id: "event-1",
        tenantId,
        eventType: "webhook_received",
        entityType: "message_in",
        entityId: messageInId,
        correlationId,
        actorType: "system",
        payload: {
          message_in_id: messageInId,
          provider_message_id: providerMessageId,
        },
        createdAt: new Date(),
      };

      vi.mocked(db.eventLog.create).mockResolvedValue(mockEventLog);

      await logWebhookReceived(
        tenantId,
        messageInId,
        correlationId,
        providerMessageId,
      );

      expect(db.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventType: "webhook_received",
          entityType: "message_in",
          entityId: messageInId,
          correlationId,
          actorType: "system",
          payload: {
            message_in_id: messageInId,
            provider_message_id: providerMessageId,
          },
        },
      });
    });
  });

  describe("logMessageSent", () => {
    it("should log message_sent event with correct payload", async () => {
      const tenantId = "tenant-123";
      const messageOutId = "msg-out-789";
      const correlationId = "corr-456";
      const providerMessageId = "SM456";

      const mockEventLog = {
        id: "event-2",
        tenantId,
        eventType: "message_sent",
        entityType: "message_out",
        entityId: messageOutId,
        correlationId,
        actorType: "system",
        payload: {
          message_out_id: messageOutId,
          provider_message_id: providerMessageId,
        },
        createdAt: new Date(),
      };

      vi.mocked(db.eventLog.create).mockResolvedValue(mockEventLog);

      await logMessageSent(
        tenantId,
        messageOutId,
        correlationId,
        providerMessageId,
      );

      expect(db.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventType: "message_sent",
          entityType: "message_out",
          entityId: messageOutId,
          correlationId,
          actorType: "system",
          payload: {
            message_out_id: messageOutId,
            provider_message_id: providerMessageId,
          },
        },
      });
    });

    it("should handle undefined messageOutId", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      const providerMessageId = "SM456";

      const mockEventLog = {
        id: "event-3",
        tenantId,
        eventType: "message_sent",
        entityType: "message_out",
        entityId: null,
        correlationId,
        actorType: "system",
        payload: {
          message_out_id: undefined,
          provider_message_id: providerMessageId,
        },
        createdAt: new Date(),
      };

      vi.mocked(db.eventLog.create).mockResolvedValue(mockEventLog);

      await logMessageSent(
        tenantId,
        undefined,
        correlationId,
        providerMessageId,
      );

      expect(db.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventType: "message_sent",
          entityType: "message_out",
          entityId: null,
          correlationId,
          actorType: "system",
          payload: {
            message_out_id: undefined,
            provider_message_id: providerMessageId,
          },
        },
      });
    });
  });

  describe("logIdempotentIgnored", () => {
    it("should log idempotent_ignored event when tenantId is provided", async () => {
      const tenantId = "tenant-123";
      const correlationId = "corr-456";
      const providerMessageId = "SM123";

      const mockEventLog = {
        id: "event-4",
        tenantId,
        eventType: "idempotent_ignored",
        entityType: "message_in",
        entityId: null,
        correlationId,
        actorType: "system",
        payload: {
          provider_message_id: providerMessageId,
          reason: "duplicate_detected",
        },
        createdAt: new Date(),
      };

      vi.mocked(db.eventLog.create).mockResolvedValue(mockEventLog);

      await logIdempotentIgnored(tenantId, correlationId, providerMessageId);

      expect(db.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventType: "idempotent_ignored",
          entityType: "message_in",
          entityId: null,
          correlationId,
          actorType: "system",
          payload: {
            provider_message_id: providerMessageId,
            reason: "duplicate_detected",
          },
        },
      });
    });

    it("should not log event when tenantId is null", async () => {
      const correlationId = "corr-456";
      const providerMessageId = "SM123";

      await logIdempotentIgnored(null, correlationId, providerMessageId);

      // Ne doit pas appeler create si tenantId est null
      expect(db.eventLog.create).not.toHaveBeenCalled();
    });
  });

  describe("logLiveSessionCreated", () => {
    it("should log live_session_created event with session id", async () => {
      const tenantId = "tenant-1";
      const liveSessionId = "session-1";
      const correlationId = "corr-1";
      vi.mocked(db.eventLog.create).mockResolvedValue({} as never);

      await logLiveSessionCreated(tenantId, liveSessionId, correlationId);

      expect(db.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventType: "live_session_created",
          entityType: "session",
          entityId: liveSessionId,
          correlationId,
          actorType: "system",
          payload: { live_session_id: liveSessionId },
        },
      });
    });
  });

  describe("logLiveSessionClosed", () => {
    it("should log live_session_closed event with session id", async () => {
      const tenantId = "tenant-1";
      const liveSessionId = "session-1";
      const correlationId = "corr-close";
      vi.mocked(db.eventLog.create).mockResolvedValue({} as never);

      await logLiveSessionClosed(tenantId, liveSessionId, correlationId);

      expect(db.eventLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventType: "live_session_closed",
          entityType: "session",
          entityId: liveSessionId,
          correlationId,
          actorType: "system",
          payload: { live_session_id: liveSessionId },
        },
      });
    });
  });
});
