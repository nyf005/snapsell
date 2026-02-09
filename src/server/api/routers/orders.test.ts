/**
 * Story 5.2: Tests pour orders router (list, getById, updateStatus).
 * Story 5.4: Notification outbox delivered/cancelled, résilience writeToOutbox, isolation tenant.
 * Story 6.1: list avec filtres status, dateFrom, dateTo ; isolation tenant.
 * - Transitions valides (confirmed → delivered), invalides refusées, isolation tenant.
 * - event_log reçoit order.status_changed via logOrderStatusChanged.
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { logOrderStatusChanged } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";

const mockOrderFindMany = vi.hoisted(() => vi.fn());
const mockOrderFindFirst = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    order: {
      findMany: mockOrderFindMany,
      findFirst: mockOrderFindFirst,
      update: vi.fn(),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logOrderStatusChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: vi.fn().mockResolvedValue({
    id: "msg-1",
    tenantId: "tenant-1",
    to: "+33612345678",
    body: "",
    status: "pending",
    attempts: 0,
    correlationId: "c1",
    createdAt: new Date(),
  }),
}));

describe("orders router", () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns orders for tenant only (no filters)", async () => {
      const orders = [
        {
          id: "order-1",
          orderNumber: "SS-0001",
          status: "confirmed",
          depositStatus: "no_deposit",
          createdAt: new Date(),
          updatedAt: new Date(),
          reservationId: "res-1",
          reservation: {
            id: "res-1",
            clientPhone: "+33612345678",
            liveItemId: "item-1",
            liveItem: { code: "A" },
          },
        },
      ];
      mockOrderFindMany.mockResolvedValue(orders);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "order-1",
        orderNumber: "SS-0001",
        status: "confirmed",
        clientPhone: "+33612345678",
        liveItemCode: "A",
      });
      expect(mockOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("filters by status when status is provided", async () => {
      const deliveredOrders = [
        {
          id: "order-2",
          orderNumber: "SS-0002",
          status: "delivered",
          depositStatus: "no_deposit",
          createdAt: new Date(),
          updatedAt: new Date(),
          reservationId: "res-2",
          reservation: {
            id: "res-2",
            clientPhone: "+33698765432",
            liveItemId: "item-2",
            liveItem: { code: "B" },
          },
        },
      ];
      mockOrderFindMany.mockResolvedValue(deliveredOrders);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.list({ status: "delivered" });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("delivered");
      expect(mockOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1", status: "delivered" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("filters by dateFrom and dateTo on createdAt", async () => {
      const orders = [
        {
          id: "order-3",
          orderNumber: "SS-0003",
          status: "confirmed",
          depositStatus: "no_deposit",
          createdAt: new Date("2024-06-15T12:00:00Z"),
          updatedAt: new Date(),
          reservationId: "res-3",
          reservation: {
            id: "res-3",
            clientPhone: "+33611111111",
            liveItemId: "item-3",
            liveItem: { code: "C" },
          },
        },
      ];
      mockOrderFindMany.mockResolvedValue(orders);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.list({
        dateFrom: "2024-06-01",
        dateTo: "2024-06-30",
      });

      expect(mockOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
          orderBy: { createdAt: "desc" },
        }),
      );
      const where = mockOrderFindMany.mock.calls[0]![0].where;
      expect(where.createdAt.gte.toISOString()).toMatch(/2024-06-01T00:00:00/);
      expect(where.createdAt.lte.toISOString()).toMatch(/2024-06-30T23:59:59/);
    });

    it("tenant isolation: list for tenant2 uses only tenant2", async () => {
      mockOrderFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.list({ status: "confirmed" });

      expect(mockOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-2", status: "confirmed" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("filters by status preparing (Story 6.3: new statuses)", async () => {
      const preparingOrders = [
        {
          id: "order-prep",
          orderNumber: "SS-0099",
          status: "preparing",
          depositStatus: "no_deposit",
          createdAt: new Date(),
          updatedAt: new Date(),
          reservationId: "res-prep",
          reservation: {
            id: "res-prep",
            clientPhone: "+33600000099",
            liveItemId: "item-99",
            liveItem: { code: "Z" },
          },
        },
      ];
      mockOrderFindMany.mockResolvedValue(preparingOrders);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.list({ status: "preparing" });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("preparing");
      expect(mockOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1", status: "preparing" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("rejects dateFrom after dateTo with clear message", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.orders.list({
          dateFrom: "2024-06-30",
          dateTo: "2024-06-01",
        }),
      ).rejects.toThrow(/date de début doit être antérieure ou égale/);
      expect(mockOrderFindMany).not.toHaveBeenCalled();
    });
  });

  describe("exportCsv (Story 6.5)", () => {
    it("returns csv and filename for OWNER with tenant isolation", async () => {
      const orders = [
        {
          id: "order-1",
          orderNumber: "SS-0001",
          status: "confirmed",
          depositStatus: "no_deposit",
          createdAt: new Date("2024-06-15T12:00:00Z"),
          updatedAt: new Date(),
          reservationId: "res-1",
          reservation: {
            clientPhone: "+33612345678",
            liveItem: { code: "A" },
          },
        },
      ];
      mockOrderFindMany.mockResolvedValue(orders);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.exportCsv({});

      expect(result).toHaveProperty("csv");
      expect(result).toHaveProperty("filename");
      expect(result.filename).toMatch(/^commandes-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.csv).toContain("orderNumber,status,depositStatus,createdAt,clientPhone,liveItemCode");
      expect(result.csv).toContain("***5678");
      expect(result.csv).not.toContain("+33612345678");
      expect(mockOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1" },
          orderBy: { createdAt: "desc" },
          take: 10_001,
        }),
      );
    });

    it("throws BAD_REQUEST when more than 10k orders would be exported", async () => {
      const many = Array.from({ length: 10_001 }, (_, i) => ({
        id: `order-${i}`,
        orderNumber: `SS-${String(i).padStart(4, "0")}`,
        status: "confirmed",
        depositStatus: "no_deposit",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservationId: `res-${i}`,
        reservation: {
          clientPhone: "+33600000000",
          liveItem: { code: "A" },
        },
      }));
      mockOrderFindMany.mockResolvedValue(many);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const err = await caller.orders.exportCsv({}).catch((e) => e);
      expect(err).toMatchObject({ code: "BAD_REQUEST" });
      expect((err as Error).message).toMatch(/Trop de commandes.*10000/);
    });

    it("returns csv for MANAGER role", async () => {
      mockOrderFindMany.mockResolvedValue([]);
      const managerSession = {
        user: {
          id: "user-mgr",
          email: "manager@example.com",
          tenantId: "tenant-1",
          role: "MANAGER",
        },
      };

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: managerSession as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.exportCsv({});
      expect(result.csv).toBeDefined();
      expect(result.filename).toBeDefined();
    });

    it("throws FORBIDDEN for AGENT role", async () => {
      const agentSession = {
        user: {
          id: "user-agent",
          email: "agent@example.com",
          tenantId: "tenant-1",
          role: "AGENT",
        },
      };

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: agentSession as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.orders.exportCsv({})).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: expect.stringContaining("managers ou propriétaires"),
      });
      expect(mockOrderFindMany).not.toHaveBeenCalled();
    });

    it("applies same filters as list (status, dateFrom, dateTo)", async () => {
      mockOrderFindMany.mockResolvedValue([]);
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.exportCsv({
        status: "delivered",
        dateFrom: "2024-06-01",
        dateTo: "2024-06-30",
      });

      expect(mockOrderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            status: "delivered",
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
          orderBy: { createdAt: "desc" },
          take: 10_001,
        }),
      );
    });
  });

  describe("getById", () => {
    it("returns order when it belongs to tenant", async () => {
      const order = {
        id: "order-1",
        orderNumber: "SS-0001",
        status: "confirmed",
        depositStatus: "no_deposit",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservationId: "res-1",
        reservation: {
          id: "res-1",
          clientPhone: "+33612345678",
          liveItem: { code: "A" },
        },
      };
      mockOrderFindFirst.mockResolvedValue(order);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.getById({ orderId: "order-1" });

      expect(result).toMatchObject({
        id: "order-1",
        orderNumber: "SS-0001",
        status: "confirmed",
        clientPhone: "+33612345678",
        liveItemCode: "A",
      });
      expect(mockOrderFindFirst).toHaveBeenCalledWith({
        where: { id: "order-1", tenantId: "tenant-1" },
        include: expect.any(Object),
      });
    });

    it("throws NOT_FOUND when order does not belong to tenant", async () => {
      mockOrderFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.orders.getById({ orderId: "order-other" })).rejects.toThrow(
        TRPCError,
      );
      await expect(caller.orders.getById({ orderId: "order-other" })).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Commande introuvable.",
      });
    });

    it("returns order with status preparing (Story 6.3: new statuses)", async () => {
      const order = {
        id: "order-prep",
        orderNumber: "SS-0098",
        status: "preparing",
        depositStatus: "no_deposit",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservationId: "res-prep",
        reservation: {
          id: "res-prep",
          clientPhone: "+33600000098",
          liveItem: { code: "Y" },
        },
      };
      mockOrderFindFirst.mockResolvedValue(order);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.getById({ orderId: "order-prep" });

      expect(result).toMatchObject({
        id: "order-prep",
        orderNumber: "SS-0098",
        status: "preparing",
        clientPhone: "+33600000098",
        liveItemCode: "Y",
      });
    });
  });

  describe("updateStatus", () => {
    it("allows valid transition in_delivery → delivered and logs order.status_changed", async () => {
      const order = {
        id: "order-1",
        tenantId: "tenant-1",
        orderNumber: "SS-0001",
        status: "in_delivery",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33612345678" },
      };
      mockOrderFindFirst.mockResolvedValue(order);

      const updatedOrder = {
        ...order,
        status: "delivered" as const,
        updatedAt: new Date(),
      };
      mockTransaction.mockImplementation(async (fn: (tx: { order: { update: (arg: unknown) => Promise<typeof updatedOrder> } }) => unknown) => {
        const tx = {
          order: {
            update: vi.fn().mockResolvedValue(updatedOrder),
          },
        };
        return fn(tx);
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.updateStatus({
        orderId: "order-1",
        status: "delivered",
      });

      expect(result).toMatchObject({
        id: "order-1",
        orderNumber: "SS-0001",
        status: "delivered",
      });
      expect(logOrderStatusChanged).toHaveBeenCalledWith(
        "tenant-1",
        "order-1",
        expect.stringMatching(/^order-order-1-\d+$/),
        { from: "in_delivery", to: "delivered" },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          to: "+33612345678",
          body: "Ta commande SS-0001 est livrée.",
          correlationId: expect.stringMatching(/^order-order-1-\d+$/),
        }),
      );
    });

    it("updateStatus → delivered: outbox message contains orderNumber and livrée", async () => {
      const order = {
        id: "order-2",
        tenantId: "tenant-1",
        orderNumber: "SS-0002",
        status: "in_delivery",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-2",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33698765432" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "delivered" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.updateStatus({ orderId: "order-2", status: "delivered" });

      const outboxCall = vi.mocked(writeToOutbox).mock.calls[0]![0];
      expect(outboxCall.body).toContain("livrée");
      expect(outboxCall.body).toContain("SS-0002");
      expect(outboxCall.to).toBe("+33698765432");
    });

    it("updateStatus → cancelled: outbox message contains orderNumber and annulée", async () => {
      const order = {
        id: "order-3",
        tenantId: "tenant-1",
        orderNumber: "SS-0003",
        status: "confirmed",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-3",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33611111111" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "cancelled" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.updateStatus({ orderId: "order-3", status: "cancelled" });

      const outboxCall = vi.mocked(writeToOutbox).mock.calls[0]![0];
      expect(outboxCall.body).toContain("annulée");
      expect(outboxCall.body).toContain("SS-0003");
      expect(outboxCall.to).toBe("+33611111111");
    });

    it("when writeToOutbox fails, updateStatus still succeeds and status is persisted", async () => {
      const order = {
        id: "order-4",
        tenantId: "tenant-1",
        orderNumber: "SS-0004",
        status: "in_delivery",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-4",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33622222222" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "delivered" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );
      vi.mocked(writeToOutbox).mockRejectedValueOnce(new Error("Outbox unavailable"));

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.updateStatus({ orderId: "order-4", status: "delivered" });

      expect(result).toMatchObject({ id: "order-4", orderNumber: "SS-0004", status: "delivered" });
      expect(writeToOutbox).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid transition delivered → confirmed", async () => {
      const order = {
        id: "order-1",
        tenantId: "tenant-1",
        orderNumber: "SS-0001",
        status: "delivered",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33612345678" },
      };
      mockOrderFindFirst.mockResolvedValue(order);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.orders.updateStatus({
          orderId: "order-1",
          status: "confirmed",
        }),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.orders.updateStatus({
          orderId: "order-1",
          status: "confirmed",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Transition non autorisée"),
      });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(logOrderStatusChanged).not.toHaveBeenCalled();
    });

    it("tenant isolation: cannot update order belonging to another tenant", async () => {
      // Order belongs to tenant-2; user is tenant-1
      mockOrderFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.orders.updateStatus({
          orderId: "order-of-tenant-2",
          status: "delivered",
        }),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.orders.updateStatus({
          orderId: "order-of-tenant-2",
          status: "delivered",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(logOrderStatusChanged).not.toHaveBeenCalled();
      expect(writeToOutbox).not.toHaveBeenCalled();
    });

    // Story 6.3: full fulfillment chain and in_delivery outbox
    it("allows transition confirmed → preparing and logs order.status_changed", async () => {
      const order = {
        id: "order-p",
        tenantId: "tenant-1",
        orderNumber: "SS-0010",
        status: "confirmed",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-p",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33612345678" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "preparing" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.orders.updateStatus({
        orderId: "order-p",
        status: "preparing",
      });

      expect(result).toMatchObject({ id: "order-p", orderNumber: "SS-0010", status: "preparing" });
      expect(logOrderStatusChanged).toHaveBeenCalledWith(
        "tenant-1",
        "order-p",
        expect.stringMatching(/^order-order-p-\d+$/),
        { from: "confirmed", to: "preparing" },
      );
      expect(writeToOutbox).not.toHaveBeenCalled();
    });

    it("allows transition preparing → in_delivery and writes in_delivery outbox message", async () => {
      const order = {
        id: "order-d",
        tenantId: "tenant-1",
        orderNumber: "SS-0011",
        status: "preparing",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-d",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33698765432" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "in_delivery" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.updateStatus({
        orderId: "order-d",
        status: "in_delivery",
      });

      expect(logOrderStatusChanged).toHaveBeenCalledWith(
        "tenant-1",
        "order-d",
        expect.stringMatching(/^order-order-d-\d+$/),
        { from: "preparing", to: "in_delivery" },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          to: "+33698765432",
          body: "Ta commande SS-0011 est en cours de livraison.",
          correlationId: expect.stringMatching(/^order-order-d-\d+$/),
        }),
      );
    });

    it("allows transition in_delivery → delivered with event_log and outbox", async () => {
      const order = {
        id: "order-l",
        tenantId: "tenant-1",
        orderNumber: "SS-0012",
        status: "in_delivery",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-l",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33611111111" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "delivered" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.updateStatus({
        orderId: "order-l",
        status: "delivered",
      });

      expect(logOrderStatusChanged).toHaveBeenCalledWith(
        "tenant-1",
        "order-l",
        expect.stringMatching(/^order-order-l-\d+$/),
        { from: "in_delivery", to: "delivered" },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Ta commande SS-0012 est livrée.",
          to: "+33611111111",
        }),
      );
    });

    it("allows cancelled from preparing and writes cancelled outbox", async () => {
      const order = {
        id: "order-c",
        tenantId: "tenant-1",
        orderNumber: "SS-0013",
        status: "preparing",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-c",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33622222222" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "cancelled" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.updateStatus({
        orderId: "order-c",
        status: "cancelled",
      });

      expect(logOrderStatusChanged).toHaveBeenCalledWith(
        "tenant-1",
        "order-c",
        expect.any(String),
        { from: "preparing", to: "cancelled" },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Ta commande SS-0013 a été annulée.",
          to: "+33622222222",
        }),
      );
    });

    it("allows cancelled from confirmed and writes cancelled outbox", async () => {
      const order = {
        id: "order-cf",
        tenantId: "tenant-1",
        orderNumber: "SS-0016",
        status: "confirmed",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-cf",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33633333333" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "cancelled" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.updateStatus({ orderId: "order-cf", status: "cancelled" });

      expect(logOrderStatusChanged).toHaveBeenCalledWith(
        "tenant-1",
        "order-cf",
        expect.any(String),
        { from: "confirmed", to: "cancelled" },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Ta commande SS-0016 a été annulée.",
          to: "+33633333333",
        }),
      );
    });

    it("allows cancelled from confirmed_pending_deposit and writes cancelled outbox", async () => {
      const order = {
        id: "order-cp",
        tenantId: "tenant-1",
        orderNumber: "SS-0017",
        status: "confirmed_pending_deposit",
        depositStatus: "deposit_approved",
        depositExpiresAt: null,
        reservationId: "res-cp",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33644444444" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "cancelled" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.updateStatus({ orderId: "order-cp", status: "cancelled" });

      expect(logOrderStatusChanged).toHaveBeenCalledWith(
        "tenant-1",
        "order-cp",
        expect.any(String),
        { from: "confirmed_pending_deposit", to: "cancelled" },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Ta commande SS-0017 a été annulée.",
          to: "+33644444444",
        }),
      );
    });

    it("allows cancelled from in_delivery and writes cancelled outbox", async () => {
      const order = {
        id: "order-cd",
        tenantId: "tenant-1",
        orderNumber: "SS-0018",
        status: "in_delivery",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-cd",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33655555555" },
      };
      mockOrderFindFirst.mockResolvedValue(order);
      const updatedOrder = { ...order, status: "cancelled" as const, updatedAt: new Date() };
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ order: { update: vi.fn().mockResolvedValue(updatedOrder) } }),
      );

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.orders.updateStatus({ orderId: "order-cd", status: "cancelled" });

      expect(logOrderStatusChanged).toHaveBeenCalledWith(
        "tenant-1",
        "order-cd",
        expect.any(String),
        { from: "in_delivery", to: "cancelled" },
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Ta commande SS-0018 a été annulée.",
          to: "+33655555555",
        }),
      );
    });

    it("rejects invalid transition confirmed → delivered with BAD_REQUEST", async () => {
      const order = {
        id: "order-bad",
        tenantId: "tenant-1",
        orderNumber: "SS-0014",
        status: "confirmed",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-bad",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33600000000" },
      };
      mockOrderFindFirst.mockResolvedValue(order);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.orders.updateStatus({
          orderId: "order-bad",
          status: "delivered",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Transition non autorisée"),
      });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(logOrderStatusChanged).not.toHaveBeenCalled();
    });

    it("rejects invalid transition in_delivery → preparing with BAD_REQUEST", async () => {
      const order = {
        id: "order-bad2",
        tenantId: "tenant-1",
        orderNumber: "SS-0015",
        status: "in_delivery",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        reservationId: "res-bad2",
        createdAt: new Date(),
        updatedAt: new Date(),
        reservation: { clientPhone: "+33600000001" },
      };
      mockOrderFindFirst.mockResolvedValue(order);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.orders.updateStatus({
          orderId: "order-bad2",
          status: "preparing",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Transition non autorisée"),
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });
});
