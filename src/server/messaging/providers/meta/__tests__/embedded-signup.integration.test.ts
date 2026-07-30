import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

// Chaque test enchaîne des allers-retours vers une base distante ; le défaut
// de 5 s de Vitest est calibré pour des tests en mémoire.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" &&
  !!process.env.DATABASE_URL &&
  !!process.env.META_APP_ID &&
  !!process.env.META_APP_SECRET;

describe.skipIf(!shouldRun)("embedded-signup.integration", () => {
  const ownerSession = {
    user: {
      id: "user-owner-1",
      email: "owner@example.com",
      tenantId: "tenant-1",
      role: "OWNER",
    },
  };
  let testTenantId = "";

  async function makeCaller(session: typeof ownerSession) {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: session as any,
    });
    return createCaller(ctx);
  }

  function mockMetaExchangeSuccess() {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "short-lived-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "long-lived-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "biz-123" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "sys-user-123", name: "SnapSell Embedded Signup" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "system-user-token",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              is_valid: true,
              scopes: [
                "business_management",
                "whatsapp_business_management",
                "whatsapp_business_messaging",
              ],
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "waba-123",
                phone_numbers: [{ id: "phone-123", display_phone_number: "33612345678" }],
              },
            ],
          }),
      });
  }

  beforeAll(async () => {
    const tenant = await db.tenant.create({
      data: {
        name: `Integration Meta Signup ${Date.now()}`,
        metaPhoneNumberId: null,
        metaWabaId: null,
        metaAccessToken: null,
      },
    });
    testTenantId = tenant.id;
    ownerSession.user.tenantId = tenant.id;
  });

  afterAll(async () => {
    if (!testTenantId) return;
    await db.sellerPhone.deleteMany({ where: { tenantId: testTenantId } });
    await db.messageOut.deleteMany({ where: { tenantId: testTenantId } });
    await db.messageIn.deleteMany({ where: { tenantId: testTenantId } });
    await db.deadLetterJob.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    if (!testTenantId) return;
    await db.sellerPhone.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.update({
      where: { id: testTenantId },
      data: {
        metaPhoneNumberId: null,
        metaWabaId: null,
        metaAccessToken: null,
      },
    });
  });

  it("valide le flow E2E backend: code OAuth -> echange -> stockage tenant -> hasAccessToken=true", async () => {
    mockMetaExchangeSuccess();
    const caller = await makeCaller(ownerSession);

    // Simulation popup frontend: on ne teste pas le navigateur ici, seulement la remise du code OAuth au backend.
    await caller.settings.connectWhatsAppEmbedded({ code: "oauth-code-from-popup" });
    const config = await caller.settings.getWhatsAppConfig();

    expect(config).toEqual({
      // `metaBusinessPhoneNumber` a été ajouté après l'écriture de ce test.
      // Assertion exacte assumée : ce que rend cette procédure part vers
      // l'écran de configuration, on veut être prévenu si le contenu change.
      metaBusinessPhoneNumber: "+33612345678",
      metaPhoneNumberId: "phone-123",
      metaWabaId: "waba-123",
      hasAccessToken: true,
    });
    const tenantAfter = await db.tenant.findUnique({
      where: { id: testTenantId },
      select: { metaPhoneNumberId: true, metaWabaId: true, metaAccessToken: true },
    });
    expect(tenantAfter).toMatchObject({
      metaPhoneNumberId: "phone-123",
      metaWabaId: "waba-123",
    });

    // Le test attendait le jeton en clair. Il est désormais chiffré (AES-256-GCM,
    // cf. `src/lib/crypto.ts`) — c'est la bonne façon de le stocker : ce jeton
    // permet d'envoyer des messages au nom de la boutique et de lire son
    // catalogue. On vérifie donc l'inverse de ce qui était écrit : qu'il
    // n'apparaisse jamais en clair en base.
    expect(tenantAfter!.metaAccessToken).not.toBe("system-user-token");
    expect(tenantAfter!.metaAccessToken).not.toContain("system-user-token");
    expect(tenantAfter!.metaAccessToken).toMatch(/^enc:/);
    const sellerPhone = await db.sellerPhone.findUnique({
      where: {
        tenantId_phoneNumber: {
          tenantId: testTenantId,
          phoneNumber: "+33612345678",
        },
      },
    });
    expect(sellerPhone).toBeTruthy();
    const sellerPhones = await caller.sellerPhones.list();
    expect(sellerPhones.some((sp) => sp.phoneNumber === "+33612345678")).toBe(true);
  });

  it("retourne BAD_REQUEST si le code/token est expire", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: {
            message: "Invalid verification code format.",
            type: "OAuthException",
            code: 100,
          },
        }),
    });

    const caller = await makeCaller(ownerSession);
    await expect(
      caller.settings.connectWhatsAppEmbedded({ code: "expired-oauth-code" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("retourne BAD_REQUEST si les permissions/scopes sont insuffisants", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "short-lived-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "long-lived-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "biz-123" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "sys-user-123", name: "SnapSell Embedded Signup" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "system-user-token",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              is_valid: true,
              scopes: ["public_profile"],
            },
          }),
      });

    const caller = await makeCaller(ownerSession);
    await expect(
      caller.settings.connectWhatsAppEmbedded({ code: "oauth-code-no-scopes" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("retourne BAD_REQUEST si aucun WABA/numero utilisable n'est resolu (sandbox suspendu/inexploitable)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "short-lived-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "long-lived-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "biz-123" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: "sys-user-123", name: "SnapSell Embedded Signup" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "system-user-token",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              is_valid: true,
              scopes: [
                "business_management",
                "whatsapp_business_management",
                "whatsapp_business_messaging",
              ],
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
          }),
      });

    const caller = await makeCaller(ownerSession);
    await expect(
      caller.settings.connectWhatsAppEmbedded({ code: "oauth-code-waba-suspended" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
