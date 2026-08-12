export const META_SDK_SCRIPT_ID = "snapsell-meta-sdk";
const META_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const META_GRAPH_VERSION = "v21.0";
const META_SDK_LOAD_TIMEOUT_MS = 10000;
const META_EMBEDDED_SIGNUP_MESSAGE_WAIT_MS = 250;
/**
 * Au-delà, on considère que Meta ne répondra pas. Large à dessein : créer un
 * compte WhatsApp Business et vérifier un numéro prend plusieurs minutes.
 */
const META_EMBEDDED_SIGNUP_ABANDON_MS = 10 * 60 * 1000;

type Dict = Record<string, unknown>;

export type MetaLoginResponse = {
  status?: string;
  code?: string;
  authResponse?: {
    code?: string;
    authorizationCode?: string;
  } | null;
  embeddedSignupEvent?: MetaEmbeddedSignupEvent;
} | null;

export type MetaEmbeddedSignupEvent = {
  type: "WA_EMBEDDED_SIGNUP";
  event?: string;
  data?: {
    phone_number_id?: string;
    waba_id?: string;
    current_step?: string;
  };
};

export type MetaSDK = {
  init: (params: Dict) => void;
  login: (callback: (response: MetaLoginResponse) => void, params: Dict) => void;
};

declare global {
  interface Window {
    FB?: MetaSDK;
    __snapsellMetaSdkPromise?: Promise<MetaSDK>;
    __snapsellMetaSdkInitAppId?: string;
    /** L'objet SDK exact qui a reçu `init()` — voir `initMetaSdk`. */
    __snapsellMetaSdkInitialized?: MetaSDK;
  }
}

/**
 * ── L'INITIALISATION SE SUIT PAR OBJET, PAS PAR DRAPEAU GLOBAL ───────────────
 *
 * Ce garde ne comparait que l'identifiant d'app, mémorisé dans une variable
 * globale. Il supposait donc qu'un `window.FB` initialisé le reste — ce qui est
 * faux : le SDK Facebook **réassigne `window.FB`** à chaque chargement de son
 * script, et le nouvel objet arrive vierge.
 *
 * Après un second chargement, le drapeau disait encore « déjà initialisé pour
 * cette app », `init()` était donc sauté, et l'on appelait `login()` sur un SDK
 * qui n'avait jamais été configuré. Un SDK non initialisé n'ouvre rien,
 * ne lève rien et ne rappelle jamais — silence total, exactement le symptôme
 * qui a rendu ce défaut si long à cerner.
 *
 * On mémorise donc **l'objet lui-même**. Si `window.FB` change, la comparaison
 * échoue et l'initialisation est refaite, ce qui est le comportement correct.
 * ────────────────────────────────────────────────────────────────────────────
 */
function hasInitForApp(appId: string, sdk: MetaSDK): boolean {
  return (
    window.__snapsellMetaSdkInitAppId === appId &&
    window.__snapsellMetaSdkInitialized === sdk
  );
}

function initMetaSdk(appId: string): MetaSDK {
  const sdk = window.FB;
  if (!sdk) {
    throw new Error("SDK Meta indisponible.");
  }

  if (!hasInitForApp(appId, sdk)) {
    sdk.init({
      appId,
      autoLogAppEvents: true,
      cookie: true,
      xfbml: true,
      version: META_GRAPH_VERSION,
    });
    window.__snapsellMetaSdkInitAppId = appId;
    window.__snapsellMetaSdkInitialized = sdk;
  }

  return sdk;
}

/**
 * Le SDK vivant, initialisé, ou `null` s'il n'est pas encore chargé.
 *
 * Synchrone à dessein : appelée depuis un gestionnaire de clic, elle ne doit
 * introduire aucune attente, sous peine de faire perdre l'activation
 * utilisateur et donc l'ouverture de la fenêtre Meta.
 *
 * C'est le seul point d'entrée correct pour obtenir le SDK au moment de s'en
 * servir : il relit `window.FB` et garantit que **cet** objet-là est initialisé.
 */
export function getInitializedMetaSdk(appId: string): MetaSDK | null {
  if (typeof window === "undefined" || !window.FB) return null;
  return initMetaSdk(appId.trim());
}

/**
 * Toujours une balise neuve, jamais celle d'une tentative précédente.
 *
 * Cette fonction renvoyait la balise existante si elle en trouvait une. Or on
 * n'arrive ici que lorsqu'il n'y a ni `window.FB` ni chargement en cours —
 * c'est-à-dire après un échec. Réutiliser cette balise-là condamnait la
 * nouvelle tentative : ses événements `load` et `error` ont déjà été émis et ne
 * le seront pas une seconde fois, donc plus rien ne se déclenchait et l'attente
 * courait jusqu'au délai d'expiration. Chaque essai suivant échouait de la même
 * façon, définitivement.
 *
 * Le défaut existait avant le préchargement, mais celui-ci le rend bien plus
 * atteignable : il y a désormais deux tentatives (montage puis clic) là où il
 * n'y en avait qu'une.
 */
function attachScript(): HTMLScriptElement {
  const stale = document.getElementById(META_SDK_SCRIPT_ID);
  if (stale) {
    stale.remove();
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
  // Attend le chargement du script Meta avant d'initialiser le SDK.
  await window.__snapsellMetaSdkPromise;
  return initMetaSdk(cleanAppId);
}

/**
 * ── À APPELER SYNCHRONEMENT DEPUIS LE GESTIONNAIRE DE CLIC ──────────────────
 *
 * `FB.login()` ouvre une popup, et un navigateur n'autorise une popup que
 * pendant l'« activation utilisateur transitoire » — la fenêtre qui suit
 * immédiatement un geste, dans la même tâche. Si un `await` s'intercale entre le
 * clic et cet appel, l'activation est perdue : `window.open` est refusé et le
 * SDK Meta bascule silencieusement sur une **redirection pleine page**.
 *
 * C'est exactement ce qui arrivait : l'appelant faisait
 * `await loadMetaEmbeddedSignupSdk(...)` juste avant, donc au premier clic
 * l'attente couvrait le téléchargement du script Meta. Le SDK se charge
 * désormais au montage de la page, et `sdk` arrive ici déjà prêt.
 *
 * Cette fonction est `async` mais son corps s'exécute **synchroniquement**
 * jusqu'à `sdk.login()` : le corps d'une fonction `async` court jusqu'au premier
 * `await`, et l'exécuteur d'une `Promise` est synchrone. L'appeler sans `await`
 * préalable suffit donc — ne pas insérer d'attente avant elle.
 * ────────────────────────────────────────────────────────────────────────────
 */
/**
 * ── QUAND DEMANDER UNE FENÊTRE PLUTÔT QU'UNE PAGE ENTIÈRE ──────────────────
 *
 * Laissé à lui-même, le SDK choisit `display=touch` dès qu'il croit voir un
 * appareil tactile — et bascule alors en pleine page, faisant quitter SnapSell.
 * Beaucoup d'ordinateurs portables ont un écran tactile et se font classer
 * ainsi, alors qu'une fenêtre par-dessus y est très préférable : la vendeuse
 * garde son tableau de bord sous les yeux et y revient sans navigation.
 *
 * On ne force donc la fenêtre que là où elle a du sens : un pointeur fin
 * (souris ou pavé tactile) **et** une largeur d'écran suffisante. Sur un
 * téléphone — pointeur grossier, écran étroit — on laisse Meta faire, et sa
 * pleine page est le bon choix : une popup y serait à l'étroit et
 * difficilement refermable.
 *
 * En cas de doute — `matchMedia` absent, contexte non navigateur — on ne force
 * rien. Le comportement par défaut de Meta fonctionne ; c'est le repli sûr.
 * ────────────────────────────────────────────────────────────────────────────
 */
function prefersPopupDisplay(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return (
      window.matchMedia("(pointer: fine)").matches &&
      window.matchMedia("(min-width: 768px)").matches
    );
  } catch {
    return false;
  }
}

/**
 * ── DEUX PARCOURS, SELON QUE LE NUMÉRO EXISTE DÉJÀ ─────────────────────────
 *
 * `"cloud_api"` est le parcours complet : Meta fait créer un compte WhatsApp
 * Business et déclarer un numéro. Il suppose un numéro **neuf**.
 *
 * C'était le seul proposé, et c'est la mauvaise porte pour la majorité des
 * boutiques : leur numéro est déjà utilisé dans l'application WhatsApp
 * Business. Meta leur demandait alors de supprimer ce compte — donc de perdre
 * historique et contacts — ce qui fait abandonner au milieu du parcours.
 *
 * `"coexistence"` demande le parcours prévu pour ce cas. Le numéro existant est
 * conservé, l'application reste utilisable, les contacts et jusqu'à six mois de
 * conversations suivent. La personne reçoit un code dans son application
 * WhatsApp Business et le recopie ; elle ne crée rien.
 * ──────────────────────────────────────────────────────────────────────────
 */
export type MetaSignupMode = "coexistence" | "cloud_api";

/**
 * Meta a renommé cette valeur : `"coexistence"` n'est plus acceptée, c'est
 * `"whatsapp_business_app_onboarding"` qui déclenche le parcours. Le nom
 * interne reste parlant ; seule la valeur envoyée suit le contrat de Meta.
 */
const META_FEATURE_TYPE_BY_MODE: Record<MetaSignupMode, string> = {
  coexistence: "whatsapp_business_app_onboarding",
  cloud_api: "",
};

export async function startMetaEmbeddedSignup(
  sdk: MetaSDK,
  configId: string,
  mode: MetaSignupMode = "cloud_api",
): Promise<MetaLoginResponse> {
  const cleanConfigId = configId.trim();
  if (!cleanConfigId) {
    throw new Error("NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID est requis.");
  }

  return new Promise<MetaLoginResponse>((resolve, reject) => {
    let loginResponse: MetaLoginResponse | undefined;
    let embeddedSignupEvent: MetaEmbeddedSignupEvent | undefined;
    let resolved = false;
    let finalizeTimer: number | undefined;
    let abandonTimer: number | undefined;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      if (finalizeTimer != null) {
        window.clearTimeout(finalizeTimer);
      }
      if (abandonTimer != null) {
        window.clearTimeout(abandonTimer);
      }
    };

    const finalize = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      if (loginResponse && typeof loginResponse === "object") {
        resolve({
          ...loginResponse,
          ...(embeddedSignupEvent ? { embeddedSignupEvent } : {}),
        });
        return;
      }
      resolve(loginResponse ?? null);
    };

    const handleMessage = (event: MessageEvent) => {
      if (!isAllowedMetaOrigin(event.origin)) return;

      const parsed = parseEmbeddedSignupMessage(event.data);
      if (!parsed) return;

      embeddedSignupEvent = parsed;
    };

    window.addEventListener("message", handleMessage);

    /**
     * Filet : cette promesse ne doit jamais rester en suspens.
     *
     * En marche normale, Meta rappelle toujours — y compris quand la personne
     * ferme la popup, auquel cas le SDK renvoie `status: "unknown"`. Mais si le
     * SDK est empêché de communiquer avec sa popup, aucun rappel n'arrive : la
     * promesse ne se résout pas, et l'écran laisse un bouton désactivé sans
     * message ni recours, jusqu'au rechargement de la page. C'est exactement ce
     * qui s'est produit quand la CSP bloquait l'iframe de communication du SDK.
     *
     * Le délai est volontairement large : l'inscription Meta demande de créer un
     * compte WhatsApp Business et de vérifier un numéro, ce qui prend plusieurs
     * minutes. Ce n'est pas un mécanisme, c'est une porte de sortie.
     */
    abandonTimer = window.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(
        new Error(
          "Meta n'a pas répondu. Ferme la fenêtre WhatsApp si elle est encore ouverte, puis réessaie.",
        ),
      );
    }, META_EMBEDDED_SIGNUP_ABANDON_MS);

    try {
      sdk.login(
        (response) => {
          loginResponse = response;
          finalizeTimer = window.setTimeout(finalize, META_EMBEDDED_SIGNUP_MESSAGE_WAIT_MS);
        },
        {
          config_id: cleanConfigId,
          response_type: "code",
          // Sur souris et grand écran seulement — cf. `prefersPopupDisplay`.
          // Omis ailleurs pour laisser Meta choisir, ce qui donne la pleine page
          // sur mobile, où c'est le bon comportement.
          ...(prefersPopupDisplay() ? { display: "popup" } : {}),
          override_default_response_type: true,
          /**
           * ── CES CLÉS SUIVENT LE CONTRAT DE META, PAS UNE APPROXIMATION ─────
           *
           * `extras` portait `feature: "whatsapp_embedded_signup"`. Ce nom
           * n'existe pas dans la documentation de Meta : la clé attendue est
           * `featureType`. Une chaîne vide y demande le parcours complet ;
           * `"only_waba_sharing"` sauterait l'étape du numéro.
           *
           * Meta valide `extras` avant d'ouvrir sa fenêtre. Une clé inconnue
           * pouvait donc suffire à ce qu'aucune fenêtre ne s'ouvre — sans
           * erreur ni rappel, symptôme exact observé : SDK chargé, popup
           * autorisée par le navigateur, et pourtant rien.
           *
           * `sessionInfoVersion` reste : c'est lui qui fait remonter `waba_id`
           * et `phone_number_id` dans le message de fin, que
           * `connectWhatsAppEmbedded` consomme.
           * ──────────────────────────────────────────────────────────────────
           */
          extras: {
            setup: {},
            featureType: META_FEATURE_TYPE_BY_MODE[mode],
            sessionInfoVersion: "3",
          },
        },
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function isAllowedMetaOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "https:") return false;
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

function parseEmbeddedSignupMessage(data: unknown): MetaEmbeddedSignupEvent | null {
  const text = typeof data === "string" ? data : null;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.type !== "WA_EMBEDDED_SIGNUP") {
      return null;
    }

    return {
      type: "WA_EMBEDDED_SIGNUP",
      event: typeof parsed.event === "string" ? parsed.event : undefined,
      data:
        parsed.data && typeof parsed.data === "object"
          ? {
              phone_number_id:
                typeof (parsed.data as Record<string, unknown>).phone_number_id === "string"
                  ? ((parsed.data as Record<string, unknown>).phone_number_id as string)
                  : undefined,
              waba_id:
                typeof (parsed.data as Record<string, unknown>).waba_id === "string"
                  ? ((parsed.data as Record<string, unknown>).waba_id as string)
                  : undefined,
              current_step:
                typeof (parsed.data as Record<string, unknown>).current_step === "string"
                  ? ((parsed.data as Record<string, unknown>).current_step as string)
                  : undefined,
            }
          : undefined,
    };
  } catch {
    return null;
  }
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
