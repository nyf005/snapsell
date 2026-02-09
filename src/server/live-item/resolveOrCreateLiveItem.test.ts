import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "../../../generated/prisma";
import { resolveOrCreateLiveItem } from "./createLiveItem";
import { db } from "~/server/db";
import * as pricing from "~/server/pricing/getPriceFromCode";

vi.mock("~/server/db", () => ({
  db: {
    liveItem: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("~/server/pricing/getPriceFromCode", () => ({
  getPriceFromCode: vi.fn(),
}));

describe("resolveOrCreateLiveItem (Story 3.3)", () => {
  const tenantId = "t1";
  const liveSessionId = "session-1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pricing.getPriceFromCode).mockResolvedValue(5000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("client envoie code A12, aucun item en session → crée un LiveItem A12, quantity 1, amountCents grille", async () => {
    vi.mocked(db.liveItem.findFirst).mockResolvedValue(null);
    vi.mocked(db.liveItem.create).mockResolvedValue({
      id: "item-1",
      tenantId,
      liveSessionId,
      code: "A12",
      amountCents: 5000,
      quantity: 1,
      availableQty: 1,
      reservedQty: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await resolveOrCreateLiveItem(tenantId, liveSessionId, "A12");

    expect(result.created).toBe(true);
    expect(result.liveItem.code).toBe("A12");
    expect(result.liveItem.quantity).toBe(1);
    expect(result.liveItem.availableQty).toBe(1);
    expect(result.liveItem.reservedQty).toBe(0);
    expect(result.liveItem.amountCents).toBe(5000);
    expect(result.liveItem.liveSessionId).toBe(liveSessionId);
    expect(db.liveItem.findFirst).toHaveBeenCalledWith({
      where: { tenantId, liveSessionId, code: "A12" },
    });
    expect(db.liveItem.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        liveSessionId,
        code: "A12",
        amountCents: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
      },
    });
  });

  it("client envoie A12 une deuxième fois (item déjà créé) → pas de second item, même item réutilisé", async () => {
    const existing = {
      id: "item-1",
      tenantId,
      liveSessionId,
      code: "A12",
      amountCents: 5000,
      quantity: 1,
      availableQty: 1,
      reservedQty: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.liveItem.findFirst).mockResolvedValue(existing as never);

    const result = await resolveOrCreateLiveItem(tenantId, liveSessionId, "A12");

    expect(result.created).toBe(false);
    expect(result.liveItem.id).toBe("item-1");
    expect(result.liveItem.code).toBe("A12");
    expect(result.liveItem.quantity).toBe(1);
    expect(db.liveItem.create).not.toHaveBeenCalled();
  });

  it("deux messages client même code (race P2002) → un seul item créé, read-after-conflict retourne l’existant", async () => {
    vi.mocked(db.liveItem.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.mocked(db.liveItem.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const existingAfterConflict = {
      id: "item-1",
      tenantId,
      liveSessionId,
      code: "A12",
      amountCents: 5000,
      quantity: 1,
      availableQty: 1,
      reservedQty: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.liveItem.findFirstOrThrow).mockResolvedValue(
      existingAfterConflict as never,
    );

    const result = await resolveOrCreateLiveItem(tenantId, liveSessionId, "A12");

    expect(result.created).toBe(false);
    expect(result.liveItem.id).toBe("item-1");
    expect(result.liveItem.code).toBe("A12");
    expect(db.liveItem.findFirstOrThrow).toHaveBeenCalledWith({
      where: { tenantId, liveSessionId, code: "A12" },
    });
  });

  it("normalise le code (trim + uppercase)", async () => {
    vi.mocked(db.liveItem.findFirst).mockResolvedValue(null);
    vi.mocked(db.liveItem.create).mockResolvedValue({
      id: "item-1",
      tenantId,
      liveSessionId,
      code: "A12",
      amountCents: 5000,
      quantity: 1,
      availableQty: 1,
      reservedQty: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    await resolveOrCreateLiveItem(tenantId, liveSessionId, "  a12  ");

    expect(db.liveItem.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        liveSessionId,
        code: "A12",
        amountCents: 5000,
        quantity: 1,
        availableQty: 1,
        reservedQty: 0,
      },
    });
  });

  it("throw si code vide après normalisation", async () => {
    await expect(
      resolveOrCreateLiveItem(tenantId, liveSessionId, ""),
    ).rejects.toThrow("invalid_code");
    await expect(
      resolveOrCreateLiveItem(tenantId, liveSessionId, "   "),
    ).rejects.toThrow("invalid_code");
    expect(db.liveItem.create).not.toHaveBeenCalled();
  });
});
