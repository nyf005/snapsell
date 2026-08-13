import { workerLogger } from "~/lib/logger";

const META_GRAPH_VERSION = "v21.0";
const META_REQUEST_TIMEOUT_MS = 10_000;

/**
 * ── DEUX PERMISSIONS, PAS TROIS ─────────────────────────────────────────────
 *
 * `business_management` figurait ici. Elle n'a jamais été accordée à l'app Meta
 * de SnapSell, et ce contrôle rejetait donc toute connexion d'une vendeuse
 * n'ayant aucun rôle sur l'app — c'est-à-dire toutes les vraies vendeuses.
 *
 * Elle n'était requise que par le détour supprimé plus bas : SnapSell fabriquait
 * un second jeton en créant un utilisateur système dans le portefeuille de la
 * vendeuse. Meta remet déjà le bon jeton — un *Business Integration System User
 * access token* — en échange du code d'Embedded Signup. C'est d'ailleurs ce que
 * SnapSell a déclaré faire dans sa demande de revue Meta
 * (`docs/meta-app-review-descriptions.md`).
 *
 * Ces deux permissions-ci sont accordées, et sont celles que Meta demande à un
 * Tech Provider : l'une gère le compte, l'autre les messages.
 * ────────────────────────────────────────────────────────────────────────────
 */
const REQUIRED_SCOPES = [
  "whatsapp_business_management",
  "whatsapp_business_messaging",
] as const;

type JsonValue = Record<string, unknown>;

type OAuthAccessTokenResponse = {
  access_token?: string;
};

/**
 * `granular_scopes` dit *sur quels actifs* une permission porte, là où `scopes`
 * ne dit que si elle est présente. C'est ce qui permet de vérifier que la WABA
 * qu'on s'apprête à enregistrer fait bien partie de ce que la vendeuse a
 * réellement partagé, plutôt que de le supposer.
 */
type DebugTokenResponse = {
  data?: {
    is_valid?: boolean;
    scopes?: string[];
    granular_scopes?: Array<{
      scope?: string;
      target_ids?: string[];
    }>;
  };
};

type PhoneNumbersResponse = {
  data?: Array<{ id?: string; display_phone_number?: string }>;
};

type PhoneNumberPlatformResponse = {
  is_on_biz_app?: boolean;
  platform_type?: string;
};

type SmbAppDataResponse = {
  request_id?: string;
};

/**
 * État de la synchronisation d'historique, tel qu'il part en base.
 *
 * `declined` n'est pas un échec : la boutique a le droit de refuser de partager
 * ses conversations pendant le parcours Meta. `failed` demande une intervention
 * — et il faut la voir vite, la fenêtre étant de 24 h.
 */
export type HistorySyncStatus = "requested" | "declined" | "failed";
export type ContactsSyncStatus = "requested" | "failed";

/**
 * Les deux synchronisations sont indépendantes et échouent séparément.
 *
 * Elles partageaient un statut unique, avec une valeur `partial` pour dire
 * « historique parti, contacts non ». Ça ne tenait pas : le premier webhook
 * d'historique écrasait ce statut, les contacts manquants disparaissaient de
 * l'écran, et le bouton de reprise avec eux.
 */
export type CoexistenceSyncResult = {
  history: HistorySyncStatus;
  contacts: ContactsSyncStatus;
};

export type EmbeddedSignupConnectionResult = {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  businessPhoneNumber: string;
  /**
   * Confirmé par Meta, pas par le choix fait à l'écran.
   * `null` = indéterminé (Meta n'a pas répondu) — voir `detectCoexistence`.
   */
  coexistence: boolean | null;
};

export class MetaEmbeddedSignupError extends Error {
  readonly kind: "BAD_REQUEST" | "UPSTREAM_ERROR" | "CONFIG_ERROR";
  /** Code d'erreur Meta, quand il en fournit un. Voir `HISTORY_DECLINED_CODE`. */
  readonly metaErrorCode?: number;

  constructor(
    kind: "BAD_REQUEST" | "UPSTREAM_ERROR" | "CONFIG_ERROR",
    message: string,
    metaErrorCode?: number,
  ) {
    super(message);
    this.name = "MetaEmbeddedSignupError";
    this.kind = kind;
    this.metaErrorCode = metaErrorCode;
  }
}

/**
 * Meta renvoie ce code quand la boutique a refusé de partager son historique
 * pendant le parcours. Ce n'est pas une panne : c'est une réponse.
 */
const HISTORY_DECLINED_CODE = 2593109;

function withTimeout(signal?: AbortSignal): AbortSignal {
  if (signal) return signal;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);
  controller.signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  return controller.signal;
}

async function parseJsonSafe(response: Response): Promise<JsonValue> {
  try {
    return (await response.json()) as JsonValue;
  } catch {
    return {};
  }
}

async function requestJson(url: string, init: RequestInit, badRequestMessage: string): Promise<JsonValue> {
  let response: Response;

  try {
    response = await fetch(url, { ...init, signal: withTimeout(init.signal ?? undefined) });
  } catch {
    throw new MetaEmbeddedSignupError(
      "UPSTREAM_ERROR",
      "Impossible de contacter l'API Meta. Reessaie dans quelques instants.",
    );
  }

  const payload = await parseJsonSafe(response);

  if (!response.ok) {
    const status = response.status;
    const upstreamError = payload.error;
    const upstreamMessage =
      typeof upstreamError === "object" &&
      upstreamError !== null &&
      "message" in upstreamError &&
      typeof upstreamError.message === "string"
        ? upstreamError.message
        : "";

    /**
     * Le code de Meta est conservé sur l'erreur. Sans lui, un refus de partage
     * d'historique (`2593109`) serait indiscernable d'une vraie panne — et
     * traité comme telle, alors que c'est un choix légitime de la boutique.
     */
    const upstreamCode =
      typeof upstreamError === "object" &&
      upstreamError !== null &&
      "code" in upstreamError &&
      typeof upstreamError.code === "number"
        ? upstreamError.code
        : undefined;

    if (status >= 400 && status < 500) {
      throw new MetaEmbeddedSignupError("BAD_REQUEST", badRequestMessage, upstreamCode);
    }

    throw new MetaEmbeddedSignupError(
      "UPSTREAM_ERROR",
      upstreamMessage || "Echec de communication avec Meta Graph.",
      upstreamCode,
    );
  }

  return payload;
}

function requireString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const USED_CODE_TTL_MS = 10 * 60 * 1000;
const usedOAuthCodes = new Map<string, number>();

function assertOAuthCodeNotReplayed(tenantId: string, code: string) {
  const now = Date.now();
  for (const [key, expiresAt] of usedOAuthCodes.entries()) {
    if (expiresAt <= now) usedOAuthCodes.delete(key);
  }

  const replayKey = `${tenantId}:${code}`;
  if (usedOAuthCodes.has(replayKey)) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "Ce code OAuth Meta a deja ete utilise. Relance la connexion WhatsApp.",
    );
  }

  usedOAuthCodes.set(replayKey, now + USED_CODE_TTL_MS);
}

/**
 * Les WABA sur lesquelles le jeton porte réellement, d'après Meta.
 *
 * On croise les deux permissions : une WABA que la vendeuse aurait partagée
 * pour la gestion mais pas pour la messagerie ne nous servirait à rien, et
 * l'enregistrer produirait un échec plus tard, à l'envoi du premier message —
 * loin d'ici, et bien plus difficile à relier à sa cause.
 */
function extractAuthorizedWabaIds(debugData: DebugTokenResponse["data"]): string[] {
  const granular = debugData?.granular_scopes ?? [];

  const idsForScope = (scope: string): string[] => {
    const entry = granular.find((item) => item.scope === scope);
    return (entry?.target_ids ?? []).filter((id): id is string => requireString(id) != null);
  };

  const managementIds = idsForScope("whatsapp_business_management");
  const messagingIds = idsForScope("whatsapp_business_messaging");

  /**
   * Meta omet `target_ids` quand la permission porte sur tous les actifs. Dans
   * ce cas on ne peut rien croiser, et exiger une intersection reviendrait à
   * tout rejeter. On se rabat alors sur l'autre liste, et si les deux sont
   * vides, on laisse la résolution se faire sans filtre — le contrôle
   * d'appartenance de `resolvePhoneNumber` reste, lui, toujours en place.
   */
  if (managementIds.length === 0) return messagingIds;
  if (messagingIds.length === 0) return managementIds;

  return managementIds.filter((id) => messagingIds.includes(id));
}

function resolveWabaId(params: {
  authorizedWabaIds: string[];
  requestedWabaId?: string;
}): string {
  const requested = requireString(params.requestedWabaId);
  const authorized = params.authorizedWabaIds;

  if (requested) {
    /**
     * La fenêtre Meta nous a annoncé cette WABA-là. On la retient, mais on
     * refuse de l'enregistrer si le jeton ne porte pas dessus : le message de
     * la fenêtre vient du navigateur, le jeton vient de Meta. C'est le second
     * qui fait foi.
     */
    if (authorized.length > 0 && !authorized.includes(requested)) {
      throw new MetaEmbeddedSignupError(
        "BAD_REQUEST",
        "Le compte WhatsApp Business selectionne n'est pas autorise par le token Meta.",
      );
    }
    return requested;
  }

  if (authorized.length === 1) {
    return authorized[0]!;
  }

  throw new MetaEmbeddedSignupError(
    "BAD_REQUEST",
    authorized.length === 0
      ? "Aucun compte WhatsApp Business autorise pour ce token Meta."
      : "Plusieurs comptes WhatsApp Business autorises : impossible de choisir sans indication.",
  );
}

/**
 * Le numéro se lit sur la WABA, pas sur `me/whatsapp_business_accounts`.
 *
 * Cet ancien appel partait du jeton pour découvrir les comptes ; il supposait un
 * jeton utilisateur. Passer par la WABA a deux avantages : c'est compatible avec
 * un business token, et ça **vérifie l'appartenance** — un `phone_number_id`
 * annoncé par la fenêtre Meta mais absent de cette WABA est rejeté ici plutôt
 * qu'enregistré.
 *
 * C'est aussi le repli nécessaire lorsque la fenêtre ne renvoie pas de
 * `phone_number_id`, ce qui peut arriver.
 */
async function resolvePhoneNumber(params: {
  wabaId: string;
  accessToken: string;
  requestedPhoneNumberId?: string;
}): Promise<{ phoneNumberId: string; businessPhoneNumber: string }> {
  const payload = (await requestJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(params.wabaId)}/phone_numbers?fields=id,display_phone_number&limit=100&access_token=${encodeURIComponent(params.accessToken)}`,
    { method: "GET" },
    "Impossible de recuperer les numeros du compte WhatsApp Business.",
  )) as PhoneNumbersResponse;

  const numbers = (payload.data ?? []).flatMap((entry) => {
    const phoneNumberId = requireString(entry.id);
    const businessPhoneNumber = requireString(entry.display_phone_number);
    return phoneNumberId && businessPhoneNumber
      ? [{ phoneNumberId, businessPhoneNumber }]
      : [];
  });

  const requested = requireString(params.requestedPhoneNumberId);
  if (requested) {
    const matched = numbers.find((entry) => entry.phoneNumberId === requested);
    if (!matched) {
      throw new MetaEmbeddedSignupError(
        "BAD_REQUEST",
        "Le numero selectionne n'appartient pas au compte WhatsApp Business autorise.",
      );
    }
    return matched;
  }

  if (numbers.length === 1) {
    return numbers[0]!;
  }

  throw new MetaEmbeddedSignupError(
    "BAD_REQUEST",
    numbers.length === 0
      ? "Aucun numero utilisable sur ce compte WhatsApp Business."
      : "Plusieurs numeros disponibles : impossible de choisir sans indication.",
  );
}

/**
 * ── SANS CET ABONNEMENT, RIEN N'ARRIVE ──────────────────────────────────────
 *
 * Meta ne pousse les évènements d'une WABA vers notre webhook que si l'app y
 * est explicitement abonnée. Cet appel n'existait nulle part dans le dépôt : une
 * boutique pouvait s'afficher « Connectée », envoyer des messages, et ne jamais
 * recevoir la moindre réponse de sa clientèle. C'est le genre de panne qu'on ne
 * découvre que par une cliente restée sans réponse.
 *
 * SnapSell l'a pourtant déclaré à Meta dans sa demande de revue pour
 * `whatsapp_business_management` (`docs/meta-app-review-descriptions.md`) : cet
 * appel remet le code en accord avec ce qui a été promis.
 *
 * L'opération est idempotente côté Meta — réabonner une WABA déjà abonnée
 * réussit — ce qui permet de la rejouer à chaque reconnexion sans précaution.
 */
async function subscribeAppToWaba(params: {
  wabaId: string;
  accessToken: string;
}): Promise<void> {
  const payload = await requestJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(params.wabaId)}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: params.accessToken }).toString(),
    },
    "Impossible d'abonner SnapSell aux notifications de ce compte WhatsApp Business.",
  );

  /**
   * Meta répond `200` avec `{"success": false}` dans certains refus. Traiter la
   * réussite HTTP comme une réussite fonctionnelle laisserait passer une
   * boutique définitivement muette.
   */
  if (payload.success !== true) {
    throw new MetaEmbeddedSignupError(
      "UPSTREAM_ERROR",
      "Meta a refuse l'abonnement aux notifications du compte WhatsApp Business.",
    );
  }
}

/**
 * La Coexistence se constate chez Meta, elle ne se déduit pas de l'écran.
 *
 * Le mode choisi par la boutique n'est qu'une intention : elle a pu demander la
 * Coexistence et voir Meta lui faire déclarer un numéro neuf, ou l'inverse.
 * Enregistrer l'intention ferait lancer une synchronisation d'historique sur un
 * numéro qui n'en a pas, ou — bien pire — l'omettre sur un numéro qui en a un,
 * avec 24 h pour s'en apercevoir.
 *
 * Meta répond sur le numéro lui-même : `is_on_biz_app` vrai *et*
 * `platform_type` à `CLOUD_API` signifient que l'application et l'API partagent
 * ce numéro.
 */
export async function detectCoexistence(params: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<boolean | null> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const payload = (await requestJson(
        `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(params.phoneNumberId)}?fields=is_on_biz_app,platform_type&access_token=${encodeURIComponent(params.accessToken)}`,
        { method: "GET" },
        "Impossible de lire la configuration du numero WhatsApp.",
      )) as PhoneNumberPlatformResponse;

      return payload.is_on_biz_app === true && payload.platform_type === "CLOUD_API";
    } catch (error) {
      workerLogger.error(
        `Meta: lecture de la plateforme du numéro échouée (tentative ${attempt}/2)`,
        error instanceof Error ? error : new Error(String(error)),
        { phoneNumberId: params.phoneNumberId },
      );
    }
  }

  /**
   * ── « JE NE SAIS PAS » N'EST PAS « NON » ────────────────────────────────
   *
   * Cette fonction renvoyait `false` sur erreur, ce qui passait pour prudent.
   * Ça ne l'était pas : un délai réseau suffisait alors à classer
   * définitivement une boutique hors Coexistence, donc à ne lancer aucune
   * synchronisation, donc à laisser la fenêtre de 24 h s'écouler et l'historique
   * disparaître — sans reprise possible.
   *
   * Les deux erreurs n'ont pas le même prix. Se tromper en tentant une
   * synchronisation sur un numéro ordinaire coûte un appel refusé ; se tromper
   * en s'abstenant coûte les conversations de la boutique. On rend donc
   * l'incertitude telle quelle, et l'appelant tente malgré tout.
   * ────────────────────────────────────────────────────────────────────────
   */
  return null;
}

/**
 * ── LA SYNCHRONISATION SE LANCE ICI, ET NULLE PART AILLEURS ────────────────
 *
 * Meta n'accorde que 24 h après l'intégration pour la demander. Passé ce délai,
 * l'historique et les contacts sont perdus sans reprise possible — et c'est
 * exactement ce que la Coexistence promet de conserver. La demande part donc
 * dans la foulée de la connexion, pas depuis un réglage que personne n'ouvrira.
 *
 * Aucun de ces deux appels ne fait échouer la connexion : un numéro connecté
 * sans historique reste utilisable, alors qu'une connexion refusée ne l'est pas.
 * L'état part en base pour que l'écran puisse le dire.
 */
export async function startCoexistenceSync(params: {
  phoneNumberId: string;
  accessToken: string;
}): Promise<CoexistenceSyncResult> {
  const requestSync = async (syncType: "smb_app_state_sync" | "history") => {
    const payload = (await requestJson(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(params.phoneNumberId)}/smb_app_data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          /*
            Le jeton manquait ici, et nulle part ailleurs : les autres appels le
            passent en paramètre d'URL ou dans un corps encodé, celui-ci envoie
            du JSON et n'avait donc aucun endroit où le glisser. Meta aurait
            refusé chaque demande de synchronisation, et la fenêtre de 24 h se
            serait écoulée sans que rien ne soit repris.
          */
          Authorization: `Bearer ${params.accessToken}`,
        },
        body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
      },
      "Meta a refuse la demande de synchronisation.",
    )) as SmbAppDataResponse;
    return payload.request_id;
  };

  // Les contacts d'abord : ils arrivent en quelques minutes et permettent
  // d'afficher un nom plutôt qu'un numéro dès les premières conversations.
  let contacts: ContactsSyncStatus = "requested";
  try {
    await requestSync("smb_app_state_sync");
  } catch (error) {
    /**
     * L'échec était avalé sans laisser de trace exploitable : si l'historique
     * partait ensuite, le statut devenait « demandé » et rien n'indiquait que
     * les contacts manquaient — ni état, ni bouton pour les rattraper, alors
     * que la fenêtre de 24 h vaut aussi pour eux.
     */
    contacts = "failed";
    workerLogger.error(
      "Meta: synchronisation des contacts non demandée",
      error instanceof Error ? error : new Error(String(error)),
      { phoneNumberId: params.phoneNumberId },
    );
  }

  try {
    await requestSync("history");
    return { history: "requested", contacts };
  } catch (error) {
    if (
      error instanceof MetaEmbeddedSignupError &&
      error.metaErrorCode === HISTORY_DECLINED_CODE
    ) {
      // Choix de la boutique pendant le parcours Meta, pas une panne.
      workerLogger.info("Meta: partage de l'historique refusé par la boutique", {
        phoneNumberId: params.phoneNumberId,
      });
      return { history: "declined", contacts };
    }

    workerLogger.error(
      "Meta: synchronisation de l'historique non demandée — fenêtre de 24 h",
      error instanceof Error ? error : new Error(String(error)),
      { phoneNumberId: params.phoneNumberId },
    );
    return { history: "failed", contacts };
  }
}

/**
 * ── LE JETON DE L'ÉCHANGE EST LE BON, ON NE LE TRANSFORME PLUS ──────────────
 *
 * Cette fonction faisait trois choses de trop après l'échange du code : elle
 * prolongeait le jeton avec `fb_exchange_token`, cherchait le portefeuille
 * Business de la vendeuse via `me/businesses`, puis y créait un utilisateur
 * système pour en tirer un second jeton.
 *
 * Chacune de ces étapes suppose un jeton *utilisateur*. Or l'échange du code
 * d'Embedded Signup renvoie déjà un jeton d'intégration business, cadré sur la
 * seule cliente qui vient de terminer le parcours. Le détour ne servait donc à
 * rien — et il exigeait `business_management`, jamais accordée, ce qui rendait
 * la connexion impossible pour toute vendeuse extérieure.
 *
 * Il imposait en prime à la vendeuse d'être **administratrice** d'un
 * portefeuille Business préexistant, ce que beaucoup ne sont pas.
 * ────────────────────────────────────────────────────────────────────────────
 */
export async function resolveMetaEmbeddedSignupCredentials(params: {
  tenantId: string;
  code: string;
  appId: string;
  appSecret: string;
  wabaId?: string;
  phoneNumberId?: string;
}): Promise<EmbeddedSignupConnectionResult> {
  const tenantId = params.tenantId.trim();
  const code = params.code.trim();
  const appId = params.appId.trim();
  const appSecret = params.appSecret.trim();

  if (!tenantId) {
    throw new MetaEmbeddedSignupError("BAD_REQUEST", "Tenant non identifie pour la connexion Meta.");
  }

  if (!code) {
    throw new MetaEmbeddedSignupError("BAD_REQUEST", "Le code OAuth Meta est requis.");
  }

  assertOAuthCodeNotReplayed(tenantId, code);

  if (!appId || !appSecret) {
    throw new MetaEmbeddedSignupError(
      "CONFIG_ERROR",
      "Configuration Meta incomplete (app id / app secret).",
    );
  }

  const codeExchangeBody = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  });

  const codeExchangePayload = (await requestJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: codeExchangeBody.toString(),
    },
    "Code OAuth Meta invalide ou expire. Relance la connexion WhatsApp.",
  )) as OAuthAccessTokenResponse;

  const businessToken = requireString(codeExchangePayload.access_token);
  if (!businessToken) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "Meta n'a pas retourne de token pour ce code OAuth.",
    );
  }

  const debugTokenPayload = (await requestJson(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(businessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
    { method: "GET" },
    "Le token Meta retourne est invalide ou incomplet.",
  )) as DebugTokenResponse;

  const debugData = debugTokenPayload.data;
  if (!debugData?.is_valid) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "Le token Meta retourne est invalide. Reconnecte ton compte WhatsApp Business.",
    );
  }

  const scopes = debugData.scopes ?? [];
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missingScopes.length > 0) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      `Permissions Meta insuffisantes pour connecter WhatsApp Business (manquant: ${missingScopes.join(", ")}).`,
    );
  }

  const wabaId = resolveWabaId({
    authorizedWabaIds: extractAuthorizedWabaIds(debugData),
    requestedWabaId: params.wabaId,
  });

  const { phoneNumberId, businessPhoneNumber } = await resolvePhoneNumber({
    wabaId,
    accessToken: businessToken,
    requestedPhoneNumberId: params.phoneNumberId,
  });

  /**
   * Dernier avant de rendre la main, donc avant toute écriture en base : une
   * boutique n'est enregistrée comme connectée que si elle recevra vraiment les
   * messages de sa clientèle. Un échec ici laisse le tenant inchangé, et
   * « Connecté » — qui se déduit des identifiants stockés — reste donc faux.
   */
  await subscribeAppToWaba({ wabaId, accessToken: businessToken });

  /**
   * ── LA SYNCHRONISATION NE PART PAS D'ICI ───────────────────────────────
   *
   * Elle était lancée à cet endroit, avant que l'appelant n'ait écrit le
   * `metaPhoneNumberId` en base. Meta pouvait donc renvoyer un `history` ou un
   * `smb_app_state_sync` pendant que la boutique n'était pas encore
   * enregistrée : le webhook ne résolvait aucun tenant et jetait l'évènement.
   *
   * On se contente donc de constater la Coexistence. C'est au routeur de
   * déclencher la synchronisation, une fois la transaction validée.
   * ────────────────────────────────────────────────────────────────────────
   */
  return {
    accessToken: businessToken,
    wabaId,
    phoneNumberId,
    businessPhoneNumber,
    coexistence: await detectCoexistence({
      phoneNumberId,
      accessToken: businessToken,
    }),
  };
}
