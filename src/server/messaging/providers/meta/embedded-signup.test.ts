import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MetaEmbeddedSignupError,
  resolveMetaEmbeddedSignupCredentials,
  startCoexistenceSync,
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
  subscribedApps?: () => Response;
  platform?: () => Response;
  smbAppData?: (url: string) => Response;
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
    if (url.includes("/subscribed_apps")) {
      return Promise.resolve(
        handlers.subscribedApps?.() ?? jsonResponse({ success: true }),
      );
    }
    if (url.includes("/smb_app_data")) {
      return Promise.resolve(
        handlers.smbAppData?.(url) ?? jsonResponse({ request_id: "req-1" }),
      );
    }
    if (url.includes("is_on_biz_app")) {
      return Promise.resolve(
        handlers.platform?.() ??
          jsonResponse({ is_on_biz_app: false, platform_type: "CLOUD_API" }),
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
      coexistence: false,
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

  it("abonne la WABA aux notifications avant de rendre la main", async () => {
    routeFetch({});

    await connect({ wabaId: "waba-1", phoneNumberId: "phone-1" });

    const subscribeCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes("/subscribed_apps"),
    );
    expect(subscribeCall).toBeDefined();
    expect(String(subscribeCall![0])).toContain("waba-1/subscribed_apps");
    expect((subscribeCall![1] as RequestInit).method).toBe("POST");
  });

  /**
   * Sans abonnement, la boutique n'aurait jamais recu un message de sa
   * clientele tout en s'affichant « Connectee ». On echoue donc franchement
   * plutot que de laisser enregistrer des identifiants trompeurs.
   */
  it("echoue si Meta refuse l'abonnement aux notifications", async () => {
    routeFetch({
      subscribedApps: () => jsonResponse({ success: false }),
    });

    await expect(connect({ wabaId: "waba-1" })).rejects.toThrow(/abonnement/i);
  });

  it("echoue si l'abonnement renvoie une erreur HTTP", async () => {
    routeFetch({
      subscribedApps: () => jsonResponse({ error: { message: "nope" } }, false, 400),
    });

    await expect(connect({ wabaId: "waba-1" })).rejects.toBeInstanceOf(
      MetaEmbeddedSignupError,
    );
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

/**
 * ── LA FENÊTRE DE 24 H NE SE RATTRAPE PAS ──────────────────────────────────
 *
 * Meta n'accorde que 24 h après l'intégration pour demander la synchronisation.
 * Passé ce délai, historique et contacts sont perdus sans reprise — soit
 * exactement ce que la Coexistence promet de conserver. La demande part donc
 * dans la foulée de la connexion, jamais depuis un réglage.
 */
describe("Coexistence — détection", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const coexistingPlatform = () =>
    jsonResponse({ is_on_biz_app: true, platform_type: "CLOUD_API" });

  it("constate la Coexistence chez Meta, pas d'apres le mode demande", async () => {
    routeFetch({ platform: coexistingPlatform });

    const result = await connect({ wabaId: "waba-1" });

    expect(result.coexistence).toBe(true);
  });

  it("ne lance aucune synchronisation pendant la resolution des identifiants", async () => {
    routeFetch({ platform: coexistingPlatform });

    await connect({ wabaId: "waba-1" });

    /*
      La synchronisation partait d'ici, avant que le routeur n'ait ecrit le
      numero en base : un webhook Meta arrivant tot ne resolvait alors aucune
      boutique et l'evenement etait jete.
    */
    expect(calledUrls().some((url) => url.includes("/smb_app_data"))).toBe(false);
  });

  /**
   * ── « JE NE SAIS PAS » N'EST PAS « NON » ────────────────────────────────
   *
   * Renvoyer `false` sur erreur passait pour prudent. Ça ne l'était pas : un
   * délai réseau suffisait à classer la boutique hors Coexistence, donc à ne
   * lancer aucune synchronisation, donc à laisser l'historique disparaître.
   */
  it("rend l'incertitude plutot que de conclure « pas de Coexistence »", async () => {
    routeFetch({
      platform: () => jsonResponse({ error: { message: "timeout" } }, false, 503),
    });

    const result = await connect({ wabaId: "waba-1" });

    expect(result.coexistence).toBeNull();
  });

  it("reessaie une fois avant de rendre l'incertitude", async () => {
    routeFetch({
      platform: () => jsonResponse({ error: { message: "timeout" } }, false, 503),
    });

    await connect({ wabaId: "waba-1" });

    const platformCalls = calledUrls().filter((url) => url.includes("is_on_biz_app"));
    expect(platformCalls).toHaveLength(2);
  });
});

describe("startCoexistenceSync", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  function routeSync(handler?: (url: string, init?: RequestInit) => Response) {
    mockFetch.mockImplementation((url: string, init?: RequestInit) =>
      Promise.resolve(handler?.(url, init) ?? jsonResponse({ request_id: "req-1" })),
    );
  }

  const run = () =>
    startCoexistenceSync({ phoneNumberId: "phone-1", accessToken: "business-token" });

  /**
   * Le jeton manquait sur ces deux appels — et nulle part ailleurs, les autres
   * le passant en paramètre d'URL ou dans un corps encodé. Meta aurait refusé
   * chaque demande, et la fenêtre de 24 h se serait écoulée sans reprise.
   */
  it("authentifie les demandes de synchronisation", async () => {
    routeSync();

    await run();

    const syncCalls = mockFetch.mock.calls.filter((call) =>
      String(call[0]).includes("/smb_app_data"),
    );
    expect(syncCalls).toHaveLength(2);
    for (const call of syncCalls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer business-token");
    }
  });

  it("demande les contacts puis l'historique", async () => {
    const syncTypes: string[] = [];
    routeSync((url, init) => {
      if (url.includes("/smb_app_data")) {
        syncTypes.push(JSON.parse(String(init?.body)).sync_type);
      }
      return jsonResponse({ request_id: "req-1" });
    });

    await run();

    expect(syncTypes).toEqual(["smb_app_state_sync", "history"]);
  });

  /**
   * Refuser de partager son historique est un choix offert par Meta pendant le
   * parcours. Le traiter comme une panne ferait chercher un défaut inexistant.
   */
  it("distingue un refus de partage d'une panne", async () => {
    routeSync((url, init) => {
      const isHistory =
        url.includes("/smb_app_data") &&
        JSON.parse(String(init?.body)).sync_type === "history";
      return isHistory
        ? jsonResponse({ error: { message: "declined", code: 2593109 } }, false, 400)
        : jsonResponse({ request_id: "req-1" });
    });

    await expect(run()).resolves.toMatchObject({ history: "declined" });
  });

  it("signale un echec sans lever", async () => {
    routeSync(() => jsonResponse({ error: { message: "boom", code: 500 } }, false, 503));

    await expect(run()).resolves.toMatchObject({ history: "failed" });
  });

  /**
   * L'échec des contacts était avalé : si l'historique partait ensuite, le
   * statut devenait « demandé » et rien n'indiquait que les noms manquaient —
   * ni état, ni bouton pour les rattraper, alors que la fenêtre vaut aussi
   * pour eux.
   */
  it("suit les contacts separement de l'historique", async () => {
    routeSync((url, init) => {
      const syncType = url.includes("/smb_app_data")
        ? JSON.parse(String(init?.body)).sync_type
        : null;
      return syncType === "smb_app_state_sync"
        ? jsonResponse({ error: { message: "boom" } }, false, 503)
        : jsonResponse({ request_id: "req-1" });
    });

    /*
      Deux etats distincts : l'historique est parti, les contacts non. Un statut
      unique aurait ete ecrase par la premiere tranche d'historique, et les
      contacts manquants auraient disparu de l'ecran.
    */
    await expect(run()).resolves.toEqual({ history: "requested", contacts: "failed" });
  });

  it("demande quand meme l'historique si les contacts echouent", async () => {
    const syncTypes: string[] = [];
    routeSync((url, init) => {
      if (!url.includes("/smb_app_data")) return jsonResponse({});
      const syncType = JSON.parse(String(init?.body)).sync_type;
      syncTypes.push(syncType);
      return syncType === "smb_app_state_sync"
        ? jsonResponse({ error: { message: "boom" } }, false, 503)
        : jsonResponse({ request_id: "req-1" });
    });

    await run();

    expect(syncTypes).toContain("history");
  });
});
