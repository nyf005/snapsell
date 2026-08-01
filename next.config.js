/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

const isProd = process.env.NODE_ENV === "production";

/**
 * ── POURQUOI CES EN-TÊTES ────────────────────────────────────────────────────
 *
 * Il n'y en avait aucun. Le dashboard entier était donc encadrable : une page
 * tierce pouvait superposer un leurre au-dessus de « Approuver la preuve » ou
 * « Annuler l'abonnement » et récolter le clic. `frame-ancestors` ferme ça, et
 * `X-Frame-Options` couvre les navigateurs qui ne lisent pas la CSP.
 *
 * `script-src` garde `unsafe-inline` — et c'est un choix, pas un oubli. Le
 * script d'amorçage du thème (`layout.tsx`) et ceux de Next sont en ligne ;
 * les interdire demanderait des nonces, donc un middleware qui n'existe pas et
 * qui s'exécuterait sur chaque requête. La directive reste utile telle quelle :
 * elle interdit le chargement de code depuis un domaine arbitraire, qui est le
 * second temps de la plupart des chaînes XSS.
 *
 * La vraie défense contre le média piégé n'est pas ici mais sur la réponse
 * elle-même — cf. la CSP `sandbox` de `/api/media`.
 *
 * `connect.facebook.net` et `www.facebook.com` sont requis par l'inscription
 * WhatsApp intégrée (`meta-embedded-signup-sdk.ts` : script + iframe + popup).
 * Les retirer casse la connexion d'un compte Meta.
 * ────────────────────────────────────────────────────────────────────────────
 */
const csp = [
  "default-src 'self'",
  // `unsafe-eval` : exigé par le rafraîchissement à chaud de React. Jamais en production.
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://connect.facebook.net`,
  // Tailwind injecte des styles en ligne.
  "style-src 'self' 'unsafe-inline'",
  // `data:` et `blob:` : aperçus d'image avant envoi. `https:` : médias R2 servis via le proxy.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://graph.facebook.com https://connect.facebook.net",
  // Le SDK Meta ouvre son parcours d'inscription dans une iframe facebook.com.
  "frame-src 'self' https://www.facebook.com https://connect.facebook.net",
  "object-src 'none'",
  "base-uri 'self'",
  // Les redirections de paiement sont des navigations, pas des soumissions de
  // formulaire : les restreindre à l'origine ne gêne pas le retour Paystack.
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Uniquement en production : posé en développement, il épinglerait localhost
  // en HTTPS dans le navigateur et rendrait `npm run dev` inaccessible.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
      ]
    : []),
];

/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: [
    "@opentelemetry/instrumentation",
    "@sentry/node",
    "@sentry/node-core",
    "@sentry/nextjs",
    "require-in-the-middle",
  ],
  async headers() {
    return [
      {
        // Tout sauf les médias : `/api/media` pose ses propres en-têtes, bien
        // plus stricts, et Next conserve ceux de la route quand elle les définit.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default config;
