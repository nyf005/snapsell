/**
 * Story 8.2 Task 4: Tests upsert catalogue depuis flux WhatsApp
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "~/server/db";
import { upsertCatalogueItemFromWebhook } from "./upsertCatalogueItemFromWebhook";
import { Prisma } from "../../../generated/prisma";

vi.mock("~/server/db", () => ({
  db: {
    catalogueItem: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("~/server/pricing/getPriceFromCode", () => ({
  getPriceFromCode: vi.fn(),
}));

vi.mock("~/server/live-item/createLiveItem", () => ({
  normalizeCode: vi.fn((code: string) => code.trim().toUpperCase()),
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";

describe("upsertCatalogueItemFromWebhook", () => {
  const tenantId = "tenant-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create new catalogue item outside live with createdInLive=false", async () => {
    vi.mocked(getPriceFromCode).mockResolvedValue(1000);
    vi.mocked(db.catalogueItem.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.catalogueItem.create).mockResolvedValue({
      id: "cat-1",
      code: "A1",
      amount: 1000,
      quantity: 5,
      availableQty: 5,
      reservedQty: 0,
      createdInLive: false,
    } as never);

    const result = await upsertCatalogueItemFromWebhook(tenantId, "a1", 5);

    expect(result).toEqual({
      success: true,
      created: true,
      catalogueItemId: "cat-1",
    });

    expect(db.catalogueItem.updateMany).toHaveBeenCalledWith({
      where: { tenantId, code: "A1" },
      data: {
        quantity: { increment: 5 },
        availableQty: { increment: 5 },
      },
    });

    expect(db.catalogueItem.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        code: "A1",
        amount: 1000,
        quantity: 5,
        availableQty: 5,
        reservedQty: 0,
        createdInLive: false,
      },
    });
  });

  it("should create new catalogue item during live with createdInLive=true", async () => {
    vi.mocked(getPriceFromCode).mockResolvedValue(1000);
    vi.mocked(db.catalogueItem.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.catalogueItem.create).mockResolvedValue({
      id: "cat-live-1",
      code: "A2",
      amount: 1000,
      quantity: 2,
      availableQty: 2,
      reservedQty: 0,
      createdInLive: true,
    } as never);

    const result = await upsertCatalogueItemFromWebhook(tenantId, "a2", 2, {
      createdInLive: true,
    });

    expect(result).toEqual({
      success: true,
      created: true,
      catalogueItemId: "cat-live-1",
    });

    expect(db.catalogueItem.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        code: "A2",
        amount: 1000,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0,
        createdInLive: true,
      },
    });
  });

  it("should update existing catalogue item by adding quantities", async () => {
    vi.mocked(getPriceFromCode).mockResolvedValue(1000);
    vi.mocked(db.catalogueItem.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({
      id: "cat-2",
    } as never);

    const result = await upsertCatalogueItemFromWebhook(tenantId, "b2", 3);

    expect(result).toEqual({
      success: true,
      created: false,
      catalogueItemId: "cat-2",
    });

    expect(db.catalogueItem.updateMany).toHaveBeenCalledWith({
      where: { tenantId, code: "B2" },
      data: {
        quantity: { increment: 3 },
        availableQty: { increment: 3 },
      },
    });

    expect(db.catalogueItem.create).not.toHaveBeenCalled();
  });

  it("should return failure if code is invalid (empty after normalization)", async () => {
    vi.mocked(getPriceFromCode).mockResolvedValue(1000);

    const result = await upsertCatalogueItemFromWebhook(tenantId, "   ", 1);

    expect(result).toEqual({
      success: false,
      reason: "invalid_code",
    });

    expect(db.catalogueItem.updateMany).not.toHaveBeenCalled();
    expect(db.catalogueItem.create).not.toHaveBeenCalled();
  });

  it("should return failure if no price configured for category", async () => {
    vi.mocked(getPriceFromCode).mockResolvedValue(null);

    const result = await upsertCatalogueItemFromWebhook(tenantId, "x999", 1);

    expect(result).toEqual({
      success: false,
      reason: "no_price",
    });

    expect(db.catalogueItem.updateMany).not.toHaveBeenCalled();
    expect(db.catalogueItem.create).not.toHaveBeenCalled();
  });

  it("should handle race condition (P2002) by retrying update", async () => {
    vi.mocked(getPriceFromCode).mockResolvedValue(1500);
    vi.mocked(db.catalogueItem.updateMany)
      .mockResolvedValueOnce({ count: 0 } as never) // First update fails (no item)
      .mockResolvedValueOnce({ count: 1 } as never); // Retry update succeeds

    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "1.0.0",
    });
    vi.mocked(db.catalogueItem.create).mockRejectedValue(error);

    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({
      id: "cat-3",
    } as never);

    const result = await upsertCatalogueItemFromWebhook(tenantId, "c3", 2);

    expect(result).toEqual({
      success: true,
      created: false,
      catalogueItemId: "cat-3",
    });

    expect(db.catalogueItem.updateMany).toHaveBeenCalledTimes(2);
    expect(db.catalogueItem.create).toHaveBeenCalledTimes(1);
  });

  it("should normalize code before upserting", async () => {
    vi.mocked(getPriceFromCode).mockResolvedValue(2000);
    vi.mocked(db.catalogueItem.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({
      id: "cat-4",
    } as never);

    await upsertCatalogueItemFromWebhook(tenantId, " d4 ", 1);

    expect(db.catalogueItem.updateMany).toHaveBeenCalledWith({
      where: { tenantId, code: "D4" },
      data: {
        quantity: { increment: 1 },
        availableQty: { increment: 1 },
      },
    });
  });
});
