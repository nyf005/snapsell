const META_GRAPH_VERSION = "v21.0";
const META_REQUEST_TIMEOUT_MS = 10_000;
const REQUIRED_SCOPES = [
  "whatsapp_business_management",
  "whatsapp_business_messaging",
] as const;

type JsonValue = Record<string, unknown>;

type OAuthAccessTokenResponse = {
  access_token?: string;
};

type DebugTokenResponse = {
  data?: {
    is_valid?: boolean;
    scopes?: string[];
  };
};

type MeBusinessesResponse = {
  data?: Array<{ id?: string }>;
};

type SystemUsersResponse = {
  data?: Array<{ id?: string; name?: string }>;
};

type CreatedSystemUserResponse = {
  id?: string;
};

type SystemUserAccessTokenResponse = {
  access_token?: string;
};

type WabaAccountsResponse = {
  data?: Array<{
    id?: string;
    phone_numbers?: Array<{ id?: string; display_phone_number?: string }>;
  }>;
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

function extractFirstWabaAndPhone(
  payload: WabaAccountsResponse,
): { wabaId: string; phoneNumberId: string; businessPhoneNumber: string } | null {
  const pairs: Array<{ wabaId: string; phoneNumberId: string; businessPhoneNumber: string }> = [];
  const accounts = payload.data ?? [];

  for (const account of accounts) {
    const wabaId = requireString(account.id);
    if (!wabaId) continue;

    const phoneNumbers = account.phone_numbers ?? [];
    for (const phone of phoneNumbers) {
      const phoneNumberId = requireString(phone.id);
      const businessPhoneNumber = requireString(phone.display_phone_number);
      if (phoneNumberId && businessPhoneNumber) {
        pairs.push({ wabaId, phoneNumberId, businessPhoneNumber });
      }
    }
  }

  if (pairs.length !== 1) {
    return null;
  }

  return pairs[0]!;
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

async function generateSystemUserToken(params: {
  userAccessToken: string;
  appId: string;
}): Promise<string> {
  const businesses = (await requestJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/businesses?fields=id&access_token=${encodeURIComponent(params.userAccessToken)}&limit=25`,
    { method: "GET" },
    "Impossible de recuperer le Business Meta associe au compte.",
  )) as MeBusinessesResponse;

  const businessId = requireString(businesses.data?.[0]?.id);
  if (!businessId) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "Aucun Business Meta associe au compte connecte.",
    );
  }

  const existingSystemUsers = (await requestJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(businessId)}/system_users?fields=id,name&access_token=${encodeURIComponent(params.userAccessToken)}&limit=25`,
    { method: "GET" },
    "Impossible de recuperer les system users Meta.",
  )) as SystemUsersResponse;

  let systemUserId = requireString(existingSystemUsers.data?.[0]?.id);

  if (!systemUserId) {
    const body = new URLSearchParams({
      name: "SnapSell Embedded Signup",
      role: "ADMIN",
      access_token: params.userAccessToken,
    });
    const createdSystemUser = (await requestJson(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(businessId)}/system_users`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      "Impossible de creer un system user Meta pour ce Business.",
    )) as CreatedSystemUserResponse;

    systemUserId = requireString(createdSystemUser.id);
  }

  if (!systemUserId) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "System user Meta introuvable pour generer le token WhatsApp.",
    );
  }

  const accessTokenBody = new URLSearchParams({
    app_id: params.appId,
    scope: REQUIRED_SCOPES.join(","),
    access_token: params.userAccessToken,
  });
  const systemTokenPayload = (await requestJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(systemUserId)}/access_tokens`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: accessTokenBody.toString(),
    },
    "Impossible de generer le System User Token Meta.",
  )) as SystemUserAccessTokenResponse;

  const systemUserToken = requireString(systemTokenPayload.access_token);
  if (!systemUserToken) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "Meta n'a pas retourne de System User Token exploitable.",
    );
  }

  return systemUserToken;
}

export async function resolveMetaEmbeddedSignupCredentials(params: {
  tenantId: string;
  code: string;
  appId: string;
  appSecret: string;
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

  const shortLivedToken = requireString(codeExchangePayload.access_token);
  if (!shortLivedToken) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "Meta n'a pas retourne de token pour ce code OAuth.",
    );
  }

  const longLivedPayload = (await requestJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`,
    { method: "GET" },
    "Impossible de prolonger le token Meta. Relance la connexion WhatsApp.",
  )) as OAuthAccessTokenResponse;

  const longLivedToken = requireString(longLivedPayload.access_token);
  if (!longLivedToken) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "Meta n'a pas retourne de token longue duree.",
    );
  }

  const systemUserToken = await generateSystemUserToken({
    userAccessToken: longLivedToken,
    appId,
  });

  const debugTokenPayload = (await requestJson(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(systemUserToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
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
      "Permissions Meta insuffisantes pour connecter WhatsApp Business.",
    );
  }

  const wabaPayload = (await requestJson(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/whatsapp_business_accounts?fields=id,phone_numbers{id,display_phone_number}&access_token=${encodeURIComponent(systemUserToken)}&limit=25`,
    { method: "GET" },
    "Impossible de recuperer les ressources WhatsApp Business du compte Meta.",
  )) as WabaAccountsResponse;

  const resolved = extractFirstWabaAndPhone(wabaPayload);
  if (!resolved) {
    throw new MetaEmbeddedSignupError(
      "BAD_REQUEST",
      "Aucun compte WhatsApp Business utilisable trouve pour ce compte Meta.",
    );
  }

  return {
    accessToken: systemUserToken,
    wabaId: resolved.wabaId,
    phoneNumberId: resolved.phoneNumberId,
    businessPhoneNumber: resolved.businessPhoneNumber,
  };
}
