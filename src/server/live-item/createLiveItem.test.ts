import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "../../../generated/prisma";
import {
  createLiveItem,
  normalizeCode,
  messageCodeAlreadyUsed,
} from "./createLiveItem";
import { db } from "~/server/db";
import * as liveSessionService from "~/server/live-session/service";
import * as pricing from "~/server/pricing/getPriceFromCode";

vi.mock("~/server/db", () => ({
  db: {
    liveItem: { create: vi.fn() },
    liveSession: { update: vi.fn() },
  },
}));

vi.mock("~/server/live-session/service", () => ({
  getOrCreateCurrentSession: vi.fn(),
  updateLastActivity: vi.fn(),
}));

vi.mock("~/server/pricing/getPriceFromCode", () => ({
  getPriceFromCode: vi.fn(),
}));

describe("live-item createLiveItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(liveSessionService.getOrCreateCurrentSession).mockResolvedValue({
      id: "session-1",
      status: "active",
      lastActivityAt: new Date(),
      created: false,
    });
    vi.mocked(pricing.getPriceFromCode).mockResolvedValue(5000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("normalizeCode", () => {
    it("trim + uppercase", () => {
      expect(normalizeCode("  a12  ")).toBe("A12");
      expect(normalizeCode("B7")).toBe("B7");
    });
  });

  describe("messageCodeAlreadyUsed", () => {
    it("includes code for MODIF", () => {
      expect(messageCodeAlreadyUsed("A12")).toContain("MODIF A12");
      expect(messageCodeAlreadyUsed("A12")).toContain("Code déjà utilisé");
    });
  });

  describe("createLiveItem", () => {
    it("creates item and returns success; updates last_activity_at", async () => {
      const created = {
        id: "item-1",
        tenantId: "t1",
        liveSessionId: "session-1",
        code: "A12",
        amountCents: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(db.liveItem.create).mockResolvedValue(created as never);

      const result = await createLiveItem("t1", "A12");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.liveItem.id).toBe("item-1");
        expect(result.liveItem.code).toBe("A12");
        expect(result.liveItem.liveSessionId).toBe("session-1");
        expect(result.liveItem.amountCents).toBe(5000);
        expect(result.liveItem.quantity).toBe(1);
        expect(result.liveItem.availableQty).toBe(1);
        expect(result.liveItem.reservedQty).toBe(0);
      }
      expect(liveSessionService.updateLastActivity).toHaveBeenCalledWith("session-1");
      expect(db.liveItem.create).toHaveBeenCalledWith({
        data: {
          tenantId: "t1",
          liveSessionId: "session-1",
          code: "A12",
          amountCents: 5000,
          quantity: 1,
          availableQty: 1,
          reservedQty: 0,
        },
      });
    });

    it("uses quantity from options", async () => {
      const created = {
        id: "item-2",
        tenantId: "t1",
        liveSessionId: "session-1",
        code: "B7",
        amountCents: null,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(db.liveItem.create).mockResolvedValue(created as never);
      vi.mocked(pricing.getPriceFromCode).mockResolvedValue(null);

      const result = await createLiveItem("t1", "B7", { quantity: 2 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.liveItem.quantity).toBe(2);
        expect(result.liveItem.availableQty).toBe(2);
        expect(result.liveItem.reservedQty).toBe(0);
        expect(result.liveItem.liveSessionId).toBe("session-1");
      }
      expect(db.liveItem.create).toHaveBeenCalledWith({
        data: {
          tenantId: "t1",
          liveSessionId: "session-1",
          code: "B7",
          amountCents: undefined,
          quantity: 2,
          availableQty: 2,
          reservedQty: 0,
        },
      });
    });

    it("Story 3.4: vendeur A12 x5 → LiveItem with availableQty 5, reservedQty 0", async () => {
      const created = {
        id: "item-3",
        tenantId: "t1",
        liveSessionId: "session-1",
        code: "A12",
        amountCents: 5000,
        quantity: 5,
        availableQty: 5,
        reservedQty: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(db.liveItem.create).mockResolvedValue(created as never);

      const result = await createLiveItem("t1", "A12", { quantity: 5 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.liveItem.code).toBe("A12");
        expect(result.liveItem.quantity).toBe(5);
        expect(result.liveItem.availableQty).toBe(5);
        expect(result.liveItem.reservedQty).toBe(0);
      }
      expect(db.liveItem.create).toHaveBeenCalledWith({
        data: {
          tenantId: "t1",
          liveSessionId: "session-1",
          code: "A12",
          amountCents: 5000,
          quantity: 5,
          availableQty: 5,
          reservedQty: 0,
        },
      });
    });

    it("returns duplicate when unique constraint violated (P2002)", async () => {
      vi.mocked(db.liveItem.create).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      const result = await createLiveItem("t1", "A12");

      expect(result.success).toBe(false);
      expect(result).toEqual({ success: false, duplicate: true });
      expect(liveSessionService.updateLastActivity).not.toHaveBeenCalled();
    });

    it("returns invalid_code for empty or whitespace code", async () => {
      expect(await createLiveItem("t1", "")).toEqual({
        success: false,
        reason: "invalid_code",
      });
      expect(await createLiveItem("t1", "   ")).toEqual({
        success: false,
        reason: "invalid_code",
      });
      expect(db.liveItem.create).not.toHaveBeenCalled();
    });

    it("same code in another session allowed (different sessionId)", async () => {
      vi.mocked(liveSessionService.getOrCreateCurrentSession)
        .mockResolvedValueOnce({
          id: "session-1",
          status: "active",
          lastActivityAt: new Date(),
          created: false,
        })
        .mockResolvedValueOnce({
          id: "session-2",
          status: "active",
          lastActivityAt: new Date(),
          created: false,
        });
      vi.mocked(db.liveItem.create)
        .mockResolvedValueOnce({
          id: "item-1",
          tenantId: "t1",
          liveSessionId: "session-1",
          code: "A12",
          amountCents: 5000,
          quantity: 1,
          availableQty: 1,
          reservedQty: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never)
        .mockResolvedValueOnce({
          id: "item-2",
          tenantId: "t1",
          liveSessionId: "session-2",
          code: "A12",
          amountCents: 5000,
          quantity: 1,
          availableQty: 1,
          reservedQty: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);

      const r1 = await createLiveItem("t1", "A12");
      const r2 = await createLiveItem("t1", "A12");

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      if (r1.success && r2.success) {
        expect(r1.liveItem.id).toBe("item-1");
        expect(r2.liveItem.id).toBe("item-2");
        expect(r1.liveItem.liveSessionId).toBe("session-1");
        expect(r2.liveItem.liveSessionId).toBe("session-2");
      }
      expect(db.liveItem.create).toHaveBeenCalledTimes(2);
    });
  });
});
