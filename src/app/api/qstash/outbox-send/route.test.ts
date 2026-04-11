import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerify = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockProcessOutboundMessage = vi.hoisted(() => vi.fn());

vi.mock("@upstash/qstash", () => ({
  Receiver: vi.fn().mockImplementation(function MockReceiver() {
    return {
      verify: mockVerify,
    };
  }),
}));

vi.mock("~/server/db", () => ({
  db: {
    messageOut: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock("~/server/workers/outbox-sender", () => ({
  processOutboundMessage: mockProcessOutboundMessage,
}));

vi.mock("~/env", () => ({
  env: {
    NODE_ENV: "production",
    QSTASH_TOKEN: "qstash-token",
    QSTASH_CURRENT_SIGNING_KEY: "current-key",
    QSTASH_NEXT_SIGNING_KEY: "next-key",
  },
}));

import { POST } from "./route";
import { env } from "~/env";

function makeRequest(body: object, signature = "valid-signature") {
  return new Request("http://localhost/api/qstash/outbox-send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "upstash-signature": signature,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/qstash/outbox-send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as Record<string, unknown>).NODE_ENV = "production";
    (env as Record<string, unknown>).QSTASH_TOKEN = "qstash-token";
    (env as Record<string, unknown>).QSTASH_CURRENT_SIGNING_KEY = "current-key";
    (env as Record<string, unknown>).QSTASH_NEXT_SIGNING_KEY = "next-key";

    mockVerify.mockResolvedValue(true);
    mockFindUnique.mockResolvedValue({
      id: "msg-1",
      tenantId: "tenant-1",
      to: "+22501020304",
      body: "Bonjour",
      status: "pending",
      attempts: 0,
      correlationId: "corr-1",
    });
    mockProcessOutboundMessage.mockResolvedValue({ success: true });
  });

  it("returns 503 in production when signing keys are missing", async () => {
    (env as Record<string, unknown>).QSTASH_CURRENT_SIGNING_KEY = undefined;
    (env as Record<string, unknown>).QSTASH_NEXT_SIGNING_KEY = undefined;

    const response = await POST(makeRequest({ messageOutId: "msg-1" }));

    expect(response.status).toBe(503);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockProcessOutboundMessage).not.toHaveBeenCalled();
  });

  it("returns 401 when signature is invalid", async () => {
    mockVerify.mockResolvedValue(false);

    const response = await POST(makeRequest({ messageOutId: "msg-1" }, "bad-signature"));

    expect(response.status).toBe(401);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockProcessOutboundMessage).not.toHaveBeenCalled();
  });

  it("allows local development without signing keys", async () => {
    (env as Record<string, unknown>).NODE_ENV = "development";
    (env as Record<string, unknown>).QSTASH_CURRENT_SIGNING_KEY = undefined;
    (env as Record<string, unknown>).QSTASH_NEXT_SIGNING_KEY = undefined;

    const response = await POST(makeRequest({ messageOutId: "msg-1" }));

    expect(response.status).toBe(200);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "msg-1" },
    });
    expect(mockProcessOutboundMessage).toHaveBeenCalled();
  });

  it("processes the callback when signature is valid", async () => {
    const response = await POST(makeRequest({ messageOutId: "msg-1" }));

    expect(response.status).toBe(200);
    expect(mockVerify).toHaveBeenCalled();
    expect(mockProcessOutboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "msg-1" }),
    );
  });
});
