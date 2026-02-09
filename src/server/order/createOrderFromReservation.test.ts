import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "../../../generated/prisma";
import { createOrderFromReservation } from "./createOrderFromReservation";
import { db } from "~/server/db";
import { confirmReservation } from "~/server/live-item/reservation";
import { writeToOutbox } from "~/server/messaging/outbox";
import { logOrderCreated, logDepositRequested } from "~/server/events/eventLog";

vi.mock("~/server/db", () => ({
  db: {
    order: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    reservation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("~/server/live-item/reservation");
vi.mock("~/server/messaging/outbox");
vi.mock("~/server/events/eventLog", () => ({
  logOrderCreated: vi.fn().mockResolvedValue(undefined),
  logDepositRequested: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/logger", () => ({
  workerLogger: { warn: vi.fn() },
}));
vi.mock("~/env", () => ({
  env: { DEPOSIT_TTL_MINUTES: 15 },
}));

/** Story 5.1 AC#1: order SS-XXXX (SnapSell) from confirmed reservation (address_collected + OUI). */
describe("Story 5.1 AC#1: order SS-XXXX from confirmed reservation", () => {
  describe("createOrderFromReservation (Story 4.5)", () => {
  const tenantId = "tenant-1";
  const reservationId = "res-1";
  const clientPhone = "+33612345678";
  const correlationId = "corr-1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.order.findUnique).mockResolvedValue(null);
    vi.mocked(db.order.count).mockResolvedValue(0);
    vi.mocked(db.order.create).mockResolvedValue({
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
    vi.mocked(db.reservation.findUnique).mockResolvedValue({
      id: reservationId,
      tenantId,
      status: "address_collected",
      liveItemId: "item-1",
      liveItem: { id: "item-1" },
    } as never);
    vi.mocked(db.reservation.update).mockResolvedValue({} as never);
    vi.mocked(confirmReservation).mockResolvedValue({ success: true });
  });

  it("when order already exists for reservation, returns existing order (idempotence)", async () => {
    vi.mocked(db.order.findUnique).mockResolvedValue({
      id: "order-existing",
      orderNumber: "SS-0001",
      status: "confirmed",
      depositStatus: "no_deposit",
    } as never);

    const result = await createOrderFromReservation(
      tenantId,
      reservationId,
      false,
      clientPhone,
      correlationId,
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
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("when requireDeposit is false, creates Order with status confirmed and depositStatus no_deposit", async () => {
    const result = await createOrderFromReservation(
      tenantId,
      reservationId,
      false,
      clientPhone,
      correlationId,
    );

    expect(result.success).toBe(true);
    expect(result.success && result.order.status).toBe("confirmed");
    expect(result.success && result.order.depositStatus).toBe("no_deposit");
    expect(confirmReservation).toHaveBeenCalledWith(tenantId, "item-1", { correlationId });
    expect(db.reservation.update).toHaveBeenCalledWith({
      where: { id: reservationId },
      data: { status: "confirmed" },
    });
    expect(db.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        reservationId,
        orderNumber: "SS-0001",
        status: "confirmed",
        depositStatus: "no_deposit",
        depositExpiresAt: null,
      }),
    });
    expect(writeToOutbox).not.toHaveBeenCalled();
    expect(logOrderCreated).toHaveBeenCalledWith(tenantId, "order-1", reservationId, correlationId);
  });

  it("when requireDeposit is true, creates Order confirmed_pending_deposit, depositExpiresAt set, sends deposit message and logs deposit_requested", async () => {
    vi.mocked(db.order.create).mockResolvedValue({
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
      tenantId,
      reservationId,
      true,
      clientPhone,
      correlationId,
    );

    expect(result.success).toBe(true);
    expect(result.success && result.order.status).toBe("confirmed_pending_deposit");
    expect(result.success && result.order.depositStatus).toBe("deposit_pending");
    expect(db.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "confirmed_pending_deposit",
        depositStatus: "deposit_pending",
        depositExpiresAt: expect.any(Date),
      }),
    });
    expect(writeToOutbox).toHaveBeenCalledWith({
      tenantId,
      to: clientPhone,
      body: "Envoyez votre preuve d'acompte (photo ou message) dans les 15 min.",
      correlationId,
    });
    expect(logDepositRequested).toHaveBeenCalledWith(tenantId, "order-1", correlationId, {
      deposit_expires_minutes: 15,
    });
  });

  it("returns reservation_not_found when reservation does not exist or not address_collected", async () => {
    vi.mocked(db.reservation.findUnique).mockResolvedValue(null);

    const result = await createOrderFromReservation(
      tenantId,
      reservationId,
      false,
      clientPhone,
      correlationId,
    );

    expect(result).toEqual({ success: false, reason: "reservation_not_found" });
    expect(confirmReservation).not.toHaveBeenCalled();
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("returns confirm_failed when confirmReservation fails", async () => {
    vi.mocked(confirmReservation).mockResolvedValue({ success: false, reason: "no_reservation" });

    const result = await createOrderFromReservation(
      tenantId,
      reservationId,
      false,
      clientPhone,
      correlationId,
    );

    expect(result).toEqual({ success: false, reason: "confirm_failed" });
    expect(db.order.create).not.toHaveBeenCalled();
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
    vi.mocked(db.order.create).mockRejectedValueOnce(p2002ReservationId);

    const result = await createOrderFromReservation(
      tenantId,
      reservationId,
      false,
      clientPhone,
      correlationId,
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
  });
});
