/**
 * Story 6.6: Tests dashboard router — getSummary counts, revenue, live session, isolation tenant.
 * + Tests unitaires des helpers de dates (getTodayUtcRange, getYesterdayUtcRange, getLast7DaysRanges).
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import {
  getTodayUtcRange,
  getYesterdayUtcRange,
  getLast7DaysRanges,
} from "./dashboard";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockProofCount = vi.hoisted(() => vi.fn());
const mockProofFindFirst = vi.hoisted(() => vi.fn());
const mockOrderCount = vi.hoisted(() => vi.fn());
const mockOrderFindMany = vi.hoisted(() => vi.fn());
const mockGetCurrentSessionReadOnly = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    paymentProof: {
      count: mockProofCount,
      findFirst: mockProofFindFirst,
    },
    order: {
      count: mockOrderCount,
      findMany: mockOrderFindMany,
    },
  },
}));

vi.mock("~/server/live-session/service", () => ({
  getCurrentSessionReadOnly: (...args: unknown[]) =>
    mockGetCurrentSessionReadOnly(...args),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tenant1Session = {
  user: {
    id: "user-1",
    email: "seller@example.com",
    tenantId: "tenant-1",
    role: "OWNER",
  },
};

const tenant2Session = {
  user: {
    id: "user-2",
    email: "other@example.com",
    tenantId: "tenant-2",
    role: "OWNER",
  },
};

async function callerForSession(session: { user: { id: string; email: string; tenantId: string; role: string } }) {
  const ctx = await createTRPCContext({ session: session as never, headers: new Headers() });
  return createCaller(ctx);
}

function makeOrderWithAmount(amount: number | null, createdAt?: Date) {
  return {
    createdAt: createdAt ?? new Date(),
    reservation: { liveItem: { amount } },
  };
}

// ─── Date Helpers Unit Tests ─────────────────────────────────────────────────

describe("date helpers", () => {
  describe("getTodayUtcRange", () => {
    it("returns start and end of UTC day for given date", () => {
      const now = new Date("2026-02-09T15:30:00Z");
      const { from, to } = getTodayUtcRange(now);

      expect(from.toISOString()).toBe("2026-02-09T00:00:00.000Z");
      expect(to.toISOString()).toBe("2026-02-09T23:59:59.999Z");
    });

    it("handles midnight boundary", () => {
      const now = new Date("2026-02-09T00:00:00.000Z");
      const { from, to } = getTodayUtcRange(now);

      expect(from.toISOString()).toBe("2026-02-09T00:00:00.000Z");
      expect(to.toISOString()).toBe("2026-02-09T23:59:59.999Z");
    });
  });

  describe("getYesterdayUtcRange", () => {
    it("returns start and end of previous UTC day", () => {
      const now = new Date("2026-02-09T15:30:00Z");
      const { from, to } = getYesterdayUtcRange(now);

      expect(from.toISOString()).toBe("2026-02-08T00:00:00.000Z");
      expect(to.toISOString()).toBe("2026-02-08T23:59:59.999Z");
    });

    it("handles month boundary (March 1 → Feb 28)", () => {
      const now = new Date("2026-03-01T10:00:00Z");
      const { from, to } = getYesterdayUtcRange(now);

      expect(from.toISOString()).toBe("2026-02-28T00:00:00.000Z");
      expect(to.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    });
  });

  describe("getLast7DaysRanges", () => {
    it("returns 7 entries ending with today", () => {
      const now = new Date("2026-02-09T15:30:00Z");
      const ranges = getLast7DaysRanges(now);

      expect(ranges).toHaveLength(7);
      // Premier jour = il y a 6 jours
      expect(ranges[0]!.from.toISOString()).toBe("2026-02-03T00:00:00.000Z");
      expect(ranges[0]!.to.toISOString()).toBe("2026-02-03T23:59:59.999Z");
      // Dernier jour = aujourd'hui
      expect(ranges[6]!.from.toISOString()).toBe("2026-02-09T00:00:00.000Z");
      expect(ranges[6]!.to.toISOString()).toBe("2026-02-09T23:59:59.999Z");
    });

    it("each range covers exactly one day", () => {
      const now = new Date("2026-02-09T15:30:00Z");
      const ranges = getLast7DaysRanges(now);

      for (const range of ranges) {
        const diff = range.to.getTime() - range.from.getTime();
        // 23h 59m 59s 999ms = 86399999ms
        expect(diff).toBe(86_399_999);
      }
    });

    it("includes a date label for each day", () => {
      const now = new Date("2026-02-09T15:30:00Z");
      const ranges = getLast7DaysRanges(now);

      for (const range of ranges) {
        expect(range.date).toBeTruthy();
        expect(typeof range.date).toBe("string");
      }
    });
  });
});

// ─── Router Tests ────────────────────────────────────────────────────────────

describe("dashboard router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupDefaultMocks(overrides?: {
    pendingProofsCount?: number;
    lastProof?: { createdAt: Date } | null;
    ordersPreparingCount?: number;
    ordersToday?: ReturnType<typeof makeOrderWithAmount>[];
    ordersYesterday?: ReturnType<typeof makeOrderWithAmount>[];
    liveSession?: { id: string; status: string; lastActivityAt: Date } | null;
    ordersLast7Days?: ReturnType<typeof makeOrderWithAmount>[];
  }) {
    mockProofCount.mockResolvedValue(overrides?.pendingProofsCount ?? 0);
    mockProofFindFirst.mockResolvedValue(overrides?.lastProof ?? null);
    mockOrderCount.mockResolvedValue(overrides?.ordersPreparingCount ?? 0);

    // order.findMany est appelé 3 fois : ordersToday, ordersYesterday, ordersLast7Days
    mockOrderFindMany
      .mockResolvedValueOnce(overrides?.ordersToday ?? [])
      .mockResolvedValueOnce(overrides?.ordersYesterday ?? [])
      .mockResolvedValueOnce(overrides?.ordersLast7Days ?? []);

    mockGetCurrentSessionReadOnly.mockResolvedValue(overrides?.liveSession ?? null);
  }

  describe("getSummary", () => {
    it("returns correct counts with no data", async () => {
      setupDefaultMocks();
      const caller = await callerForSession(tenant1Session);

      const result = await caller.dashboard.getSummary();

      expect(result.pendingProofsCount).toBe(0);
      expect(result.lastProofSubmittedAt).toBeNull();
      expect(result.ordersPreparingCount).toBe(0);
      expect(result.ordersTodayCount).toBe(0);
      expect(result.ordersYesterdayCount).toBe(0);
      expect(result.revenueTodayCents).toBe(0);
      expect(result.revenueYesterdayCents).toBe(0);
      expect(result.revenueByDay).toHaveLength(7);
      expect(result.hasLiveSession).toBe(false);
    });

    it("returns correct counts and revenue with data", async () => {
      const proofDate = new Date("2026-02-09T10:00:00Z");
      setupDefaultMocks({
        pendingProofsCount: 3,
        lastProof: { createdAt: proofDate },
        ordersPreparingCount: 5,
        ordersToday: [
          makeOrderWithAmount(1500),
          makeOrderWithAmount(2500),
        ],
        ordersYesterday: [
          makeOrderWithAmount(1000),
        ],
      });

      const caller = await callerForSession(tenant1Session);
      const result = await caller.dashboard.getSummary();

      expect(result.pendingProofsCount).toBe(3);
      expect(result.lastProofSubmittedAt).toEqual(proofDate);
      expect(result.ordersPreparingCount).toBe(5);
      expect(result.ordersTodayCount).toBe(2);
      expect(result.ordersYesterdayCount).toBe(1);
      expect(result.revenueTodayCents).toBe(4000);
      expect(result.revenueYesterdayCents).toBe(1000);
    });

    it("handles null amount gracefully (uses 0)", async () => {
      setupDefaultMocks({
        ordersToday: [
          makeOrderWithAmount(null),
          makeOrderWithAmount(2000),
        ],
      });

      const caller = await callerForSession(tenant1Session);
      const result = await caller.dashboard.getSummary();

      expect(result.revenueTodayCents).toBe(2000);
    });

    it("returns hasLiveSession true when session exists", async () => {
      setupDefaultMocks({
        liveSession: {
          id: "session-1",
          status: "active",
          lastActivityAt: new Date(),
        },
      });

      const caller = await callerForSession(tenant1Session);
      const result = await caller.dashboard.getSummary();

      expect(result.hasLiveSession).toBe(true);
    });

    it("returns hasLiveSession false when no session", async () => {
      setupDefaultMocks({ liveSession: null });

      const caller = await callerForSession(tenant1Session);
      const result = await caller.dashboard.getSummary();

      expect(result.hasLiveSession).toBe(false);
    });

    it("passes tenantId to all queries (isolation)", async () => {
      setupDefaultMocks();
      const caller = await callerForSession(tenant1Session);

      await caller.dashboard.getSummary();

      // paymentProof.count reçoit tenantId
      expect(mockProofCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-1" }),
        })
      );

      // paymentProof.findFirst reçoit tenantId
      expect(mockProofFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-1" }),
        })
      );

      // order.count reçoit tenantId
      expect(mockOrderCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-1" }),
        })
      );

      // order.findMany (3 appels) reçoit tenantId
      for (const call of mockOrderFindMany.mock.calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({
            where: expect.objectContaining({ tenantId: "tenant-1" }),
          })
        );
      }

      // getCurrentSessionReadOnly reçoit tenantId
      expect(mockGetCurrentSessionReadOnly).toHaveBeenCalledWith("tenant-1");
    });

    it("tenant 2 calls pass tenant-2 id (cross-tenant isolation)", async () => {
      setupDefaultMocks();
      const caller = await callerForSession(tenant2Session);

      await caller.dashboard.getSummary();

      expect(mockProofCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-2" }),
        })
      );
      expect(mockGetCurrentSessionReadOnly).toHaveBeenCalledWith("tenant-2");
    });

    it("revenueByDay has 7 entries with correct structure", async () => {
      setupDefaultMocks();
      const caller = await callerForSession(tenant1Session);

      const result = await caller.dashboard.getSummary();

      expect(result.revenueByDay).toHaveLength(7);
      for (const day of result.revenueByDay) {
        expect(day).toHaveProperty("date");
        expect(day).toHaveProperty("revenueCents");
        expect(day).toHaveProperty("orders");
        expect(typeof day.date).toBe("string");
        expect(typeof day.revenueCents).toBe("number");
        expect(typeof day.orders).toBe("number");
      }
    });

    it("throws FORBIDDEN when tenantId missing (enforceTenant middleware)", async () => {
      const noTenantSession = {
        user: {
          id: "user-x",
          email: "x@example.com",
          tenantId: "",
          role: "OWNER",
        },
      };

      const caller = await callerForSession(noTenantSession);

      await expect(caller.dashboard.getSummary()).rejects.toThrow(TRPCError);
      await expect(caller.dashboard.getSummary()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });
});
