import { describe, it, expect, vi, beforeEach } from "vitest";
import { runReservationReminderJob, runReservationTtlJob } from "./reservation-ttl";
import { db } from "~/server/db";
import { createReservation } from "~/server/reservation/service";
import {
  logReservationExpired,
  logReservationReminderSent,
  logWaitlistPromoted,
} from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";

vi.mock("~/server/db", () => ({
  db: {
    reservation: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
    liveItem: { findUnique: vi.fn() },
    waitlist: { delete: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock("~/server/reservation/service", () => ({
  createReservation: vi.fn(),
}));

vi.mock("~/server/events/eventLog", () => ({
  logReservationExpired: vi.fn().mockResolvedValue(undefined),
  logWaitlistPromoted: vi.fn().mockResolvedValue(undefined),
  logReservationReminderSent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: vi.fn().mockResolvedValue(undefined),
}));

describe("reservation-ttl (Story 4.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.reservation.findMany).mockResolvedValue([]);
  });

  it("returns 0 expired and 0 promoted when no expired reservations", async () => {
    const result = await runReservationTtlJob();
    expect(result).toEqual({ expiredCount: 0, promotedCount: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("expires reservation and logs reservation_expired when no one in waitlist", async () => {
    const res = {
      id: "res-1",
      tenantId: "t1",
      liveSessionId: "s1",
      liveItemId: "item-1",
      correlationId: "corr-1",
      liveItem: { id: "item-1", code: "A12" },
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);

    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        waitlist: { findFirst: vi.fn().mockResolvedValue(null), delete: vi.fn() },
      };
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: res.id, tenant_id: res.tenantId, live_item_id: res.liveItemId, live_session_id: res.liveSessionId, correlation_id: res.correlationId }])
        .mockResolvedValueOnce(undefined);
      return fn(tx as never) as Promise<unknown>;
    });

    const result = await runReservationTtlJob();

    expect(result).toEqual({ expiredCount: 1, promotedCount: 0 });
    expect(logReservationExpired).toHaveBeenCalledWith(
      "t1",
      "res-1",
      "corr-1",
      expect.objectContaining({ live_item_id: "item-1", live_session_id: "s1" }),
    );
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("expires reservation, promotes first in waitlist, logs and sends message", async () => {
    const res = {
      id: "res-1",
      tenantId: "t1",
      liveSessionId: "s1",
      liveItemId: "item-1",
      correlationId: "corr-1",
      liveItem: { id: "item-1", code: "A12" },
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);

    const promoted = {
      id: "w1",
      tenantId: "t1",
      liveSessionId: "s1",
      liveItemId: "item-1",
      clientPhone: "+33699999999",
      correlationId: "corr-w",
    };
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        waitlist: {
          findFirst: vi.fn().mockResolvedValue(promoted),
        },
      };
      tx.$queryRaw
        .mockResolvedValueOnce([{ id: res.id, tenant_id: res.tenantId, live_item_id: res.liveItemId, live_session_id: res.liveSessionId, correlation_id: res.correlationId }])
        .mockResolvedValueOnce(undefined);
      return fn(tx as never) as Promise<unknown>;
    });

    vi.mocked(createReservation).mockResolvedValue({
      success: true,
      reservation: { id: "res-new", status: "reserved" },
    });
    vi.mocked(db.liveItem.findUnique).mockResolvedValue({ code: "A12" } as never);

    const result = await runReservationTtlJob();

    expect(result).toEqual({ expiredCount: 1, promotedCount: 1 });
    expect(logReservationExpired).toHaveBeenCalled();
    expect(createReservation).toHaveBeenCalledWith(
      "t1",
      "s1",
      "item-1",
      "+33699999999",
      "corr-w",
    );
    expect(db.waitlist.delete).toHaveBeenCalledWith({ where: { id: "w1" } });
    expect(logWaitlistPromoted).toHaveBeenCalledWith(
      "t1",
      "res-new",
      "item-1",
      "corr-w",
      expect.any(Object),
    );
    expect(writeToOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        to: "+33699999999",
        body: expect.stringContaining("Une place s'est libérée pour A12"),
        correlationId: "corr-w",
      }),
    );
  });

  // ── Story 8.1: Catalogue item tests ───────────────────

  it("Story 8.1: expires catalogue reservation, decrements catalogue_items, logs catalogue_item_id", async () => {
    const res = {
      id: "res-cat-1",
      tenantId: "t1",
      liveSessionId: null,
      liveItemId: null,
      catalogueItemId: "cat-item-1",
      correlationId: "corr-cat-1",
      catalogueItem: { id: "cat-item-1", code: "B5" },
      liveItem: null,
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);

    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        waitlist: { findFirst: vi.fn().mockResolvedValue(null), delete: vi.fn() },
      };
      tx.$queryRaw.mockResolvedValueOnce([{
        id: res.id,
        tenant_id: res.tenantId,
        live_item_id: null,
        catalogue_item_id: res.catalogueItemId,
        live_session_id: null,
        correlation_id: res.correlationId,
      }]);
      return fn(tx as never) as Promise<unknown>;
    });

    const result = await runReservationTtlJob();

    expect(result).toEqual({ expiredCount: 1, promotedCount: 0 });
    expect(logReservationExpired).toHaveBeenCalledWith(
      "t1",
      "res-cat-1",
      "corr-cat-1",
      expect.objectContaining({ catalogue_item_id: "cat-item-1" }),
    );
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("Story 8.1: expires catalogue reservation, promotes waitlist with catalogue createReservation overload", async () => {
    const res = {
      id: "res-cat-2",
      tenantId: "t1",
      liveSessionId: null,
      liveItemId: null,
      catalogueItemId: "cat-item-2",
      correlationId: "corr-cat-2",
      catalogueItem: { id: "cat-item-2", code: "C3" },
      liveItem: null,
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);

    const promoted = {
      id: "w-cat",
      tenantId: "t1",
      liveSessionId: "catalogue",
      liveItemId: "cat-item-2",
      clientPhone: "+33611111111",
      correlationId: "corr-w-cat",
    };
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        waitlist: {
          findFirst: vi.fn().mockResolvedValue(promoted),
        },
      };
      tx.$queryRaw.mockResolvedValueOnce([{
        id: res.id,
        tenant_id: res.tenantId,
        live_item_id: null,
        catalogue_item_id: res.catalogueItemId,
        live_session_id: null,
        correlation_id: res.correlationId,
      }]);
      return fn(tx as never) as Promise<unknown>;
    });

    vi.mocked(createReservation).mockResolvedValue({
      success: true,
      reservation: { id: "res-promoted-cat", status: "reserved" },
    });

    const result = await runReservationTtlJob();

    expect(result).toEqual({ expiredCount: 1, promotedCount: 1 });
    // Story 8.1: catalogue promotion uses 6-arg overload with catalogueItemId
    expect(createReservation).toHaveBeenCalledWith(
      "t1",
      null, // liveSessionId = "catalogue" → null
      null, // liveItemId = null for catalogue
      "+33611111111",
      "corr-w-cat",
      expect.objectContaining({ catalogueItemId: "cat-item-2" }),
    );
    expect(db.waitlist.delete).toHaveBeenCalledWith({ where: { id: "w-cat" } });
    expect(writeToOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        to: "+33611111111",
        body: expect.stringContaining("C3"),
      }),
    );
  });

  it("Story 8.1: skips reservation with no associated item (neither liveItemId nor catalogueItemId)", async () => {
    const res = {
      id: "res-broken",
      tenantId: "t1",
      liveSessionId: null,
      liveItemId: null,
      catalogueItemId: null,
      correlationId: "corr-broken",
      catalogueItem: null,
      liveItem: null,
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);

    const result = await runReservationTtlJob();

    expect(result).toEqual({ expiredCount: 0, promotedCount: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("when createReservation fails (exhausted), does not delete waitlist entry so client keeps place", async () => {
    const res = {
      id: "res-2",
      tenantId: "t2",
      liveSessionId: "s2",
      liveItemId: "item-2",
      correlationId: "corr-2",
      liveItem: { id: "item-2", code: "B7" },
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);
    const promoted = {
      id: "w2",
      tenantId: "t2",
      liveSessionId: "s2",
      liveItemId: "item-2",
      clientPhone: "+33700000000",
      correlationId: "corr-w2",
    };
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        waitlist: { findFirst: vi.fn().mockResolvedValue(promoted) },
      };
      tx.$queryRaw
        .mockResolvedValueOnce([
          {
            id: res.id,
            tenant_id: res.tenantId,
            live_item_id: res.liveItemId,
            live_session_id: res.liveSessionId,
            correlation_id: res.correlationId,
          },
        ])
        .mockResolvedValueOnce(undefined);
      return fn(tx as never) as Promise<unknown>;
    });
    vi.mocked(createReservation).mockResolvedValue({ success: false, reason: "exhausted" });

    const result = await runReservationTtlJob();

    expect(result).toEqual({ expiredCount: 1, promotedCount: 0 });
    expect(db.waitlist.delete).not.toHaveBeenCalled();
    expect(writeToOutbox).not.toHaveBeenCalled();
  });
});

describe("runReservationReminderJob (Story 4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.reservation.findMany).mockResolvedValue([]);
    vi.mocked(db.reservation.updateMany).mockResolvedValue({ count: 0 });
  });

  it("sends reminder when reservation expiresAt is in T-2 window (now+2min to now+3min)", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2.5 * 60 * 1000);
    const res = {
      id: "res-rem-1",
      tenantId: "t1",
      liveSessionId: "s1",
      liveItemId: "item-1",
      clientPhone: "+33612345678",
      correlationId: "corr-rem-1",
      status: "reserved",
      expiresAt,
      reminderSentAt: null,
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);
    vi.mocked(db.reservation.updateMany).mockResolvedValue({ count: 1 });

    const result = await runReservationReminderJob();

    expect(result).toEqual({ reminderSentCount: 1 });
    expect(writeToOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        to: "+33612345678",
        body: expect.stringContaining("2 min"),
        correlationId: "corr-rem-1",
      }),
    );
    expect(logReservationReminderSent).toHaveBeenCalledWith(
      "t1",
      "res-rem-1",
      "corr-rem-1",
      expect.objectContaining({ live_item_id: "item-1", live_session_id: "s1" }),
    );
    expect(db.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: res.id, reminderSentAt: null },
      data: expect.objectContaining({}),
    });
  });

  it("does not send second reminder when updateMany returns 0 (already sent)", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2.5 * 60 * 1000);
    const res = {
      id: "res-rem-2",
      tenantId: "t1",
      liveSessionId: "s1",
      liveItemId: "item-1",
      clientPhone: "+33612345678",
      correlationId: "corr-rem-2",
      status: "reserved",
      expiresAt,
      reminderSentAt: null,
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);
    vi.mocked(db.reservation.updateMany).mockResolvedValue({ count: 0 });

    const result = await runReservationReminderJob();

    expect(result).toEqual({ reminderSentCount: 0 });
    expect(writeToOutbox).not.toHaveBeenCalled();
    expect(logReservationReminderSent).not.toHaveBeenCalled();
  });

  it("Story 8.1: sends reminder for catalogue reservation with catalogue_item_id in payload", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2.5 * 60 * 1000);
    const res = {
      id: "res-rem-cat",
      tenantId: "t1",
      liveSessionId: null,
      liveItemId: null,
      catalogueItemId: "cat-rem-1",
      clientPhone: "+33699887766",
      correlationId: "corr-rem-cat",
      status: "reserved",
      expiresAt,
      reminderSentAt: null,
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);
    vi.mocked(db.reservation.updateMany).mockResolvedValue({ count: 1 });

    const result = await runReservationReminderJob();

    expect(result).toEqual({ reminderSentCount: 1 });
    expect(writeToOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        to: "+33699887766",
      }),
    );
    expect(logReservationReminderSent).toHaveBeenCalledWith(
      "t1",
      "res-rem-cat",
      "corr-rem-cat",
      expect.objectContaining({ catalogue_item_id: "cat-rem-1" }),
    );
  });

  it("does not send reminder when no reservations in T-2 window (e.g. expiresAt now+5min)", async () => {
    vi.mocked(db.reservation.findMany).mockResolvedValue([]);

    const result = await runReservationReminderJob();

    expect(result).toEqual({ reminderSentCount: 0 });
    expect(writeToOutbox).not.toHaveBeenCalled();
    expect(logReservationReminderSent).not.toHaveBeenCalled();
  });

  it("on writeToOutbox failure, rolls back reminder_sent_at and continues (no batch abort)", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2.5 * 60 * 1000);
    const res = {
      id: "res-rem-fail",
      tenantId: "t1",
      liveSessionId: "s1",
      liveItemId: "item-1",
      clientPhone: "+33612345678",
      correlationId: "corr-rem-fail",
      status: "reserved",
      expiresAt,
      reminderSentAt: null,
    };
    vi.mocked(db.reservation.findMany).mockResolvedValue([
      res as Awaited<ReturnType<typeof db.reservation.findMany>>[number],
    ]);
    vi.mocked(db.reservation.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 }); // rollback
    vi.mocked(writeToOutbox).mockRejectedValueOnce(new Error("Outbox unavailable"));

    const result = await runReservationReminderJob();

    expect(result).toEqual({ reminderSentCount: 0 });
    expect(writeToOutbox).toHaveBeenCalledTimes(1);
    expect(db.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: res.id },
      data: { reminderSentAt: null },
    });
  });
});
