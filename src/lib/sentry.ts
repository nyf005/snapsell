/**
 * Envoi des erreurs vers Sentry (optionnel).
 * Si SENTRY_DSN n’est pas défini ou @sentry/nextjs n’est pas installé, no-op.
 * Utilisé par le webhook et les workers pour remonter les erreurs critiques.
 */
export async function captureException(
  error: unknown,
  context?: { correlationId?: string; tags?: Record<string, string> },
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || dsn === "") return;

  try {
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
