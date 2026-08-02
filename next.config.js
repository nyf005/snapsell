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
 * Les domaines Meta autorisés plus bas ne sont pas décoratifs : l'inscription
 * WhatsApp intégrée cesse de fonctionner sans eux, et elle échoue en silence.
 * Voir la note sur `connect-src` / `frame-src`.
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
  /**
   * ── LE SDK FACEBOOK TOUCHE PLUS DE DOMAINES QUE `graph` ET `connect` ───────
   *
   * Cette liste ne contenait que `graph.facebook.com` et `connect.facebook.net`.
   * C'était trop étroit, et l'effet n'avait rien d'évident : le bouton
   * « Reconnecter » partait en chargement et n'en revenait jamais.
   *
   * Le SDK ne se contente pas d'ouvrir une popup. Il installe une iframe cachée
   * dite « XD Arbiter », servie depuis `staticxx.facebook.com`, qui est le canal
   * par lequel la popup renvoie son résultat à la page. Iframe bloquée par
   * `frame-src`, donc pas de canal, donc le callback de `FB.login()` n'est
   * jamais appelé — et la promesse qui l'attend ne se résout pas. Le bouton
   * restait désactivé indéfiniment, sans erreur ni trace visible.
   * Il interroge aussi `www.facebook.com` en XHR pour l'état de session, ce que
   * `connect-src` refusait.
   *
   * D'où le joker sur les sous-domaines : `staticxx` n'est pas documenté par
   * Meta comme faisant partie du contrat, et énumérer à la main ce qu'on ne
   * maîtrise pas nous ramènerait ici au prochain changement de leur
   * infrastructure. Le domaine reste celui de Meta, et le joker ne couvre pas
   * `facebook.com` nu — d'où sa présence explicite.
   * ──────────────────────────────────────────────────────────────────────────
   */
  "connect-src 'self' https://facebook.com https://*.facebook.com https://connect.facebook.net",
  "frame-src 'self' https://facebook.com https://*.facebook.com https://connect.facebook.net",
  "object-src 'none'",
  "base-uri 'self'",
  /**
   * ── LE SDK META SOUMET UN FORMULAIRE, IL NE FAIT PAS QUE REDIRIGER ─────────
   *
   * Cette directive valait `'self'` seul, au motif — écrit ici même — que les
   * redirections de paiement sont des navigations et non des soumissions de
   * formulaire. C'est exact pour Paystack, et c'est passé à côté du SDK Meta.
   *
   * Pour ouvrir son parcours d'inscription, le SDK **poste un formulaire** vers
   * `facebook.com/.../dialog/oauth`. `'self'` le refusait, sans erreur visible
   * et sans que rien ne se passe : ni fenêtre, ni navigation. C'est ce qui a
   * cassé l'inscription WhatsApp intégrée, qui fonctionnait auparavant en
   * pleine page.
   *
   * Vérifié en sondant la directive dans le navigateur : la soumission vers
   * `facebook.com` déclenchait bien une violation `form-action`.
   *
   * La restriction garde tout son sens pour le reste : elle empêche un
   * formulaire injecté dans nos pages d'expédier des données vers un domaine
   * arbitraire.
   * ──────────────────────────────────────────────────────────────────────────
   */
  "form-action 'self' https://facebook.com https://*.facebook.com",
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
