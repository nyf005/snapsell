/**
 * Story 7B.1: Tests ops router (eventLogs.list, tenants.list).
 * Accès ops via rôle OPS (tenantId null), filtres tenant/correlationId, masquage données sensibles.
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockEventLogFindMany = vi.hoisted(() => vi.fn());
const mockTenantFindUnique = vi.hoisted(() => vi.fn());
const mockTenantFindMany = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    eventLog: {
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
      findMany: (...args: unknown[]) => mockTenantFindMany(...args),
    },
  },
}));

// Mock isOpsUser pour contrôler l'accès ops (vérifie le rôle, pas l'email)
const mockIsOpsUser = vi.hoisted(() => vi.fn());
vi.mock("~/lib/rbac", async () => {
  const actual = await vi.importActual<typeof import("~/lib/rbac")>(
    "~/lib/rbac",
  );
  return {
    ...actual,
    isOpsUser: (...args: unknown[]) => mockIsOpsUser(...args),
  };
});

describe("ops router", () => {
  // CUIDs valides pour les tests
  const tenant1Id = "clx1234567890123456789012";
  const tenant2Id = "clx9876543210987654321098";
  const tenantNonexistentId = "clx0000000000000000000000";

  // User OPS : rôle OPS, pas de tenant (tenantId null)
  const opsSession = {
    user: {
      id: "clxops1234567890123456789",
      email: "ops@snapsell.com",
      tenantId: null, // OPS : pas de tenant
      role: "OPS",
    },
  };

  // User tenant classique : rôle OWNER, tenant assigné
  const nonOpsSession = {
    user: {
      id: "clxuser123456789012345678",
      email: "user1@example.com",
      tenantId: tenant1Id,
      role: "OWNER",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpsUser.mockImplementation((role: string) => {
      return role === "OPS";
    });
  });

  describe("tenants.list", () => {
    it("returns tenants list for ops user", async () => {
      mockTenantFindMany.mockResolvedValue([
        { id: tenant1Id, name: "Tenant 1" },
        { id: tenant2Id, name: "Tenant 2" },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.tenants.list();

      expect(result).toEqual([
        { id: tenant1Id, name: "Tenant 1" },
        { id: tenant2Id, name: "Tenant 2" },
      ]);
      expect(mockIsOpsUser).toHaveBeenCalledWith("OPS");
    });

    it("rejects non-ops user", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: nonOpsSession as any,
      });
      const caller = createCaller(ctx);

      await expect(caller.ops.tenants.list()).rejects.toThrow(TRPCError);
      try {
        await caller.ops.tenants.list();
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("eventLogs.list", () => {
    it("returns events for specified tenant (ops user)", async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: tenant1Id,
        name: "Tenant 1",
      });
      mockEventLogFindMany.mockResolvedValue([
        {
          id: "clxev1234567890123456789",
          tenantId: tenant1Id,
          eventType: "message_sent",
          entityType: "message_out",
          entityId: "msg-1",
          correlationId: "corr-123",
          actorType: "system",
          payload: { to: "+33612345678", body: "Test" },
          createdAt: new Date("2024-01-01T10:00:00Z"),
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.eventLogs.list({
        tenantId: tenant1Id,
        limit: 50,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.tenantId).toBe(tenant1Id);
      expect(result.tenantName).toBe("Tenant 1");
      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: tenant1Id }),
        }),
      );
    });

    it("filters by correlationId", async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: tenant1Id,
        name: "Tenant 1",
      });
      mockEventLogFindMany.mockResolvedValue([
        {
          id: "clxev1234567890123456789",
          tenantId: tenant1Id,
          eventType: "message_sent",
          entityType: "message_out",
          entityId: null,
          correlationId: "corr-123",
          actorType: "system",
          payload: { to: "+33612345678" },
          createdAt: new Date("2024-01-01T10:00:00Z"),
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.eventLogs.list({
        tenantId: tenant1Id,
        correlationId: "corr-123",
        limit: 50,
      });

      expect(result.items).toHaveLength(1);
      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: tenant1Id,
            correlationId: "corr-123",
          }),
        }),
      );
    });

    it("masks sensitive data in payload (phone numbers)", async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: tenant1Id,
        name: "Tenant 1",
      });
      mockEventLogFindMany.mockResolvedValue([
        {
          id: "clxev1234567890123456789",
          tenantId: tenant1Id,
          eventType: "message_sent",
          entityType: "message_out",
          entityId: null,
          correlationId: "corr-123",
          actorType: "system",
          payload: {
            to: "+33612345678",
            from: "+33698765432",
            phoneNumber: "+33611111111",
          },
          createdAt: new Date("2024-01-01T10:00:00Z"),
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.eventLogs.list({
        tenantId: tenant1Id,
        limit: 50,
      });

      const payload = result.items[0]?.payload as Record<string, unknown>;
      // Format masqué : 2 premiers caractères + **** + 2 derniers caractères
      expect(payload?.to).toMatch(/^\+\d\*\*\*\*\d{2}$/);
      expect(payload?.from).toMatch(/^\+\d\*\*\*\*\d{2}$/);
      expect(payload?.phoneNumber).toMatch(/^\+\d\*\*\*\*\d{2}$/);
    });

    it("does NOT mask 'from' field when value is not a phone number (CR 7B-1 M2)", async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: tenant1Id,
        name: "Tenant 1",
      });
      mockEventLogFindMany.mockResolvedValue([
        {
          id: "clxev1234567890123456789",
          tenantId: tenant1Id,
          eventType: "order.status_changed",
          entityType: "order",
          entityId: "ord-1",
          correlationId: "corr-456",
          actorType: "system",
          payload: {
            from: "pending",
            to: "confirmed",
          },
          createdAt: new Date("2024-01-01T10:00:00Z"),
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.eventLogs.list({
        tenantId: tenant1Id,
        limit: 50,
      });

      const payload = result.items[0]?.payload as Record<string, unknown>;
      // Non-phone values should NOT be masked
      expect(payload?.from).toBe("pending");
      expect(payload?.to).toBe("confirmed");
    });

    it("masks sensitive data in payload (addresses)", async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: tenant1Id,
        name: "Tenant 1",
      });
      mockEventLogFindMany.mockResolvedValue([
        {
          id: "clxev1234567890123456789",
          tenantId: tenant1Id,
          eventType: "reservation_started",
          entityType: "reservation",
          entityId: "res-1",
          correlationId: "corr-123",
          actorType: "client",
          payload: {
            address: "123 Rue de la République, 75001 Paris, France",
          },
          createdAt: new Date("2024-01-01T10:00:00Z"),
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.eventLogs.list({
        tenantId: tenant1Id,
        limit: 50,
      });

      const payload = result.items[0]?.payload as Record<string, unknown>;
      expect(payload?.address).toMatch(/^.{10}\.\.\.$/);
    });

    it("rejects if tenant not found", async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.ops.eventLogs.list({
          tenantId: tenantNonexistentId,
          limit: 50,
        }),
      ).rejects.toThrow(TRPCError);
      try {
        await caller.ops.eventLogs.list({
          tenantId: tenantNonexistentId,
          limit: 50,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("rejects non-ops user", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: nonOpsSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.ops.eventLogs.list({
          tenantId: tenant1Id,
          limit: 50,
        }),
      ).rejects.toThrow(TRPCError);
      try {
        await caller.ops.eventLogs.list({
          tenantId: tenant1Id,
          limit: 50,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("FORBIDDEN");
      }
    });

    it("requires tenantId or correlationId", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      // Neither tenantId nor correlationId → should fail
      await expect(
        caller.ops.eventLogs.list({
          limit: 50,
        } as any),
      ).rejects.toThrow();
    });

    it("searches cross-tenant by correlationId without tenantId (CR 7B-1 M1)", async () => {
      mockEventLogFindMany.mockResolvedValue([
        {
          id: "clxev1234567890123456789",
          tenantId: tenant1Id,
          eventType: "message_sent",
          entityType: "message_out",
          entityId: null,
          correlationId: "corr-cross-123",
          actorType: "system",
          payload: { body: "Test" },
          createdAt: new Date("2024-01-01T10:00:00Z"),
          tenant: { name: "Tenant 1" },
        },
        {
          id: "clxev9876543210987654321",
          tenantId: tenant2Id,
          eventType: "webhook_received",
          entityType: "webhook",
          entityId: null,
          correlationId: "corr-cross-123",
          actorType: "system",
          payload: { data: "test" },
          createdAt: new Date("2024-01-01T10:01:00Z"),
          tenant: { name: "Tenant 2" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.eventLogs.list({
        correlationId: "corr-cross-123",
        limit: 50,
      });

      expect(result.items).toHaveLength(2);
      // Cross-tenant: items come from different tenants
      expect(result.items[0]?.tenantId).toBe(tenant1Id);
      expect(result.items[1]?.tenantId).toBe(tenant2Id);
      // tenantName resolved from included tenant relation
      expect(result.items[0]?.tenantName).toBe("Tenant 1");
      expect(result.items[1]?.tenantName).toBe("Tenant 2");
      // No global tenantName when cross-tenant
      expect(result.tenantName).toBeNull();
      // Should NOT have called tenant findUnique
      expect(mockTenantFindUnique).not.toHaveBeenCalled();
      // Verify where clause: correlationId present, NO tenantId
      expect(mockEventLogFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ correlationId: "corr-cross-123" }),
        }),
      );
      const calledWhere = mockEventLogFindMany.mock.calls[0]?.[0]?.where;
      expect(calledWhere).not.toHaveProperty("tenantId");
    });
  });

  describe("mutual exclusion OPS / tenant", () => {
    it("OPS user session has tenantId null", () => {
      expect(opsSession.user.tenantId).toBeNull();
      expect(opsSession.user.role).toBe("OPS");
    });

    it("tenant user session has tenantId non-null", () => {
      expect(nonOpsSession.user.tenantId).toBe(tenant1Id);
      expect(nonOpsSession.user.role).not.toBe("OPS");
    });
  });
});
