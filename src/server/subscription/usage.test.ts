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
  },
}));

import { occupiesSeat } from "~/lib/rbac";
import { db } from "~/server/db";
import { getUsageThisCycle, checkProofsQuota, checkAgentsQuota } from "./usage";

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

    /**
     * Le siège est vendu par personne, pas par rôle.
     *
     * Le compteur ne regardait que `role: "AGENT"`, ce qui ouvrait deux
     * contournements de la limite affichée sur la page Tarifs (free 0, starter 1,
     * pro 5) : promouvoir un Agent en Manager libérait un siège, et inviter
     * directement en Manager n'en consommait aucun. Les autres tests du bloc
     * bouchonnent `db.user.count` et ne peuvent donc pas voir le critère.
     *
     * L'assertion porte sur `{ not: "OWNER" }` et non sur une liste de rôles :
     * le critère a reposé un temps sur `ASSIGNABLE_ROLES`, et retirer VENDEUR de
     * l'attribuable a suffi à faire cesser sa facturation. La règle survit à
     * l'ajout comme au retrait d'un rôle, une liste non.
     */
    it("compte toute personne de la boutique sauf le Propriétaire", async () => {
      vi.mocked(db.tenant.findUniqueOrThrow).mockResolvedValue({
        maxAgents: 5,
      } as never);
      vi.mocked(db.user.count).mockResolvedValue(0);

      await checkAgentsQuota("tenant-1");

      expect(db.user.count).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1", role: { not: "OWNER" } },
      });
      expect(occupiesSeat("MANAGER")).toBe(true);
      expect(occupiesSeat("AGENT")).toBe(true);
      expect(occupiesSeat("OWNER")).toBe(false);
    });
  });
});
