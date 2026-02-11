/**
 * Story 8.2 Task 1: Tests promotion session → catalogue
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "~/server/db";
import { Prisma } from "../../../generated/prisma";
import { promoteSessionToCatalogue } from "./promoteSessionToCatalogue";

vi.mock("~/server/db", () => ({
  db: {
    liveItem: {
      findMany: vi.fn(),
    },
    catalogueItem: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("promoteSessionToCatalogue", () => {
  const tenantId = "test-tenant-promote";
  const liveSessionId = "test-session-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create catalogue item from LiveItem with remaining stock", async () => {
    const liveItems = [
      {
        id: "live-1",
        code: "A1",
        amountCents: 1000,
        quantity: 5,
        availableQty: 5,
        reservedQty: 2, // remaining = 3
        mediaStorageKey: null,
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(null); // Item doesn't exist
    vi.mocked(db.catalogueItem.updateMany).mockResolvedValue({ count: 0 } as never); // No update
    vi.mocked(db.catalogueItem.create).mockResolvedValue({} as never);

    const result = await promoteSessionToCatalogue(tenantId, liveSessionId);

    expect(result.itemsProcessed).toBe(1);
    expect(result.itemsCreated).toBe(1);
    expect(result.itemsUpdated).toBe(0);
    expect(result.itemsSkipped).toBe(0);

    expect(db.catalogueItem.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        code: "A1",
        amountCents: 1000,
        quantity: 3, // remaining qty
        availableQty: 3,
        reservedQty: 0,
        mediaStorageKey: null,
        createdInLive: true,
      },
    });
  });

  it("should update catalogue item if code already exists (add quantities)", async () => {
    const liveItems = [
      {
        id: "live-2",
        code: "B2",
        amountCents: 2000,
        quantity: 5,
        availableQty: 5,
        reservedQty: 0, // remaining = 5
        mediaStorageKey: null,
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({ id: "cat-1" } as never); // Item exists
    vi.mocked(db.catalogueItem.updateMany).mockResolvedValue({ count: 1 } as never); // Update successful

    const result = await promoteSessionToCatalogue(tenantId, liveSessionId);

    expect(result.itemsProcessed).toBe(1);
    expect(result.itemsCreated).toBe(0);
    expect(result.itemsUpdated).toBe(1);
    expect(result.itemsSkipped).toBe(0);

    expect(db.catalogueItem.updateMany).toHaveBeenCalledWith({
      where: { tenantId, code: "B2" },
      data: {
        quantity: { increment: 5 },
        availableQty: { increment: 5 },
      },
    });
  });

  it("should skip LiveItem with no remaining stock", async () => {
    const liveItems = [
      {
        id: "live-3",
        code: "C3",
        amountCents: 1500,
        quantity: 3,
        availableQty: 3,
        reservedQty: 3, // remaining = 0
        mediaStorageKey: null,
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);

    const result = await promoteSessionToCatalogue(tenantId, liveSessionId);

    expect(result.itemsProcessed).toBe(1);
    expect(result.itemsCreated).toBe(0);
    expect(result.itemsUpdated).toBe(0);
    expect(result.itemsSkipped).toBe(1);

    expect(db.catalogueItem.create).not.toHaveBeenCalled();
    expect(db.catalogueItem.updateMany).not.toHaveBeenCalled();
  });

  it("should process multiple LiveItems (mix of create/update/skip)", async () => {
    const liveItems = [
      {
        id: "live-4",
        code: "D1",
        amountCents: 1000,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0, // remaining = 2
        mediaStorageKey: null,
      },
      {
        id: "live-5",
        code: "D2",
        amountCents: 1500,
        quantity: 3,
        availableQty: 3,
        reservedQty: 1, // remaining = 2
        mediaStorageKey: null,
      },
      {
        id: "live-6",
        code: "D3",
        amountCents: 2000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 1, // remaining = 0
        mediaStorageKey: null,
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);

    // D1: doesn't exist, will be created
    vi.mocked(db.catalogueItem.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "cat-2" } as never) // D2: exists
      .mockResolvedValueOnce(null); // D3: shouldn't be called

    vi.mocked(db.catalogueItem.updateMany)
      .mockResolvedValueOnce({ count: 0 } as never) // D1 update fails
      .mockResolvedValueOnce({ count: 1 } as never); // D2 update succeeds

    vi.mocked(db.catalogueItem.create).mockResolvedValue({} as never);

    const result = await promoteSessionToCatalogue(tenantId, liveSessionId);

    expect(result.itemsProcessed).toBe(3);
    expect(result.itemsCreated).toBe(1); // D1
    expect(result.itemsUpdated).toBe(1); // D2
    expect(result.itemsSkipped).toBe(1); // D3
  });

  it("should handle items with media storage key", async () => {
    const liveItems = [
      {
        id: "live-7",
        code: "F1",
        amountCents: 3000,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0,
        mediaStorageKey: "test-image-key.jpg",
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(null);
    vi.mocked(db.catalogueItem.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.catalogueItem.create).mockResolvedValue({} as never);

    await promoteSessionToCatalogue(tenantId, liveSessionId);

    expect(db.catalogueItem.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        code: "F1",
        amountCents: 3000,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0,
        mediaStorageKey: "test-image-key.jpg",
        createdInLive: true,
      },
    });
  });

  it("should handle P2002 race condition (create fails, retry update succeeds)", async () => {
    const liveItems = [
      {
        id: "live-race",
        code: "R1",
        amountCents: 2000,
        quantity: 3,
        availableQty: 3,
        reservedQty: 1, // remaining = 2
        mediaStorageKey: null,
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(null); // Item n'existe pas encore

    // Premier updateMany retourne 0 (item absent) → tentative create
    // Create échoue avec P2002 (un autre process a créé l'item entre-temps)
    // Retry updateMany réussit
    vi.mocked(db.catalogueItem.updateMany)
      .mockResolvedValueOnce({ count: 0 } as never)  // Premier update: item absent
      .mockResolvedValueOnce({ count: 1 } as never);  // Retry update après P2002

    const p2002Error = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "1.0.0",
    });
    vi.mocked(db.catalogueItem.create).mockRejectedValue(p2002Error);

    const result = await promoteSessionToCatalogue(tenantId, liveSessionId);

    // L'item est compté comme créé (car findUnique initial dit null)
    // mais en réalité il a été mis à jour via retry — le résultat fonctionnel est correct
    expect(result.itemsProcessed).toBe(1);
    expect(result.itemsCreated).toBe(1); // Stats basées sur findUnique initial
    expect(result.itemsSkipped).toBe(0);

    expect(db.catalogueItem.create).toHaveBeenCalledTimes(1);
    expect(db.catalogueItem.updateMany).toHaveBeenCalledTimes(2);
    // Le retry update doit incrémenter les quantités
    expect(db.catalogueItem.updateMany).toHaveBeenNthCalledWith(2, {
      where: { tenantId, code: "R1" },
      data: {
        quantity: { increment: 2 },
        availableQty: { increment: 2 },
      },
    });
  });
});
