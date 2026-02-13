import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findLiveItemByCode } from "./findLiveItemByCode";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    liveItem: {
      findFirst: vi.fn(),
    },
  },
}));

describe("findLiveItemByCode (Story 4.2)", () => {
  const tenantId = "t1";
  const liveSessionId = "session-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retourne null si aucun LiveItem pour (tenantId, liveSessionId, code)", async () => {
    vi.mocked(db.liveItem.findFirst).mockResolvedValue(null);

    const result = await findLiveItemByCode(tenantId, liveSessionId, "A12");

    expect(result).toBeNull();
    expect(db.liveItem.findFirst).toHaveBeenCalledWith({
      where: { tenantId, liveSessionId, code: "A12" },
    });
  });

  it("retourne l'item si existant (lookup seul, pas de création)", async () => {
    const existing = {
      id: "item-1",
      tenantId,
      liveSessionId,
      code: "A12",
      amount: 5000,
      quantity: 1,
      availableQty: 1,
      reservedQty: 0,
      mediaStorageKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.liveItem.findFirst).mockResolvedValue(existing as never);

    const result = await findLiveItemByCode(tenantId, liveSessionId, "A12");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("item-1");
    expect(result?.code).toBe("A12");
    expect(result?.availableQty).toBe(1);
    expect(result?.reservedQty).toBe(0);
    expect(db.liveItem.findFirst).toHaveBeenCalledTimes(1);
  });

  it("normalise le code (trim + uppercase) pour le lookup", async () => {
    vi.mocked(db.liveItem.findFirst).mockResolvedValue(null);

    await findLiveItemByCode(tenantId, liveSessionId, "  a12  ");

    expect(db.liveItem.findFirst).toHaveBeenCalledWith({
      where: { tenantId, liveSessionId, code: "A12" },
    });
  });

  it("retourne null si code vide après normalisation", async () => {
    const result = await findLiveItemByCode(tenantId, liveSessionId, "   ");

    expect(result).toBeNull();
    expect(db.liveItem.findFirst).not.toHaveBeenCalled();
  });

  it("propage l'erreur si db.liveItem.findFirst lève (ex. timeout)", async () => {
    vi.mocked(db.liveItem.findFirst).mockRejectedValue(new Error("DB timeout"));

    await expect(
      findLiveItemByCode(tenantId, liveSessionId, "A12"),
    ).rejects.toThrow("DB timeout");

    expect(db.liveItem.findFirst).toHaveBeenCalledWith({
      where: { tenantId, liveSessionId, code: "A12" },
    });
  });
});
