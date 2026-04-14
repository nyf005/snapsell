import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "../../../generated/prisma";
import {
  createReservation,
  getActiveReservationForClient,
  collectAddress,
} from "./service";
import { db } from "~/server/db";
import { reserveUnits, releaseReservation } from "~/server/live-item/reservation";
import { logReservationStarted } from "~/server/events/eventLog";

vi.mock("~/server/db", () => ({
  db: {
    tenant: { findUnique: vi.fn() },
    reservation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("~/env", () => ({
  env: {
    RESERVATION_TTL_MINUTES: 10,
    RESERVATION_TTL_SOFT_MINUTES: 5,
    RESERVATION_TTL_LOCKED_MINUTES: 12,
  },
}));
vi.mock("~/server/live-item/reservation");
vi.mock("~/server/events/eventLog", () => ({
  logReservationStarted: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/lib/logger", () => ({
  workerLogger: { warn: vi.fn(), error: vi.fn() },
}));

describe("reservation/service (Story 4.1)", () => {
  const tenantId = "tenant-1";
  const liveSessionId = "session-1";
  const liveItemId = "item-1";
  const clientPhone = "+33612345678";
  const correlationId = "corr-1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reserveUnits).mockResolvedValue({ success: true });
    vi.mocked(db.tenant.findUnique).mockResolvedValue({
      requireDeposit: false,
    } as never);
    vi.mocked(db.reservation.findFirst).mockResolvedValue(null);
    vi.mocked(db.reservation.create).mockResolvedValue({
      id: "res-1",
      tenantId,
      liveSessionId,
      liveItemId,
      clientPhone,
      status: "reserved",
      address: null,
      expiresAt: null,
      correlationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createReservation", () => {
    it("returns already_reserved when active reservation exists for same client+item+session", async () => {
      vi.mocked(db.reservation.findFirst).mockResolvedValue({
        id: "res-existing",
        status: "reserved",
      } as never);

      const result = await createReservation(
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone,
        correlationId,
      );

      expect(result).toEqual({
        success: false,
        reason: "already_reserved",
        reservation: { id: "res-existing" },
      });
      expect(reserveUnits).not.toHaveBeenCalled();
      expect(db.reservation.create).not.toHaveBeenCalled();
    });

    it("returns exhausted when reserveUnits returns exhausted", async () => {
      vi.mocked(reserveUnits).mockResolvedValue({ success: false, reason: "exhausted" });

      const result = await createReservation(
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone,
        correlationId,
      );

      expect(result).toEqual({ success: false, reason: "exhausted" });
      expect(db.reservation.create).not.toHaveBeenCalled();
    });

    it("creates reservation and logs reservation_started on success", async () => {
      const result = await createReservation(
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone,
        correlationId,
      );

      expect(result).toEqual({
        success: true,
        reservation: { id: "res-1", status: "reserved" },
      });
      expect(reserveUnits).toHaveBeenCalledWith(tenantId, liveItemId, 1, {
        correlationId,
        table: "live_items",
      });
      expect(db.reservation.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          liveSessionId,
          liveItemId,
          catalogueItemId: null,
          clientPhone,
          quantity: 1,
          variantId: null,
          status: "reserved",
          correlationId,
          expiresAt: expect.any(Date),
        },
      });
      expect(logReservationStarted).toHaveBeenCalledWith(
        tenantId,
        "res-1",
        correlationId,
        { live_item_id: liveItemId, live_session_id: liveSessionId },
      );
    });

    it("Story 4.5: when tenant requireDeposit is false, expiresAt = now + TTL soft (5 min)", async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        requireDeposit: false,
      } as never);
      const before = Date.now();
      await createReservation(
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone,
        correlationId,
      );
      const after = Date.now();
      expect(db.reservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          expiresAt: expect.any(Date),
        }),
      });
      const expiresAt = (db.reservation.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.expiresAt as Date;
      const diffMs = expiresAt.getTime() - (before + after) / 2;
      const diffMin = diffMs / (60 * 1000);
      expect(diffMin).toBeGreaterThanOrEqual(4.9);
      expect(diffMin).toBeLessThanOrEqual(5.1);
    });

    it("Story 4.5: when tenant requireDeposit is true, expiresAt = now + TTL locked (12 min)", async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        requireDeposit: true,
      } as never);
      const before = Date.now();
      await createReservation(
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone,
        correlationId,
      );
      const after = Date.now();
      const expiresAt = (db.reservation.create as ReturnType<typeof vi.fn>).mock.calls[0]![0].data.expiresAt as Date;
      const diffMs = expiresAt.getTime() - (before + after) / 2;
      const diffMin = diffMs / (60 * 1000);
      expect(diffMin).toBeGreaterThanOrEqual(11.9);
      expect(diffMin).toBeLessThanOrEqual(12.1);
    });

    it("on P2002 (race), calls releaseReservation and returns already_reserved", async () => {
      vi.mocked(db.reservation.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "res-other",
          status: "reserved",
        } as never);
      vi.mocked(db.reservation.create).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "5.x",
        }),
      );

      const result = await createReservation(
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone,
        correlationId,
      );

      expect(result).toEqual({
        success: false,
        reason: "already_reserved",
        reservation: { id: "res-other" },
      });
      expect(reserveUnits).toHaveBeenCalledWith(tenantId, liveItemId, 1, {
        correlationId,
        table: "live_items",
      });
      expect(releaseReservation).toHaveBeenCalledWith(tenantId, liveItemId, 1, {
        correlationId,
        table: "live_items",
      });
      expect(logReservationStarted).not.toHaveBeenCalled();
    });
  });

  describe("getActiveReservationForClient", () => {
    it("returns first active reservation (reserved or address_collected) for client", async () => {
      const reservation = {
        id: "res-1",
        status: "reserved",
        liveItem: { code: "A12", amount: 5000 },
        catalogueItem: null,
      };
      vi.mocked(db.reservation.findFirst).mockResolvedValue(reservation as never);

      const result = await getActiveReservationForClient(
        tenantId,
        clientPhone,
      );

      expect(result).toEqual(reservation);
      expect(db.reservation.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          clientPhone,
          status: { in: ["reserved", "address_collected"] },
        },
        orderBy: { createdAt: "desc" },
        include: { liveItem: true, catalogueItem: true },
      });
    });

    it("filters by liveItemId when provided", async () => {
      await getActiveReservationForClient(
        tenantId,
        clientPhone,
        { liveItemId },
      );

      expect(db.reservation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ liveItemId }),
        }),
      );
    });
  });

  describe("collectAddress", () => {
    beforeEach(() => {
      vi.mocked(db.reservation.findFirst).mockResolvedValue({
        id: "res-1",
        status: "reserved",
        liveItem: { code: "A12", amount: 5000 },
        catalogueItem: null,
        variant: null,
        quantity: 1,
      } as never);
      vi.mocked(db.reservation.update).mockResolvedValue({
        id: "res-1",
        status: "address_collected",
        quantity: 1,
        variant: null,
      } as never);
    });

    it("returns no_reservation when no reserved reservation for client", async () => {
      vi.mocked(db.reservation.findFirst).mockResolvedValue(null);

      const result = await collectAddress(
        tenantId,
        clientPhone,
        "12 rue de la Paix",
      );

      expect(result).toEqual({ success: false, reason: "no_reservation" });
      expect(db.reservation.update).not.toHaveBeenCalled();
    });

    it("returns no_reservation when address text is empty after trim", async () => {
      const result = await collectAddress(
        tenantId,
        clientPhone,
        "   ",
      );

      expect(result).toEqual({ success: false, reason: "no_reservation" });
      expect(db.reservation.update).not.toHaveBeenCalled();
    });

    it("updates reservation with address and status address_collected, returns item for récap", async () => {
      const result = await collectAddress(
        tenantId,
        clientPhone,
        "12 rue de la Paix, Cocody",
      );

      expect(result).toEqual({
        success: true,
        reservation: {
          id: "res-1",
          item: { code: "A12", amount: 5000, quantity: 1, variantLabel: null, mediaStorageKey: undefined, catalogueItemId: undefined },
        },
      });
      expect(db.reservation.update).toHaveBeenCalledWith({
        where: { id: "res-1" },
        data: expect.objectContaining({
          address: "12 rue de la Paix, Cocody",
          status: "address_collected",
        }),
      });
    });

    it("returns address_too_long when address exceeds max length", async () => {
      const longAddress = "x".repeat(2001);

      const result = await collectAddress(
        tenantId,
        clientPhone,
        longAddress,
      );

      expect(result).toEqual({ success: false, reason: "address_too_long" });
      expect(db.reservation.update).not.toHaveBeenCalled();
    });

    it("returns already_collected when reservation status is not reserved", async () => {
      vi.mocked(db.reservation.findFirst).mockResolvedValue({
        id: "res-1",
        status: "address_collected",
        liveItem: {},
        catalogueItem: null,
      } as never);

      const result = await collectAddress(
        tenantId,
        clientPhone,
        "12 rue de la Paix",
      );

      expect(result).toEqual({ success: false, reason: "already_collected" });
      expect(db.reservation.update).not.toHaveBeenCalled();
    });
  });
});
