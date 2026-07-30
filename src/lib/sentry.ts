/**
 * Remontée des erreurs vers Sentry (optionnelle).
 *
 * Deux points d'appel : le webhook Meta (Vercel) et le processeur de jobs
 * (Railway). Ce sont les deux chemins où personne ne regarde un écran — une
 * erreur qui n'est pas remontée ici n'est vue par personne.
 *
 * Sans `SENTRY_DSN`, tout est inerte : ni init, ni envoi.
 */

import { maskPhone } from "~/lib/validations/phone";

/**
 * Numéros au format E.164 apparaissant **dans** un texte.
 *
 * `redactContext` du logger ne couvre pas ce cas : son motif est ancré, il ne
 * reconnaît qu'une valeur entière. Or dans Sentry un numéro arrive au milieu
 * d'un message — « Failed to send to +2250701020304 » — où seul un motif non
 * ancré le retrouve.
 */
const E164_IN_TEXT = /\+[1-9]\d{7,14}/g;

/** Remplace tout numéro par sa forme masquée, en conservant le reste du texte. */
export function scrubPhones(text: string): string {
  return text.replace(E164_IN_TEXT, (match) => maskPhone(match));
}

/**
 * Champs d'un événement Sentry susceptibles de porter du texte libre.
 *
 * Structure minimale décrite ici plutôt qu'importée : le SDK n'est chargé que
 * dynamiquement, pour rester inerte quand `SENTRY_DSN` est absent.
 */
type ScrubbableEvent = {
  message?: string;
  exception?: { values?: { value?: string }[] };
};

/** Masque les numéros dans les champs texte, en place. */
function scrubEvent(event: ScrubbableEvent): void {
  if (typeof event.message === "string") event.message = scrubPhones(event.message);

  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === "string") value.value = scrubPhones(value.value);
  }
}

let initialized = false;

/**
 * Initialise Sentry. Idempotent : appelable depuis les deux runtimes sans risque.
 *
 * Rien n'était initialisé jusqu'ici — `captureException` était bien appelé, mais
 * sur un SDK sans client. Les erreurs n'allaient nulle part, et définir
 * `SENTRY_DSN` seul n'y aurait rien changé.
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      // On ne veut que les erreurs : le traçage consomme le quota sans rien
      // apporter ici, les deux chemins instrumentés étant déjà journalisés.
      tracesSampleRate: 0,
      // Ni adresse IP ni en-têtes de requête : ce service manipule les numéros
      // de téléphone de clientes, et Sentry n'a pas à en être un second dépôt.
      sendDefaultPii: false,
      beforeSend: (event) => {
        scrubEvent(event);
        return event;
      },
    });
    initialized = true;
  } catch {
    // Paquet absent ou init impossible : la remontée d'erreurs ne doit jamais
    // faire tomber ce qu'elle observe.
  }
}

export async function captureException(
  error: unknown,
  context?: { correlationId?: string; tags?: Record<string, string> },
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || dsn === "") return;

  try {
    await initSentry();
    const Sentry = await import("@sentry/nextjs");
    if (context?.correlationId) Sentry.setTag("correlationId", context.correlationId);
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) Sentry.setTag(k, v);
    }
    Sentry.captureException(error);
  } catch {
    // @sentry/nextjs non installé ou erreur d'init : ignorer
  }
}
