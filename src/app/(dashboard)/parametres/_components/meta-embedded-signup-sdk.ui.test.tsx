import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  META_SDK_SCRIPT_ID,
  extractOAuthCodeFromMetaLoginResponse,
  loadMetaEmbeddedSignupSdk,
  startMetaEmbeddedSignup,
} from "./meta-embedded-signup-sdk";

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
