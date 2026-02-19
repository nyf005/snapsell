import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockTenantFindUnique = vi.hoisted(() => vi.fn());
const mockTenantFindFirst = vi.hoisted(() => vi.fn());
const mockTenantUpdate = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findUnique: mockTenantFindUnique,
      findFirst: mockTenantFindFirst,
      update: mockTenantUpdate,
    },
    categoryPrice: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("settings router — setWhatsAppConfig (Meta)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ownerSession = {
    user: {
      id: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "OWNER",
    },
  };

  const agentSession = {
    user: {
      id: "user-2",
      email: "agent@example.com",
      tenantId: "tenant-1",
      role: "AGENT",
    },
  };

  async function makeCaller(session: any) {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: session as any,
    });
    return createCaller(ctx);
  }

  it("saves Meta fields for Owner", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantUpdate.mockResolvedValue({});

    const caller = await makeCaller(ownerSession);
    const result = await caller.settings.setWhatsAppConfig({
      metaPhoneNumberId: "123456",
      metaWabaId: "789",
      metaAccessToken: "EAAtoken",
    });

    expect(result).toEqual({ ok: true });
    expect(mockTenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: {
        metaPhoneNumberId: "123456",
        metaWabaId: "789",
        metaAccessToken: "EAAtoken",
      },
    });
  });

  it("does NOT overwrite token when metaAccessToken is null", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantUpdate.mockResolvedValue({});

    const caller = await makeCaller(ownerSession);
    await caller.settings.setWhatsAppConfig({
      metaPhoneNumberId: "123456",
      metaWabaId: "789",
      metaAccessToken: null,
    });

    expect(mockTenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: {
        metaPhoneNumberId: "123456",
        metaWabaId: "789",
        // metaAccessToken absent → token existant préservé
      },
    });
    // Vérifie que metaAccessToken n'est PAS dans data
    const updateCall = mockTenantUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateCall.data).not.toHaveProperty("metaAccessToken");
  });

  it("rejects AGENT role with FORBIDDEN", async () => {
    const caller = await makeCaller(agentSession);
    await expect(
      caller.settings.setWhatsAppConfig({
        metaPhoneNumberId: "123",
        metaWabaId: "456",
        metaAccessToken: null,
      }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.settings.setWhatsAppConfig({
        metaPhoneNumberId: "123",
        metaWabaId: "456",
        metaAccessToken: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects duplicate metaPhoneNumberId with CONFLICT", async () => {
    mockTenantFindFirst.mockResolvedValue({ id: "other-tenant" });

    const caller = await makeCaller(ownerSession);
    await expect(
      caller.settings.setWhatsAppConfig({
        metaPhoneNumberId: "duplicate-id",
        metaWabaId: "456",
        metaAccessToken: "tok",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("skips uniqueness check when metaPhoneNumberId is null", async () => {
    mockTenantUpdate.mockResolvedValue({});

    const caller = await makeCaller(ownerSession);
    await caller.settings.setWhatsAppConfig({
      metaPhoneNumberId: null,
      metaWabaId: null,
      metaAccessToken: null,
    });

    expect(mockTenantFindFirst).not.toHaveBeenCalled();
    expect(mockTenantUpdate).toHaveBeenCalled();
  });
});

describe("settings router — getWhatsAppConfig (Meta)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ownerSession = {
    user: {
      id: "user-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "OWNER",
    },
  };

  async function makeCaller(session: any) {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: session as any,
    });
    return createCaller(ctx);
  }

  it("returns Meta fields with hasAccessToken=true when token exists", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123",
      metaWabaId: "456",
      metaAccessToken: "secret-token",
    });

    const caller = await makeCaller(ownerSession);
    const result = await caller.settings.getWhatsAppConfig();

    expect(result).toEqual({
      metaPhoneNumberId: "123",
      metaWabaId: "456",
      hasAccessToken: true,
    });
  });

  it("returns hasAccessToken=false when token is null", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123",
      metaWabaId: null,
      metaAccessToken: null,
    });

    const caller = await makeCaller(ownerSession);
    const result = await caller.settings.getWhatsAppConfig();

    expect(result.hasAccessToken).toBe(false);
  });

  it("never exposes the raw access token", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123",
      metaWabaId: "456",
      metaAccessToken: "super-secret",
    });

    const caller = await makeCaller(ownerSession);
    const result = await caller.settings.getWhatsAppConfig();

    expect(result).not.toHaveProperty("metaAccessToken");
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });
});
