import { describe, it, expect, vi, beforeEach } from "vitest";
import { findOrCreateOrderableItemByCode } from "./findOrCreateOrderableItemByCode";
import { db } from "~/server/db";
import { getPriceFromCode } from "~/server/pricing/getPriceFromCode";
import { Prisma } from "../../../generated/prisma";

vi.mock("~/server/db", () => ({
  db: {
    catalogueItem: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("~/server/pricing/getPriceFromCode", () => ({
  getPriceFromCode: vi.fn(),
}));

const mockFindUnique = vi.mocked(db.catalogueItem.findUnique);
const mockCreate = vi.mocked(db.catalogueItem.create);
const mockGetPrice = vi.mocked(getPriceFromCode);

const TENANT = "tenant-1";

const CATALOGUE_ITEM = {
  id: "cat-1",
  tenantId: TENANT,
  code: "A12",
  amount: 5000,
  quantity: 1,
  availableQty: 1,
  reservedQty: 0,
  mediaStorageKey: null,
  origin: "live",
  createdInLive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("findOrCreateOrderableItemByCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing item without creating", async () => {
    mockGetPrice.mockResolvedValue(5000);
    mockFindUnique.mockResolvedValue(CATALOGUE_ITEM as never);

    const result = await findOrCreateOrderableItemByCode(TENANT, "A12");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("cat-1");
    expect(result!.code).toBe("A12");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates item when code absent with qty 1, prix grille, createdInLive true", async () => {
    mockGetPrice.mockResolvedValue(5000);
    mockFindUnique.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue(CATALOGUE_ITEM as never);

    const result = await findOrCreateOrderableItemByCode(TENANT, "A12");

    expect(result).not.toBeNull();
    expect(result!.code).toBe("A12");
    expect(result!.amount).toBe(5000);
    expect(result!.origin).toBe("live");
    expect(result!.createdInLive).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT,
        code: "A12",
        amount: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
        origin: "live",
        createdInLive: true,
      },
    });
  });

  it("returns null for invalid code (empty)", async () => {
    const result = await findOrCreateOrderableItemByCode(TENANT, "");

    expect(result).toBeNull();
    expect(mockGetPrice).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null for code with no price in grid (letter not configured)", async () => {
    mockGetPrice.mockResolvedValue(null);

    const result = await findOrCreateOrderableItemByCode(TENANT, "Z99");

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("handles race condition (P2002) by retrying lookup", async () => {
    mockGetPrice.mockResolvedValue(5000);
    mockFindUnique
      .mockResolvedValueOnce(null as never) // first lookup: absent
      .mockResolvedValueOnce(CATALOGUE_ITEM as never); // retry after P2002

    const p2002Error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.0.0",
    });
    mockCreate.mockRejectedValue(p2002Error);

    const result = await findOrCreateOrderableItemByCode(TENANT, "A12");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("cat-1");
    expect(mockFindUnique).toHaveBeenCalledTimes(2);
  });

  it("normalizes code before processing", async () => {
    mockGetPrice.mockResolvedValue(5000);
    mockFindUnique.mockResolvedValue(CATALOGUE_ITEM as never);

    await findOrCreateOrderableItemByCode(TENANT, "  a12  ");

    expect(mockGetPrice).toHaveBeenCalledWith(TENANT, "A12");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { tenantId_code: { tenantId: TENANT, code: "A12" } },
    });
  });

  it("propagates non-P2002 errors", async () => {
    mockGetPrice.mockResolvedValue(5000);
    mockFindUnique.mockResolvedValue(null as never);
    mockCreate.mockRejectedValue(new Error("DB connection failed"));

    await expect(findOrCreateOrderableItemByCode(TENANT, "A12")).rejects.toThrow(
      "DB connection failed",
    );
  });
});
