/**
 * Story 6.4: Tests live router — getCurrentSession, getSessionItems, getSessionReservations, releaseReservation.
 * Isolation tenant, releaseReservation 404/400, event_log actorType seller.
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockGetCurrentSessionReadOnly = vi.hoisted(() => vi.fn());
const mockGetOrCreateCurrentSession = vi.hoisted(() => vi.fn());
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
const mockLogLiveSessionCreated = vi.hoisted(() => vi.fn());
const mockWriteToOutbox = vi.hoisted(() => vi.fn());

vi.mock("~/server/live-session/service", () => ({
  getCurrentSessionReadOnly: (...args: unknown[]) => mockGetCurrentSessionReadOnly(...args),
  getOrCreateCurrentSession: (...args: unknown[]) => mockGetOrCreateCurrentSession(...args),
}));

const mockCatalogueItemFindMany = vi.hoisted(() => vi.fn(() => Promise.resolve([])));

vi.mock("~/server/db", () => ({
  db: {
    liveSession: { findFirst: vi.fn() },
    liveItem: { findMany: mockLiveItemFindMany },
    catalogueItem: { findMany: mockCatalogueItemFindMany },
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
  logLiveSessionCreated: (...args: unknown[]) => mockLogLiveSessionCreated(...args),
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
    mockLogLiveSessionCreated.mockResolvedValue(undefined);
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
          amount: 1999,
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
      expect(result.items[0]).toMatchObject({ code: "A", amount: 1999 });
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
            tenantId: "tenant-1",
            status: { in: ["reserved", "address_collected"] },
            OR: [
              { liveSessionId: "session-1" },
              { catalogueItemId: { not: null }, liveSessionId: null },
            ],
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
          amount: 2999,
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

  describe("startLive (Story 8.3)", () => {
    it("creates new session and logs event when no active session exists", async () => {
      const now = new Date();
      mockGetOrCreateCurrentSession.mockResolvedValue({
        id: "new-session-1",
        status: "active",
        lastActivityAt: now,
        created: true,
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.startLive();

      expect(result).toEqual({
        id: "new-session-1",
        lastActivityAt: now,
        created: true,
      });
      expect(mockGetOrCreateCurrentSession).toHaveBeenCalledWith("tenant-1");
      expect(mockLogLiveSessionCreated).toHaveBeenCalledWith(
        "tenant-1",
        "new-session-1",
        "user-1",
        { actorType: "seller" },
      );
    });

    it("returns existing session without logging when session already active", async () => {
      const now = new Date();
      mockGetOrCreateCurrentSession.mockResolvedValue({
        id: "existing-session-1",
        status: "active",
        lastActivityAt: now,
        created: false,
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.startLive();

      expect(result).toEqual({
        id: "existing-session-1",
        lastActivityAt: now,
        created: false,
      });
      expect(mockGetOrCreateCurrentSession).toHaveBeenCalledWith("tenant-1");
      expect(mockLogLiveSessionCreated).not.toHaveBeenCalled();
    });

    it("tenant isolation: tenant2 creates its own session", async () => {
      const now = new Date();
      mockGetOrCreateCurrentSession.mockResolvedValue({
        id: "session-tenant2",
        status: "active",
        lastActivityAt: now,
        created: true,
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant2Session as never,
      });
      const caller = createCaller(ctx);

      const result = await caller.live.startLive();

      expect(result.id).toBe("session-tenant2");
      expect(mockGetOrCreateCurrentSession).toHaveBeenCalledWith("tenant-2");
      expect(mockLogLiveSessionCreated).toHaveBeenCalledWith(
        "tenant-2",
        "session-tenant2",
        "user-2",
        { actorType: "seller" },
      );
    });

    it("throws FORBIDDEN when tenantId is missing", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: { user: { id: "user-x", email: "x@example.com", tenantId: null, role: "OWNER" } } as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.live.startLive()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mockGetOrCreateCurrentSession).not.toHaveBeenCalled();
    });

    it("propagates error when getOrCreateCurrentSession fails", async () => {
      mockGetOrCreateCurrentSession.mockRejectedValue(new Error("DB connection failed"));

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(caller.live.startLive()).rejects.toThrow("DB connection failed");
      expect(mockGetOrCreateCurrentSession).toHaveBeenCalledWith("tenant-1");
      expect(mockLogLiveSessionCreated).not.toHaveBeenCalled();
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
        catalogueItemId: null,
        liveSessionId: "session-1",
        correlationId: "c1",
        status: "reserved",
        quantity: 1,
        liveItem: { code: "A" },
        catalogueItem: null,
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
      expect(mockReleaseReservation).toHaveBeenCalledWith("tenant-1", "item-1", 1, { correlationId: "c1", table: "live_items" });
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
        catalogueItemId: null,
        liveSessionId: "session-1",
        correlationId: "c1",
        status: "address_collected",
        liveItem: { code: "A" },
        catalogueItem: null,
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
        reservation: { id: "res-1", status: "reserved" } 
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

    // ── Story 8.1: Catalogue item tests ───────────────────

    it("Story 8.1: releases catalogue reservation (catalogueItemId set, liveItemId null)", async () => {
      mockReservationFindFirst.mockResolvedValue({
        id: VALID_RESERVATION_ID,
        tenantId: "tenant-1",
        liveItemId: null,
        catalogueItemId: "cat-item-1",
        liveSessionId: null,
        correlationId: "c-cat",
        status: "reserved",
        quantity: 1,
        liveItem: null,
        catalogueItem: { code: "D9" },
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
      expect(mockReleaseReservation).toHaveBeenCalledWith(
        "tenant-1",
        "cat-item-1",
        1,
        { correlationId: "c-cat", table: "catalogue_items" },
      );
      expect(mockLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "reservation_expired",
          actorType: "seller",
          payload: expect.objectContaining({
            reservation_id: VALID_RESERVATION_ID,
            catalogue_item_id: "cat-item-1",
            reason: "released_by_seller",
          }),
        }),
      );
    });

    it("Story 9.1: releases catalogue reservation and promotes catalogue waitlist entry (no sentinel)", async () => {
      mockReservationFindFirst.mockResolvedValue({
        id: VALID_RESERVATION_ID,
        tenantId: "tenant-1",
        liveItemId: null,
        catalogueItemId: "cat-item-2",
        liveSessionId: null,
        correlationId: "c-cat-2",
        status: "reserved",
        quantity: 1,
        liveItem: null,
        catalogueItem: { code: "A12" },
      });
      mockReservationUpdate.mockResolvedValue({});
      mockReleaseReservation.mockResolvedValue({ success: true });
      mockWaitlistFindFirst.mockResolvedValue({
        id: "wl-cat",
        tenantId: "tenant-1",
        liveSessionId: null,
        liveItemId: null,
        catalogueItemId: "cat-item-2",
        clientPhone: "+33688888888",
        correlationId: "c-wl-cat",
        position: 1,
      });
      mockCreateReservation.mockResolvedValue({
        success: true,
        reservation: { id: "res-promoted-cat", status: "reserved" },
      });
      mockWaitlistDelete.mockResolvedValue({});

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID });

      // Story 9.1: Catalogue promotion uses catalogueItemId directly (no sentinel)
      expect(mockCreateReservation).toHaveBeenCalledWith(
        "tenant-1",
        null, // liveSessionId = null for catalogue
        null, // liveItemId = null for catalogue
        "+33688888888",
        "c-wl-cat",
        expect.objectContaining({ catalogueItemId: "cat-item-2" }),
      );
      expect(mockWaitlistDelete).toHaveBeenCalledWith({ where: { id: "wl-cat" } });
      expect(mockWriteToOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          to: "+33688888888",
          body: expect.stringContaining("A12"),
        }),
      );
    });

    it("Story 8.1: throws BAD_REQUEST when neither catalogueItemId nor liveItemId is set", async () => {
      mockReservationFindFirst.mockResolvedValue({
        id: VALID_RESERVATION_ID,
        tenantId: "tenant-1",
        liveItemId: null,
        catalogueItemId: null,
        liveSessionId: null,
        correlationId: "c-broken",
        status: "reserved",
        liveItem: null,
        catalogueItem: null,
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: tenant1Session as never,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.live.releaseReservation({ reservationId: VALID_RESERVATION_ID }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        // Le message porte désormais une clé utilisateur ; les noms de colonnes
        // (liveItemId / catalogueItemId) ne sortent plus vers l'interface.
        userKey: "reservation.invalid",
      });
      expect(mockReleaseReservation).not.toHaveBeenCalled();
    });
  });
});
