/**
 * Story 6.5: Tests eventLog router (list, exportCsv).
 * Filtres, pagination, isolation tenant.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockEventLogFindMany = vi.hoisted(() => vi.fn());
const mockTenantFindUnique = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findUnique: mockTenantFindUnique,
    },
    eventLog: {
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
    },
  },
}));

describe("eventLog router", () => {
  const tenant1Session = {
    user: {
      id: "user-1",
      email: "user1@example.com",
      tenantId: "tenant-1",
      role: "OWNER",
    },
  };

  const tenant2Session = {
    user: {
      id: "user-2",
      email: "user2@example.com",
      tenantId: "tenant-2",
      role: "MANAGER",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Par défaut : plan Pro → journal illimité, aucun plancher de date injecté.
    // Les tests de profondeur redéfinissent ce mock avec un autre plan.
    mockTenantFindUnique.mockResolvedValue({
      hasExportCsv: true,
      subscriptionPlan: "pro",
    });
  });

  describe("list", () => {
    it("returns events for tenant only (no filters)", async () => {
      const events = [
        {
          id: "ev-1",
          tenantId: "tenant-1",
          eventType: "order_created",
          entityType: "order",
          entityId: "ord-1",
          correlationId: "corr-1",
          actorType: "system",
          payload: {},
          createdAt: new Date(),
        },
      ];
      mockEventLogFindMany.mockResolvedValue(events);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.eventLog.list({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: "ev-1",
        eventType: "order_created",
        entityType: "order",
        correlationId: "corr-1",
        actorType: "system",
      });
      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1" },
          orderBy: { createdAt: "desc" },
          take: 51,
        }),
      );
    });

    it("filters by eventType when provided", async () => {
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.eventLog.list({ eventType: "reservation_confirmed" });

      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: "tenant-1",
            eventType: "reservation_confirmed",
          },
        }),
      );
    });

    it("filters by dateFrom and dateTo", async () => {
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.eventLog.list({
        dateFrom: "2024-06-01",
        dateTo: "2024-06-30",
      });

      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it("filters by correlationId when provided", async () => {
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.eventLog.list({ correlationId: "msg-123" });

      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: "tenant-1",
            correlationId: "msg-123",
          },
        }),
      );
    });

    it("tenant isolation: tenant2 gets only tenant2 events", async () => {
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);

      await caller.eventLog.list({});

      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-2" },
        }),
      );
    });

    it("uses cursor for pagination when provided", async () => {
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.eventLog.list({
        cursor: "clp1abc2d3e4f5g6h7i8j9k0",
      });

      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: "clp1abc2d3e4f5g6h7i8j9k0" },
          skip: 1,
          take: 51,
        }),
      );
    });

    it("rejects dateFrom after dateTo", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.eventLog.list({
          dateFrom: "2024-06-30",
          dateTo: "2024-06-01",
        }),
      ).rejects.toThrow(/date de début doit être antérieure/);
      expect(mockEventLogFindMany).not.toHaveBeenCalled();
    });
  });

  describe("exportCsv", () => {
    it("returns csv and filename with tenant isolation", async () => {
      const events = [
        {
          id: "ev-1",
          tenantId: "tenant-1",
          eventType: "order_created",
          entityType: "order",
          entityId: "ord-1",
          correlationId: "c1",
          actorType: "system",
          payload: { order_id: "ord-1" },
          createdAt: new Date("2024-06-15T12:00:00Z"),
        },
      ];
      mockEventLogFindMany.mockResolvedValue(events);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.eventLog.exportCsv({});

      expect(result).toHaveProperty("csv");
      expect(result).toHaveProperty("filename");
      expect(result.filename).toMatch(/^audit-trail-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.csv).toContain(
        "eventType,entityType,entityId,correlationId,actorType,createdAt,payload",
      );
      expect(result.csv).toContain("order_created");
      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1" },
          orderBy: { createdAt: "desc" },
          take: 10_001,
        }),
      );
    });

    it("throws BAD_REQUEST when more than 10k events would be exported", async () => {
      const many = Array.from({ length: 10_001 }, (_, i) => ({
        id: `ev-${i}`,
        tenantId: "tenant-1",
        eventType: "order_created",
        entityType: "order",
        entityId: null,
        correlationId: "c1",
        actorType: "system",
        payload: {},
        createdAt: new Date(),
      }));
      mockEventLogFindMany.mockResolvedValue(many);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const err = await caller.eventLog.exportCsv({}).catch((e) => e);
      expect(err).toMatchObject({ code: "BAD_REQUEST" });
      expect((err as Error).message).toMatch(/Trop d'événements.*10000/);
    });

    it("applies same filters as list for export", async () => {
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.eventLog.exportCsv({
        eventType: "reservation_started",
        dateFrom: "2024-06-01",
        dateTo: "2024-06-30",
        correlationId: "corr-x",
      });

      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: "tenant-1",
            eventType: "reservation_started",
            correlationId: "corr-x",
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          },
          take: 10_001,
        }),
      );
    });
  });

  describe("profondeur du journal selon le plan (auditRetentionDays)", () => {
    /** Borne haute tolérante : le plancher est calculé à l'exécution. */
    function daysAgo(n: number): Date {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - n);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    }

    it("borne le journal à 90 jours en Starter", async () => {
      mockTenantFindUnique.mockResolvedValue({
        hasExportCsv: true,
        subscriptionPlan: "starter",
      });
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      await caller.eventLog.list({});

      const call = mockEventLogFindMany.mock.calls[0]![0] as {
        where: { createdAt?: { gte?: Date } };
      };
      expect(call.where.createdAt?.gte).toEqual(daysAgo(90));
    });

    it("borne le journal à 30 jours en Free", async () => {
      mockTenantFindUnique.mockResolvedValue({
        hasExportCsv: false,
        subscriptionPlan: "free",
      });
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      await caller.eventLog.list({});

      const call = mockEventLogFindMany.mock.calls[0]![0] as {
        where: { createdAt?: { gte?: Date } };
      };
      expect(call.where.createdAt?.gte).toEqual(daysAgo(30));
    });

    it("retombe sur la borne la plus restrictive si le plan est inconnu", async () => {
      mockTenantFindUnique.mockResolvedValue({
        hasExportCsv: false,
        subscriptionPlan: "plan-corrompu",
      });
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      // Ne doit pas lever : consulter le journal ne peut pas échouer sur une
      // valeur de plan invalide — mais on n'ouvre pas l'historique complet.
      await caller.eventLog.list({});

      const call = mockEventLogFindMany.mock.calls[0]![0] as {
        where: { createdAt?: { gte?: Date } };
      };
      expect(call.where.createdAt?.gte).toEqual(daysAgo(30));
    });

    it("n'impose aucune borne en Pro", async () => {
      mockTenantFindUnique.mockResolvedValue({
        hasExportCsv: true,
        subscriptionPlan: "pro",
      });
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      await caller.eventLog.list({});

      const call = mockEventLogFindMany.mock.calls[0]![0] as {
        where: { createdAt?: unknown };
      };
      expect(call.where.createdAt).toBeUndefined();
    });

    it("ne relâche pas une borne demandée plus récente que le plancher", async () => {
      mockTenantFindUnique.mockResolvedValue({
        hasExportCsv: true,
        subscriptionPlan: "starter",
      });
      mockEventLogFindMany.mockResolvedValue([]);

      const recent = daysAgo(7).toISOString().slice(0, 10);
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      await caller.eventLog.list({ dateFrom: recent });

      const call = mockEventLogFindMany.mock.calls[0]![0] as {
        where: { createdAt?: { gte?: Date } };
      };
      // La demande de l'utilisateur (7 jours) est plus restrictive : on la conserve.
      expect(call.where.createdAt?.gte).toEqual(daysAgo(7));
    });

    it("l'export applique la même borne que la consultation", async () => {
      mockTenantFindUnique.mockResolvedValue({
        hasExportCsv: true,
        subscriptionPlan: "starter",
      });
      mockEventLogFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      await caller.eventLog.exportCsv({});

      const call = mockEventLogFindMany.mock.calls[0]![0] as {
        where: { createdAt?: { gte?: Date } };
      };
      // Sinon l'export serait une porte dérobée vers un historique plus profond.
      expect(call.where.createdAt?.gte).toEqual(daysAgo(90));
    });
  });
});
