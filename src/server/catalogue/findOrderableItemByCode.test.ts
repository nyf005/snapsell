import { describe, it, expect, vi, beforeEach } from "vitest";
import { findOrderableItemByCode } from "./findOrderableItemByCode";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    catalogueItem: {
      findUnique: vi.fn(),
    },
  },
}));

const mockFindUnique = vi.mocked(db.catalogueItem.findUnique);

const TENANT = "tenant-1";

const CATALOGUE_ITEM = {
  id: "cat-1",
  tenantId: TENANT,
  code: "A12",
  amount: 5000,
  quantity: 3,
  availableQty: 2,
  reservedQty: 1,
  mediaStorageKey: null,
  createdInLive: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("findOrderableItemByCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns item when code exists in catalogue", async () => {
    mockFindUnique.mockResolvedValue(CATALOGUE_ITEM as never);

    const result = await findOrderableItemByCode(TENANT, "a12");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("cat-1");
    expect(result!.code).toBe("A12");
    expect(result!.amount).toBe(5000);
    expect(result!.availableQty).toBe(2);
    expect(result!.reservedQty).toBe(1);
    expect(result!.createdInLive).toBe(false);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { tenantId_code: { tenantId: TENANT, code: "A12" } },
    });
  });

  it("returns null when code is absent from catalogue", async () => {
    mockFindUnique.mockResolvedValue(null as never);

    const result = await findOrderableItemByCode(TENANT, "Z99");

    expect(result).toBeNull();
  });

  it("returns null for empty code", async () => {
    const result = await findOrderableItemByCode(TENANT, "");

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null for whitespace-only code", async () => {
    const result = await findOrderableItemByCode(TENANT, "   ");

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("normalizes code (trim + uppercase) before lookup", async () => {
    mockFindUnique.mockResolvedValue(CATALOGUE_ITEM as never);

    await findOrderableItemByCode(TENANT, "  a12  ");

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { tenantId_code: { tenantId: TENANT, code: "A12" } },
    });
  });
});
