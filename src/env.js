import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AUTH_SECRET: z
      .string()
      .min(1, "AUTH_SECRET is required for NextAuth JWT signing")
      .optional()
      .refine(
        (val) =>
          process.env.NODE_ENV !== "production" ||
          (typeof val === "string" && val.length > 0),
        { message: "AUTH_SECRET is required in production" },
      ),
    // Twilio configuration
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_WEBHOOK_SECRET: z.string().min(1).optional(),
    TWILIO_WHATSAPP_NUMBER: z.string().min(1).optional(),
    // Outbox worker (Story 2.4) - optionnel, valeurs par défaut en code
    OUTBOX_MAX_RETRIES: z.coerce.number().int().min(1).max(20).optional(),
    OUTBOX_BACKOFF_MAX_MS: z.coerce.number().int().min(1000).optional(),
    // Live session auto close (Story 2.6) - fenêtre inactivité en minutes, MVP 30–60
    LIVE_SESSION_INACTIVITY_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).optional(),
    // Webhook rate limiting (Story 2.1 complement) - par IP
    WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).optional(),
    WEBHOOK_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).optional(),
    // Sentry (optionnel) - si défini, erreurs webhook/workers remontées
    SENTRY_DSN: z.string().url().optional(),
    // Redis/Upstash configuration
    REDIS_URL: z
      .string()
      .refine(
        (val) => !val || val.startsWith("redis://") || val.startsWith("rediss://"),
        { message: "REDIS_URL must start with redis:// or rediss://" },
      )
      .optional(),
    REDIS_TOKEN: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WEBHOOK_SECRET: process.env.TWILIO_WEBHOOK_SECRET,
    TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER,
    OUTBOX_MAX_RETRIES: process.env.OUTBOX_MAX_RETRIES,
    OUTBOX_BACKOFF_MAX_MS: process.env.OUTBOX_BACKOFF_MAX_MS,
    LIVE_SESSION_INACTIVITY_WINDOW_MINUTES: process.env.LIVE_SESSION_INACTIVITY_WINDOW_MINUTES,
    WEBHOOK_RATE_LIMIT_MAX: process.env.WEBHOOK_RATE_LIMIT_MAX,
    WEBHOOK_RATE_LIMIT_WINDOW_MS: process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS,
    SENTRY_DSN: process.env.SENTRY_DSN,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_TOKEN: process.env.REDIS_TOKEN,
    // NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
