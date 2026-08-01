/**
 * Rate limiting partagé pour invitations et webhooks.
 *
 * Redis (Upstash) porte les compteurs, pour qu'ils restent cohérents entre les
 * instances serverless. Quand il est indisponible, on retombe sur un compteur
 * mémoire, propre à l'instance.
 *
 * Ce repli remplace un `throw`, et l'incident qui a motivé le changement mérite
 * d'être écrit ici : la base Redis avait disparu, le webhook Meta répondait 503
 * à *chaque* message, et plus aucune commande ne pouvait entrer. Une protection
 * contre les abus mettait la vente à l'arrêt.
 *
 * Un compteur par instance est imparfait — n instances tolèrent n fois le
 * plafond. C'est sans commune mesure avec le fait de tout rejeter, d'autant que
 * le webhook Meta est protégé juste après par sa signature HMAC.
 *
 * `trpc-rate-limit.ts` dégradait déjà ainsi ; seul ce chemin ne le faisait pas.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "~/env";
import { captureException } from "~/lib/sentry";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const sharedLimiterCache = new Map<string, Ratelimit>();

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure
const MAX_INVITATIONS_PER_HOUR = 10;
const WEBHOOK_RATE_LIMIT_KEY_PREFIX = "webhook:";
// 500 ms ne laissait aucune marge à un aller-retour transatlantique ou à une
// connexion froide. Le budget sert à ne pas retenir le webhook, pas à trancher
// au plus court : au-delà, on bascule sur le compteur mémoire.
const SHARED_RATE_LIMIT_TIMEOUT_MS = 2_000;

/** Évite d'inonder Sentry : une alerte par fenêtre, pas une par requête. */
const DEGRADED_ALERT_INTERVAL_MS = 5 * 60 * 1000;
let lastDegradedAlertAt = 0;

/**
 * Signale le passage en mode dégradé, sans jamais faire échouer l'appelant.
 *
 * C'est le point aveugle qui a coûté cher : Redis absent, aucune alerte, et la
 * panne ne se voyait qu'au silence des clientes.
 */
function reportDegraded(reason: string, error?: unknown): void {
  const now = Date.now();
  if (now - lastDegradedAlertAt < DEGRADED_ALERT_INTERVAL_MS) return;
  lastDegradedAlertAt = now;

  void captureException(
    error instanceof Error ? error : new Error(`Rate limiting dégradé : ${reason}`),
    { tags: { component: "rate-limit", degraded: "memory-fallback", reason } },
  ).catch(() => {
    // La remontée d'alerte ne doit jamais casser ce qu'elle observe.
  });
}

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
  /**
   * Inerte en test — comme `trpc-rate-limit.ts` l'est déjà.
   *
   * `vitest.setup.env.ts` charge le vrai `.env` : les identifiants Upstash de
   * production s'y trouvent. Sans cette sortie, la suite de tests incrémentait
   * de véritables compteurs distants, qui survivaient d'une exécution à l'autre
   * — un test finissait donc par échouer non pas à cause du code, mais parce
   * qu'une exécution précédente avait consommé le quota. Les tests qui veulent
   * réellement éprouver le limiteur mockent ce module, comme le font déjà
   * `invitations.test.ts` et le test du webhook Meta.
   */
  if (env.NODE_ENV === "test") return true;

  const limiter = getSharedRateLimiter(maxRequests, windowMs, prefix);

  if (!limiter) {
    if (isProduction()) {
      reportDegraded("upstash_not_configured");
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
    // On ne relève plus en production. Le compteur mémoire prend le relais :
    // dégradé, mais l'application continue d'encaisser les commandes.
    if (isProduction()) {
      reportDegraded("upstash_unreachable", error);
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

/**
 * ── FREINS SUR LES PORTES D'ENTRÉE DU COMPTE ─────────────────────────────────
 *
 * La connexion et l'inscription n'en avaient aucun. `authorize()` comparait un
 * bcrypt sans compter les échecs, sans verrouillage, sans plafond par IP : un
 * mot de passe se testait autant de fois qu'on voulait. Et `auth.signup` est un
 * `publicProcedure`, donc hors du limiteur tRPC — qui se clé de toute façon sur
 * un `userId` inexistant avant l'inscription. Chaque appel créait une boutique
 * et brûlait un `hash(password, 10)`, soit un coût CPU offert à l'inconnu.
 *
 * Deux clés pour la connexion, parce qu'elles arrêtent deux attaques
 * différentes : par email, on bloque l'acharnement sur un compte précis ; par
 * IP, on bloque le bourrage d'identifiants qui essaie un mot de passe sur mille
 * comptes. Aucune des deux ne suffit seule.
 *
 * Les fenêtres sont volontairement larges (15 min) et les plafonds hauts au
 * regard d'un usage humain : une vendeuse qui se trompe trois fois de suite ne
 * doit jamais rencontrer ce mur. Le repli mémoire du limiteur s'applique ici
 * comme ailleurs — dégradé vaut mieux que porte fermée.
 * ────────────────────────────────────────────────────────────────────────────
 */
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_EMAIL = 10;
const MAX_LOGIN_ATTEMPTS_PER_IP = 40;
const MAX_SIGNUPS_PER_IP = 5;

/** Tentative de connexion autorisée ? Vérifie le compte visé ET l'origine. */
export async function checkLoginRateLimit(
  email: string,
  ip: string,
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();

  // Les deux compteurs sont incrémentés à chaque tentative, y compris quand le
  // premier a déjà refusé : sinon, une fois un email bloqué, l'attaquant
  // passerait au suivant sans jamais alimenter le compteur d'IP.
  const [emailAllowed, ipAllowed] = await Promise.all([
    runSharedRateLimit(
      `login:email:${normalizedEmail}`,
      MAX_LOGIN_ATTEMPTS_PER_EMAIL,
      AUTH_WINDOW_MS,
      "auth:rl",
    ),
    runSharedRateLimit(
      `login:ip:${ip}`,
      MAX_LOGIN_ATTEMPTS_PER_IP,
      AUTH_WINDOW_MS,
      "auth:rl",
    ),
  ]);

  return emailAllowed && ipAllowed;
}

/** Création de compte autorisée depuis cette IP ? */
export async function checkSignupRateLimit(ip: string): Promise<boolean> {
  return runSharedRateLimit(
    `signup:ip:${ip}`,
    MAX_SIGNUPS_PER_IP,
    AUTH_WINDOW_MS,
    "auth:rl",
  );
}

/** Extrait l'IP client depuis un jeu d'en-têtes déjà lu (contexte tRPC). */
export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
