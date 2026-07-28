/**
 * Traduction des erreurs serveur en messages lisibles par une vendeuse.
 *
 * Objectif : plus aucun texte anglais, plus aucun identifiant interne, plus aucun
 * message d'erreur de Meta ne doit atteindre l'écran. Tout passe par `formatError()`.
 *
 * Forme d'un message (DESIGN.md § Erreurs) : ce qui s'est passé, pourquoi si connu,
 * comment continuer.
 */

import { errorCopy } from "./glossary";

export type UserError = {
  /** Ce qui s'est passé. Toujours présent. */
  title: string;
  /** Pourquoi, quand c'est connu et utile. */
  detail?: string;
  /** Comment continuer. */
  action?: { label: string; href: string };
};

export type ErrorContext =
  | "whatsapp"
  | "pricing"
  | "delivery"
  | "catalogue"
  | "orders"
  | "proofs"
  | "live"
  | "team"
  | "subscription"
  | "auth"
  | "generic";

/**
 * Motifs qui trahissent une fuite technique. Un message serveur qui en contient un
 * n'est jamais affiché tel quel, même s'il est en français.
 */
const LEAK_PATTERNS = [
  /internal server error/i,
  /\btenantId\b/,
  /\bcorrelationId\b/,
  /\bliveItemId\b/,
  /\bcatalogueItemId\b/,
  /\bWABA\b/,
  /Phone Number ID/i,
  /Access Token/i,
  /NEXT_PUBLIC_/,
  /\bprisma\b/i,
  /\bP20\d\d\b/,
  /\bundefined\b|\bnull\b/,
  /\bfetch failed\b/i,
  /\bECONNREFUSED\b|\bETIMEDOUT\b/,
  /<[a-z][\s\S]*>/i, // du HTML dans un message d'erreur
  /`/, // un backtick signale une citation de code
  /\w\(\)/, // un appel de fonction, ex. findUnique()
];

const MAX_PASSTHROUGH_LENGTH = 200;

/** Un message serveur est-il présentable tel quel ? */
function isPresentable(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > MAX_PASSTHROUGH_LENGTH) return false;
  return !LEAK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Message générique par contexte, dernier recours. */
function genericFor(ctx: ErrorContext): UserError {
  switch (ctx) {
    case "whatsapp":
      return {
        title: "La connexion WhatsApp n’a pas abouti",
        detail: "Réessayez dans quelques minutes.",
      };
    case "pricing":
      return { title: "Les prix n’ont pas pu être enregistrés", detail: "Réessayez." };
    case "delivery":
      return {
        title: "Les frais de livraison n’ont pas pu être enregistrés",
        detail: "Réessayez.",
      };
    case "catalogue":
      return { title: "L’article n’a pas pu être enregistré", detail: "Réessayez." };
    case "orders":
      return { title: "La commande n’a pas pu être mise à jour", detail: "Réessayez." };
    case "proofs":
      return { title: "La preuve n’a pas pu être traitée", detail: "Réessayez." };
    case "live":
      return { title: "L’action sur le live n’a pas abouti", detail: "Réessayez." };
    case "team":
      return { title: "L’équipe n’a pas pu être mise à jour", detail: "Réessayez." };
    case "subscription":
      return { title: "L’abonnement n’a pas pu être mis à jour", detail: "Réessayez." };
    case "auth":
      return {
        title: "La connexion n’a pas abouti",
        detail: "Vérifiez votre adresse e-mail et votre mot de passe.",
      };
    default:
      return {
        title: "Une erreur est survenue",
        detail: "Réessayez dans un instant.",
      };
  }
}

/** Message générique dérivé du code tRPC, quand il est plus précis que le contexte. */
function fromTrpcCode(code: string, ctx: ErrorContext): UserError | null {
  switch (code) {
    case "UNAUTHORIZED":
      return errorCopy["session.expired"] ?? null;
    case "FORBIDDEN":
      return errorCopy["session.forbidden"] ?? null;
    case "TOO_MANY_REQUESTS":
      return errorCopy["session.rateLimited"] ?? null;
    case "NOT_FOUND":
      return {
        title: "Introuvable",
        detail: "Cet élément a peut-être été supprimé. Rafraîchissez la page.",
      };
    case "TIMEOUT":
    case "BAD_GATEWAY":
    case "SERVICE_UNAVAILABLE":
      return {
        title: "Le service ne répond pas",
        detail: "Réessayez dans quelques minutes.",
      };
    case "INTERNAL_SERVER_ERROR":
      return genericFor(ctx);
    default:
      return null;
  }
}

/** Libellés français des champs, pour les erreurs de validation Zod. */
const FIELD_LABELS: Record<string, string> = {
  name: "Le nom",
  code: "Le code",
  email: "L’adresse e-mail",
  password: "Le mot de passe",
  phone: "Le numéro de téléphone",
  amount: "Le prix",
  price: "Le prix",
  quantity: "La quantité",
  categoryLetter: "La catégorie",
  description: "La description",
  communes: "Les communes",
  zoneName: "Le nom de la zone",
};

type TrpcLikeError = {
  message?: unknown;
  data?: {
    code?: unknown;
    userKey?: unknown;
    zodError?: {
      formErrors?: unknown;
      fieldErrors?: Record<string, unknown>;
    } | null;
  } | null;
  shape?: { data?: { code?: unknown; userKey?: unknown } | null } | null;
};

function readZodError(err: TrpcLikeError): UserError | null {
  const zod = err.data?.zodError;
  if (!zod) return null;

  const fieldErrors = zod.fieldErrors ?? {};
  const firstField = Object.keys(fieldErrors)[0];
  if (firstField) {
    const messages = fieldErrors[firstField];
    const first = Array.isArray(messages) ? messages[0] : undefined;
    const label = FIELD_LABELS[firstField] ?? "Ce champ";
    return {
      title: "Vérifiez votre saisie",
      detail:
        typeof first === "string" && isPresentable(first)
          ? `${label} : ${first.charAt(0).toLowerCase()}${first.slice(1)}`
          : `${label} n’est pas valide.`,
    };
  }

  const formErrors = zod.formErrors;
  const firstForm = Array.isArray(formErrors) ? formErrors[0] : undefined;
  if (typeof firstForm === "string" && isPresentable(firstForm)) {
    return { title: "Vérifiez votre saisie", detail: firstForm };
  }

  return { title: "Vérifiez votre saisie" };
}

/**
 * Convertit n'importe quelle erreur en message affichable.
 *
 * Ordre de résolution :
 *   1. `data.userKey` — liste blanche explicite, posée par `appError()` côté serveur.
 *   2. `data.zodError` — erreurs de validation, mappées sur des libellés français.
 *   3. Message serveur, uniquement s'il ne contient aucune fuite technique (transitoire :
 *      disparaîtra quand chaque `throw` portera un `userKey`).
 *   4. Générique dérivé du code tRPC, puis du contexte.
 *
 * @param err Erreur tRPC, Error, ou n'importe quoi d'autre.
 * @param ctx Domaine appelant — choisit le générique et le lien de récupération.
 */
export function formatError(err: unknown, ctx: ErrorContext = "generic"): UserError {
  if (err == null) return genericFor(ctx);

  const candidate = err as TrpcLikeError;

  // 1. Liste blanche par userKey.
  const userKey = candidate.data?.userKey ?? candidate.shape?.data?.userKey;
  if (typeof userKey === "string") {
    const known = errorCopy[userKey];
    if (known) return known;
  }

  // 2. Validation.
  const zodError = readZodError(candidate);
  if (zodError) return zodError;

  const code =
    typeof candidate.data?.code === "string"
      ? candidate.data.code
      : typeof candidate.shape?.data?.code === "string"
        ? candidate.shape.data.code
        : null;

  // 3. Message serveur, sous liste noire.
  const message = typeof candidate.message === "string" ? candidate.message : null;
  if (message && isPresentable(message)) {
    // Les codes de session/quota ont un message d'accompagnement plus utile.
    const coded = code ? fromTrpcCode(code, ctx) : null;
    return { title: message, ...(coded?.action ? { action: coded.action } : {}) };
  }

  // 4. Générique.
  if (code) {
    const coded = fromTrpcCode(code, ctx);
    if (coded) return coded;
  }
  return genericFor(ctx);
}

/** Raccourci pour les endroits qui n'affichent qu'une seule ligne. */
export function formatErrorText(err: unknown, ctx: ErrorContext = "generic"): string {
  const { title, detail } = formatError(err, ctx);
  return detail ? `${title}. ${detail}` : title;
}
