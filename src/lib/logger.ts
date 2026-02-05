/**
 * Logger structuré pour le webhook et les workers
 * En production, utiliser un système de logging structuré (ex: Sentry, Winston, Pino)
 * En développement, utiliser console avec format structuré
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function formatLog(level: LogLevel, component: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}${contextStr}`;
}

function createLogger(component: string) {
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
