import { Receiver } from "@upstash/qstash";
import { env } from "~/env";

export function hasQStashConfig(): boolean {
  return Boolean(env.QSTASH_TOKEN);
}

export function hasQStashSigningKeys(): boolean {
  return Boolean(env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY);
}

/**
 * ── EN PRODUCTION, PAS DE CLÉS = PAS DE ROUTE ───────────────────────────────
 *
 * Cette fonction exigeait `hasQStashConfig()`, c'est-à-dire la présence de
 * `QSTASH_TOKEN`. Le raisonnement se tenait — sans jeton, on n'enfile rien, donc
 * personne n'appelle ces routes — mais il faisait dépendre une **vérification de
 * signature** d'une variable qui ne la concerne pas.
 *
 * Conséquence : dans le mode dégradé que le README documente lui-même (jeton
 * absent, repli sur pg-boss), `createQStashReceiver()` renvoyait `null` et les
 * routes sautaient la vérification **entièrement**. Elles restaient pourtant
 * publiquement joignables : n'importe qui pouvait poster un `messageOutId` et
 * déclencher l'envoi du message correspondant.
 *
 * La règle ne regarde plus que ce qu'elle protège : en production, ces routes
 * exigent des clés de signature. Sans elles, elles répondent 503 — ce qui est
 * l'état correct, puisque rien de légitime ne les appelle dans ce cas.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function isQStashMisconfiguredForHttpRoute(): boolean {
  return env.NODE_ENV === "production" && !hasQStashSigningKeys();
}

export function createQStashReceiver(): Receiver | null {
  if (!hasQStashSigningKeys()) return null;
  return new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY!,
  });
}
