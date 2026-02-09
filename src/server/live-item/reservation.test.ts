import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  reserveOneUnit,
  releaseReservation,
  confirmReservation,
} from "./reservation";
import { logEvent } from "~/server/events/eventLog";

const mockQueryRaw = vi.fn();
const mockExecuteRaw = vi.fn();

const mockTx = {
  $queryRaw: mockQueryRaw,
  $executeRaw: mockExecuteRaw,
};

vi.mock("~/server/db", () => ({
  db: {
    $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
    ),
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("reservation (Story 3.6)", () => {
  const tenantId = "tenant-1";
  const liveItemId = "item-1";

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteRaw.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("reserveOneUnit", () => {
    it("succeeds when (availableQty - reservedQty) >= 1", async () => {
      mockQueryRaw
        .mockResolvedValueOnce([
          { id: liveItemId, available_qty: 2, reserved_qty: 0 },
        ])
        .mockRejectedValue(new Error("unexpected second call"));

      const result = await reserveOneUnit(tenantId, liveItemId);

      expect(result).toEqual({ success: true });
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      expect(logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          eventType: "reservation_hold",
          entityType: "live_item",
          entityId: liveItemId,
          actorType: "system",
          payload: { liveItemId },
        }),
      );
      expect(vi.mocked(logEvent).mock.calls[0]![0]).toHaveProperty(
        "correlationId",
      );
    });

    it("fails with exhausted when no free unit (available 1, reserved 1)", async () => {
      mockQueryRaw.mockResolvedValueOnce([
        { id: liveItemId, available_qty: 1, reserved_qty: 1 },
      ]);

      const result = await reserveOneUnit(tenantId, liveItemId);

      expect(result).toEqual({ success: false, reason: "exhausted" });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    it("fails with not_found when item does not exist", async () => {
      mockQueryRaw.mockResolvedValueOnce([]);

      const result = await reserveOneUnit(tenantId, "nonexistent-id");

      expect(result).toEqual({ success: false, reason: "not_found" });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });
  });

  describe("releaseReservation", () => {
    it("succeeds and decrements reservedQty only", async () => {
      mockQueryRaw
        .mockResolvedValueOnce([{ id: liveItemId, reserved_qty: 1 }])
        .mockRejectedValue(new Error("unexpected second call"));

      const result = await releaseReservation(tenantId, liveItemId);

      expect(result).toEqual({ success: true });
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      expect(logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          eventType: "reservation_released",
          entityType: "live_item",
          entityId: liveItemId,
          actorType: "system",
          payload: { liveItemId },
        }),
      );
    });

    it("fails with no_reservation when reservedQty is 0", async () => {
      mockQueryRaw.mockResolvedValueOnce([{ id: liveItemId, reserved_qty: 0 }]);

      const result = await releaseReservation(tenantId, liveItemId);

      expect(result).toEqual({ success: false, reason: "no_reservation" });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    it("fails with not_found when item does not exist", async () => {
      mockQueryRaw.mockResolvedValueOnce([]);

      const result = await releaseReservation(tenantId, "nonexistent-id");

      expect(result).toEqual({ success: false, reason: "not_found" });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });
  });

  describe("confirmReservation", () => {
    it("succeeds after a reservation (reservedQty and availableQty decremented)", async () => {
      mockQueryRaw
        .mockResolvedValueOnce([
          { id: liveItemId, available_qty: 2, reserved_qty: 1 },
        ])
        .mockResolvedValueOnce([{ available_qty: 1 }]);

      const result = await confirmReservation(tenantId, liveItemId);

      expect(result).toEqual({ success: true });
      expect(mockQueryRaw).toHaveBeenCalledTimes(2);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
      expect(logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          eventType: "reservation_confirmed",
          entityType: "live_item",
          entityId: liveItemId,
          actorType: "system",
          payload: { liveItemId },
        }),
      );
    });

    it("fails with no_reservation when reservedQty is 0", async () => {
      mockQueryRaw.mockResolvedValueOnce([
        { id: liveItemId, available_qty: 1, reserved_qty: 0 },
      ]);

      const result = await confirmReservation(tenantId, liveItemId);

      expect(result).toEqual({ success: false, reason: "no_reservation" });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    it("fails with not_found when item does not exist", async () => {
      mockQueryRaw.mockResolvedValueOnce([]);

      const result = await confirmReservation(tenantId, "nonexistent-id");

      expect(result).toEqual({ success: false, reason: "not_found" });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    it("returns concurrency when available_qty would go negative (one confirmation wins)", async () => {
      // Simulates DB state after a concurrent confirmation: second read shows available_qty < 0.
      // True concurrency would require an integration test with a real DB.
      mockQueryRaw
        .mockResolvedValueOnce([
          { id: liveItemId, available_qty: 1, reserved_qty: 1 },
        ])
        .mockResolvedValueOnce([{ available_qty: -1 }]);

      const result = await confirmReservation(tenantId, liveItemId);

      expect(result).toEqual({ success: false, reason: "concurrency" });
    });
  });
});
