import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeToOutbox } from "./outbox";
import { db } from "~/server/db";

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
    error: vi.fn(),
  },
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
