/**
 * Rate limiting partagé pour invitations et webhooks.
 *
 * En production, Upstash Redis est requis pour éviter les compteurs locaux
 * incohérents entre instances. En développement/test, un fallback mémoire
 * reste disponible pour faciliter le travail local.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "~/env";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const sharedLimiterCache = new Map<string, Ratelimit>();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure
const MAX_INVITATIONS_PER_HOUR = 10;
const WEBHOOK_RATE_LIMIT_KEY_PREFIX = "webhook:";
const SHARED_RATE_LIMIT_TIMEOUT_MS = 500;

function isProduction(): boolean {
  return env.NODE_ENV === "production";
}

function isSharedRateLimitConfigured(): boolean {
  return !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

function checkMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
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

function getSharedRateLimiter(
  maxRequests: number,
  windowMs: number,
  prefix: string,
): Ratelimit | null {
  if (!isSharedRateLimitConfigured()) {
    return null;
  }

  const cacheKey = `${prefix}:${maxRequests}:${windowMs}`;
  const cached = sharedLimiterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL!,
    token: env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${Math.ceil(windowMs / 1000)} s`),
    prefix,
    analytics: false,
  });

  sharedLimiterCache.set(cacheKey, limiter);
  return limiter;
}

async function runSharedRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  prefix: string,
): Promise<boolean> {
  const limiter = getSharedRateLimiter(maxRequests, windowMs, prefix);

  if (!limiter) {
    if (isProduction()) {
      throw new Error(
        "Shared rate limiting requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production.",
      );
    }
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  }

  try {
    const result = (await Promise.race([
      limiter.limit(key),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("shared rate-limit timeout")), SHARED_RATE_LIMIT_TIMEOUT_MS),
      ),
    ])) as Awaited<ReturnType<Ratelimit["limit"]>>;
    return result.success;
  } catch (error) {
    if (isProduction()) {
      throw error;
    }
    return checkMemoryRateLimit(key, maxRequests, windowMs);
  }
}

/**
 * Vérifie si une action est autorisée selon le rate limiting partagé.
 * En dev/test, utilise un fallback mémoire si Redis n'est pas configuré.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number = MAX_INVITATIONS_PER_HOUR,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): Promise<boolean> {
  return runSharedRateLimit(key, maxRequests, windowMs, "shared:rl");
}

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
 */
export async function checkWebhookRateLimit(
  request: Request,
  maxRequests: number = 120,
  windowMs: number = 60_000,
): Promise<boolean> {
  const ip = getClientIpFromRequest(request);
  const key = `${WEBHOOK_RATE_LIMIT_KEY_PREFIX}${ip}`;
  return runSharedRateLimit(key, maxRequests, windowMs, WEBHOOK_RATE_LIMIT_KEY_PREFIX);
}
