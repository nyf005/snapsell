/**
 * Story 7B.1 + 7B.2: Tests ops router (eventLogs.list, tenants.list, dlq.list, dlq.failedMessages).
 * Accès ops via rôle OPS (tenantId null), filtres tenant/correlationId, masquage données sensibles.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockEventLogFindMany = vi.hoisted(() => vi.fn());
const mockTenantFindUnique = vi.hoisted(() => vi.fn());
const mockTenantFindMany = vi.hoisted(() => vi.fn());
const mockDeadLetterJobFindMany = vi.hoisted(() => vi.fn());
const mockMessageOutFindMany = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    eventLog: {
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
      findMany: (...args: unknown[]) => mockTenantFindMany(...args),
    },
    deadLetterJob: {
      findMany: (...args: unknown[]) => mockDeadLetterJobFindMany(...args),
    },
    messageOut: {
      findMany: (...args: unknown[]) => mockMessageOutFindMany(...args),
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

      await expect(caller.ops.tenants.list()).rejects.toThrow(
        expect.objectContaining({ code: "FORBIDDEN" }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({ code: "NOT_FOUND" }),
      );
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
      ).rejects.toThrow(
        expect.objectContaining({ code: "FORBIDDEN" }),
      );
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

  describe("dlq.list (Story 7B.2)", () => {
    it("returns DLQ entries for ops user with tenant filter", async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: tenant1Id,
        name: "Tenant 1",
      });
      mockDeadLetterJobFindMany.mockResolvedValue([
        {
          id: "dlq1",
          tenantId: tenant1Id,
          jobType: "message_out",
          payload: { to: "+33612345678", body: "Hello" },
          errorMessage: "Provider send error",
          errorStack: null,
          attempts: 3,
          createdAt: new Date("2024-01-01T10:00:00Z"),
          resolvedAt: null,
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.dlq.list({
        tenantId: tenant1Id,
        limit: 50,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.jobType).toBe("message_out");
      expect(result.items[0]?.tenantName).toBe("Tenant 1");
      expect(result.items[0]?.errorMessage).toBe("Provider send error");
      expect(result.items[0]?.attempts).toBe(3);
      const payload = result.items[0]?.payload as Record<string, unknown>;
      expect(payload?.to).toMatch(/^\+\d\*\*\*\*\d{2}$/);
    });

    it("rejects non-ops user for dlq.list", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: nonOpsSession as any,
      });
      const caller = createCaller(ctx);

      await expect(caller.ops.dlq.list({ limit: 50 })).rejects.toThrow(
        expect.objectContaining({ code: "FORBIDDEN" }),
      );
    });

    it("filters by resolved=false when requested", async () => {
      mockDeadLetterJobFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      await caller.ops.dlq.list({ resolved: false, limit: 50 });

      expect(mockDeadLetterJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resolvedAt: null }),
        }),
      );
    });

    it("rejects if tenant not found for dlq.list", async () => {
      mockTenantFindUnique.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.ops.dlq.list({ tenantId: tenantNonexistentId, limit: 50 }),
      ).rejects.toThrow(
        expect.objectContaining({ code: "NOT_FOUND" }),
      );
    });

    it("filters by resolved=true (CR 7B-2 L1)", async () => {
      mockDeadLetterJobFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      await caller.ops.dlq.list({ resolved: true, limit: 50 });

      expect(mockDeadLetterJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resolvedAt: { not: null } }),
        }),
      );
    });

    it("returns nextCursor when more rows exist (CR 7B-2 L2)", async () => {
      // Simulate limit=2 with 3 rows returned (take: limit+1)
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `dlq-${i}`,
        tenantId: tenant1Id,
        jobType: "message_out",
        payload: {},
        errorMessage: `error ${i}`,
        errorStack: null,
        attempts: 1,
        createdAt: new Date("2024-01-01T10:00:00Z"),
        resolvedAt: null,
        tenant: { name: "Tenant 1" },
      }));
      mockDeadLetterJobFindMany.mockResolvedValue(rows);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.dlq.list({ limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe("dlq-1");
    });

    it("filters by jobType when provided (CR 7B-2 M1)", async () => {
      mockDeadLetterJobFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      await caller.ops.dlq.list({ jobType: "message_out", limit: 50 });

      expect(mockDeadLetterJobFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ jobType: "message_out" }),
        }),
      );
    });

    it("truncates errorStack to 10 lines max (CR 7B-2 M2)", async () => {
      const longStack = Array.from({ length: 20 }, (_, i) => `at line ${i}`).join("\n");
      mockDeadLetterJobFindMany.mockResolvedValue([
        {
          id: "dlq-stack",
          tenantId: tenant1Id,
          jobType: "message_out",
          payload: {},
          errorMessage: "boom",
          errorStack: longStack,
          attempts: 1,
          createdAt: new Date("2024-01-01T10:00:00Z"),
          resolvedAt: null,
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.dlq.list({ limit: 50 });

      const stack = result.items[0]?.errorStack;
      expect(stack).toBeDefined();
      expect(stack!.split("\n")).toHaveLength(10);
      expect(stack).toContain("at line 0");
      expect(stack).toContain("at line 9");
      expect(stack).not.toContain("at line 10");
    });

    it("sanitizes body > 200 chars in DLQ payload (CR 7B-2 M5)", async () => {
      const longBody = "A".repeat(300);
      mockDeadLetterJobFindMany.mockResolvedValue([
        {
          id: "dlq-body",
          tenantId: tenant1Id,
          jobType: "message_out",
          payload: { body: longBody, to: "+33612345678" },
          errorMessage: "timeout",
          errorStack: null,
          attempts: 3,
          createdAt: new Date("2024-01-01T10:00:00Z"),
          resolvedAt: null,
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.dlq.list({ limit: 50 });

      const payload = result.items[0]?.payload as Record<string, unknown>;
      // body should be truncated at 200 chars + ellipsis
      expect(typeof payload?.body).toBe("string");
      expect((payload?.body as string).length).toBeLessThanOrEqual(202); // 200 + "…" (2-byte char)
      expect((payload?.body as string).endsWith("…")).toBe(true);
      // to should still be masked
      expect(payload?.to).toMatch(/^\+\d\*\*\*\*\d{2}$/);
    });
  });

  describe("dlq.failedMessages (Story 7B.2)", () => {
    it("returns failed MessageOut for ops user", async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: tenant1Id,
        name: "Tenant 1",
      });
      mockMessageOutFindMany.mockResolvedValue([
        {
          id: "msg1",
          tenantId: tenant1Id,
          to: "+33612345678",
          body: "Short",
          lastError: "Network error",
          attempts: 2,
          correlationId: "corr-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.dlq.failedMessages({
        tenantId: tenant1Id,
        limit: 50,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.lastError).toBe("Network error");
      expect(result.items[0]?.to).toMatch(/^\+\d\*\*\*\*\d{2}$/);
    });

    it("rejects non-ops user for failedMessages", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: nonOpsSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.ops.dlq.failedMessages({ limit: 50 }),
      ).rejects.toThrow(
        expect.objectContaining({ code: "FORBIDDEN" }),
      );
    });

    it("truncates body > 200 chars in failedMessages (CR 7B-2 L2)", async () => {
      mockTenantFindUnique.mockResolvedValue({
        id: tenant1Id,
        name: "Tenant 1",
      });
      const longBody = "B".repeat(300);
      mockMessageOutFindMany.mockResolvedValue([
        {
          id: "msg-long",
          tenantId: tenant1Id,
          to: "+33612345678",
          body: longBody,
          lastError: "timeout",
          attempts: 2,
          correlationId: "corr-2",
          createdAt: new Date(),
          updatedAt: new Date(),
          tenant: { name: "Tenant 1" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: opsSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.ops.dlq.failedMessages({
        tenantId: tenant1Id,
        limit: 50,
      });

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item?.body.length).toBeLessThanOrEqual(202);
      expect(item?.body.endsWith("…")).toBe(true);
      expect(item?.to).toMatch(/^\+\d\*\*\*\*\d{2}$/);
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
