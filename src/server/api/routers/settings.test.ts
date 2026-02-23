import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockTenantFindUnique = vi.hoisted(() => vi.fn());
const mockTenantFindFirst = vi.hoisted(() => vi.fn());
const mockTenantUpdate = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

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

  it("saves Meta fields for Owner when Meta API validates OK", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantUpdate.mockResolvedValue({});
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "123456" }] }),
    });

    const caller = await makeCaller(ownerSession);
    const result = await caller.settings.setWhatsAppConfig({
      metaPhoneNumberId: "123456",
      metaWabaId: "789",
      metaAccessToken: "EAAtoken",
    });

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("graph.facebook.com/v20.0/789/phone_numbers"),
    );
    expect(mockTenantUpdate).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      data: {
        metaPhoneNumberId: "123456",
        metaWabaId: "789",
        metaAccessToken: "EAAtoken",
      },
    });
  });

  it("rejects when WABA ID or token is invalid (Meta API returns non-OK)", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const caller = await makeCaller(ownerSession);
    await expect(
      caller.settings.setWhatsAppConfig({
        metaPhoneNumberId: "bad-phone-id",
        metaWabaId: "bad-waba",
        metaAccessToken: "invalid-token",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it("rejects when phone ID not found in WABA phone_numbers list", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "other-phone-id" }] }),
    });

    const caller = await makeCaller(ownerSession);
    await expect(
      caller.settings.setWhatsAppConfig({
        metaPhoneNumberId: "123456",
        metaWabaId: "789",
        metaAccessToken: "EAAtoken",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it("rejects when Meta API is unreachable with INTERNAL_SERVER_ERROR", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockFetch.mockRejectedValue(new Error("Network error"));

    const caller = await makeCaller(ownerSession);
    await expect(
      caller.settings.setWhatsAppConfig({
        metaPhoneNumberId: "123456",
        metaWabaId: "789",
        metaAccessToken: "EAAtoken",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it("valide le phoneId avec le token et wabaId stockés quand aucun n'est fourni", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantFindUnique.mockResolvedValue({ metaAccessToken: "stored-token", metaWabaId: "789" });
    mockTenantUpdate.mockResolvedValue({});
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "123456" }] }),
    });

    const caller = await makeCaller(ownerSession);
    await caller.settings.setWhatsAppConfig({
      metaPhoneNumberId: "123456",
      metaWabaId: null,
      metaAccessToken: null,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("graph.facebook.com/v20.0/789/phone_numbers"),
    );
    const updateCall = mockTenantUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(updateCall.data).not.toHaveProperty("metaAccessToken");
  });

  it("rejette un faux phoneId même sans nouveau token (utilise le token stocké)", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantFindUnique.mockResolvedValue({ metaAccessToken: "stored-token", metaWabaId: "789" });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "real-phone-id" }] }),
    });

    const caller = await makeCaller(ownerSession);
    await expect(
      caller.settings.setWhatsAppConfig({
        metaPhoneNumberId: "fake-phone-id",
        metaWabaId: null,
        metaAccessToken: null,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });

  it("skips Meta API validation when metaAccessToken is null AND aucun token stocké", async () => {
    mockTenantFindFirst.mockResolvedValue(null);
    mockTenantFindUnique.mockResolvedValue({ metaAccessToken: null, metaWabaId: null });
    mockTenantUpdate.mockResolvedValue({});

    const caller = await makeCaller(ownerSession);
    await caller.settings.setWhatsAppConfig({
      metaPhoneNumberId: "123456",
      metaWabaId: null,
      metaAccessToken: null,
    });

    expect(mockFetch).not.toHaveBeenCalled();
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

  it("skips uniqueness check and Meta API validation when metaPhoneNumberId is null", async () => {
    mockTenantUpdate.mockResolvedValue({});

    const caller = await makeCaller(ownerSession);
    await caller.settings.setWhatsAppConfig({
      metaPhoneNumberId: null,
      metaWabaId: null,
      metaAccessToken: null,
    });

    expect(mockTenantFindFirst).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
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

describe("settings router — testWhatsAppConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ownerSession = {
    user: { id: "user-1", email: "owner@example.com", tenantId: "tenant-1", role: "OWNER" },
  };
  const agentSession = {
    user: { id: "user-2", email: "agent@example.com", tenantId: "tenant-1", role: "AGENT" },
  };

  async function makeCaller(session: any) {
    const ctx = await createTRPCContext({ headers: new Headers(), session: session as any });
    return createCaller(ctx);
  }

  it("returns ok:true when phone ID found in WABA phone_numbers", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123",
      metaWabaId: "456",
      metaAccessToken: "valid-token",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "123" }] }),
    });

    const caller = await makeCaller(ownerSession);
    const result = await caller.settings.testWhatsAppConnection();

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("graph.facebook.com/v20.0/456/phone_numbers"),
    );
  });

  it("throws BAD_REQUEST when Meta API returns error", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123",
      metaWabaId: "456",
      metaAccessToken: "bad-token",
    });
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const caller = await makeCaller(ownerSession);
    await expect(caller.settings.testWhatsAppConnection()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws BAD_REQUEST when phone ID not found in WABA phone_numbers list", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123",
      metaWabaId: "456",
      metaAccessToken: "valid-token",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: "other-id" }] }),
    });

    const caller = await makeCaller(ownerSession);
    await expect(caller.settings.testWhatsAppConnection()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws BAD_REQUEST when config is incomplete (missing wabaId)", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123",
      metaWabaId: null,
      metaAccessToken: "valid-token",
    });

    const caller = await makeCaller(ownerSession);
    await expect(caller.settings.testWhatsAppConnection()).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws INTERNAL_SERVER_ERROR when Meta API is unreachable", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "123",
      metaWabaId: "456",
      metaAccessToken: "valid-token",
    });
    mockFetch.mockRejectedValue(new Error("Network error"));

    const caller = await makeCaller(ownerSession);
    await expect(caller.settings.testWhatsAppConnection()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("throws FORBIDDEN for AGENT role", async () => {
    const caller = await makeCaller(agentSession);
    await expect(caller.settings.testWhatsAppConnection()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
