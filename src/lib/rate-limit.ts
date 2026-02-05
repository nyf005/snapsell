/**
 * Rate limiting simple en mémoire pour les invitations
 * En production, utiliser Redis ou un service dédié
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure
const MAX_INVITATIONS_PER_HOUR = 10;

/**
 * Vérifie si une action est autorisée selon le rate limiting
 * @param key Clé unique pour le rate limiting (ex: tenantId)
 * @param maxRequests Nombre maximum de requêtes autorisées
 * @param windowMs Fenêtre de temps en millisecondes
 * @returns true si autorisé, false sinon
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = MAX_INVITATIONS_PER_HOUR,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Nouvelle fenêtre ou fenêtre expirée
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Réinitialise le rate limit pour une clé (utile pour les tests)
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Nettoie les entrées expirées (à appeler périodiquement)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

/** Préfixe des clés rate-limit pour le webhook (par IP). */
const WEBHOOK_RATE_LIMIT_KEY_PREFIX = "webhook:";

/**
 * Extrait l’IP client depuis les headers (Vercel/proxy) ou fallback.
 * À utiliser côté serveur uniquement.
 */
export function getClientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Rate limit spécifique au webhook : une clé par IP.
 * @param request - Requête HTTP (pour extraire l’IP)
 * @param maxRequests - Nombre max de requêtes dans la fenêtre (défaut 120)
 * @param windowMs - Fenêtre en ms (défaut 60_000)
 * @returns true si autorisé, false si limite dépassée
 */
export function checkWebhookRateLimit(
  request: Request,
  maxRequests: number = 120,
  windowMs: number = 60_000,
): boolean {
  const ip = getClientIpFromRequest(request);
  const key = `${WEBHOOK_RATE_LIMIT_KEY_PREFIX}${ip}`;
  return checkRateLimit(key, maxRequests, windowMs);
}
