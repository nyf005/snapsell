import { describe, it, expect } from "vitest";
import { SUBSCRIPTION_PLANS, PLAN_IDS, getPlanConfig, formatPriceFCFA } from "./subscription-plans";
import type { PlanId } from "./subscription-plans";

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
      expect(free.entitlements.creditsTotalMonthly).toBe(70);
      expect(free.entitlements.maxProofsPerMonth).toBe(-1);
      expect(free.entitlements.maxAgents).toBe(0);
      expect(free.entitlements.overagePerOrderCents).toBe(0); // Blocage
      expect(free.entitlements.hasAI).toBe(false);
    });

    it("has restricted feature flags", () => {
      expect(free.entitlements.hasExportCsv).toBe(false);
      expect(free.entitlements.hasAdvancedExports).toBe(false);
      expect(free.entitlements.hasNotificationsOutside24h).toBe(false);
      expect(free.entitlements.showBranding).toBe(true);
      expect(free.entitlements.showUpgradeBanner).toBe(true);
    });

    it("ne propose pas de recharge — le palier d'essai doit forcer une décision", () => {
      // Ouvrir les packs au Free créait une inversion : 570 conversations pour
      // 15 000 F contre 500 pour 25 000 F en Starter.
      expect(free.creditPackPriceFCFA).toBeNull();
      expect(free.creditPackLabel).toBeUndefined();
    });

    it("borne le journal d'activité à 30 jours", () => {
      expect(free.entitlements.auditRetentionDays).toBe(30);
    });
  });

  describe("Starter plan", () => {
    const starter = SUBSCRIPTION_PLANS.starter;

    it("has correct pricing", () => {
      expect(starter.price).toBe(25_000);
      expect(starter.currency).toBe("XOF");
    });

    it("has correct entitlements", () => {
      expect(starter.entitlements.creditsTotalMonthly).toBe(500);
      expect(starter.entitlements.maxProofsPerMonth).toBe(-1); // Illimité
      expect(starter.entitlements.maxAgents).toBe(1);
      expect(starter.entitlements.overagePerOrderCents).toBe(2_500); // 25 Fcfa
      expect(starter.entitlements.hasAI).toBe(true);
    });
  });

  describe("Pro plan", () => {
    const pro = SUBSCRIPTION_PLANS.pro;

    it("has correct pricing", () => {
      expect(pro.price).toBe(50_000);
      expect(pro.currency).toBe("XOF");
    });

    it("has correct entitlements", () => {
      expect(pro.entitlements.creditsTotalMonthly).toBe(1500);
      expect(pro.entitlements.maxProofsPerMonth).toBe(-1); // Illimité
      expect(pro.entitlements.maxAgents).toBe(5);
      expect(pro.entitlements.overagePerOrderCents).toBe(2_000); // 20 FCFA/session
      expect(pro.entitlements.hasAI).toBe(true);
    });

    it("has all feature flags", () => {
      expect(pro.entitlements.hasExportCsv).toBe(true);
      expect(pro.entitlements.hasAdvancedExports).toBe(true);
      expect(pro.entitlements.hasNotificationsOutside24h).toBe(true);
      expect(pro.entitlements.hasAdvancedFilters).toBe(true);
      expect(pro.entitlements.hasPrioritySupport).toBe(true);
    });
  });

  describe("getPlanConfig", () => {
    it("returns Free for 'free'", () => {
      const config = getPlanConfig("free");
      expect(config.id).toBe("free");
    });

    it("returns Starter for 'starter'", () => {
      const config = getPlanConfig("starter");
      expect(config.id).toBe("starter");
    });

    it("returns Pro for 'pro'", () => {
      const config = getPlanConfig("pro");
      expect(config.id).toBe("pro");
    });

    it("throws for invalid plan", () => {
      expect(() => getPlanConfig("invalid" as PlanId)).toThrow();
    });
  });

  describe("formatPriceFCFA", () => {
    it("formats 0 as Gratuit", () => {
      expect(formatPriceFCFA(0)).toBe("Gratuit");
    });

    // La fonction s'appelait formatPriceFCFA mais renvoyait « FCA ». La monnaie
    // s'écrit FCFA partout — voir src/lib/copy/format.ts.
    it("formats with non-breaking space separator", () => {
      expect(formatPriceFCFA(25000)).toContain("FCFA");
      expect(formatPriceFCFA(50000)).toContain("FCFA");
    });

    it("n’écrit jamais la monnaie « FCA »", () => {
      expect(formatPriceFCFA(25000)).not.toMatch(/\bFCA\b/);
    });
  });

  describe("hasAI flag", () => {
    it("Free has no AI", () => {
      expect(SUBSCRIPTION_PLANS.free.entitlements.hasAI).toBe(false);
    });

    it("Starter has AI", () => {
      expect(SUBSCRIPTION_PLANS.starter.entitlements.hasAI).toBe(true);
    });

    it("Pro has AI", () => {
      expect(SUBSCRIPTION_PLANS.pro.entitlements.hasAI).toBe(true);
    });
  });
});
