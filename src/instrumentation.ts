/**
 * Point d'entrée d'instrumentation Next.js.
 *
 * Next appelle `register()` une fois au démarrage du serveur, avant toute
 * requête. C'est le seul endroit où initialiser Sentry pour le runtime Node de
 * Vercel : sans cela, `captureException` s'exécute sur un SDK sans client et
 * les erreurs du webhook Meta ne partent nulle part.
 *
 * Le worker Railway n'est pas une application Next : il initialise de son côté,
 * dans `scripts/start-worker.ts`.
 */
export async function register() {
  // Le runtime Edge n'exécute pas les workers ni le webhook Meta, et le SDK
  // Node n'y est pas chargeable.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initSentry } = await import("~/lib/sentry");
  await initSentry();
}
