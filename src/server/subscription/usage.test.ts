import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findUniqueOrThrow: vi.fn(),
    },
    order: { count: vi.fn() },
    paymentProof: { count: vi.fn() },
    user: { count: vi.fn() },
    conversationWindow: { count: vi.fn() },
    subscriptionPayment: { create: vi.fn() },
  },
}));

vi.mock("~/server/payment/paystack", () => ({
  chargeAuthorization: vi.fn(),
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: { warn: vi.fn() },
}));

import { db } from "~/server/db";
import { chargeAuthorization } from "~/server/payment/paystack";
import {
  getUsageThisCycle,
  checkQuota,
  checkProofsQuota,
  checkAgentsQuota,
  calculateOverage,
  chargeOverage,
  QuotaExceededError,
  type QuotaCheckResult,
} from "./usage";

describe("Story 7A.2: Usage service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.order.count).mockResolvedValue(0);
    vi.mocked(db.paymentProof.count).mockResolvedValue(0);
    vi.mocked(db.user.count).mockResolvedValue(0);
    vi.mocked(db.conversationWindow.count).mockResolvedValue(0);
  });

  describe("getUsageThisCycle", () => {
    it("returns usage for Free tenant", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "free",
        cycleStartedAt: null,
        creditsBalance: 50,
        creditsTotalMonthly: 70,
        maxProofsPerMonth: -1,
        maxAgents: 0,
        overagePerOrderCents: 0,
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(10);
      vi.mocked(db.conversationWindow.count).mockResolvedValue(20);
      vi.mocked(db.user.count).mockResolvedValue(0);

      const usage = await getUsageThisCycle("tenant-1");

      expect(usage.balance).toBe(50);
      expect(usage.totalMonthly).toBe(70);
      expect(usage.used).toBe(20);
      expect(usage.confirmedOrders).toBe(10);
      expect(usage.agents).toBe(0);
      expect(usage.overageCount).toBe(0);
      expect(usage.overageAmountFCFA).toBe(0);
      expect(usage.plan).toBe("free");
    });

    it("calculates overage for Starter plan", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "starter",
        cycleStartedAt: new Date("2026-02-01"),
        creditsBalance: 450,
        creditsTotalMonthly: 500,
        maxProofsPerMonth: -1,
        maxAgents: 1,
        overagePerOrderCents: 2500,
      } as never);
      vi.mocked(db.conversationWindow.count).mockResolvedValue(50);

      const usage = await getUsageThisCycle("tenant-1");

      expect(usage.used).toBe(50);
      expect(usage.overageCount).toBe(0);
      expect(usage.overageAmountFCFA).toBe(0);
    });
  });

  describe("checkProofsQuota", () => {
    it("allows unlimited for Free plan (-1)", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxProofsPerMonth: -1,
        cycleStartedAt: null,
        subscriptionPlan: "free",
      } as never);
      vi.mocked(db.paymentProof.count).mockResolvedValue(10);

      const result = await checkProofsQuota("tenant-1");

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(10);
      expect(result.quota).toBe(-1);
    });

    it("allows unlimited for Starter plan (-1)", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxProofsPerMonth: -1,
        cycleStartedAt: new Date("2026-02-01"),
        subscriptionPlan: "starter",
      } as never);
      vi.mocked(db.paymentProof.count).mockResolvedValue(100);

      const result = await checkProofsQuota("tenant-1");

      expect(result.allowed).toBe(true);
      expect(result.quota).toBe(-1);
    });

    it("blocks when at or over quota", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxProofsPerMonth: 10,
        cycleStartedAt: null,
        subscriptionPlan: "free",
      } as never);
      vi.mocked(db.paymentProof.count).mockResolvedValue(10);

      const result = await checkProofsQuota("tenant-1");

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(10);
      expect(result.quota).toBe(10);
    });
  });

    it("allows when quota is unlimited (-1)", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxProofsPerMonth: -1,
        cycleStartedAt: new Date("2026-02-01"),
        subscriptionPlan: "starter",
      } as never);
      vi.mocked(db.paymentProof.count).mockResolvedValue(100);

      const result = await checkProofsQuota("tenant-1");

      expect(result.allowed).toBe(true);
      expect(result.quota).toBe(-1);
    });

    it("blocks when at or over quota", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxProofsPerMonth: 10,
        cycleStartedAt: null,
        subscriptionPlan: "free",
      } as never);
      vi.mocked(db.paymentProof.count).mockResolvedValue(10);

      const result = await checkProofsQuota("tenant-1");

      expect(result.allowed).toBe(false);
      expect(result.currentUsage).toBe(10);
      expect(result.quota).toBe(10);
    });
  });

  describe("checkAgentsQuota", () => {
    it("allows when under maxAgents", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxAgents: 1,
      } as never);
      vi.mocked(db.user.count).mockResolvedValue(0);

      const result = await checkAgentsQuota("tenant-1");

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.maxAgents).toBe(1);
    });

    it("blocks when at maxAgents", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxAgents: 1,
      } as never);
      vi.mocked(db.user.count).mockResolvedValue(1);

      const result = await checkAgentsQuota("tenant-1");

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(1);
      expect(result.maxAgents).toBe(1);
    });

    it("allows when maxAgents is 5 and current is 3", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxAgents: 5,
      } as never);
      vi.mocked(db.user.count).mockResolvedValue(3);

      const result = await checkAgentsQuota("tenant-1");

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(3);
    });
  });

  describe("checkQuota", () => {
    it("Free plan — allows when under quota", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "free",
        cycleStartedAt: null,
        maxConfirmedOrdersPerMonth: 50,
        overagePerOrderCents: 0,
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(49);

      const result = await checkQuota("tenant-1");

      expect(result.allowed).toBe(true);
      expect(result.isOverage).toBe(false);
      expect(result.currentUsage).toBe(49);
      expect(result.quota).toBe(50);
    });

    it("Free plan — blocks at quota (50 confirmed)", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "free",
        cycleStartedAt: null,
        maxConfirmedOrdersPerMonth: 50,
        overagePerOrderCents: 0,
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(50);

      const result = await checkQuota("tenant-1");

      expect(result.allowed).toBe(false);
      expect(result.isOverage).toBe(false);
      expect(result.plan).toBe("free");
    });

    it("Starter plan — allows with overage beyond 300", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "starter",
        cycleStartedAt: new Date("2026-02-01"),
        maxConfirmedOrdersPerMonth: 300,
        overagePerOrderCents: 7500,
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(310);

      const result = await checkQuota("tenant-1");

      expect(result.allowed).toBe(true);
      expect(result.isOverage).toBe(true);
      expect(result.overageCount).toBe(11); // 310 - 300 + 1 (next order)
    });

    it("Pro plan — allows with overage beyond 700", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "pro",
        cycleStartedAt: new Date("2026-02-01"),
        maxConfirmedOrdersPerMonth: 700,
        overagePerOrderCents: 10000,
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(700);

      const result = await checkQuota("tenant-1");

      expect(result.allowed).toBe(true);
      expect(result.isOverage).toBe(true);
    });
  });

  describe("calculateOverage", () => {
    it("returns 0 when under quota", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "starter",
        cycleStartedAt: new Date("2026-02-01"),
        maxConfirmedOrdersPerMonth: 300,
        overagePerOrderCents: 7500,
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(200);

      const result = await calculateOverage("tenant-1");

      expect(result.overageCount).toBe(0);
      expect(result.totalAmountFCFA).toBe(0);
    });

    it("calculates overage for Starter: 12 over at 75 FCFA = 900 FCFA", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "starter",
        cycleStartedAt: new Date("2026-02-01"),
        maxConfirmedOrdersPerMonth: 300,
        overagePerOrderCents: 7500,
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(312);

      const result = await calculateOverage("tenant-1");

      expect(result.overageCount).toBe(12);
      expect(result.ratePerOrder).toBe(75);
      expect(result.totalAmountFCFA).toBe(900);
    });

    it("Free plan returns 0 (no overage, blocked)", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        subscriptionPlan: "free",
        cycleStartedAt: null,
        maxConfirmedOrdersPerMonth: 50,
        overagePerOrderCents: 0,
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(60);

      const result = await calculateOverage("tenant-1");

      expect(result.overageCount).toBe(0);
      expect(result.totalAmountFCFA).toBe(0);
    });
  });

  describe("chargeOverage", () => {
    it("charges Paystack and records SubscriptionPayment", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        paystackAuthorizationCode: "AUTH_xxx",
        subscriptionPlan: "starter",
        cycleStartedAt: new Date("2026-02-01"),
        maxConfirmedOrdersPerMonth: 300,
        overagePerOrderCents: 7500,
        users: [{ email: "owner@test.com" }],
      } as never);
      vi.mocked(db.order.count).mockResolvedValue(312);
      vi.mocked(chargeAuthorization).mockResolvedValue({
        status: true,
        message: "Charge attempted",
        data: {
          reference: "ref-overage-1",
          status: "success",
          amount: 90000,
          currency: "NGN",
        },
      });
      vi.mocked(db.subscriptionPayment.create).mockResolvedValue({} as never);

      const success = await chargeOverage("tenant-1");

      expect(success).toBe(true);
      expect(chargeAuthorization).toHaveBeenCalledWith("AUTH_xxx", "owner@test.com", 90000);
      expect(db.subscriptionPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          type: "overage",
          plan: "starter",
          amount: 900,
          status: "success",
          overageDetails: {
            ordersOverQuota: 12,
            ratePerOrder: 75,
            totalAmount: 900,
          },
        }),
      });
    });

    it("returns true when no overage to charge", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockReset();
      vi.mocked(db.order.count).mockReset();
      vi.mocked(db.order.count).mockResolvedValue(0);
      vi.mocked(chargeAuthorization).mockReset();
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        paystackAuthorizationCode: "AUTH_xxx",
        subscriptionPlan: "starter",
        cycleStartedAt: new Date("2026-02-01"),
        creditsBalance: 450,
        creditsTotalMonthly: 500,
        maxConfirmedOrdersPerMonth: 999_999,
        overagePerOrderCents: 2500,
        users: [{ email: "owner@test.com" }],
      } as never);
      vi.mocked(db.conversationWindow.count).mockResolvedValue(200);

      const success = await chargeOverage("tenant-1");

      expect(success).toBe(true);
      expect(chargeAuthorization).not.toHaveBeenCalled();
    });

    it("returns false when no authorization code", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        paystackAuthorizationCode: null,
        subscriptionPlan: "starter",
        cycleStartedAt: new Date("2026-02-01"),
        maxConfirmedOrdersPerMonth: 300,
        overagePerOrderCents: 7500,
        users: [{ email: "owner@test.com" }],
      } as never);

      const success = await chargeOverage("tenant-1");

      expect(success).toBe(false);
    });
  });

  describe("QuotaExceededError", () => {
    it("has correct properties", () => {
      const quota: QuotaCheckResult = {
        allowed: false,
        isOverage: false,
        currentUsage: 50,
        quota: 50,
        overageCount: 0,
        plan: "free",
      };
      const error = new QuotaExceededError("t1", quota);
      expect(error.name).toBe("QuotaExceededError");
      expect(error.tenantId).toBe("t1");
      expect(error.message).toContain("50/50");
    });
});
