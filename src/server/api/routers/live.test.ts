/**
 * Story 6.4: Tests live router — getCurrentSession, getSessionItems, getSessionReservations, releaseReservation.
 * Isolation tenant, releaseReservation 404/400, event_log actorType seller.
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockGetCurrentSessionReadOnly = vi.hoisted(() => vi.fn());
const mockLiveItemFindMany = vi.hoisted(() => vi.fn());
const mockReservationFindFirst = vi.hoisted(() => vi.fn());
const mockReservationFindMany = vi.hoisted(() => vi.fn());
const mockReservationUpdate = vi.hoisted(() => vi.fn());
const mockWaitlistFindFirst = vi.hoisted(() => vi.fn());
const mockWaitlistDelete = vi.hoisted(() => vi.fn());
const mockWaitlistCount = vi.hoisted(() => vi.fn());
const mockReleaseReservation = vi.hoisted(() => vi.fn());
const mockCreateReservation = vi.hoisted(() => vi.fn());
const mockLogEvent = vi.hoisted(() => vi.fn());
const mockLogWaitlistPromoted = vi.hoisted(() => vi.fn());
const mockWriteToOutbox = vi.hoisted(() => vi.fn());

vi.mock("~/server/live-session/service", () => ({
  getCurrentSessionReadOnly: (...args: unknown[]) => mockGetCurrentSessionReadOnly(...args),
}));

vi.mock("~/server/db", () => ({
  db: {
    liveSession: { findFirst: vi.fn() },
    liveItem: { findMany: mockLiveItemFindMany },
    reservation: {
      findFirst: mockReservationFindFirst,
      findMany: mockReservationFindMany,
      update: mockReservationUpdate,
    },
    waitlist: {
      findFirst: mockWaitlistFindFirst,
      delete: mockWaitlistDelete,
      count: mockWaitlistCount,
    },
  },
}));

vi.mock("~/server/live-item/reservation", () => ({
  releaseReservation: (...args: unknown[]) => mockReleaseReservation(...args),
}));

vi.mock("~/server/reservation/service", () => ({
  createReservation: (...args: unknown[]) => mockCreateReservation(...args),
}));

vi.mock("~/server/events/eventLog", () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  logWaitlistPromoted: (...args: unknown[]) => mockLogWaitlistPromoted(...args),
}));

vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: (...args: unknown[]) => mockWriteToOutbox(...args),
}));

/** CUID valide (Prisma) pour les tests releaseReservation. */
const VALID_RESERVATION_ID = "clr1234567890123456789012";

describe("live router", () => {
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
    mockLogEvent.mockResolvedValue(undefined);
    mockLogWaitlistPromoted.mockResolvedValue(undefined);
    mockWriteToOutbox.mockResolvedValue({});
  });

  describe("getLiveOpsData", () => {
    it("returns session null and empty arrays when no active session", async () => {
      mockGetCurrentSessionReadOnly.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getLiveOpsData();

      expect(result).toEqual({
        session: null,
        waitlistCount: 0,
        items: [],
        reservations: [],
      });
      expect(mockGetCurrentSessionReadOnly).toHaveBeenCalledTimes(1);
      expect(mockLiveItemFindMany).not.toHaveBeenCalled();
      expect(mockReservationFindMany).not.toHaveBeenCalled();
      expect(mockWaitlistCount).not.toHaveBeenCalled();
    });

    it("returns session, items and reservations in one call when session exists", async () => {
      const session = {
        id: "session-1",
        status: "active" as const,
        lastActivityAt: new Date(),
      };
      mockGetCurrentSessionReadOnly.mockResolvedValue(session);
      mockLiveItemFindMany.mockResolvedValue([
        {
          id: "item-1",
          code: "A",
          amountCents: 1999,
          quantity: 2,
          availableQty: 1,
          reservedQty: 1,
          mediaStorageKey: null,
        },
      ]);
      mockReservationFindMany.mockResolvedValue([
        {
          id: VALID_RESERVATION_ID,
          liveItemId: "item-1",
          clientPhone: "+33612345678",
          status: "reserved",
          expiresAt: new Date(),
          liveItem: { code: "A" },
        },
      ]);
      mockWaitlistCount.mockResolvedValue(0);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getLiveOpsData();

      expect(result.session).toEqual({ id: "session-1", lastActivityAt: session.lastActivityAt });
      expect(result.waitlistCount).toBe(0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ code: "A", amountCents: 1999 });
      expect(result.reservations).toHaveLength(1);
      expect(result.reservations[0]!.clientPhoneMasked).toMatch(/\*\*\*\d{4}$/);
      expect(mockGetCurrentSessionReadOnly).toHaveBeenCalledTimes(1);
      expect(mockWaitlistCount).toHaveBeenCalledWith({
        where: { liveSessionId: "session-1", tenantId: "tenant-1" },
      });
      expect(mockLiveItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { liveSessionId: "session-1", tenantId: "tenant-1" },
        }),
      );
      expect(mockReservationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            liveSessionId: "session-1",
            tenantId: "tenant-1",
            status: { in: ["reserved", "address_collected"] },
          },
        }),
      );
    });

    it("tenant isolation: tenant2 receives only tenant2 session and data", async () => {
      const session2 = {
        id: "session-2",
        status: "active" as const,
        lastActivityAt: new Date(),
      };
      mockGetCurrentSessionReadOnly.mockResolvedValue(session2);
      mockLiveItemFindMany.mockResolvedValue([
        {
          id: "item-tenant2",
          code: "B",
          amountCents: 2999,
          quantity: 1,
          availableQty: 0,
          reservedQty: 1,
          mediaStorageKey: null,
        },
      ]);
      mockReservationFindMany.mockResolvedValue([]);
      mockWaitlistCount.mockResolvedValue(3);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getLiveOpsData();

      expect(result.session?.id).toBe("session-2");
      expect(result.waitlistCount).toBe(3);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.code).toBe("B");
      expect(result.reservations).toHaveLength(0);
      expect(mockGetCurrentSessionReadOnly).toHaveBeenCalledWith("tenant-2");
      expect(mockWaitlistCount).toHaveBeenCalledWith({
        where: { liveSessionId: "session-2", tenantId: "tenant-2" },
      });
      expect(mockLiveItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { liveSessionId: "session-2", tenantId: "tenant-2" },
        }),
      );
      expect(mockReservationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-2" }),
        }),
      );
    });
  });

  describe("getCurrentSession", () => {
    it("returns null when no active session for tenant", async () => {
      mockGetCurrentSessionReadOnly.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getCurrentSession();

      expect(result).toBeNull();
      expect(mockGetCurrentSessionReadOnly).toHaveBeenCalledWith("tenant-1");
    });

    it("returns session when active session exists", async () => {
      const session = {
        id: "session-1",
        status: "active",
        lastActivityAt: new Date(),
      };
      mockGetCurrentSessionReadOnly.mockResolvedValue(session);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getCurrentSession();

      expect(result).toEqual({
        id: "session-1",
        lastActivityAt: session.lastActivityAt,
      });
    });
  });

  describe("getSessionItems", () => {
    it("returns empty array when no current session", async () => {
      mockGetCurrentSessionReadOnly.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getSessionItems();

      expect(result).toEqual([]);
      expect(mockLiveItemFindMany).not.toHaveBeenCalled();
    });

    it("returns items for current session filtered by tenant", async () => {
      mockGetCurrentSessionReadOnly.mockResolvedValue({
        id: "session-1",
        status: "active",
        lastActivityAt: new Date(),
      });
      mockLiveItemFindMany.mockResolvedValue([
        {
          id: "item-1",
          code: "A",
          amountCents: 1999,
          quantity: 2,
          availableQty: 1,
          reservedQty: 1,
          mediaStorageKey: null,
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getSessionItems();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "item-1",
        code: "A",
        amountCents: 1999,
        quantity: 2,
        availableQty: 1,
        reservedQty: 1,
      });
      expect(mockLiveItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { liveSessionId: "session-1", tenantId: "tenant-1" },
        }),
      );
    });
  });

  describe("getSessionReservations", () => {
    it("returns empty array when no current session", async () => {
      mockGetCurrentSessionReadOnly.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getSessionReservations();

      expect(result).toEqual([]);
      expect(mockReservationFindMany).not.toHaveBeenCalled();
    });

    it("returns reservations with masked client phone", async () => {
      mockGetCurrentSessionReadOnly.mockResolvedValue({
        id: "session-1",
        status: "active",
        lastActivityAt: new Date(),
      });
      mockReservationFindMany.mockResolvedValue([
        {
          id: "res-1",
          liveItemId: "item-1",
          clientPhone: "+33612345678",
          status: "reserved",
          expiresAt: new Date(),
          liveItem: { code: "A" },
        },
      ]);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.getSessionReservations();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "res-1",
        liveItemId: "item-1",
        code: "A",
        status: "reserved",
      });
      expect(result[0]!.clientPhoneMasked).toMatch(/\*\*\*\d{4}$/);
      expect(mockReservationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            liveSessionId: "session-1",
            tenantId: "tenant-1",
            status: { in: ["reserved", "address_collected"] },
          },
        }),
      );
    });
  });

  describe("releaseReservation", () => {
    it("rejects invalid reservationId (non-CUID) with validation error", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.live.releaseReservation({ reservationId: "x" })).rejects.toThrow();
      await expect(caller.live.releaseReservation({ reservationId: "short" })).rejects.toThrow();

      expect(mockReservationFindFirst).not.toHaveBeenCalled();
    });

    it("returns 404 when reservation not found", async () => {
      mockReservationFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const unknownCuid = "clr0000000000000000000000";
      await expect(caller.live.releaseReservation({ reservationId: unknownCuid })).rejects.toThrow(TRPCError);
      await expect(caller.live.releaseReservation({ reservationId: unknownCuid })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      expect(mockReservationUpdate).not.toHaveBeenCalled();
      expect(mockReleaseReservation).not.toHaveBeenCalled();
    });

    it("returns 404 when reservation belongs to another tenant", async () => {
      mockReservationFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID }),
      ).rejects.toThrow(TRPCError);
      expect(mockReservationFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: VALID_RESERVATION_ID, tenantId: "tenant-2" },
        }),
      );
    });

    it("returns 400 when reservation already confirmed", async () => {
      mockReservationFindFirst.mockResolvedValue({
        id: VALID_RESERVATION_ID,
        tenantId: "tenant-1",
        liveItemId: "item-1",
        liveSessionId: "session-1",
        correlationId: "c1",
        status: "confirmed",
        liveItem: { code: "A" },
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID })).rejects.toThrow(TRPCError);
      await expect(caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("plus active"),
      });

      expect(mockReservationUpdate).not.toHaveBeenCalled();
    });

    it("returns 400 when reservation already expired", async () => {
      mockReservationFindFirst.mockResolvedValue({
        id: VALID_RESERVATION_ID,
        tenantId: "tenant-1",
        liveItemId: "item-1",
        liveSessionId: "session-1",
        correlationId: "c1",
        status: "expired",
        liveItem: { code: "A" },
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(mockReservationUpdate).not.toHaveBeenCalled();
    });

    it("throws CONFLICT and rolls back reservation status when releaseReservation fails", async () => {
      mockReservationFindFirst.mockResolvedValue({
        id: VALID_RESERVATION_ID,
        tenantId: "tenant-1",
        liveItemId: "item-1",
        liveSessionId: "session-1",
        correlationId: "c1",
        status: "reserved",
        liveItem: { code: "A" },
      });
      mockReservationUpdate.mockResolvedValue({});
      mockReleaseReservation.mockResolvedValue({ success: false, reason: "no_reservation" });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID })).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("Impossible de libérer"),
      });
      expect(mockReservationUpdate).toHaveBeenCalledTimes(2);
      expect(mockReservationUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: VALID_RESERVATION_ID },
        data: { status: "expired" },
      });
      expect(mockReservationUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: VALID_RESERVATION_ID },
        data: { status: "reserved" },
      });
      expect(mockLogEvent).not.toHaveBeenCalled();
    });

    it("succeeds: marks reservation expired, calls releaseReservation, logs event with actorType seller", async () => {
      mockReservationFindFirst.mockResolvedValue({
        id: VALID_RESERVATION_ID,
        tenantId: "tenant-1",
        liveItemId: "item-1",
        liveSessionId: "session-1",
        correlationId: "c1",
        status: "reserved",
        liveItem: { code: "A" },
      });
      mockReservationUpdate.mockResolvedValue({});
      mockReleaseReservation.mockResolvedValue({ success: true });
      mockWaitlistFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID });

      expect(result).toEqual({ success: true });
      expect(mockReservationUpdate).toHaveBeenCalledWith({
        where: { id: VALID_RESERVATION_ID },
        data: { status: "expired" },
      });
      expect(mockReleaseReservation).toHaveBeenCalledWith("tenant-1", "item-1", { correlationId: "c1" });
      expect(mockLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "reservation_expired",
          entityType: "reservation",
          entityId: VALID_RESERVATION_ID,
          actorType: "seller",
          payload: expect.objectContaining({
            reservation_id: VALID_RESERVATION_ID,
            live_item_id: "item-1",
            reason: "released_by_seller",
          }),
        }),
      );
    });

    it("promotes first waitlist when present after release", async () => {
      mockReservationFindFirst.mockResolvedValue({
        id: VALID_RESERVATION_ID,
        tenantId: "tenant-1",
        liveItemId: "item-1",
        liveSessionId: "session-1",
        correlationId: "c1",
        status: "address_collected",
        liveItem: { code: "A" },
      });
      mockReservationUpdate.mockResolvedValue({});
      mockReleaseReservation.mockResolvedValue({ success: true });
      mockWaitlistFindFirst.mockResolvedValue({
        id: "wl-1",
        tenantId: "tenant-1",
        liveSessionId: "session-1",
        liveItemId: "item-1",
        clientPhone: "+33699999999",
        correlationId: "c-wl",
        position: 1,
      });
      mockCreateReservation.mockResolvedValue({
        success: true,
        reservation: { id: "res-new", status: "reserved" },
      });
      mockWaitlistDelete.mockResolvedValue({});

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID });

      expect(mockCreateReservation).toHaveBeenCalledWith(
        "tenant-1",
        "session-1",
        "item-1",
        "+33699999999",
        "c-wl",
      );
      expect(mockWaitlistDelete).toHaveBeenCalledWith({ where: { id: "wl-1" } });
      expect(mockLogWaitlistPromoted).toHaveBeenCalled();
      expect(mockWriteToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          to: "+33699999999",
          body: expect.stringContaining("A"),
        }),
      );
    });
  });
});
