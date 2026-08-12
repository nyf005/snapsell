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

export type EmbeddedSignupConnectionResult = {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  businessPhoneNumber: string;
};

export class MetaEmbeddedSignupError extends Error {
  readonly kind: "BAD_REQUEST" | "UPSTREAM_ERROR" | "CONFIG_ERROR";

  constructor(kind: "BAD_REQUEST" | "UPSTREAM_ERROR" | "CONFIG_ERROR", message: string) {
    super(message);
    this.name = "MetaEmbeddedSignupError";
    this.kind = kind;
  }
}

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

    if (status >= 400 && status < 500) {
      throw new MetaEmbeddedSignupError("BAD_REQUEST", badRequestMessage);
    }

    throw new MetaEmbeddedSignupError(
      "UPSTREAM_ERROR",
      upstreamMessage || "Echec de communication avec Meta Graph.",
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

  return {
    accessToken: businessToken,
    wabaId,
    phoneNumberId,
    businessPhoneNumber,
  };
}
