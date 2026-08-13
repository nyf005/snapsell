import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantFindUnique = vi.hoisted(() => vi.fn());
const tenantUpdate = vi.hoisted(() => vi.fn());
const catalogueCount = vi.hoisted(() => vi.fn());
const zoneCount = vi.hoisted(() => vi.fn());
const communeCount = vi.hoisted(() => vi.fn());
const eventCreate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: { findUnique: tenantFindUnique },
    catalogueItem: { count: catalogueCount },
    deliveryZone: { count: zoneCount },
    deliveryFeeCommune: { count: communeCount },
    $transaction: transaction,
  },
}));

import { getAssistantStatus, setAssistantEnabled } from "./service";

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    assistantEnabled: false,
    assistantUpdatedAt: null,
    assistantUpdatedBy: null,
    assistantActivatedAt: null,
    metaPhoneNumberId: "phone-1",
    metaWabaId: "waba-1",
    metaAccessToken: "encrypted-token",
    faqDelivery: null,
    faqPayment: null,
    faqLocation: null,
    faqAvailability: null,
    businessHoursStart: null,
    businessHoursEnd: null,
    ...overrides,
  };
}

describe("assistant service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantFindUnique.mockResolvedValue(tenant());
    catalogueCount.mockResolvedValue(1);
    zoneCount.mockResolvedValue(1);
    communeCount.mockResolvedValue(0);
    tenantUpdate.mockResolvedValue({});
    eventCreate.mockResolvedValue({});
    transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          tenant: { update: tenantUpdate },
          eventLog: { create: eventCreate },
        }),
    );
  });

  it("sépare une connexion valide d’une autorisation de répondre", async () => {
    const status = await getAssistantStatus("tenant-1");

    expect(status).toMatchObject({
      connected: true,
      enabled: false,
      state: "paused",
      ready: true,
    });
  });

  it("refuse l’activation sans WhatsApp ni article vendable", async () => {
    tenantFindUnique.mockResolvedValue(
      tenant({ metaPhoneNumberId: null, metaWabaId: null, metaAccessToken: null }),
    );
    catalogueCount.mockResolvedValue(0);

    await expect(
      setAssistantEnabled({
        tenantId: "tenant-1",
        enabled: true,
        actorUserId: "user-1",
        actorType: "seller",
      }),
    ).rejects.toMatchObject({
      message: "assistant_not_ready",
      blockers: ["whatsapp", "catalogue"],
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("active et audite atomiquement sans masquer les avertissements", async () => {
    zoneCount.mockResolvedValue(0);

    const result = await setAssistantEnabled({
      tenantId: "tenant-1",
      enabled: true,
      actorUserId: "user-1",
      actorType: "seller",
    });

    expect(result.enabled).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining(["delivery", "replies", "hours"]));
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: expect.objectContaining({
        assistantEnabled: true,
        assistantUpdatedBy: "user-1",
        assistantActivatedAt: expect.any(Date),
      }),
    });
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "assistant.activated",
        actorType: "seller",
      }),
    });
  });
});
