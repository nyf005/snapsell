import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPriceFromCode, extractCategoryLetter } from "./getPriceFromCode";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    categoryPrice: {
      findUnique: vi.fn(),
    },
  },
}));

describe("extractCategoryLetter", () => {
  it("returns first letter uppercased for A12", () => {
    expect(extractCategoryLetter("A12")).toBe("A");
  });
  it("returns first letter uppercased for B7", () => {
    expect(extractCategoryLetter("B7")).toBe("B");
  });
  it("trims and uppercases before extraction", () => {
    expect(extractCategoryLetter("  a12  ")).toBe("A");
  });
  it("returns null for empty string", () => {
    expect(extractCategoryLetter("")).toBeNull();
  });
  it("returns null for whitespace-only", () => {
    expect(extractCategoryLetter("   ")).toBeNull();
  });
  it("returns null when first character is not a letter", () => {
    expect(extractCategoryLetter("12")).toBeNull();
    expect(extractCategoryLetter("1A")).toBeNull();
  });
});

describe("getPriceFromCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns amountCents for code A12 when tenant has A=5000", async () => {
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
    vi.mocked(db.categoryPrice.findUnique).mockResolvedValue(null);

    const result = await getPriceFromCode("t1", "Z99");
    expect(result).toBeNull();
    expect(db.categoryPrice.findUnique).toHaveBeenCalledWith({
      where: { tenantId_categoryLetter: { tenantId: "t1", categoryLetter: "Z" } },
      select: { amountCents: true },
    });
  });

  it("returns null for empty/invalid code", async () => {
    expect(await getPriceFromCode("t1", "")).toBeNull();
    expect(await getPriceFromCode("t1", "   ")).toBeNull();
    expect(await getPriceFromCode("t1", "12")).toBeNull();
    expect(db.categoryPrice.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for empty or whitespace tenantId without calling DB", async () => {
    expect(await getPriceFromCode("", "A12")).toBeNull();
    expect(await getPriceFromCode("   ", "A12")).toBeNull();
    expect(db.categoryPrice.findUnique).not.toHaveBeenCalled();
  });
});
