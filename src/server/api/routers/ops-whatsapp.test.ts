import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockTenantFindMany = vi.hoisted(() => vi.fn());
const mockTenantFindUnique = vi.hoisted(() => vi.fn());
const mockTenantUpdate = vi.hoisted(() => vi.fn());
const mockEventLogFindMany = vi.hoisted(() => vi.fn());
const mockEventLogCreate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
const mockValidateMetaCredentials = vi.hoisted(() => vi.fn());
const mockIsOpsUser = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findMany: (...args: unknown[]) => mockTenantFindMany(...args),
      findUnique: (...args: unknown[]) => mockTenantFindUnique(...args),
    },
    eventLog: {
      findMany: (...args: unknown[]) => mockEventLogFindMany(...args),
      create: (...args: unknown[]) => mockEventLogCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("~/server/messaging/providers/meta/credentials", () => ({
  validateMetaCredentials: (...args: unknown[]) =>
    mockValidateMetaCredentials(...args),
}));

vi.mock("~/lib/rbac", async () => {
  const actual = await vi.importActual<typeof import("~/lib/rbac")>("~/lib/rbac");
  return {
    ...actual,
    isOpsUser: (...args: unknown[]) => mockIsOpsUser(...args),
  };
});

const tenantId = "clx1234567890123456789012";
const opsSession = {
  user: {
    id: "clxops1234567890123456789",
    email: "ops@snapsell.com",
    tenantId: null,
    role: "OPS",
  },
};
const ownerSession = {
  user: {
    id: "clxowner12345678901234567",
    email: "owner@example.com",
    tenantId,
    role: "OWNER",
  },
};

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: tenantId,
    name: "Boutique Awa",
    subscriptionPlan: "PRO",
    metaPhoneNumberId: "123456",
    metaWabaId: "789012",
    metaAccessToken: "stored-token",
    metaCoexistence: true,
    metaHistorySyncStatus: "completed",
    metaContactsSyncStatus: "completed",
    metaHistorySyncAt: new Date("2026-08-12T20:00:00Z"),
    updatedAt: new Date("2026-08-12T21:00:00Z"),
    users: [{ email: "awa@example.com" }],
    ...overrides,
  };
}

async function callerFor(session: typeof opsSession | typeof ownerSession) {
  const ctx = await createTRPCContext({
    headers: new Headers(),
    session: session as never,
  });
  return createCaller(ctx);
}

describe("ops.whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpsUser.mockImplementation((role: string) => role === "OPS");
    mockEventLogFindMany.mockResolvedValue([]);
    mockValidateMetaCredentials.mockResolvedValue(undefined);
    mockTenantUpdate.mockResolvedValue({ id: tenantId });
    mockEventLogCreate.mockResolvedValue({ id: "event-1" });
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          tenant: { update: mockTenantUpdate },
          eventLog: { create: mockEventLogCreate },
        }),
    );
  });

  it("réserve la console au rôle OPS", async () => {
    const caller = await callerFor(ownerSession);

    await expect(caller.ops.whatsapp.list({ query: "" })).rejects.toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("recherche les boutiques sans exposer leurs tokens", async () => {
    mockTenantFindMany.mockResolvedValue([
      {
        id: tenantId,
        name: "Boutique Awa",
        metaPhoneNumberId: "123456",
        metaWabaId: "789012",
        metaAccessToken: "secret-never-returned",
        users: [{ email: "awa@example.com" }],
      },
    ]);
    const caller = await callerFor(opsSession);

    const result = await caller.ops.whatsapp.list({ query: "awa" });

    expect(result).toEqual([
      {
        id: tenantId,
        name: "Boutique Awa",
        ownerEmail: "awa@example.com",
        phoneNumberId: "123456",
        connected: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret-never-returned");
    expect(mockTenantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            { name: { contains: "awa", mode: "insensitive" } },
          ]),
        },
      }),
    );
  });

  it("retourne un diagnostic sans jamais relire le token", async () => {
    mockTenantFindUnique.mockResolvedValue(
      tenant({ metaAccessToken: "secret-never-returned" }),
    );
    const caller = await callerFor(opsSession);

    const result = await caller.ops.whatsapp.diagnostic({ tenantId });

    expect(result.hasAccessToken).toBe(true);
    expect(result.connected).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-never-returned");
    expect(mockEventLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          eventType: { startsWith: "ops.whatsapp_" },
        },
      }),
    );
  });

  it("audite un test de connexion réussi sans journaliser le secret", async () => {
    mockTenantFindUnique.mockResolvedValue(
      tenant({ metaAccessToken: "secret-never-logged" }),
    );
    const caller = await callerFor(opsSession);

    await caller.ops.whatsapp.testConnection({ tenantId });

    expect(mockValidateMetaCredentials).toHaveBeenCalledWith({
      phoneId: "123456",
      wabaId: "789012",
      accessToken: "secret-never-logged",
    });
    expect(mockEventLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        eventType: "ops.whatsapp_connection_tested",
        actorType: "ops",
        payload: { actorUserId: opsSession.user.id, result: "success" },
      }),
    });
    expect(JSON.stringify(mockEventLogCreate.mock.calls)).not.toContain(
      "secret-never-logged",
    );
  });

  it("valide chez Meta avant une écriture auditée et atomique", async () => {
    mockTenantFindUnique.mockResolvedValue(tenant());
    const caller = await callerFor(opsSession);

    await caller.ops.whatsapp.updateConfig({
      tenantId,
      phoneNumberId: "new-phone-id",
      wabaId: "new-waba-id",
      accessToken: "new-secret-token",
    });

    expect(mockValidateMetaCredentials).toHaveBeenCalledWith({
      phoneId: "new-phone-id",
      wabaId: "new-waba-id",
      accessToken: "new-secret-token",
    });
    expect(mockValidateMetaCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      mockTransaction.mock.invocationCallOrder[0]!,
    );
    expect(mockTenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: tenantId },
        data: expect.objectContaining({
          metaPhoneNumberId: "new-phone-id",
          metaWabaId: "new-waba-id",
          metaAccessToken: expect.any(String),
        }),
      }),
    );
    expect(mockEventLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        eventType: "ops.whatsapp_config_updated",
        actorType: "ops",
        payload: {
          actorUserId: opsSession.user.id,
          phoneNumberIdChanged: true,
          wabaIdChanged: true,
          accessTokenChanged: true,
        },
      }),
    });
    expect(JSON.stringify(mockEventLogCreate.mock.calls)).not.toContain(
      "new-secret-token",
    );
  });

  it("conserve le secret existant lorsqu'aucun nouveau token n'est fourni", async () => {
    mockTenantFindUnique.mockResolvedValue(tenant());
    const caller = await callerFor(opsSession);

    await caller.ops.whatsapp.updateConfig({
      tenantId,
      phoneNumberId: "123456",
      wabaId: "789012",
    });

    expect(mockValidateMetaCredentials).toHaveBeenCalledWith({
      phoneId: "123456",
      wabaId: "789012",
      accessToken: "stored-token",
    });
    expect(mockTenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metaPhoneNumberId: "123456",
          metaWabaId: "789012",
        },
      }),
    );
  });
});
