import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "../../../generated/prisma";
import { createOrderFromReservation } from "./createOrderFromReservation";
import { db } from "~/server/db";
import { confirmReservation } from "~/server/live-item/reservation";
import { writeToOutbox } from "~/server/messaging/outbox";
import { logEvent, logOrderCreated, logDepositRequested } from "~/server/events/eventLog";

/**
 * Mock du client transactionnel (tx) passé à la callback de db.$transaction.
 * Toutes les opérations critiques (reservation.update, order.create, order.count)
 * utilisent ce tx au lieu de db directement.
 */
const mockTxReservationUpdate = vi.fn();
const mockTxOrderCreate = vi.fn();
const mockTxOrderCount = vi.fn();

const mockTx = {
  reservation: { update: mockTxReservationUpdate },
  order: { create: mockTxOrderCreate, count: mockTxOrderCount },
};

vi.mock("~/server/db", () => ({
  db: {
    order: { findUnique: vi.fn() },
    reservation: { findUnique: vi.fn() },
    catalogueItem: { findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  },
}));
vi.mock("~/server/live-item/reservation");
vi.mock("~/server/messaging/outbox");
vi.mock("~/server/events/eventLog", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
  logOrderCreated: vi.fn().mockResolvedValue(undefined),
  logDepositRequested: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/logger", () => ({
  workerLogger: { warn: vi.fn() },
}));
vi.mock("~/env", () => ({
  env: { DEPOSIT_TTL_MINUTES: 15 },
}));

describe("Story TECH: Transaction globale confirmation → création Order", () => {
  describe("createOrderFromReservation", () => {
    const tenantId = "tenant-1";
    const reservationId = "res-1";
    const clientPhone = "+33612345678";
    const correlationId = "corr-1";

    beforeEach(() => {
      vi.clearAllMocks();

      // Default: no existing order (idempotence check HORS transaction)
      vi.mocked(db.order.findUnique).mockResolvedValue(null);

      // Default: reservation exists in address_collected (HORS transaction)
      vi.mocked(db.reservation.findUnique).mockResolvedValue({
        id: reservationId,
        tenantId,
        status: "address_collected",
        liveItemId: "item-1",
        liveItem: { id: "item-1" },
        catalogueItemId: null,
        catalogueItem: null,
      } as never);

      // Default: confirmReservation succeeds (module mock)
      vi.mocked(confirmReservation).mockResolvedValue({ success: true });

      // Default: tx mocks for INSIDE transaction
      mockTxReservationUpdate.mockResolvedValue({} as never);
      mockTxOrderCount.mockResolvedValue(0);
      mockTxOrderCreate.mockResolvedValue({
        id: "order-1",
        tenantId,
        reservationId,
        orderNumber: "SS-0001",
        status: "confirmed",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      // Restore $transaction mock (execute callback with mockTx)
      vi.mocked(db.$transaction).mockImplementation(
        (fn: unknown) => (fn as (tx: typeof mockTx) => Promise<unknown>)(mockTx),
      );
    });

    // --- Tests existants adaptés (mocks tx au lieu de db) ---

    it("when order already exists for reservation, returns existing order (idempotence)", async () => {
      vi.mocked(db.order.findUnique).mockResolvedValue({
        id: "order-existing",
        orderNumber: "SS-0001",
        status: "confirmed",
        depositStatus: "no_deposit",
      } as never);

      const result = await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(result).toEqual({
        success: true,
        order: {
          id: "order-existing",
          orderNumber: "SS-0001",
          status: "confirmed",
          depositStatus: "no_deposit",
        },
      });
      expect(confirmReservation).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("when requireDeposit is false, creates Order with status confirmed and depositStatus no_deposit", async () => {
      const result = await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(result.success).toBe(true);
      expect(result.success && result.order.status).toBe("confirmed");
      expect(result.success && result.order.depositStatus).toBe("no_deposit");

      // confirmReservation appelé avec tx (même transaction) + table
      expect(confirmReservation).toHaveBeenCalledWith(tenantId, "item-1", {
        correlationId,
        tx: mockTx,
        table: "live_items",
      });

      // Opérations critiques utilisent tx (pas db)
      expect(mockTxReservationUpdate).toHaveBeenCalledWith({
        where: { id: reservationId },
        data: { status: "confirmed" },
      });
      expect(mockTxOrderCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          reservationId,
          orderNumber: "SS-0001",
          status: "confirmed",
          depositStatus: "no_deposit",
          depositExpiresAt: null,
        }),
      });
      expect(mockTxOrderCount).toHaveBeenCalledWith({ where: { tenantId } });

      // Post-transaction : logEvent reservation_confirmed + logOrderCreated
      expect(writeToOutbox).not.toHaveBeenCalled();
      expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
        tenantId,
        eventType: "reservation_confirmed",
        entityType: "live_item",
        entityId: "item-1",
        actorType: "system",
      }));
      expect(logOrderCreated).toHaveBeenCalledWith(tenantId, "order-1", reservationId, correlationId);
    });

    it("when requireDeposit is true, creates Order confirmed_pending_deposit, depositExpiresAt set, sends deposit message and logs deposit_requested", async () => {
      mockTxOrderCreate.mockResolvedValue({
        id: "order-1",
        tenantId,
        reservationId,
        orderNumber: "SS-0001",
        status: "confirmed_pending_deposit",
        depositStatus: "deposit_pending",
        depositExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await createOrderFromReservation(
        tenantId, reservationId, true, clientPhone, correlationId,
      );

      expect(result.success).toBe(true);
      expect(result.success && result.order.status).toBe("confirmed_pending_deposit");
      expect(result.success && result.order.depositStatus).toBe("deposit_pending");
      expect(mockTxOrderCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "confirmed_pending_deposit",
          depositStatus: "deposit_pending",
          depositExpiresAt: expect.any(Date),
        }),
      });
      expect(writeToOutbox).toHaveBeenCalledWith({
        tenantId,
        to: clientPhone,
        body: "Super ! Ta commande est enregistrée 🎉\n\nPour finaliser, on a besoin d'un acompte. Envoie la preuve de paiement ici dans les 15 min 📸\n\nOn garde ton article de côté en attendant 🔒",
        correlationId,
      });
      expect(logDepositRequested).toHaveBeenCalledWith(tenantId, "order-1", correlationId, {
        deposit_expires_minutes: 15,
      });
    });

    it("returns reservation_not_found when reservation does not exist or not address_collected", async () => {
      vi.mocked(db.reservation.findUnique).mockResolvedValue(null);

      const result = await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(result).toEqual({ success: false, reason: "reservation_not_found" });
      expect(confirmReservation).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("returns confirm_failed when confirmReservation fails", async () => {
      vi.mocked(confirmReservation).mockResolvedValue({ success: false, reason: "no_reservation" });

      const result = await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(result).toEqual({ success: false, reason: "confirm_failed" });
      expect(mockTxOrderCreate).not.toHaveBeenCalled();
    });

    it("when create throws P2002 on reservation_id (concurrent order), returns existing order (idempotence)", async () => {
      vi.mocked(db.order.findUnique)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "order-concurrent",
          orderNumber: "SS-0001",
          status: "confirmed",
          depositStatus: "no_deposit",
        } as never);
      const p2002ReservationId = new Prisma.PrismaClientKnownRequestError("Unique constraint reservation_id", {
        code: "P2002",
        clientVersion: "x",
        meta: { target: ["reservation_id"] },
      });
      mockTxOrderCreate.mockRejectedValueOnce(p2002ReservationId);

      const result = await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(result).toEqual({
        success: true,
        order: {
          id: "order-concurrent",
          orderNumber: "SS-0001",
          status: "confirmed",
          depositStatus: "no_deposit",
        },
      });
      expect(db.order.findUnique).toHaveBeenCalledTimes(2);
      expect(db.order.findUnique).toHaveBeenNthCalledWith(1, { where: { reservationId } });
      expect(db.order.findUnique).toHaveBeenNthCalledWith(2, { where: { reservationId } });
    });

    // --- NOUVEAUX TESTS : Transaction globale rollback (AC#1, AC#5) ---

    it("AC#1: when order.create fails (non-P2002), stock is NOT decremented — error propagates, no Order created", async () => {
      const dbError = new Error("Unexpected DB error");
      mockTxOrderCreate.mockRejectedValue(dbError);

      await expect(
        createOrderFromReservation(tenantId, reservationId, false, clientPhone, correlationId),
      ).rejects.toThrow("Unexpected DB error");

      // confirmReservation was called WITH tx (same transaction → rollback annule le décrément)
      expect(confirmReservation).toHaveBeenCalledWith(tenantId, "item-1", {
        correlationId,
        tx: mockTx,
        table: "live_items",
      });
      // Aucun effet de bord post-transaction (pas de logEvent, pas de logOrderCreated)
      expect(logEvent).not.toHaveBeenCalled();
      expect(logOrderCreated).not.toHaveBeenCalled();
    });

    it("AC#1: when reservation.update fails inside transaction, everything is rolled back", async () => {
      const dbError = new Error("reservation update failed");
      mockTxReservationUpdate.mockRejectedValue(dbError);

      await expect(
        createOrderFromReservation(tenantId, reservationId, false, clientPhone, correlationId),
      ).rejects.toThrow("reservation update failed");

      // confirmReservation was called (in same tx → sera rollback)
      expect(confirmReservation).toHaveBeenCalledWith(tenantId, "item-1", {
        correlationId,
        tx: mockTx,
        table: "live_items",
      });
      // order.create jamais atteint
      expect(mockTxOrderCreate).not.toHaveBeenCalled();
      // Aucun effet de bord post-transaction (pas de logEvent, pas de logOrderCreated)
      expect(logEvent).not.toHaveBeenCalled();
      expect(logOrderCreated).not.toHaveBeenCalled();
    });

    it("AC#3: confirmReservation receives the global transaction client (tx)", async () => {
      await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(confirmReservation).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(confirmReservation).mock.calls[0]!;
      expect(callArgs[2]).toEqual(expect.objectContaining({ tx: mockTx }));
    });

    it("getNextOrderNumber uses tx.order.count inside the transaction (not db.order.count)", async () => {
      mockTxOrderCount.mockResolvedValue(42);
      mockTxOrderCreate.mockResolvedValue({
        id: "order-1",
        tenantId,
        reservationId,
        orderNumber: "SS-0043",
        status: "confirmed",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(result.success).toBe(true);
      // tx.order.count utilisé (pas db.order.count)
      expect(mockTxOrderCount).toHaveBeenCalledWith({ where: { tenantId } });
      expect(mockTxOrderCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ orderNumber: "SS-0043" }),
      });
    });

    it("event log and outbox are called AFTER transaction (post-transaction, non-critical)", async () => {
      await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      // db.$transaction terminé, puis logEvent + logOrderCreated appelés hors transaction
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(logEvent).toHaveBeenCalledTimes(1);
      expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "reservation_confirmed",
      }));
      expect(logOrderCreated).toHaveBeenCalledTimes(1);
      expect(logOrderCreated).toHaveBeenCalledWith(tenantId, "order-1", reservationId, correlationId);
    });

    // --- Fix #2 : Test CONCURRENCY_ROLLBACK via transaction ---

    it("when confirmReservation throws CONCURRENCY_ROLLBACK via tx, returns confirm_failed (transaction rolled back)", async () => {
      vi.mocked(confirmReservation).mockRejectedValueOnce(new Error("CONCURRENCY_ROLLBACK"));

      const result = await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(result).toEqual({ success: false, reason: "confirm_failed" });
      // Aucune opération post-transaction
      expect(mockTxOrderCreate).not.toHaveBeenCalled();
      expect(mockTxReservationUpdate).not.toHaveBeenCalled();
      expect(logEvent).not.toHaveBeenCalled();
      expect(logOrderCreated).not.toHaveBeenCalled();
    });

    // --- Fix #3 : Test P2002 order_number retry (full transaction) ---

    it("when order.create throws P2002 on order_number, retries full transaction and succeeds", async () => {
      const p2002OrderNumber = new Prisma.PrismaClientKnownRequestError("Unique constraint order_number", {
        code: "P2002",
        clientVersion: "x",
        meta: { target: ["order_number"] },
      });
      // First attempt: P2002 on order_number → retry
      mockTxOrderCreate
        .mockRejectedValueOnce(p2002OrderNumber)
        .mockResolvedValueOnce({
          id: "order-1",
          tenantId,
          reservationId,
          orderNumber: "SS-0002",
          status: "confirmed",
          depositStatus: "no_deposit",
          depositExpiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
      // Second attempt: count returns 1 (first number was taken)
      mockTxOrderCount
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      const result = await createOrderFromReservation(
        tenantId, reservationId, false, clientPhone, correlationId,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.order.orderNumber).toBe("SS-0002");
      }
      // $transaction appelé 2 fois (retry)
      expect(db.$transaction).toHaveBeenCalledTimes(2);
      // confirmReservation appelé 2 fois (une par tentative de transaction)
      expect(confirmReservation).toHaveBeenCalledTimes(2);
      // order.create appelé 2 fois
      expect(mockTxOrderCreate).toHaveBeenCalledTimes(2);
    });
  });
});
