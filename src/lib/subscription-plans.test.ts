import { describe, it, expect } from "vitest";
import {
  SUBSCRIPTION_PLANS,
  PLAN_IDS,
  getPlanConfig,
  getPlanByPaystackCode,
  getPaystackPlanCode,
  formatPriceFCFA,
} from "./subscription-plans";
import type { PlanId, PlanEntitlements } from "./subscription-plans";

describe("Story 7A.2: subscription-plans config", () => {
  it("exports 3 plans: free, starter, pro", () => {
    expect(PLAN_IDS).toEqual(["free", "starter", "pro"]);
    expect(Object.keys(SUBSCRIPTION_PLANS)).toHaveLength(3);
  });

  describe("Free plan", () => {
    const free = SUBSCRIPTION_PLANS.free;

    it("has correct pricing", () => {
      expect(free.price).toBe(0);
      expect(free.currency).toBe("XOF");
      expect(free.paystackPlanCodeEnv).toBeNull();
    });

    it("has correct entitlements", () => {
      expect(free.entitlements.maxConfirmedOrdersPerMonth).toBe(50);
      expect(free.entitlements.maxProofsPerMonth).toBe(20);
      expect(free.entitlements.maxAgents).toBe(0);
      expect(free.entitlements.overagePerOrderCents).toBe(0); // Blocage
    });

    it("has restricted feature flags", () => {
      expect(free.entitlements.hasExportCsv).toBe(false);
      expect(free.entitlements.hasAdvancedExports).toBe(false);
      expect(free.entitlements.hasNotificationsOutside24h).toBe(false);
      expect(free.entitlements.showBranding).toBe(true);
      expect(free.entitlements.showUpgradeBanner).toBe(true);
    });

    it("has no overage label", () => {
      expect(free.overageLabel).toBeUndefined();
    });
  });

  describe("Starter plan", () => {
    const starter = SUBSCRIPTION_PLANS.starter;

    it("has correct pricing", () => {
      expect(starter.price).toBe(25_000);
      expect(starter.currency).toBe("XOF");
    });

    it("has correct entitlements", () => {
      expect(starter.entitlements.maxConfirmedOrdersPerMonth).toBe(300);
      expect(starter.entitlements.maxProofsPerMonth).toBe(-1); // Illimité
      expect(starter.entitlements.maxAgents).toBe(1);
      expect(starter.entitlements.overagePerOrderCents).toBe(7_500); // 75 FCFA
    });

    it("has starter feature flags", () => {
      expect(starter.entitlements.hasExportCsv).toBe(true);
      expect(starter.entitlements.hasAdvancedExports).toBe(false);
      expect(starter.entitlements.hasNotificationsOutside24h).toBe(true);
      expect(starter.entitlements.hasDepositRecommended).toBe(true);
      expect(starter.entitlements.showBranding).toBe(false);
      expect(starter.entitlements.showUpgradeBanner).toBe(false);
    });

    it("has overage label", () => {
      expect(starter.overageLabel).toBe("75 FCFA / commande au-delà");
    });
  });

  describe("Pro plan", () => {
    const pro = SUBSCRIPTION_PLANS.pro;

    it("has correct pricing", () => {
      expect(pro.price).toBe(50_000);
      expect(pro.popular).toBe(true);
    });

    it("has correct entitlements", () => {
      expect(pro.entitlements.maxConfirmedOrdersPerMonth).toBe(700);
      expect(pro.entitlements.maxProofsPerMonth).toBe(-1);
      expect(pro.entitlements.maxAgents).toBe(5);
      expect(pro.entitlements.overagePerOrderCents).toBe(10_000); // 100 FCFA
    });

    it("has full feature flags", () => {
      expect(pro.entitlements.hasExportCsv).toBe(true);
      expect(pro.entitlements.hasAdvancedExports).toBe(true);
      expect(pro.entitlements.hasAdvancedFilters).toBe(true);
      expect(pro.entitlements.hasPrioritySupport).toBe(true);
      expect(pro.entitlements.showBranding).toBe(false);
    });
  });

  describe("getPlanConfig", () => {
    it("returns correct plan for valid ID", () => {
      expect(getPlanConfig("free").id).toBe("free");
      expect(getPlanConfig("starter").id).toBe("starter");
      expect(getPlanConfig("pro").id).toBe("pro");
    });

    it("throws for invalid plan ID", () => {
      expect(() => getPlanConfig("invalid")).toThrow("Unknown plan: invalid");
    });
  });

  describe("formatPriceFCFA", () => {
    it("returns 'Gratuit' for 0", () => {
      expect(formatPriceFCFA(0)).toBe("Gratuit");
    });

    it("formats with French number format + FCFA", () => {
      // Intl.NumberFormat fr-FR uses narrow no-break space
      const result = formatPriceFCFA(25_000);
      expect(result).toContain("25");
      expect(result).toContain("000");
      expect(result).toContain("FCFA");
    });
  });

  describe("getPaystackPlanCode", () => {
    it("returns null for Free plan (no env var)", () => {
      expect(getPaystackPlanCode(SUBSCRIPTION_PLANS.free)).toBeNull();
    });

    it("returns env value for Starter when env var is set", () => {
      const original = process.env.PAYSTACK_PLAN_STARTER;
      process.env.PAYSTACK_PLAN_STARTER = "PLN_test_starter";
      expect(getPaystackPlanCode(SUBSCRIPTION_PLANS.starter)).toBe("PLN_test_starter");
      process.env.PAYSTACK_PLAN_STARTER = original;
    });

    it("returns null when env var is not set", () => {
      const original = process.env.PAYSTACK_PLAN_PRO;
      delete process.env.PAYSTACK_PLAN_PRO;
      expect(getPaystackPlanCode(SUBSCRIPTION_PLANS.pro)).toBeNull();
      process.env.PAYSTACK_PLAN_PRO = original;
    });
  });

  describe("getPlanByPaystackCode", () => {
    it("returns plan config when code matches", () => {
      const original = process.env.PAYSTACK_PLAN_STARTER;
      process.env.PAYSTACK_PLAN_STARTER = "PLN_match_test";
      const found = getPlanByPaystackCode("PLN_match_test");
      expect(found?.id).toBe("starter");
      process.env.PAYSTACK_PLAN_STARTER = original;
    });

    it("returns undefined for unknown code", () => {
      expect(getPlanByPaystackCode("PLN_nonexistent")).toBeUndefined();
    });
  });

  describe("all plans have required entitlement keys", () => {
    const requiredKeys: (keyof PlanEntitlements)[] = [
      "maxConfirmedOrdersPerMonth",
      "maxProofsPerMonth",
      "maxAgents",
      "overagePerOrderCents",
      "hasExportCsv",
      "hasAdvancedExports",
      "hasNotificationsOutside24h",
      "hasDepositRecommended",
      "hasAdvancedFilters",
      "hasPrioritySupport",
      "showBranding",
      "showUpgradeBanner",
    ];

    for (const planId of PLAN_IDS) {
      it(`${planId} has all entitlement keys`, () => {
        const plan = SUBSCRIPTION_PLANS[planId];
        for (const key of requiredKeys) {
          expect(plan.entitlements).toHaveProperty(key);
        }
      });
    }
  });
});
