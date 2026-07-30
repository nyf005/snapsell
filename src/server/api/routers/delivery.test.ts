/**
 * Tests du router livraison.
 *
 * Il n'en avait aucun, alors qu'il fixe les montants réellement facturés aux
 * clientes. La *règle* de calcul est testée à part
 * (`lib/delivery/resolve-delivery-fee.test.ts`, 11 cas) ; ce qui manquait, c'est
 * l'écriture autour : qui a le droit, ce qui est écrit, et ce qui est refusé.
 *
 * `checkDeliveryAccess` mérite en particulier une vérification mécanique — j'avais
 * cru à tort qu'il n'était pas appelé, faute de test pour trancher.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockZoneFindMany = vi.hoisted(() => vi.fn());
const mockZoneFindFirst = vi.hoisted(() => vi.fn());
const mockZoneCreate = vi.hoisted(() => vi.fn());
const mockZoneUpdate = vi.hoisted(() => vi.fn());
const mockZoneDeleteMany = vi.hoisted(() => vi.fn());
const mockCommuneDeleteMany = vi.hoisted(() => vi.fn());
const mockCommuneCreate = vi.hoisted(() => vi.fn());
const mockFeeFindMany = vi.hoisted(() => vi.fn());
const mockFeeUpsert = vi.hoisted(() => vi.fn());
const mockFeeDeleteMany = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    deliveryZone: {
      findMany: mockZoneFindMany,
      findFirst: mockZoneFindFirst,
      create: mockZoneCreate,
      update: mockZoneUpdate,
      deleteMany: mockZoneDeleteMany,
    },
    deliveryZoneCommune: {
      deleteMany: mockCommuneDeleteMany,
      create: mockCommuneCreate,
    },
    deliveryFeeCommune: {
      findMany: mockFeeFindMany,
      upsert: mockFeeUpsert,
      deleteMany: mockFeeDeleteMany,
    },
    $transaction: mockTransaction,
  },
}));

describe("delivery router", () => {
  const ownerSession = {
    user: { id: "u1", email: "o@example.com", tenantId: "tenant-1", role: "OWNER" },
  };
  const agentSession = { user: { ...ownerSession.user, id: "u2", role: "AGENT" } };

  async function callerFor(session: unknown = ownerSession) {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: session as never,
    });
    return createCaller(ctx);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockZoneFindMany.mockResolvedValue([]);
    mockFeeFindMany.mockResolvedValue([]);
    mockZoneCreate.mockResolvedValue({ id: "zone-new" });
    mockZoneDeleteMany.mockResolvedValue({ count: 1 });
    mockFeeDeleteMany.mockResolvedValue({ count: 1 });
    mockFeeUpsert.mockResolvedValue({ id: "fee-1" });
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          deliveryZone: { update: mockZoneUpdate },
          deliveryZoneCommune: {
            deleteMany: mockCommuneDeleteMany,
            create: mockCommuneCreate,
          },
        }),
    );
  });

  /**
   * Les frais de livraison sont un réglage : ils déterminent ce que paie la
   * cliente. Un Agent ne doit pas pouvoir les changer.
   */
  describe("accès", () => {
    it.each([
      ["getDeliveryZones", (c: Awaited<ReturnType<typeof callerFor>>) => c.delivery.getDeliveryZones({})],
      ["deleteDeliveryZone", (c: Awaited<ReturnType<typeof callerFor>>) => c.delivery.deleteDeliveryZone({ zoneId: "z1" })],
      ["getDeliveryFeeCommunes", (c: Awaited<ReturnType<typeof callerFor>>) => c.delivery.getDeliveryFeeCommunes({})],
      ["deleteDeliveryFeeCommune", (c: Awaited<ReturnType<typeof callerFor>>) => c.delivery.deleteDeliveryFeeCommune({ communeName: "Cocody" })],
    ])("refuse %s à un Agent", async (_name, call) => {
      const caller = await callerFor(agentSession);
      await expect(call(caller)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuse la création de zone à un Agent, sans rien écrire", async () => {
      const caller = await callerFor(agentSession);
      await expect(
        caller.delivery.upsertDeliveryZone({
          name: "Abidjan",
          amount: 100_000,
          communeNames: ["Cocody"],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockZoneCreate).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("laisse passer le Propriétaire", async () => {
      const caller = await callerFor();
      await expect(caller.delivery.getDeliveryZones({})).resolves.toBeDefined();
    });
  });

  describe("upsertDeliveryZone", () => {
    it("crée une zone avec ses communes", async () => {
      const caller = await callerFor();

      const result = await caller.delivery.upsertDeliveryZone({
        name: "Abidjan",
        amount: 100_000,
        communeNames: ["Cocody", "Marcory"],
      });

      expect(result).toEqual({ id: "zone-new" });
      expect(mockZoneCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: "tenant-1", name: "Abidjan" }),
        }),
      );
    });

    /** Deux fois la même commune ne doit pas créer deux lignes. */
    it("déduplique les communes", async () => {
      const caller = await callerFor();

      await caller.delivery.upsertDeliveryZone({
        name: "Abidjan",
        amount: 100_000,
        communeNames: ["Cocody", "Cocody", "Marcory"],
      });

      const communes = mockZoneCreate.mock.calls[0]?.[0]?.data?.communes?.create;
      expect(communes).toHaveLength(2);
    });

    /**
     * La modification remplace la liste des communes dans une transaction : sans
     * elle, une erreur en cours laisserait la zone sans aucune commune, et toutes
     * les livraisons concernées basculeraient sur le tarif de repli.
     */
    it("remplace les communes d'une zone existante en transaction", async () => {
      mockZoneFindFirst.mockResolvedValue({ id: "zone-1", tenantId: "tenant-1" });
      const caller = await callerFor();

      const result = await caller.delivery.upsertDeliveryZone({
        id: "zone-1",
        name: "Abidjan",
        amount: 150_000,
        communeNames: ["Yopougon"],
      });

      expect(result).toEqual({ id: "zone-1" });
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockCommuneDeleteMany).toHaveBeenCalledWith({ where: { zoneId: "zone-1" } });
      expect(mockCommuneCreate).toHaveBeenCalledWith({
        data: { zoneId: "zone-1", communeName: "Yopougon" },
      });
    });

    /** Une zone d'une autre boutique ne doit pas être modifiable. */
    it("refuse de modifier une zone qui n'est pas de la boutique", async () => {
      mockZoneFindFirst.mockResolvedValue(null);
      const caller = await callerFor();

      await expect(
        caller.delivery.upsertDeliveryZone({
          id: "zone-autre",
          name: "X",
          amount: 1,
          communeNames: [],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("cherche la zone dans la boutique de l'appelant", async () => {
      mockZoneFindFirst.mockResolvedValue({ id: "zone-1", tenantId: "tenant-1" });
      const caller = await callerFor();

      await caller.delivery.upsertDeliveryZone({
        id: "zone-1",
        name: "Abidjan",
        amount: 1,
        communeNames: [],
      });

      expect(mockZoneFindFirst).toHaveBeenCalledWith({
        where: { id: "zone-1", tenantId: "tenant-1" },
      });
    });

    /** Plafond ajouté après coup : chaque nom crée une ligne. */
    it("refuse plus de 300 communes", async () => {
      const caller = await callerFor();
      const communeNames = Array.from({ length: 301 }, (_, i) => `Commune${i}`);

      await expect(
        caller.delivery.upsertDeliveryZone({ name: "X", amount: 1, communeNames }),
      ).rejects.toThrow();
      expect(mockZoneCreate).not.toHaveBeenCalled();
    });

    it("refuse un montant négatif", async () => {
      const caller = await callerFor();
      await expect(
        caller.delivery.upsertDeliveryZone({ name: "X", amount: -1, communeNames: [] }),
      ).rejects.toThrow();
    });

    it("refuse un nom vide", async () => {
      const caller = await callerFor();
      await expect(
        caller.delivery.upsertDeliveryZone({ name: "   ", amount: 1, communeNames: [] }),
      ).rejects.toThrow();
    });
  });

  describe("suppressions", () => {
    it("supprime une zone dans la boutique de l'appelant", async () => {
      const caller = await callerFor();

      await caller.delivery.deleteDeliveryZone({ zoneId: "zone-1" });

      expect(mockZoneDeleteMany).toHaveBeenCalledWith({
        where: { id: "zone-1", tenantId: "tenant-1" },
      });
    });

    it("supprime un tarif de commune dans la boutique de l'appelant", async () => {
      const caller = await callerFor();

      await caller.delivery.deleteDeliveryFeeCommune({ communeName: "Cocody" });

      expect(mockFeeDeleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-1" }),
        }),
      );
    });
  });
});
