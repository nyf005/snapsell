export const META_SDK_SCRIPT_ID = "snapsell-meta-sdk";
const META_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const META_GRAPH_VERSION = "v20.0";
const META_SDK_LOAD_TIMEOUT_MS = 10000;

type Dict = Record<string, unknown>;

export type MetaLoginResponse = {
  status?: string;
  code?: string;
  authResponse?: {
    code?: string;
    authorizationCode?: string;
  } | null;
} | null;

export type MetaSDK = {
  init: (params: Dict) => void;
  login: (callback: (response: MetaLoginResponse) => void, params: Dict) => void;
};

declare global {
  interface Window {
    FB?: MetaSDK;
    __snapsellMetaSdkPromise?: Promise<MetaSDK>;
    __snapsellMetaSdkInitAppId?: string;
  }
}

function hasInitForApp(appId: string): boolean {
  return window.__snapsellMetaSdkInitAppId === appId;
}

function initMetaSdk(appId: string): MetaSDK {
  const sdk = window.FB;
  if (!sdk) {
    throw new Error("SDK Meta indisponible.");
  }

  if (!hasInitForApp(appId)) {
    sdk.init({
      appId,
      xfbml: false,
      version: META_GRAPH_VERSION,
    });
    window.__snapsellMetaSdkInitAppId = appId;
  }

  return sdk;
}

function attachScript(): HTMLScriptElement {
  const existing = document.getElementById(META_SDK_SCRIPT_ID);
  if (existing instanceof HTMLScriptElement) {
    return existing;
  }

  const script = document.createElement("script");
  script.id = META_SDK_SCRIPT_ID;
  script.src = META_SDK_SRC;
  script.async = true;
  script.defer = true;
  script.crossOrigin = "anonymous";
  document.body.appendChild(script);
  return script;
}

export async function loadMetaEmbeddedSignupSdk(appId: string): Promise<MetaSDK> {
  const cleanAppId = appId.trim();
  if (!cleanAppId) {
    throw new Error("NEXT_PUBLIC_META_APP_ID est requis.");
  }
  if (typeof window === "undefined") {
    throw new Error("Le SDK Meta doit etre charge cote navigateur.");
  }
  if (window.FB) {
    return initMetaSdk(cleanAppId);
  }
  if (!window.__snapsellMetaSdkPromise) {
    window.__snapsellMetaSdkPromise = new Promise<MetaSDK>((resolve, reject) => {
      const script = attachScript();
      const timeoutId = window.setTimeout(() => {
        reject(new Error("Le chargement du SDK Meta a expire."));
      }, META_SDK_LOAD_TIMEOUT_MS);

      const handleLoad = () => {
        window.clearTimeout(timeoutId);
        try {
          resolve(initMetaSdk(cleanAppId));
        } catch (error) {
          reject(error);
        }
      };
      const handleError = () => {
        window.clearTimeout(timeoutId);
        reject(new Error("Impossible de charger le SDK Meta."));
      };
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
    }).catch((error) => {
      window.__snapsellMetaSdkPromise = undefined;
      throw error;
    });
  }
  const sdk = await window.__snapsellMetaSdkPromise;
  return initMetaSdk(cleanAppId);
}

export async function startMetaEmbeddedSignup(
  sdk: MetaSDK,
  configId: string,
): Promise<MetaLoginResponse> {
  const cleanConfigId = configId.trim();
  if (!cleanConfigId) {
    throw new Error("NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID est requis.");
  }

  return new Promise<MetaLoginResponse>((resolve, reject) => {
    try {
      sdk.login(
        (response) => resolve(response),
        {
          config_id: cleanConfigId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            feature: "whatsapp_embedded_signup",
            sessionInfoVersion: "3",
          },
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

export function extractOAuthCodeFromMetaLoginResponse(
  response: MetaLoginResponse,
): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  const directCode = typeof response.code === "string" ? response.code.trim() : "";
  if (directCode) {
    return directCode;
  }

  const authResponse = response.authResponse;
  if (!authResponse || typeof authResponse !== "object") {
    return null;
  }

  const authCode = typeof authResponse.code === "string" ? authResponse.code.trim() : "";
  if (authCode) {
    return authCode;
  }

  const authorizationCode =
    typeof authResponse.authorizationCode === "string"
      ? authResponse.authorizationCode.trim()
      : "";
  return authorizationCode || null;
}

export function getMetaEmbeddedSignupErrorMessage(
  response: MetaLoginResponse,
  fallback: string,
): string {
  if (!response || typeof response !== "object") {
    return fallback;
  }
  if (response.status === "not_authorized") {
    return "Connexion Meta annulee ou non autorisee.";
  }
  if (response.status === "unknown") {
    return "Popup fermee avant la fin du flow Meta.";
  }
  return fallback;
}
