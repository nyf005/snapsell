/**
 * Résolution d'un media ID Meta (préfixe meta-media://) en URL HTTPS téléchargeable.
 * L'API Graph Meta retourne une URL temporaire valide ~5 minutes.
 */

import { workerLogger } from "~/lib/logger";

const API_VERSION = "v21.0";

/**
 * Si mediaUrl commence par "meta-media://", appelle l'API Graph Meta pour obtenir
 * l'URL HTTPS du fichier. Sinon retourne mediaUrl tel quel.
 *
 * @param mediaUrl  - URL brute (meta-media://<id> ou https://...)
 * @param accessToken - Token d'accès Meta du tenant (déchiffré)
 * @param correlationId - Pour les logs
 * @returns URL HTTPS téléchargeable, ou null en cas d'échec
 */
export async function resolveMetaMediaUrl(
  mediaUrl: string,
  accessToken: string,
  correlationId: string,
): Promise<string | null> {
  if (!mediaUrl.startsWith("meta-media://")) {
    return mediaUrl;
  }

  const mediaId = mediaUrl.slice("meta-media://".length);
  if (!mediaId) {
    workerLogger.warn("resolveMetaMediaUrl: mediaId vide", { correlationId });
    return null;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      workerLogger.warn("resolveMetaMediaUrl: API Graph error", {
        correlationId,
        mediaId,
        status: res.status,
        error: err.error?.message,
      });
      return null;
    }

    const data = await res.json() as { url?: string };
    if (!data.url) {
      workerLogger.warn("resolveMetaMediaUrl: pas d'url dans la réponse", { correlationId, mediaId });
      return null;
    }

    return data.url;
  } catch (error) {
    workerLogger.error("resolveMetaMediaUrl: exception", error, { correlationId, mediaId });
    return null;
  }
}
