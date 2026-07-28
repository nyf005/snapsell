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
  variants: [],
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
    // L'article porte son propre prix : la grille n'est même pas consultée.
    expect(mockGetPrice).not.toHaveBeenCalled();
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
      include: { variants: { select: { id: true } } },
    });
  });

  it("returns null for invalid code (empty)", async () => {
    const result = await findOrCreateOrderableItemByCode(TENANT, "");

    expect(result).toBeNull();
    expect(mockGetPrice).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null for unknown code with no price in grid", async () => {
    // Le catalogue est consulté en premier ; la grille ne tranche que pour la création.
    mockFindUnique.mockResolvedValue(null as never);
    mockGetPrice.mockResolvedValue(null);

    const result = await findOrCreateOrderableItemByCode(TENANT, "Z99");

    expect(result).toBeNull();
    expect(mockFindUnique).toHaveBeenCalled();
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

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { tenantId_code: { tenantId: TENANT, code: "A12" } },
      include: { variants: { select: { id: true } } },
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

/**
 * Régression : la grille était consultée AVANT le catalogue et bloquait tout.
 *
 * Une vendeuse ajoutait « ROBE01 » à son catalogue avec son prix, démarrait un live,
 * et la cliente qui envoyait « ROBE01 » recevait « Code introuvable » — parce
 * qu'aucune catégorie ne commençait par R. Hors live le même code fonctionnait,
 * ce qui rendait le défaut invisible aux tests manuels.
 */
describe("findOrCreateOrderableItemByCode — commande possible dès que l'article existe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Article au catalogue dont le code ne correspond à aucune catégorie. */
  const ROBE = {
    ...CATALOGUE_ITEM,
    id: "cat-robe",
    code: "ROBE01",
    amount: 1_500_000,
    origin: "dashboard",
    createdInLive: false,
  };

  it("accepte un article du catalogue dont le code n'a aucune catégorie", async () => {
    mockFindUnique.mockResolvedValue(ROBE as never);
    mockGetPrice.mockResolvedValue(null); // aucune catégorie ne commence par R

    const result = await findOrCreateOrderableItemByCode(TENANT, "ROBE01");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("cat-robe");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("conserve le prix de l'article, pas celui de la grille", async () => {
    mockFindUnique.mockResolvedValue(ROBE as never);
    mockGetPrice.mockResolvedValue(999); // la grille propose autre chose

    const result = await findOrCreateOrderableItemByCode(TENANT, "ROBE01");

    expect(result!.amount).toBe(1_500_000);
  });

  it("crée toujours un article inconnu quand la grille donne un prix", async () => {
    mockFindUnique.mockResolvedValue(null as never);
    mockGetPrice.mockResolvedValue(5000);
    mockCreate.mockResolvedValue(CATALOGUE_ITEM as never);

    const result = await findOrCreateOrderableItemByCode(TENANT, "A12");

    expect(result).not.toBeNull();
    expect(result!.createdInLive).toBe(true);
    expect(mockCreate).toHaveBeenCalled();
  });

  it("refuse un code inconnu sans prix connaissable", async () => {
    mockFindUnique.mockResolvedValue(null as never);
    mockGetPrice.mockResolvedValue(null);

    expect(await findOrCreateOrderableItemByCode(TENANT, "ZZZ9")).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("interroge le catalogue avant la grille", async () => {
    const order: string[] = [];
    // `as never` : le type de retour de Prisma est plus riche qu'une simple promesse.
    mockFindUnique.mockImplementation((() => {
      order.push("catalogue");
      return Promise.resolve(null);
    }) as never);
    mockGetPrice.mockImplementation(() => {
      order.push("grille");
      return Promise.resolve(null);
    });

    await findOrCreateOrderableItemByCode(TENANT, "A12");

    expect(order).toEqual(["catalogue", "grille"]);
  });

  it("n'interroge jamais la grille pour un article déjà au catalogue", async () => {
    mockFindUnique.mockResolvedValue(ROBE as never);

    await findOrCreateOrderableItemByCode(TENANT, "ROBE01");

    // Une requête de moins sur le chemin chaud du live.
    expect(mockGetPrice).not.toHaveBeenCalled();
  });
});
