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

vi.mock("~/server/pricing/getItemNameFromCode", () => ({
  getItemNameFromCode: vi.fn().mockResolvedValue(null),
}));

vi.mock("./syncCatalogueItemToMeta", () => ({
  syncPendingCatalogueItems: vi.fn().mockResolvedValue(undefined),
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
        amount: 1000,
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
        name: null,
        amount: 1000,
        quantity: 3, // remaining qty
        availableQty: 3,
        reservedQty: 0,
        mediaStorageKey: null,
        origin: "live",
        createdInLive: true,
      },
    });
  });

  it("laisse intact un article catalogue déjà existant", async () => {
    const liveItems = [
      {
        id: "live-2",
        code: "B2",
        amount: 2000,
        quantity: 5,
        availableQty: 5,
        reservedQty: 0,
        mediaStorageKey: null,
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({ id: "cat-1" } as never);

    const result = await promoteSessionToCatalogue(tenantId, liveSessionId);

    expect(result.itemsProcessed).toBe(1);
    expect(result.itemsCreated).toBe(0);
    expect(result.itemsUpdated).toBe(1);
    expect(result.itemsSkipped).toBe(0);

    // Régression : incrémenter avec la quantité figée du LiveItem gonflait le
    // stock catalogue à chaque fin de live.
    expect(db.catalogueItem.updateMany).not.toHaveBeenCalled();
    expect(db.catalogueItem.create).not.toHaveBeenCalled();
  });

  it("should process multiple LiveItems (mix of create/update/skip)", async () => {
    const liveItems = [
      {
        id: "live-4",
        code: "D1",
        amount: 1000,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0, // remaining = 2
        mediaStorageKey: null,
      },
      {
        id: "live-5",
        code: "D2",
        amount: 1500,
        quantity: 3,
        availableQty: 3,
        reservedQty: 1, // remaining = 2
        mediaStorageKey: null,
      },
      {
        id: "live-6",
        code: "D3",
        amount: 2000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 1, // remaining = 0
        mediaStorageKey: null,
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);

    // Un seul lookup par article : D1 absent → créé, D2 présent → intact,
    // D3 sans stock restant → ignoré avant tout lookup.
    vi.mocked(db.catalogueItem.findUnique)
      .mockResolvedValueOnce(null) // D1
      .mockResolvedValueOnce({ id: "cat-2" } as never); // D2

    vi.mocked(db.catalogueItem.create).mockResolvedValue({} as never);

    const result = await promoteSessionToCatalogue(tenantId, liveSessionId);

    expect(result.itemsProcessed).toBe(3);
    expect(result.itemsCreated).toBe(1); // D1
    expect(result.itemsUpdated).toBe(1); // D2 — présent, non modifié
    expect(result.itemsSkipped).toBe(1); // D3

    // Un seul article créé, aucun stock ajouté à un article existant.
    expect(db.catalogueItem.create).toHaveBeenCalledTimes(1);
    expect(db.catalogueItem.updateMany).not.toHaveBeenCalled();
  });

  it("should handle items with media storage key", async () => {
    const liveItems = [
      {
        id: "live-7",
        code: "F1",
        amount: 3000,
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
        name: null,
        amount: 3000,
        quantity: 2,
        availableQty: 2,
        reservedQty: 0,
        mediaStorageKey: "test-image-key.jpg",
        origin: "live",
        createdInLive: true,
      },
    });
  });

  it("n’ajoute rien si un autre processus a créé l’article entre-temps (P2002)", async () => {
    const liveItems = [
      {
        id: "live-race",
        code: "R1",
        amount: 3000,
        quantity: 4,
        availableQty: 4,
        reservedQty: 0,
        mediaStorageKey: null,
      },
    ];

    vi.mocked(db.liveItem.findMany).mockResolvedValue(liveItems as never);
    // Absent au moment du lookup…
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(null as never);
    // …mais créé par un autre processus juste avant notre create.
    vi.mocked(db.catalogueItem.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.0.0",
      }) as never,
    );

    const result = await promoteSessionToCatalogue(tenantId, liveSessionId);

    expect(result.itemsSkipped).toBe(0);
    // L'article de l'autre processus fait autorité : on n'y touche pas.
    expect(db.catalogueItem.updateMany).not.toHaveBeenCalled();
  });

});
