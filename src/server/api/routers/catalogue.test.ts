/**
 * Story 8.2 Task 2: Tests router catalogue CRUD
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "~/server/db";
import { catalogueRouter } from "./catalogue";
import { TRPCError } from "@trpc/server";
import { Prisma } from "../../../../generated/prisma";

vi.mock("~/server/db", () => ({
  db: {
    catalogueItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reservation: {
      count: vi.fn(),
    },
  },
}));

vi.mock("~/server/pricing/getPriceFromCode", () => ({
  getPriceFromCode: vi.fn(),
}));

vi.mock("~/server/live-item/createLiveItem", () => ({
  normalizeCode: vi.fn((code: string) => code.trim().toUpperCase()),
}));

import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";

const mockCtx = (tenantId: string | null = "tenant-1") => ({
  session: {
    user: { tenantId },
  },
  db,
});

const createCaller = (ctx: ReturnType<typeof mockCtx>) => {
  return catalogueRouter.createCaller(ctx as never);
};

describe("catalogueRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("should return all catalogue items for tenant", async () => {
      const items = [
        {
          id: "cat-1",
          tenantId: "tenant-1",
          code: "A1",
          amountCents: 1000,
          quantity: 5,
          availableQty: 5,
          reservedQty: 0,
          mediaStorageKey: null,
          createdInLive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.catalogueItem.findMany).mockResolvedValue(items as never);

      const caller = createCaller(mockCtx("tenant-1"));
      const result = await caller.list();

      expect(result).toEqual(items);
      expect(db.catalogueItem.findMany).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("should throw if no tenantId", async () => {
      const caller = createCaller(mockCtx(null));

      await expect(caller.list()).rejects.toThrow(TRPCError);
    });
  });

  describe("create", () => {
    it("should create catalogue item with provided price", async () => {
      const input = {
        code: "a1",
        quantity: 5,
        amountCents: 1000,
        mediaStorageKey: null,
      };

      const created = {
        id: "cat-1",
        tenantId: "tenant-1",
        code: "A1",
        amountCents: 1000,
        quantity: 5,
        availableQty: 5,
        reservedQty: 0,
        mediaStorageKey: null,
        createdInLive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.catalogueItem.create).mockResolvedValue(created as never);

      const caller = createCaller(mockCtx("tenant-1"));
      const result = await caller.create(input);

      expect(result).toEqual(created);
      expect(db.catalogueItem.create).toHaveBeenCalledWith({
        data: {
          tenantId: "tenant-1",
          code: "A1",
          amountCents: 1000,
          quantity: 5,
          availableQty: 5,
          reservedQty: 0,
          mediaStorageKey: null,
          createdInLive: false,
        },
      });
    });

    it("should derive price from grid if not provided", async () => {
      const input = {
        code: "b2",
        quantity: 3,
      };

      vi.mocked(getPriceFromCode).mockResolvedValue(2000);
      vi.mocked(db.catalogueItem.create).mockResolvedValue({
        id: "cat-2",
        code: "B2",
        amountCents: 2000,
      } as never);

      const caller = createCaller(mockCtx("tenant-1"));
      const result = await caller.create(input);

      expect(getPriceFromCode).toHaveBeenCalledWith("tenant-1", "B2");
      expect(result.amountCents).toBe(2000);
    });

    it("should throw CONFLICT if code already exists", async () => {
      const input = {
        code: "a1",
        quantity: 5,
        amountCents: 1000,
      };

      const error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "1.0.0",
      });

      vi.mocked(db.catalogueItem.create).mockRejectedValue(error);

      const caller = createCaller(mockCtx("tenant-1"));

      await expect(caller.create(input)).rejects.toThrow(TRPCError);
      await expect(caller.create(input)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("should throw if price not configured for category", async () => {
      const input = {
        code: "x999",
        quantity: 1,
      };

      vi.mocked(getPriceFromCode).mockResolvedValue(null);

      const caller = createCaller(mockCtx("tenant-1"));

      await expect(caller.create(input)).rejects.toThrow(TRPCError);
      await expect(caller.create(input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });

  describe("update", () => {
    const existing = {
      id: "cat-1",
      tenantId: "tenant-1",
      code: "A1",
      amountCents: 1000,
      quantity: 5,
      availableQty: 5,
      reservedQty: 0,
      mediaStorageKey: null,
      createdInLive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should update quantity and adjust availableQty", async () => {
      const validCuid = "clxyz1234567890abcdefgh";
      const input = {
        id: validCuid,
        quantity: 8, // +3 from 5
      };

      const existingWithValidId = { ...existing, id: validCuid };
      vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(existingWithValidId as never);
      vi.mocked(db.catalogueItem.update).mockResolvedValue({
        ...existingWithValidId,
        quantity: 8,
        availableQty: 8,
      } as never);

      const caller = createCaller(mockCtx("tenant-1"));
      const result = await caller.update(input);

      expect(result.quantity).toBe(8);
      expect(db.catalogueItem.update).toHaveBeenCalledWith({
        where: { id: validCuid },
        data: {
          quantity: 8,
          availableQty: 8, // 5 + (8 - 5) = 8
        },
      });
    });

    it("should update code", async () => {
      const validCuid = "clxyz1234567890abcdefgh";
      const input = {
        id: validCuid,
        code: "b2",
      };

      const existingWithValidId = { ...existing, id: validCuid };
      vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(existingWithValidId as never);
      vi.mocked(db.catalogueItem.update).mockResolvedValue({
        ...existingWithValidId,
        code: "B2",
      } as never);

      const caller = createCaller(mockCtx("tenant-1"));
      const result = await caller.update(input);

      expect(result.code).toBe("B2");
      expect(db.catalogueItem.update).toHaveBeenCalledWith({
        where: { id: validCuid },
        data: { code: "B2" },
      });
    });

    it("should throw NOT_FOUND if item doesn't exist", async () => {
      vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(null);

      const caller = createCaller(mockCtx("tenant-1"));

      await expect(
        caller.update({ id: "clxyz1234567890abcdefgh", quantity: 10 }),
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.update({ id: "clxyz1234567890abcdefgh", quantity: 10 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("should throw NOT_FOUND if item belongs to different tenant", async () => {
      vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({
        ...existing,
        tenantId: "tenant-2",
      } as never);

      const caller = createCaller(mockCtx("tenant-1"));

      await expect(caller.update({ id: "cat-1", quantity: 10 })).rejects.toThrow(
        TRPCError,
      );
    });

    it("should throw CONFLICT if new code already exists", async () => {
      const validCuid = "clxyz1234567890abcdefgh";
      const existingWithValidId = { ...existing, id: validCuid };
      vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(existingWithValidId as never);

      const error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "1.0.0",
      });
      vi.mocked(db.catalogueItem.update).mockRejectedValue(error);

      const caller = createCaller(mockCtx("tenant-1"));

      await expect(caller.update({ id: validCuid, code: "b2" })).rejects.toThrow(TRPCError);
      await expect(caller.update({ id: validCuid, code: "b2" })).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });

  describe("delete", () => {
    it("should delete catalogue item if no active reservations", async () => {
      const validCuid = "clxyz1234567890abcdefgh";
      vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({
        id: validCuid,
        tenantId: "tenant-1",
      } as never);
      vi.mocked(db.reservation.count).mockResolvedValue(0);
      vi.mocked(db.catalogueItem.delete).mockResolvedValue({} as never);

      const caller = createCaller(mockCtx("tenant-1"));
      const result = await caller.delete({ id: validCuid });

      expect(result.success).toBe(true);
      expect(db.catalogueItem.delete).toHaveBeenCalledWith({
        where: { id: validCuid },
      });
    });

    it("should throw BAD_REQUEST if item has active reservations", async () => {
      const validCuid = "clxyz1234567890abcdefgh";
      vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({
        id: validCuid,
        tenantId: "tenant-1",
      } as never);
      vi.mocked(db.reservation.count).mockResolvedValue(2); // 2 active reservations

      const caller = createCaller(mockCtx("tenant-1"));

      await expect(caller.delete({ id: validCuid })).rejects.toThrow(TRPCError);
      await expect(caller.delete({ id: validCuid })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should throw NOT_FOUND if item doesn't exist", async () => {
      const validCuid = "clxyz9999999999999999";
      vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(null);

      const caller = createCaller(mockCtx("tenant-1"));

      await expect(caller.delete({ id: validCuid })).rejects.toThrow(TRPCError);
      await expect(caller.delete({ id: validCuid })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
