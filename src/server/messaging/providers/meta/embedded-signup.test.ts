import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MetaEmbeddedSignupError,
  resolveMetaEmbeddedSignupCredentials,
} from "./embedded-signup";

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

const APP_ID = "app-id";
const APP_SECRET = "app-secret";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * `usedOAuthCodes` vit au niveau du module et rejette un code déjà vu. Chaque
 * test doit donc apporter le sien, sous peine de se faire refuser par le
 * garde-fou anti-rejeu plutôt que par ce qu'il cherche à vérifier.
 */
let codeCounter = 0;
function freshCode(): string {
  codeCounter += 1;
  return `oauth-code-${codeCounter}`;
}

type Handlers = {
  exchange?: () => Response;
  debugToken?: () => Response;
  phoneNumbers?: () => Response;
};

/**
 * Route par URL plutôt que par ordre d'appel : un test qui vérifie qu'un
 * endpoint n'est *jamais* appelé ne doit pas dépendre du rang de cet appel.
 */
function routeFetch(handlers: Handlers) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/oauth/access_token")) {
      return Promise.resolve(
        handlers.exchange?.() ?? jsonResponse({ access_token: "business-token" }),
      );
    }
    if (url.includes("/debug_token")) {
      return Promise.resolve(
        handlers.debugToken?.() ??
          jsonResponse({
            data: {
              is_valid: true,
              scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["waba-1"] },
                { scope: "whatsapp_business_messaging", target_ids: ["waba-1"] },
              ],
            },
          }),
      );
    }
    if (url.includes("/phone_numbers")) {
      return Promise.resolve(
        handlers.phoneNumbers?.() ??
          jsonResponse({
            data: [{ id: "phone-1", display_phone_number: "+225 07 01 02 03 04" }],
          }),
      );
    }
    throw new Error(`Appel Meta inattendu: ${url}`);
  });
}

function calledUrls(): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]));
}

function connect(overrides: Partial<Parameters<typeof resolveMetaEmbeddedSignupCredentials>[0]> = {}) {
  return resolveMetaEmbeddedSignupCredentials({
    tenantId: "tenant-1",
    code: freshCode(),
    appId: APP_ID,
    appSecret: APP_SECRET,
    ...overrides,
  });
}

describe("resolveMetaEmbeddedSignupCredentials", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("utilise directement le token de l'echange, sans le transformer", async () => {
    routeFetch({});

    const result = await connect({ wabaId: "waba-1", phoneNumberId: "phone-1" });

    expect(result).toEqual({
      accessToken: "business-token",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      businessPhoneNumber: "+225 07 01 02 03 04",
    });
  });

  /**
   * Le cœur du correctif. Ces trois appels formaient le détour qui exigeait
   * `business_management` — permission jamais accordee a l'app SnapSell — et
   * rendait donc la connexion impossible pour toute vendeuse exterieure.
   */
  it("n'appelle ni me/businesses, ni system_users, ni fb_exchange_token", async () => {
    routeFetch({});

    await connect({ wabaId: "waba-1", phoneNumberId: "phone-1" });

    const urls = calledUrls().join("\n");
    expect(urls).not.toContain("me/businesses");
    expect(urls).not.toContain("system_users");
    expect(urls).not.toContain("fb_exchange_token");
    expect(urls).not.toContain("me/whatsapp_business_accounts");
  });

  it("n'exige plus business_management dans les scopes", async () => {
    routeFetch({
      debugToken: () =>
        jsonResponse({
          data: {
            is_valid: true,
            // Exactement les deux permissions accordees a l'app, sans plus.
            scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
            granular_scopes: [
              { scope: "whatsapp_business_management", target_ids: ["waba-1"] },
              { scope: "whatsapp_business_messaging", target_ids: ["waba-1"] },
            ],
          },
        }),
    });

    await expect(connect({ wabaId: "waba-1" })).resolves.toMatchObject({
      wabaId: "waba-1",
    });
  });

  it("refuse un token auquel il manque une permission WhatsApp", async () => {
    routeFetch({
      debugToken: () =>
        jsonResponse({
          data: {
            is_valid: true,
            scopes: ["whatsapp_business_management"],
            granular_scopes: [
              { scope: "whatsapp_business_management", target_ids: ["waba-1"] },
            ],
          },
        }),
    });

    await expect(connect({ wabaId: "waba-1" })).rejects.toThrow(
      /whatsapp_business_messaging/,
    );
  });

  it("refuse un token invalide", async () => {
    routeFetch({
      debugToken: () => jsonResponse({ data: { is_valid: false } }),
    });

    await expect(connect({ wabaId: "waba-1" })).rejects.toBeInstanceOf(
      MetaEmbeddedSignupError,
    );
  });

  /**
   * Le `waba_id` vient du message de la fenetre Meta, donc du navigateur. Le
   * token, lui, vient de Meta. Quand les deux se contredisent, c'est le token
   * qui fait foi.
   */
  it("refuse une WABA que le token n'autorise pas", async () => {
    routeFetch({});

    await expect(connect({ wabaId: "waba-etrangere" })).rejects.toThrow(
      /n'est pas autorise/,
    );
  });

  it("deduit la WABA quand la fenetre Meta n'en renvoie qu'une seule autorisee", async () => {
    routeFetch({});

    const result = await connect();

    expect(result.wabaId).toBe("waba-1");
  });

  it("refuse de choisir quand plusieurs WABA sont autorisees", async () => {
    routeFetch({
      debugToken: () =>
        jsonResponse({
          data: {
            is_valid: true,
            scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
            granular_scopes: [
              { scope: "whatsapp_business_management", target_ids: ["waba-1", "waba-2"] },
              { scope: "whatsapp_business_messaging", target_ids: ["waba-1", "waba-2"] },
            ],
          },
        }),
    });

    await expect(connect()).rejects.toThrow(/Plusieurs comptes/);
  });

  it("ne retient qu'une WABA autorisee pour les deux permissions a la fois", async () => {
    routeFetch({
      debugToken: () =>
        jsonResponse({
          data: {
            is_valid: true,
            scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
            granular_scopes: [
              { scope: "whatsapp_business_management", target_ids: ["waba-1", "waba-2"] },
              // waba-2 n'est partagee que pour la gestion : inutilisable pour envoyer.
              { scope: "whatsapp_business_messaging", target_ids: ["waba-1"] },
            ],
          },
        }),
    });

    const result = await connect();

    expect(result.wabaId).toBe("waba-1");
  });

  /**
   * Meta peut ne pas renvoyer le `phone_number_id` dans le message de fin. La
   * resolution par la WABA est donc le repli, et non un simple confort.
   */
  it("retrouve le numero via la WABA quand la fenetre Meta ne le donne pas", async () => {
    routeFetch({});

    const result = await connect({ wabaId: "waba-1" });

    expect(result.phoneNumberId).toBe("phone-1");
    expect(calledUrls().some((url) => url.includes("waba-1/phone_numbers"))).toBe(true);
  });

  it("refuse un numero qui n'appartient pas a la WABA autorisee", async () => {
    routeFetch({});

    await expect(
      connect({ wabaId: "waba-1", phoneNumberId: "phone-etranger" }),
    ).rejects.toThrow(/n'appartient pas/);
  });

  it("refuse de choisir quand la WABA porte plusieurs numeros", async () => {
    routeFetch({
      phoneNumbers: () =>
        jsonResponse({
          data: [
            { id: "phone-1", display_phone_number: "+225 07 01 02 03 04" },
            { id: "phone-2", display_phone_number: "+225 07 09 08 07 06" },
          ],
        }),
    });

    await expect(connect({ wabaId: "waba-1" })).rejects.toThrow(/Plusieurs numeros/);
  });

  it("signale un code OAuth expire comme une erreur de requete", async () => {
    routeFetch({
      exchange: () => jsonResponse({ error: { message: "expired" } }, false, 400),
    });

    await expect(connect({ wabaId: "waba-1" })).rejects.toMatchObject({
      kind: "BAD_REQUEST",
    });
  });

  it("signale une panne Meta comme une erreur amont", async () => {
    routeFetch({
      exchange: () => jsonResponse({ error: { message: "boom" } }, false, 503),
    });

    await expect(connect({ wabaId: "waba-1" })).rejects.toMatchObject({
      kind: "UPSTREAM_ERROR",
    });
  });

  it("rejette un code deja utilise par le meme tenant", async () => {
    routeFetch({});
    const code = freshCode();

    await resolveMetaEmbeddedSignupCredentials({
      tenantId: "tenant-1",
      code,
      appId: APP_ID,
      appSecret: APP_SECRET,
      wabaId: "waba-1",
    });

    await expect(
      resolveMetaEmbeddedSignupCredentials({
        tenantId: "tenant-1",
        code,
        appId: APP_ID,
        appSecret: APP_SECRET,
        wabaId: "waba-1",
      }),
    ).rejects.toThrow(/deja ete utilise/);
  });

  it("signale une configuration serveur incomplete", async () => {
    routeFetch({});

    await expect(connect({ appSecret: "" })).rejects.toMatchObject({
      kind: "CONFIG_ERROR",
    });
  });
});
