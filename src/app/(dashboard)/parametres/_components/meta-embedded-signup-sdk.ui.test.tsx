import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  META_SDK_SCRIPT_ID,
  extractOAuthCodeFromMetaLoginResponse,
  getInitializedMetaSdk,
  loadMetaEmbeddedSignupSdk,
  startMetaEmbeddedSignup,
} from "./meta-embedded-signup-sdk";

function setWindowFB(value: unknown) {
  Object.defineProperty(window, "FB", {
    configurable: true,
    writable: true,
    value,
  });
}

/**
 * ── LE SDK FACEBOOK REMPLACE `window.FB` À CHAQUE CHARGEMENT ────────────────
 *
 * L'initialisation n'était suivie que par un identifiant d'app rangé dans une
 * variable globale. Le raisonnement supposait qu'un `window.FB` initialisé le
 * reste — faux : un second chargement du script y installe un objet neuf,
 * vierge de toute configuration.
 *
 * Le drapeau disait alors « déjà initialisé pour cette app », `init()` était
 * sauté, et `login()` s'exécutait sur un SDK jamais configuré. Un tel SDK
 * n'ouvre rien, ne lève rien, ne rappelle jamais. Ce silence a rendu la panne
 * très difficile à cerner : aucune erreur, aucune violation CSP, aucune
 * fenêtre — et les sondes posées sur `window.FB` observaient un objet différent
 * de celui que l'application appelait réellement.
 */
/**
 * ── LA FENÊTRE N'EST DEMANDÉE QUE LÀ OÙ ELLE A DU SENS ─────────────────────
 *
 * Laissé à lui-même, le SDK bascule en `display=touch` — donc en pleine page —
 * dès qu'il croit voir un appareil tactile. Beaucoup d'ordinateurs portables
 * ont un écran tactile et se font classer ainsi, alors que la vendeuse y gagne
 * à garder son tableau de bord sous les yeux.
 *
 * L'inverse compte tout autant : sur téléphone, la pleine page de Meta est le
 * bon comportement, et forcer une fenêtre y serait une régression.
 */
describe("SDK Meta — choix de la fenêtre", () => {
  function stubPointerAndWidth(pointerFine: boolean, wide: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("pointer: fine") ? pointerFine : wide,
      media: query,
    }));
  }

  async function displayParamFor(pointerFine: boolean, wide: boolean) {
    stubPointerAndWidth(pointerFine, wide);
    const login = vi.fn(
      (cb: (r: { code: string }) => void, _p: Record<string, unknown>) => {
        cb({ code: "c" });
      },
    );
    await startMetaEmbeddedSignup({ init: vi.fn(), login }, "config-id");
    return (login.mock.calls[0]?.[1] as Record<string, unknown> | undefined)
      ?.display;
  }

  it("demande une fenêtre sur souris et grand écran", async () => {
    expect(await displayParamFor(true, true)).toBe("popup");
  });

  it("laisse Meta décider sur écran tactile étroit", async () => {
    expect(await displayParamFor(false, false)).toBeUndefined();
  });

  it("laisse Meta décider sur grand écran tactile sans souris", async () => {
    expect(await displayParamFor(false, true)).toBeUndefined();
  });

  it("laisse Meta décider quand matchMedia est absent", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const login = vi.fn(
      (cb: (r: { code: string }) => void, _p: Record<string, unknown>) => {
        cb({ code: "c" });
      },
    );
    await startMetaEmbeddedSignup({ init: vi.fn(), login }, "config-id");
    expect(
      (login.mock.calls[0]?.[1] as Record<string, unknown> | undefined)?.display,
    ).toBeUndefined();
  });
});

describe("SDK Meta — remplacement de window.FB", () => {
  beforeEach(() => {
    // L'initialisation est mémorisée sur `window` : sans remise à zéro, un cas
    // hériterait de l'état du précédent.
    window.__snapsellMetaSdkInitAppId = undefined;
    window.__snapsellMetaSdkInitialized = undefined;
  });

  it("réinitialise le nouvel objet SDK", () => {
    const premier = { init: vi.fn(), login: vi.fn() };
    setWindowFB(premier);
    expect(getInitializedMetaSdk("app-id")).toBe(premier);
    expect(premier.init).toHaveBeenCalledTimes(1);

    // Le SDK recharge et installe un objet neuf, vierge.
    const second = { init: vi.fn(), login: vi.fn() };
    setWindowFB(second);

    expect(getInitializedMetaSdk("app-id")).toBe(second);
    expect(second.init).toHaveBeenCalledTimes(1);
  });

  it("n'initialise pas deux fois le même objet", () => {
    const sdk = { init: vi.fn(), login: vi.fn() };
    setWindowFB(sdk);

    getInitializedMetaSdk("app-id");
    getInitializedMetaSdk("app-id");

    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("rend le SDK vivant, jamais une référence capturée plus tôt", () => {
    const ancien = { init: vi.fn(), login: vi.fn() };
    setWindowFB(ancien);
    getInitializedMetaSdk("app-id");

    const nouveau = { init: vi.fn(), login: vi.fn() };
    setWindowFB(nouveau);

    expect(getInitializedMetaSdk("app-id")).not.toBe(ancien);
  });

  it("rend null tant que le script n'est pas chargé", () => {
    setWindowFB(undefined);
    expect(getInitializedMetaSdk("app-id")).toBeNull();
  });
});

describe("meta-embedded-signup-sdk", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("loads script once and initializes sdk once per appId", async () => {
    const init = vi.fn();
    Object.defineProperty(window, "FB", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const first = loadMetaEmbeddedSignupSdk("app-id");
    const script = document.getElementById(META_SDK_SCRIPT_ID);
    expect(script).toBeInstanceOf(HTMLScriptElement);
    Object.defineProperty(window, "FB", {
      configurable: true,
      writable: true,
      value: { init, login: vi.fn() },
    });
    script?.dispatchEvent(new Event("load"));
    await first;

    const second = await loadMetaEmbeddedSignupSdk("app-id");
    expect(second).toBe(window.FB);
    expect(init).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(`#${META_SDK_SCRIPT_ID}`)).toHaveLength(1);
  });

  it("extracts OAuth code from authResponse", () => {
    const code = extractOAuthCodeFromMetaLoginResponse({
      status: "connected",
      authResponse: { code: "oauth-code-xyz" },
    });
    expect(code).toBe("oauth-code-xyz");
  });

  /**
   * ── LES PARAMÈTRES SUIVENT LE CONTRAT DE META ──────────────────────────────
   *
   * Ce test figeait `extras.feature: "whatsapp_embedded_signup"`. Cette clé
   * n'existe pas dans la documentation de Meta — la clé attendue est
   * `featureType`, une chaîne vide demandant le parcours complet. Le test
   * verrouillait donc une valeur inventée, et l'aurait défendue contre sa propre
   * correction.
   *
   * Meta valide `extras` avant d'ouvrir sa fenêtre : une clé inconnue suffisait
   * à ce qu'aucune fenêtre ne s'ouvre, sans erreur ni rappel — SDK chargé,
   * popup autorisée par le navigateur, et pourtant rien.
   *
   * `sessionInfoVersion` reste exigé : c'est lui qui fait remonter `waba_id` et
   * `phone_number_id`, que `connectWhatsAppEmbedded` consomme.
   */
  it("passe à Meta les paramètres qu'il documente", async () => {
    const login = vi.fn(
      (
        callback: (response: { code: string }) => void,
        // Déclaré pour que l'assertion ci-dessous puisse relire les paramètres.
        _params: Record<string, unknown>,
      ) => {
        callback({ code: "oauth-code-xyz" });
      },
    );
    const sdk = { init: vi.fn(), login };

    await startMetaEmbeddedSignup(sdk, "config-id");

    expect(login).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        config_id: "config-id",
        response_type: "code",
        override_default_response_type: true,
        extras: expect.objectContaining({
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
        }),
      }),
    );

    // La clé inventée ne doit pas revenir par inadvertance.
    expect(login.mock.calls[0]?.[1]?.extras).not.toHaveProperty("feature");
  });
});
