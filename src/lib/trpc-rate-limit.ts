/**
 * Rate limiting pour les appels tRPC via Upstash Redis.
 *
 * ── POURQUOI DEUX SEUILS, ET NON UN ──────────────────────────────────────────
 *
 * Il n'y en avait qu'un : 20 appels/minute par utilisateur. La docstring parlait
 * de « mutations », mais le middleware était monté sur `protectedProcedure`, donc
 * sur **toutes** les procédures, lectures comprises.
 *
 * Or l'écran du live interroge `live.getLiveOpsData` toutes les 5 secondes dès
 * qu'une réservation est active — 12 appels par minute à lui seul. Il suffisait
 * d'y ajouter une navigation, une libération de réservation ou un second onglet
 * pour franchir les 20 : la vendeuse recevait « Trop de requêtes » **pendant son
 * live**, c'est-à-dire au seul moment où le produit doit tenir.
 *
 * Rien ne le signalait avant la production : le limiteur est inerte en test
 * (`NODE_ENV === "test"`) et en développement, où Upstash n'est pas configuré.
 *
 * Les deux seuils séparent ce qui coûte de ce qui ne coûte pas. Une lecture est
 * une requête en base ; une mutation écrit, envoie un WhatsApp, consomme un
 * crédit. Le plafond de lecture existe donc contre une boucle emballée, pas
 * contre l'usage normal — il est calibré très au-dessus du sondage le plus
 * rapide de l'application, second onglet compris.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "~/env";

/** Écritures : envois WhatsApp, crédits consommés, stock modifié. */
export const MUTATION_LIMIT_PER_MINUTE = 30;

/**
 * Lectures. Le sondage du live vaut 12/min, celui du dashboard 1/min ; trois
 * onglets ouverts pendant une navigation soutenue restent loin du compte.
 */
export const QUERY_LIMIT_PER_MINUTE = 300;

export type TrpcCallKind = "query" | "mutation";

const limiters = new Map<TrpcCallKind, Ratelimit>();

function getRateLimiter(kind: TrpcCallKind): Ratelimit | null {
  if (env.NODE_ENV === "test") {
    return null;
  }

  const cached = limiters.get(kind);
  if (cached) return cached;

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      kind === "mutation" ? MUTATION_LIMIT_PER_MINUTE : QUERY_LIMIT_PER_MINUTE,
      "1 m",
    ),
    // Préfixes distincts : sans cela les deux compteurs partageraient une clé et
    // une rafale de lectures épuiserait le droit d'écrire.
    prefix: kind === "mutation" ? "trpc:rl:m" : "trpc:rl:q",
    analytics: false,
  });

  limiters.set(kind, limiter);
  return limiter;
}

/**
 * Vérifie le rate limit pour un userId.
 * Retourne true si la requête est autorisée, false si elle est bloquée.
 * Si Upstash n'est pas configuré, retourne toujours true.
 */
export async function checkTrpcRateLimit(
  userId: string,
  kind: TrpcCallKind = "mutation",
): Promise<boolean> {
  const limiter = getRateLimiter(kind);
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
