import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeToOutbox } from "./outbox";
import { db } from "~/server/db";
import { boss, QUEUE } from "~/server/workers/queues";

// Mock db
vi.mock("~/server/db", () => ({
  db: {
    messageOut: {
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

// Mock queues (pg-boss)
vi.mock("~/server/workers/queues", () => ({
  boss: { send: vi.fn().mockResolvedValue("job-id-mock") },
  QUEUE: { OUTBOX_SEND: "outbox-send" },
}));

describe("writeToOutbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should write MessageOut with status pending", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Hello World",
      correlationId: "corr-123",
    };

    const mockMessageOut = {
      id: "msg-out-123",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
      createdAt: new Date(),
    };

    vi.mocked(db.messageOut.create).mockResolvedValue(mockMessageOut as never);

    const result = await writeToOutbox(message);

    expect(db.messageOut.create).toHaveBeenCalledWith({
      data: {
        tenantId: message.tenantId,
        to: message.to,
        body: message.body,
        mediaUrl: null,
        status: "pending",
        attempts: 0,
        correlationId: message.correlationId,
      },
    });

    expect(result).toMatchObject({
      id: "msg-out-123",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
    });

    // AC6: boss.send() appelé après create pour enqueue immédiat
    expect(boss.send).toHaveBeenCalledWith(
      QUEUE.OUTBOX_SEND,
      { messageOutId: "msg-out-123" },
      { singletonKey: "msg-out-123" },
    );
  });

  it("Story 9.4: should persist mediaUrl when provided", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Récap",
      correlationId: "corr-media",
      mediaUrl: "tenants/t1/catalogue-items/ci1/photo",
    };

    const mockMessageOut = {
      id: "msg-out-media",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
      createdAt: new Date(),
    };

    vi.mocked(db.messageOut.create).mockResolvedValue(mockMessageOut as never);

    await writeToOutbox(message);

    expect(db.messageOut.create).toHaveBeenCalledWith({
      data: {
        tenantId: message.tenantId,
        to: message.to,
        body: message.body,
        mediaUrl: "tenants/t1/catalogue-items/ci1/photo",
        status: "pending",
        attempts: 0,
        correlationId: message.correlationId,
      },
    });
  });

  it("should validate message with Zod", async () => {
    const invalidMessage = {
      tenantId: "", // Invalid: empty string
      to: "+33612345678",
      body: "Hello",
      correlationId: "corr-123",
    };

    await expect(writeToOutbox(invalidMessage as never)).rejects.toThrow();
    expect(db.messageOut.create).not.toHaveBeenCalled();
  });

  it("AC6: should succeed even if boss.send() fails (MessageOut remains pending)", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Hello",
      correlationId: "corr-resilient",
    };

    const mockMessageOut = {
      id: "msg-out-resilient",
      tenantId: message.tenantId,
      to: message.to,
      body: message.body,
      status: "pending",
      attempts: 0,
      correlationId: message.correlationId,
      createdAt: new Date(),
    };

    vi.mocked(db.messageOut.create).mockResolvedValue(mockMessageOut as never);
    vi.mocked(boss.send).mockRejectedValueOnce(new Error("pg-boss connection failed"));

    const result = await writeToOutbox(message);

    // MessageOut créé malgré l'échec de boss.send()
    expect(result.id).toBe("msg-out-resilient");
    expect(result.status).toBe("pending");
    expect(db.messageOut.create).toHaveBeenCalled();
  });

  it("should throw error if DB create fails", async () => {
    const message = {
      tenantId: "tenant-123",
      to: "+33612345678",
      body: "Hello World",
      correlationId: "corr-123",
    };

    const dbError = new Error("DB error");
    vi.mocked(db.messageOut.create).mockRejectedValue(dbError);

    await expect(writeToOutbox(message)).rejects.toThrow("DB error");
  });
});
