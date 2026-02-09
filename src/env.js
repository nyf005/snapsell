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
    // URL exacte du webhook (celle configurée dans Twilio). Si définie, utilisée pour la vérification de signature.
    WEBHOOK_PUBLIC_URL: z.string().url().optional(),
    // Outbox worker (Story 2.4) - optionnel, valeurs par défaut en code
    OUTBOX_MAX_RETRIES: z.coerce.number().int().min(1).max(20).optional(),
    OUTBOX_BACKOFF_MAX_MS: z.coerce.number().int().min(1000).optional(),
    // Live session auto close (Story 2.6) - fenêtre inactivité en minutes, MVP 30–60
    LIVE_SESSION_INACTIVITY_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).optional(),
    // Reservation TTL (Story 4.3) - durée en minutes avant expiration (5–15), défaut 10
    RESERVATION_TTL_MINUTES: z.coerce.number().int().min(5).max(15).optional(),
    // Story 4.5: TTL soft (sans acompte) vs locked (avec acompte) ; si seuls RESERVATION_TTL_* sont définis, locked = RESERVATION_TTL_MINUTES, soft = moitié
    RESERVATION_TTL_SOFT_MINUTES: z.coerce.number().int().min(1).max(60).optional(),
    RESERVATION_TTL_LOCKED_MINUTES: z.coerce.number().int().min(5).max(60).optional(),
    // Story 4.5: TTL pour envoyer la preuve d'acompte (15–30 min)
    DEPOSIT_TTL_MINUTES: z.coerce.number().int().min(5).max(120).optional(),
    // Webhook rate limiting (Story 2.1 complement) - par IP
    WEBHOOK_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).optional(),
    WEBHOOK_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).optional(),
    // Sentry (optionnel) - si défini, erreurs webhook/workers remontées
    SENTRY_DSN: z.string().url().optional(),
    // R2 (Cloudflare) for media storage (Story 3.4) - optional
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET_NAME: z.string().min(1).optional(),
    // Paystack (Story 7A.2)
    PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
    PAYSTACK_PUBLIC_KEY: z.string().min(1).optional(),
    PAYSTACK_PLAN_STARTER: z.string().min(1).optional(),
    PAYSTACK_PLAN_PRO: z.string().min(1).optional(),
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
    // Optional at build time (Vercel); valid URL when set (used for Paystack callback, links)
    NEXT_PUBLIC_APP_URL: z.union([z.string().url(), z.literal("")]).optional(),
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
    WEBHOOK_PUBLIC_URL: process.env.WEBHOOK_PUBLIC_URL,
    OUTBOX_MAX_RETRIES: process.env.OUTBOX_MAX_RETRIES,
    OUTBOX_BACKOFF_MAX_MS: process.env.OUTBOX_BACKOFF_MAX_MS,
    LIVE_SESSION_INACTIVITY_WINDOW_MINUTES: process.env.LIVE_SESSION_INACTIVITY_WINDOW_MINUTES,
    RESERVATION_TTL_MINUTES: process.env.RESERVATION_TTL_MINUTES,
    RESERVATION_TTL_SOFT_MINUTES: process.env.RESERVATION_TTL_SOFT_MINUTES,
    RESERVATION_TTL_LOCKED_MINUTES: process.env.RESERVATION_TTL_LOCKED_MINUTES,
    DEPOSIT_TTL_MINUTES: process.env.DEPOSIT_TTL_MINUTES,
    WEBHOOK_RATE_LIMIT_MAX: process.env.WEBHOOK_RATE_LIMIT_MAX,
    WEBHOOK_RATE_LIMIT_WINDOW_MS: process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS,
    SENTRY_DSN: process.env.SENTRY_DSN,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY,
    PAYSTACK_PLAN_STARTER: process.env.PAYSTACK_PLAN_STARTER,
    PAYSTACK_PLAN_PRO: process.env.PAYSTACK_PLAN_PRO,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_TOKEN: process.env.REDIS_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
