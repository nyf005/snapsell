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

  it("uses config_id only for embedded signup", async () => {
    const login = vi.fn((callback: (response: { code: string }) => void) => {
      callback({ code: "oauth-code-xyz" });
    });
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
          feature: "whatsapp_embedded_signup",
          sessionInfoVersion: "3",
        }),
      }),
    );
  });
});
