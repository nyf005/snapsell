import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    /**
     * Rôle de ce processus vis-à-vis de pg-boss.
     *
     * `worker` (Railway) : consomme les jobs et porte toute la maintenance —
     * migration du schéma pg-boss, supervision, planification des crons. Exige
     * la connexion Neon **directe** (non-pooler) : ces tâches s'appuient sur
     * des verrous et un état de session que PgBouncer ne préserve pas.
     *
     * `producer` (Vercel, défaut) : se contente de publier des jobs. Aucune
     * maintenance, donc compatible avec l'URL pooler, et bien moins de
     * connexions ouvertes par instance serverless.
     */
    PG_BOSS_ROLE: z.enum(["worker", "producer"]).default("producer"),
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
    // URL publique du webhook (optionnelle, pour logs/rate limiting)
    WEBHOOK_PUBLIC_URL: z.string().url().optional(),
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
    // Upstash Redis — rate limiting tRPC (optionnel : si absent, rate limiting désactivé)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    // Chiffrement at-rest (metaAccessToken et autres secrets sensibles)
    // Générer avec: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ENCRYPTION_KEY: z
      .string()
      .length(64, "ENCRYPTION_KEY doit être une chaîne hex de 64 caractères")
      .optional()
      .refine(
        (val) =>
          process.env.NODE_ENV !== "production" ||
          (typeof val === "string" && val.length === 64),
        { message: "ENCRYPTION_KEY est requis en production" },
      ),
    // QStash (Upstash) — outbox sender serverless (Option A)
    // En prod: QSTASH_TOKEN requis. QSTASH_*_SIGNING_KEY pour vérification de signature.
    QSTASH_TOKEN: z.string().min(1).optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
    // Secret partagé pour sécuriser les routes Vercel Cron (header Authorization: Bearer <CRON_SECRET>)
    CRON_SECRET: z
      .string()
      .min(1)
      .optional()
      .refine(
        (val) =>
          process.env.NODE_ENV !== "production" ||
          (typeof val === "string" && val.length > 0),
        { message: "CRON_SECRET is required in production" },
      ),
    // Meta WhatsApp Cloud API (Story 10.1)
    META_APP_ID: z.string().min(1).optional(),
    META_APP_SECRET: z.string().min(1).optional(),
    META_VERIFY_TOKEN: z.string().min(1).optional(),
    // AI Configuration (Gemma 4 integration)
    AI_API_KEY: z.string().min(1).optional(),
    AI_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
    AI_MODEL_NAME: z.string().default("llama-3.1-8b-instant"),
    // WhatsApp Business — synchro catalogue Meta Commerce Manager (Starter/Pro)
    META_CATALOG_SYNC_ENABLED: z.enum(["true", "false"]).optional(),
    // Image placeholder pour articles sans photo (URL publique permanente, ex. CDN)
    CATALOGUE_PLACEHOLDER_IMAGE_URL: z.string().url().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // Optional at build time (Vercel). Accept any string so build never fails; app uses fallbacks (url.origin / localhost).
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_META_APP_ID: z.string().optional(),
    NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().optional(),
    NEXT_PUBLIC_META_EMBEDDED_SIGNUP_ENABLED: z.enum(["true", "false"]).optional(),
    /**
     * Numéro WhatsApp du support, au format international sans « + » ni espaces
     * (ex. 2250701020304) — c'est la forme attendue par les liens wa.me.
     *
     * Optionnel : tant qu'il est absent, le bouton d'aide renvoie vers le centre
     * d'aide au lieu d'ouvrir une conversation. Une vendeuse ne doit jamais
     * tomber sur un lien mort.
     */
    NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER: z
      .string()
      .regex(/^\d{8,15}$/, "Numéro international sans + ni espaces")
      .optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    PG_BOSS_ROLE: process.env.PG_BOSS_ROLE,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    WEBHOOK_PUBLIC_URL: process.env.WEBHOOK_PUBLIC_URL,
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
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_META_APP_ID: process.env.NEXT_PUBLIC_META_APP_ID,
    NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID:
      process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID,
    NEXT_PUBLIC_META_EMBEDDED_SIGNUP_ENABLED:
      process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_ENABLED,
    NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER:
      process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL_NAME: process.env.AI_MODEL_NAME,
    META_CATALOG_SYNC_ENABLED: process.env.META_CATALOG_SYNC_ENABLED,
    CATALOGUE_PLACEHOLDER_IMAGE_URL: process.env.CATALOGUE_PLACEHOLDER_IMAGE_URL,
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
