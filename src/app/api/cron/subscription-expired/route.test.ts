import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTenantFindMany = vi.hoisted(() => vi.fn());
const mockTenantUpdate = vi.hoisted(() => vi.fn());
const mockRunSubscriptionExpiredJob = vi.hoisted(() => vi.fn());

vi.mock("~/env", () => ({
  env: {
    CRON_SECRET: "cron-secret",
  },
}));

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findMany: mockTenantFindMany,
      update: mockTenantUpdate,
    },
  },
}));

vi.mock("~/server/workers/subscription-expired", () => ({
  runSubscriptionExpiredJob: mockRunSubscriptionExpiredJob,
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { env } from "~/env";
import { GET } from "./route";

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new Request("http://localhost/api/cron/subscription-expired", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/subscription-expired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as Record<string, unknown>).CRON_SECRET = "cron-secret";
    mockTenantFindMany.mockResolvedValue([]);
    mockTenantUpdate.mockResolvedValue({});
    mockRunSubscriptionExpiredJob.mockResolvedValue({
      processed: 0,
      timestamp: "2026-05-01T00:00:00.000Z",
    });
  });

  it("does not touch tenant data when CRON_SECRET is missing", async () => {
    (env as Record<string, unknown>).CRON_SECRET = undefined;

    const response = await GET(makeRequest());

    expect(response.status).toBe(503);
    expect(mockTenantFindMany).not.toHaveBeenCalled();
    expect(mockTenantUpdate).not.toHaveBeenCalled();
    expect(mockRunSubscriptionExpiredJob).not.toHaveBeenCalled();
  });

  it("does not touch tenant data when authorization is missing or invalid", async () => {
    const missing = await GET(makeRequest());
    const invalid = await GET(makeRequest("Bearer wrong"));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(mockTenantFindMany).not.toHaveBeenCalled();
    expect(mockTenantUpdate).not.toHaveBeenCalled();
    expect(mockRunSubscriptionExpiredJob).not.toHaveBeenCalled();
  });

  it("processes expired subscriptions when authorization is valid", async () => {
    mockRunSubscriptionExpiredJob.mockResolvedValue({
      processed: 1,
      timestamp: "2026-05-01T00:00:00.000Z",
    });

    const response = await GET(makeRequest("Bearer cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(mockRunSubscriptionExpiredJob).toHaveBeenCalledOnce();
  });
});
