import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPriceFromCode } from "./getPriceFromCode";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    categoryPrice: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe("getPriceFromCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns amountCents for code A12 when tenant has A=5000", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "A" },
    ] as never);
    vi.mocked(db.categoryPrice.findUnique).mockResolvedValue({
      id: "cp1",
      tenantId: "t1",
      categoryLetter: "A",
      amountCents: 5000,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getPriceFromCode("t1", "A12");
    expect(result).toBe(5000);
    expect(db.categoryPrice.findUnique).toHaveBeenCalledWith({
      where: { tenantId_categoryLetter: { tenantId: "t1", categoryLetter: "A" } },
      select: { amountCents: true },
    });
  });

  it("returns amountCents for code B7 when tenant has B=10000", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "B" },
    ] as never);
    vi.mocked(db.categoryPrice.findUnique).mockResolvedValue({
      id: "cp2",
      tenantId: "t1",
      categoryLetter: "B",
      amountCents: 10000,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getPriceFromCode("t1", "B7");
    expect(result).toBe(10000);
    expect(db.categoryPrice.findUnique).toHaveBeenCalledWith({
      where: { tenantId_categoryLetter: { tenantId: "t1", categoryLetter: "B" } },
      select: { amountCents: true },
    });
  });

  it("returns null when category not in grid", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "A" },
      { categoryLetter: "B" },
    ] as never);
    vi.mocked(db.categoryPrice.findUnique).mockResolvedValue(null);

    const result = await getPriceFromCode("t1", "Z99");
    expect(result).toBeNull();
    expect(db.categoryPrice.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for empty/invalid code", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "A" },
    ] as never);
    expect(await getPriceFromCode("t1", "")).toBeNull();
    expect(await getPriceFromCode("t1", "   ")).toBeNull();
    expect(await getPriceFromCode("t1", "12")).toBeNull();
    expect(db.categoryPrice.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for empty or whitespace tenantId without calling DB", async () => {
    expect(await getPriceFromCode("", "A12")).toBeNull();
    expect(await getPriceFromCode("   ", "A12")).toBeNull();
    expect(db.categoryPrice.findMany).not.toHaveBeenCalled();
    expect(db.categoryPrice.findUnique).not.toHaveBeenCalled();
  });

  // --- Story 3.7: longest match (A, AB, Premium) ---
  it("resolves AB12 to category AB when grid has A and AB (longest match)", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "A" },
      { categoryLetter: "AB" },
    ] as never);
    vi.mocked(db.categoryPrice.findUnique).mockResolvedValue({
      id: "cp-ab",
      tenantId: "t1",
      categoryLetter: "AB",
      amountCents: 7500,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getPriceFromCode("t1", "AB12");
    expect(result).toBe(7500);
    expect(db.categoryPrice.findUnique).toHaveBeenCalledWith({
      where: { tenantId_categoryLetter: { tenantId: "t1", categoryLetter: "AB" } },
      select: { amountCents: true },
    });
  });

  it("resolves Premium1 to category Premium when grid has Premium", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "P" },
      { categoryLetter: "Premium" },
    ] as never);
    vi.mocked(db.categoryPrice.findUnique).mockResolvedValue({
      id: "cp-prem",
      tenantId: "t1",
      categoryLetter: "Premium",
      amountCents: 15000,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getPriceFromCode("t1", "Premium1");
    expect(result).toBe(15000);
    expect(db.categoryPrice.findUnique).toHaveBeenCalledWith({
      where: { tenantId_categoryLetter: { tenantId: "t1", categoryLetter: "Premium" } },
      select: { amountCents: true },
    });
  });

  it("A99 returns price of A when grid has A and AB", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "A" },
      { categoryLetter: "AB" },
    ] as never);
    vi.mocked(db.categoryPrice.findUnique).mockResolvedValue({
      id: "cp-a",
      tenantId: "t1",
      categoryLetter: "A",
      amountCents: 5000,
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getPriceFromCode("t1", "A99");
    expect(result).toBe(5000);
    expect(db.categoryPrice.findUnique).toHaveBeenCalledWith({
      where: { tenantId_categoryLetter: { tenantId: "t1", categoryLetter: "A" } },
      select: { amountCents: true },
    });
  });

  it("returns null when code A1 and grid has only AB (no category A)", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "AB" },
    ] as never);
    vi.mocked(db.categoryPrice.findUnique).mockResolvedValue(null);

    const result = await getPriceFromCode("t1", "A1");
    expect(result).toBeNull();
    expect(db.categoryPrice.findUnique).not.toHaveBeenCalled();
  });

  it("AB or AB1 resolves to AB when grid has only AB", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([
      { categoryLetter: "AB" },
    ] as never);
    vi.mocked(db.categoryPrice.findUnique)
      .mockResolvedValueOnce({
        id: "cp-ab",
        tenantId: "t1",
        categoryLetter: "AB",
        amountCents: 7500,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: "cp-ab",
        tenantId: "t1",
        categoryLetter: "AB",
        amountCents: 7500,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

    expect(await getPriceFromCode("t1", "AB")).toBe(7500);
    expect(await getPriceFromCode("t1", "AB1")).toBe(7500);
  });

  it("returns null when tenant has no categories (empty grid)", async () => {
    vi.mocked(db.categoryPrice.findMany).mockResolvedValue([]);
    const result = await getPriceFromCode("t1", "A12");
    expect(result).toBeNull();
    expect(db.categoryPrice.findUnique).not.toHaveBeenCalled();
  });
});
