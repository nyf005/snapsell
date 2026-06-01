import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTenantFindMany = vi.hoisted(() => vi.fn());
const mockTenantUpdate = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findMany: mockTenantFindMany,
      update: mockTenantUpdate,
    },
  },
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { runSubscriptionExpiredJob } from "./subscription-expired";

describe("runSubscriptionExpiredJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantFindMany.mockResolvedValue([]);
    mockTenantUpdate.mockResolvedValue({});
  });

  it("downgrades expired paid tenants to free entitlements", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "tenant-1", subscriptionPlan: "starter" },
      { id: "tenant-2", subscriptionPlan: "pro" },
    ]);

    const result = await runSubscriptionExpiredJob();

    expect(result.processed).toBe(2);
    expect(mockTenantFindMany).toHaveBeenCalledWith({
      where: {
        subscriptionPlan: { not: "free" },
        subscriptionExpiresAt: { lt: expect.any(Date) },
        subscriptionStatus: { in: ["active", "non_renewing"] },
      },
      select: { id: true, subscriptionPlan: true },
    });
    expect(mockTenantUpdate).toHaveBeenCalledTimes(2);
    expect(mockTenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: expect.objectContaining({
        subscriptionStatus: "cancelled",
        subscriptionPlan: "free",
        creditsBalance: 70,
        creditsTotalMonthly: 70,
        maxAgents: 0,
        hasAI: false,
        showUpgradeBanner: true,
      }),
    });
  });

  it("does not update tenants when no subscriptions are expired", async () => {
    const result = await runSubscriptionExpiredJob();

    expect(result.processed).toBe(0);
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });
});
