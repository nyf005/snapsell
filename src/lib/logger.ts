/**
 * Logger structuré pour le webhook et les workers
 * En production, utiliser un système de logging structuré (ex: Sentry, Winston, Pino)
 * En développement, utiliser console avec format structuré
 */

import { maskPhone } from "~/lib/validations/phone";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

/**
 * ── LES NUMÉROS NE SORTENT PAS EN CLAIR ─────────────────────────────────────
 *
 * Vingt-quatre appels au logger passaient un numéro de cliente brut — le webhook,
 * l'outbox, l'adaptateur Meta, les preuves. Le projet masque pourtant déjà les
 * numéros à l'export CSV, et son architecture interdit la PII dans l'`event_log` :
 * seuls les journaux applicatifs y échappaient, alors qu'ils partent typiquement
 * vers un agrégateur tiers avec une rétention qui n'est pas celle de la base.
 *
 * Le masquage est fait **ici** plutôt que sur les vingt-quatre sites : un seul
 * endroit à tenir, et un nouvel appel est couvert sans que personne y pense.
 *
 * Deux filets, parce qu'aucun ne suffit seul :
 *   — par **clé**, pour les noms connus (`from`, `to`, `clientPhone`…) ;
 *   — par **forme**, pour toute chaîne strictement E.164, quelle que soit la clé.
 *     Le `+` initial est exigé : sans lui, un horodatage en millisecondes serait
 *     masqué et on perdrait un repère de diagnostic pour rien.
 * ────────────────────────────────────────────────────────────────────────────
 */
const PHONE_KEYS = new Set([
  "from",
  "to",
  "phone",
  "phoneNumber",
  "clientPhone",
  "clientPhoneE164",
  "sellerPhone",
  "recipient",
]);

/** Strictement E.164 : le `+` évite de masquer les nombres qui n'en sont pas. */
const E164_VALUE = /^\+[1-9]\d{7,14}$/;

/** Profondeur maximale, garde-fou contre une structure cyclique ou trop imbriquée. */
const MAX_DEPTH = 6;

function redact(value: unknown, key?: string, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[trop imbriqué]";

  if (typeof value === "string") {
    if ((key && PHONE_KEYS.has(key)) || E164_VALUE.test(value)) {
      return maskPhone(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, key, depth + 1));
  }

  if (value && typeof value === "object") {
    // Une Error ne survit pas à une copie clé par clé : on la laisse au sérialiseur.
    if (value instanceof Error) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k, depth + 1);
    }
    return out;
  }

  return value;
}

/** Contexte prêt à journaliser, numéros masqués. Exporté pour les tests. */
export function redactContext(context?: LogContext): LogContext | undefined {
  if (!context) return context;
  return redact(context) as LogContext;
}

function formatLog(level: LogLevel, component: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const safe = redactContext(context);
  const contextStr = safe ? ` ${JSON.stringify(safe)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}${contextStr}`;
}

export function createLogger(component: string) {
  return {
    debug: (message: string, context?: LogContext) => {
      if (process.env.NODE_ENV === "development") {
        console.log(formatLog("debug", component, message, context));
      }
    },

    info: (message: string, context?: LogContext) => {
      console.log(formatLog("info", component, message, context));
    },

    warn: (message: string, context?: LogContext) => {
      console.warn(formatLog("warn", component, message, context));
    },

    error: (message: string, error?: unknown, context?: LogContext) => {
      const errorContext = {
        ...context,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      console.error(formatLog("error", component, message, errorContext));
    },
  };
}

export const webhookLogger = createLogger("Webhook");
export const workerLogger = createLogger("Worker");
