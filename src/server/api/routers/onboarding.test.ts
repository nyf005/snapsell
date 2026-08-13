/**
 * Tests du router onboarding.
 *
 * `getStatus` ne modifie rien : il dérive la liste de démarrage de comptes en
 * base. C'est justement pour ça qu'il mérite des tests — une étape cochée à tort
 * fait croire à la vendeuse que sa boutique est prête, alors qu'un message
 * échouera au premier client. L'étape WhatsApp est la plus sensible : elle exige
 * trois identifiants, et deux sur trois ne suffisent pas.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockTenantFindUnique = vi.hoisted(() => vi.fn());
const mockCategoryCount = vi.hoisted(() => vi.fn());
const mockZoneCount = vi.hoisted(() => vi.fn());
const mockCommuneCount = vi.hoisted(() => vi.fn());
const mockSellerPhoneCount = vi.hoisted(() => vi.fn());
const mockOrderCount = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: { findUnique: mockTenantFindUnique },
    categoryPrice: { count: mockCategoryCount },
    deliveryZone: { count: mockZoneCount },
    deliveryFeeCommune: { count: mockCommuneCount },
    sellerPhone: { count: mockSellerPhoneCount },
    order: { count: mockOrderCount },
  },
}));

const CONNECTED = {
  metaPhoneNumberId: "phone-1",
  metaWabaId: "waba-1",
  metaAccessToken: "token-1",
  assistantEnabled: false,
  faqDelivery: null,
  faqPayment: null,
  faqLocation: null,
  faqAvailability: null,
};

describe("onboarding.getStatus", () => {
  const session = {
    user: { id: "u1", email: "o@example.com", tenantId: "tenant-1", role: "OWNER" },
  };

  async function callerFor(user: unknown = session) {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: user as never,
    });
    return createCaller(ctx);
  }

  /** Tout à zéro : rien de fait. */
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: null,
      metaWabaId: null,
      metaAccessToken: null,
      assistantEnabled: false,
      faqDelivery: null,
      faqPayment: null,
      faqLocation: null,
      faqAvailability: null,
    });
    mockCategoryCount.mockResolvedValue(0);
    mockZoneCount.mockResolvedValue(0);
    mockCommuneCount.mockResolvedValue(0);
    mockSellerPhoneCount.mockResolvedValue(0);
    mockOrderCount.mockResolvedValue(0);
  });

  function stepOf(
    result: { steps: { id: string; done: boolean; required: boolean }[] },
    id: string,
  ) {
    const step = result.steps.find((s) => s.id === id);
    if (!step) throw new Error(`étape ${id} absente`);
    return step;
  }

  it("part de sept étapes, aucune faite", async () => {
    const caller = await callerFor();

    const result = await caller.onboarding.getStatus();

    expect(result.totalCount).toBe(7);
    expect(result.doneCount).toBe(0);
    expect(result.isComplete).toBe(false);
    expect(result.whatsappConnected).toBe(false);
  });

  /**
   * Trois étapes sont requises pour vendre, trois sont du confort. La liste ne
   * doit pas se réordonner ni changer de nature sans qu'on s'en aperçoive :
   * l'écran de démarrage s'appuie dessus.
   */
  it("garde les mêmes étapes, dans le même ordre, avec le même caractère requis", async () => {
    const caller = await callerFor();

    const result = await caller.onboarding.getStatus();

    expect(result.steps.map((s) => s.id)).toEqual([
      "whatsapp",
      "prices",
      "delivery",
      "assistant",
      "replies",
      "sellerPhone",
      "firstSale",
    ]);
    expect(result.steps.filter((s) => s.required).map((s) => s.id)).toEqual([
      "whatsapp",
      "prices",
      "delivery",
      "assistant",
    ]);
  });

  describe("étape WhatsApp", () => {
    it("est faite quand les trois identifiants sont là", async () => {
      mockTenantFindUnique.mockResolvedValue(CONNECTED);
      const caller = await callerFor();

      const result = await caller.onboarding.getStatus();

      expect(result.whatsappConnected).toBe(true);
      expect(stepOf(result, "whatsapp").done).toBe(true);
    });

    /**
     * Le WABA ID est le plus facile à oublier — il n'apparaît pas dans l'envoi
     * de message, mais sans lui l'appel à Meta échoue. Une étape cochée avec
     * deux identifiants sur trois enverrait la vendeuse en production cassée.
     */
    it.each([
      ["metaPhoneNumberId", { ...CONNECTED, metaPhoneNumberId: null }],
      ["metaWabaId", { ...CONNECTED, metaWabaId: null }],
      ["metaAccessToken", { ...CONNECTED, metaAccessToken: null }],
    ])("reste à faire s'il manque %s", async (_name, tenant) => {
      mockTenantFindUnique.mockResolvedValue(tenant);
      const caller = await callerFor();

      const result = await caller.onboarding.getStatus();

      expect(result.whatsappConnected).toBe(false);
      expect(stepOf(result, "whatsapp").done).toBe(false);
    });

    /** Une boutique introuvable ne doit pas être déclarée connectée. */
    it("reste à faire si la boutique est introuvable", async () => {
      mockTenantFindUnique.mockResolvedValue(null);
      const caller = await callerFor();

      const result = await caller.onboarding.getStatus();

      expect(result.whatsappConnected).toBe(false);
      expect(result.doneCount).toBe(0);
    });
  });

  describe("étape livraison", () => {
    it("est faite avec une zone seule", async () => {
      mockZoneCount.mockResolvedValue(1);
      const caller = await callerFor();

      expect(stepOf(await caller.onboarding.getStatus(), "delivery").done).toBe(true);
    });

    /** Les deux façons de tarifer valent l'une pour l'autre. */
    it("est faite avec un tarif par commune seul", async () => {
      mockCommuneCount.mockResolvedValue(3);
      const caller = await callerFor();

      expect(stepOf(await caller.onboarding.getStatus(), "delivery").done).toBe(true);
    });
  });

  describe("étape réponses automatiques", () => {
    it.each(["faqDelivery", "faqPayment", "faqLocation", "faqAvailability"])(
      "est faite dès que %s est renseignée",
      async (field) => {
        mockTenantFindUnique.mockResolvedValue({ ...CONNECTED, [field]: "Une réponse" });
        const caller = await callerFor();

        expect(stepOf(await caller.onboarding.getStatus(), "replies").done).toBe(true);
      },
    );

    it("reste à faire quand aucune n'est renseignée", async () => {
      mockTenantFindUnique.mockResolvedValue(CONNECTED);
      const caller = await callerFor();

      expect(stepOf(await caller.onboarding.getStatus(), "replies").done).toBe(false);
    });
  });

  it("compte la boutique comme prête quand les sept étapes sont faites", async () => {
    mockTenantFindUnique.mockResolvedValue({
      ...CONNECTED,
      assistantEnabled: true,
      faqDelivery: "Sous 24h",
    });
    mockCategoryCount.mockResolvedValue(4);
    mockZoneCount.mockResolvedValue(2);
    mockSellerPhoneCount.mockResolvedValue(1);
    mockOrderCount.mockResolvedValue(1);
    const caller = await callerFor();

    const result = await caller.onboarding.getStatus();

    expect(result.doneCount).toBe(7);
    expect(result.isComplete).toBe(true);
  });

  /** L'écran de démarrage doit compter la boutique de l'appelant, pas une autre. */
  it("ne compte que la boutique de l'appelant", async () => {
    const caller = await callerFor();

    await caller.onboarding.getStatus();

    for (const mock of [
      mockCategoryCount,
      mockZoneCount,
      mockCommuneCount,
      mockSellerPhoneCount,
      mockOrderCount,
    ]) {
      expect(mock).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    }
    expect(mockTenantFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tenant-1" } }),
    );
  });

  /** La liste de démarrage se lit à tous les rôles : elle ne modifie rien. */
  it("est lisible par un Agent", async () => {
    const caller = await callerFor({ user: { ...session.user, role: "AGENT" } });

    await expect(caller.onboarding.getStatus()).resolves.toBeDefined();
  });

  it("refuse un visiteur non connecté", async () => {
    const caller = await callerFor(null);

    await expect(caller.onboarding.getStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
