import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSessionInventory } from "./getSessionInventory";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    liveItem: { findMany: vi.fn() },
    catalogueItem: { findMany: vi.fn() },
  },
}));

const mockLiveItems = vi.mocked(db.liveItem.findMany);
const mockCatalogueItems = vi.mocked(db.catalogueItem.findMany);

const TENANT = "tenant-1";
const SESSION = "session-1";

/** LiveItem tel que créé au démarrage du live : chiffres figés. */
const LIVE_ITEM = {
  id: "live-1",
  code: "A12",
  amount: 500_000,
  quantity: 10,
  availableQty: 10,
  reservedQty: 0,
  mediaStorageKey: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSessionInventory", () => {
  it("prend le stock sur le catalogue, pas sur le LiveItem", async () => {
    // Trois réservations sont passées depuis le début du live.
    mockLiveItems.mockResolvedValue([LIVE_ITEM] as never);
    mockCatalogueItems.mockResolvedValue([
      {
        code: "A12",
        amount: 500_000,
        quantity: 10,
        availableQty: 10,
        reservedQty: 3,
      },
    ] as never);

    const [item] = await getSessionInventory(TENANT, SESSION);

    // Régression : LiveItem.reservedQty vaut toujours 0, l'écran affichait
    // « 0 réservé » quel que soit le nombre de commandes.
    expect(item!.reservedQty).toBe(3);
    expect(item!.availableQty).toBe(10);
  });

  it("garde l’identifiant du LiveItem comme clé d’affichage", async () => {
    mockLiveItems.mockResolvedValue([LIVE_ITEM] as never);
    mockCatalogueItems.mockResolvedValue([
      { code: "A12", amount: 500_000, quantity: 10, availableQty: 7, reservedQty: 3 },
    ] as never);

    const [item] = await getSessionInventory(TENANT, SESSION);

    expect(item!.id).toBe("live-1");
    expect(item!.code).toBe("A12");
  });

  it("préfère le prix du catalogue, qui peut avoir été corrigé", async () => {
    mockLiveItems.mockResolvedValue([LIVE_ITEM] as never);
    mockCatalogueItems.mockResolvedValue([
      { code: "A12", amount: 750_000, quantity: 10, availableQty: 10, reservedQty: 0 },
    ] as never);

    const [item] = await getSessionInventory(TENANT, SESSION);

    expect(item!.amount).toBe(750_000);
  });

  it("retombe sur les valeurs du LiveItem si le catalogue ne l’a pas", async () => {
    mockLiveItems.mockResolvedValue([LIVE_ITEM] as never);
    mockCatalogueItems.mockResolvedValue([] as never);

    const [item] = await getSessionInventory(TENANT, SESSION);

    // Mieux vaut une valeur périmée que rien du tout.
    expect(item!.availableQty).toBe(10);
    expect(item!.amount).toBe(500_000);
  });

  it("n’interroge pas le catalogue quand la session est vide", async () => {
    mockLiveItems.mockResolvedValue([] as never);

    expect(await getSessionInventory(TENANT, SESSION)).toEqual([]);
    expect(mockCatalogueItems).not.toHaveBeenCalled();
  });

  it("isole par tenant et par session", async () => {
    mockLiveItems.mockResolvedValue([LIVE_ITEM] as never);
    mockCatalogueItems.mockResolvedValue([] as never);

    await getSessionInventory(TENANT, SESSION);

    expect(mockLiveItems).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, liveSessionId: SESSION } }),
    );
    expect(mockCatalogueItems).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, code: { in: ["A12"] } } }),
    );
  });

  it("apparie plusieurs articles par code", async () => {
    mockLiveItems.mockResolvedValue([
      LIVE_ITEM,
      { ...LIVE_ITEM, id: "live-2", code: "B7", availableQty: 5, reservedQty: 0 },
    ] as never);
    mockCatalogueItems.mockResolvedValue([
      { code: "B7", amount: 100_000, quantity: 5, availableQty: 5, reservedQty: 4 },
      { code: "A12", amount: 500_000, quantity: 10, availableQty: 10, reservedQty: 1 },
    ] as never);

    const items = await getSessionInventory(TENANT, SESSION);

    expect(items.find((i) => i.code === "A12")!.reservedQty).toBe(1);
    expect(items.find((i) => i.code === "B7")!.reservedQty).toBe(4);
  });
});
