/**
 * Rate limiting pour les mutations tRPC via Upstash Redis.
 *
 * Sliding window : 20 mutations / minute par userId.
 * Si Upstash n'est pas configuré (pas de UPSTASH_REDIS_REST_URL),
 * le rate limiting est désactivé silencieusement (graceful degradation).
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "~/env";

let ratelimiter: Ratelimit | null = null;

function getRateLimiter(): Ratelimit | null {
  if (ratelimiter !== null) return ratelimiter;

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  ratelimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    prefix: "trpc:rl",
    analytics: false,
  });

  return ratelimiter;
}

/**
 * Vérifie le rate limit pour un userId.
 * Retourne true si la requête est autorisée, false si elle est bloquée.
 * Si Upstash n'est pas configuré, retourne toujours true.
 */
export async function checkTrpcRateLimit(userId: string): Promise<boolean> {
  const limiter = getRateLimiter();
  if (!limiter) return true;

  try {
    const result = await Promise.race([
      limiter.limit(userId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("rate-limit timeout")), 500)
      ),
    ]);
    return result.success;
  } catch {
    // Upstash unreachable or timeout — degrade gracefully, never block the request
    return true;
  }
}
