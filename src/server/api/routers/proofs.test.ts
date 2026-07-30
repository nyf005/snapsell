/**
 * Story 5.3: Tests pour proofs router (listPending, approve, reject).
 * - Approve: proof + order mis à jour, event log, outbox message confirmation.
 * - Reject: proof + order deposit_rejected, event log, outbox message refus.
 * - Isolation tenant, idempotence (déjà traité → BAD_REQUEST).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { logDepositApproved, logDepositRejected } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";

const mockProofFindMany = vi.hoisted(() => vi.fn());
const mockProofFindFirst = vi.hoisted(() => vi.fn());
const mockProofUpdate = vi.hoisted(() => vi.fn());
const mockProofCount = vi.hoisted(() => vi.fn());
const mockOrderUpdate = vi.hoisted(() => vi.fn());
/**
 * La validation confirme la commande par un `updateMany` **conditionné** au
 * statut courant, et non plus par un `update` : le worker d'expiration pouvait
 * l'annuler entre le contrôle et l'écriture, et l'`update` inconditionnel
 * écrasait alors l'annulation. Le mock rend `count: 1` — la commande était
 * encore éligible.
 */
const mockOrderUpdateMany = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    paymentProof: {
      findMany: mockProofFindMany,
      findFirst: mockProofFindFirst,
      update: mockProofUpdate,
      count: mockProofCount,
    },
    order: {
      findFirst: vi.fn(),
      update: mockOrderUpdate,
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mockTransaction(fn),
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logDepositApproved: vi.fn().mockResolvedValue(undefined),
  logDepositRejected: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: vi.fn().mockResolvedValue({ id: "msg-1", tenantId: "t1", to: "+336", body: "", status: "pending", attempts: 0, correlationId: "c1", createdAt: new Date() }),
}));

describe("proofs router", () => {
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

  const pendingProofWithOrder = {
    id: "proof-1",
    orderId: "order-1",
    tenantId: "tenant-1",
    status: "pending",
    textPayload: "Preuve envoyée",
    mediaStorageKey: null,
    correlationId: "corr-1",
    createdAt: new Date(),
    order: {
      id: "order-1",
      orderNumber: "SS-0001",
      status: "confirmed_pending_deposit",
      depositStatus: "deposit_pending",
      reservation: { clientPhone: "+33612345678" },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        paymentProof: { update: mockProofUpdate },
        order: { update: mockOrderUpdate, updateMany: mockOrderUpdateMany },
      };
      return fn(tx);
    });
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("listPending", () => {
    it("returns pending proofs for tenant only", async () => {
      mockProofFindMany.mockResolvedValue([
        {
          ...pendingProofWithOrder,
          order: {
            id: "order-1",
            orderNumber: "SS-0001",
            status: "confirmed_pending_deposit",
            depositStatus: "deposit_pending",
            reservation: { clientPhone: "+33612345678" },
          },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.listPending({});

      expect(mockProofFindMany).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-1",
          status: "pending",
          order: { depositStatus: "deposit_pending" },
        },
        orderBy: { createdAt: "desc" },
        take: 21,
        skip: 0,
        cursor: undefined,
        include: expect.any(Object),
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.orderNumber).toBe("SS-0001");
      expect(result.items[0]!.clientPhone).toBe("+33612345678");
      expect(result.items[0]!.status).toBe("pending");
    });

    it("returns only pending proofs (status=pending) for tenant", async () => {
      mockProofFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      await caller.proofs.listPending({});

      expect(mockProofFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            status: "pending",
          }),
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("requests results ordered by createdAt desc", async () => {
      mockProofFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      await caller.proofs.listPending({});

      expect(mockProofFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("does not return proofs from another tenant", async () => {
      mockProofFindMany.mockResolvedValue([]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.listPending({});

      expect(mockProofFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-1" }),
        }),
      );
      expect(result.items).toHaveLength(0);
    });
  });

  describe("pendingCount", () => {
    it("returns count of pending proofs for tenant only", async () => {
      mockProofCount.mockResolvedValue(3);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.pendingCount();

      expect(result).toBe(3);
      expect(mockProofCount).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-1",
          status: "pending",
          order: { depositStatus: "deposit_pending" },
        },
      });
    });

    it("uses same tenant isolation as listPending", async () => {
      mockProofCount.mockResolvedValue(0);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);
      await caller.proofs.pendingCount();

      expect(mockProofCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-2" }),
        }),
      );
    });
  });

  describe("approve", () => {
    it("updates proof and order, logs event, writes outbox message", async () => {
      mockProofFindFirst.mockResolvedValue(pendingProofWithOrder);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.approve({ proofId: "proof-1" });

      expect(result.status).toBe("approved");
      expect(result.orderNumber).toBe("SS-0001");
      expect(mockTransaction).toHaveBeenCalled();
      expect(logDepositApproved).toHaveBeenCalledWith(
        "tenant-1",
        "order-1",
        "proof-1",
        "corr-1",
      );
      expect(writeToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          to: "+33612345678",
          body: "✅ *Acompte validé pour SS-0001.*\n\nLa commande est confirmée. On te contacte pour la livraison.",
          interactive: expect.objectContaining({
            type: "buttons",
          }),
          correlationId: expect.any(String),
        }),
      );
    });

    it("returns NOT_FOUND when proof belongs to another tenant", async () => {
      mockProofFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.proofs.approve({ proofId: "proof-1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Preuve introuvable.",
      });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(logDepositApproved).not.toHaveBeenCalled();
      expect(writeToOutbox).not.toHaveBeenCalled();
    });

    it("returns BAD_REQUEST when proof already approved", async () => {
      mockProofFindFirst.mockResolvedValue({
        ...pendingProofWithOrder,
        status: "approved",
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.proofs.approve({ proofId: "proof-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Cette preuve a déjà été traitée.",
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("returns BAD_REQUEST when order is not in confirmed_pending_deposit", async () => {
      mockProofFindFirst.mockResolvedValue({
        ...pendingProofWithOrder,
        order: {
          ...pendingProofWithOrder.order,
          status: "confirmed",
          depositStatus: "deposit_approved",
        },
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.proofs.approve({ proofId: "proof-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "La commande n'est pas en attente d'acompte.",
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    /**
     * Le contrôle ci-dessus lit la commande *avant* la transaction : le worker
     * d'expiration d'acompte peut l'annuler dans l'intervalle. La vraie garde
     * est donc dans l'écriture — un `updateMany` conditionné au statut. Quand il
     * ne touche aucune ligne, la validation doit être refusée franchement et la
     * preuve rester à traiter : une preuve « approuvée » accrochée à une
     * commande annulée serait indéfendable en litige.
     */
    it("refuse quand la commande a été annulée entre le contrôle et l'écriture", async () => {
      mockProofFindFirst.mockResolvedValue(pendingProofWithOrder);
      mockOrderUpdateMany.mockResolvedValue({ count: 0 });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.proofs.approve({ proofId: "proof-1" })).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(mockProofUpdate).not.toHaveBeenCalled();
    });
  });

  describe("reject", () => {
    it("updates proof and order deposit_rejected, logs event, writes outbox message", async () => {
      mockProofFindFirst.mockResolvedValue(pendingProofWithOrder);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.reject({ proofId: "proof-1" });

      expect(result.status).toBe("rejected");
      expect(result.orderNumber).toBe("SS-0001");
      expect(mockTransaction).toHaveBeenCalled();
      expect(logDepositRejected).toHaveBeenCalledWith(
        "tenant-1",
        "order-1",
        "proof-1",
        "corr-1",
      );
      const outboxCall = vi.mocked(writeToOutbox).mock.calls[0]![0];
      expect(outboxCall.tenantId).toBe("tenant-1");
      expect(outboxCall.to).toBe("+33612345678");
      expect(outboxCall.body).toContain("Preuve refusée");
      expect(outboxCall.body).toContain("SS-0001");
    });

    it("returns NOT_FOUND when proof belongs to another tenant", async () => {
      mockProofFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.proofs.reject({ proofId: "proof-1" })).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Preuve introuvable.",
      });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(logDepositRejected).not.toHaveBeenCalled();
      expect(writeToOutbox).not.toHaveBeenCalled();
    });

    it("returns BAD_REQUEST when proof already rejected", async () => {
      mockProofFindFirst.mockResolvedValue({
        ...pendingProofWithOrder,
        status: "rejected",
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.proofs.reject({ proofId: "proof-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Cette preuve a déjà été traitée.",
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe("bulkApprove", () => {
    it("approves multiple proofs and returns results per proof", async () => {
      mockProofFindFirst
        .mockResolvedValueOnce(pendingProofWithOrder)
        .mockResolvedValueOnce({
          ...pendingProofWithOrder,
          id: "proof-2",
          orderId: "order-2",
          order: {
            id: "order-2",
            orderNumber: "SS-0002",
            status: "confirmed_pending_deposit",
            depositStatus: "deposit_pending",
            reservation: { clientPhone: "+33687654321" },
          },
        });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.bulkApprove({
        proofIds: ["proof-1", "proof-2"],
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ proofId: "proof-1", ok: true });
      expect(result.results[1]).toEqual({ proofId: "proof-2", ok: true });
      expect(mockTransaction).toHaveBeenCalledTimes(2);
      expect(logDepositApproved).toHaveBeenCalledTimes(2);
      expect(writeToOutbox).toHaveBeenCalledTimes(2);
    });

    it("returns ok: false for proof not found without throwing", async () => {
      mockProofFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(pendingProofWithOrder);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.bulkApprove({
        proofIds: ["proof-missing", "proof-1"],
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({
        proofId: "proof-missing",
        ok: false,
        error: "Preuve introuvable.",
      });
      expect(result.results[1]).toEqual({ proofId: "proof-1", ok: true });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it("uses tenant from session for each proof", async () => {
      mockProofFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.bulkApprove({ proofIds: ["proof-1"] });

      expect(result.results[0]?.ok).toBe(false);
      expect(mockProofFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-2" }),
        }),
      );
    });
  });

  describe("bulkReject", () => {
    it("rejects multiple proofs and returns results per proof", async () => {
      mockProofFindFirst
        .mockResolvedValueOnce(pendingProofWithOrder)
        .mockResolvedValueOnce({
          ...pendingProofWithOrder,
          id: "proof-2",
          orderId: "order-2",
          order: {
            id: "order-2",
            orderNumber: "SS-0002",
            status: "confirmed_pending_deposit",
            depositStatus: "deposit_pending",
            reservation: { clientPhone: "+33687654321" },
          },
        });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.bulkReject({
        proofIds: ["proof-1", "proof-2"],
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ proofId: "proof-1", ok: true });
      expect(result.results[1]).toEqual({ proofId: "proof-2", ok: true });
      expect(mockTransaction).toHaveBeenCalledTimes(2);
      expect(logDepositRejected).toHaveBeenCalledTimes(2);
      expect(writeToOutbox).toHaveBeenCalledTimes(2);
    });

    it("returns ok: false for proof already rejected without throwing", async () => {
      mockProofFindFirst.mockResolvedValueOnce({
        ...pendingProofWithOrder,
        status: "rejected",
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);
      const result = await caller.proofs.bulkReject({ proofIds: ["proof-1"] });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        proofId: "proof-1",
        ok: false,
        error: "Déjà traitée.",
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });
});
