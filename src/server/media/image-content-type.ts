/**
 * Types d'image acceptés à l'entrée comme à la sortie du stockage R2.
 *
 * ── POURQUOI CE FICHIER EXISTE ───────────────────────────────────────────────
 *
 * La liste vivait en dur dans `uploadMediaToCatalogueItem`, et nulle part
 * ailleurs. `uploadMediaToLiveItem`, écrit sur le même modèle, ne la portait
 * pas : il stockait le `content-type` renvoyé par Meta tel quel, sans plafond
 * de taille. Or `/api/media` sert les deux préfixes, sans authentification, en
 * réémettant le type stocké — une vendeuse envoyant un document HTML pendant un
 * live déposait donc du script exécutable sur l'origine de l'application.
 *
 * Deux fonctions jumelles qui divergent, c'est le défaut lui-même. La règle est
 * ici, en un seul endroit, et les trois chemins la lisent.
 *
 * `svg+xml` est **volontairement absent** : un SVG est un document, il exécute
 * du script, et le servir depuis notre origine reviendrait à rouvrir la faille
 * qu'on ferme. WhatsApp ne produit de toute façon pas de SVG.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

/** Plafond de taille d'un média stocké (10 Mo). */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

/**
 * Le type est-il une image que l'on accepte de stocker et de resservir ?
 *
 * Compare sur le type seul : un en-tête vaut souvent `image/jpeg; charset=...`,
 * et le paramètre ne change pas la nature du contenu.
 */
export function isAllowedImageContentType(
  contentType: string | null | undefined,
): boolean {
  if (!contentType) return false;
  const bare = contentType.split(";")[0]?.trim().toLowerCase();
  if (!bare) return false;
  return (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(bare);
}

/**
 * Normalise un type validé vers sa forme canonique, sans paramètres.
 *
 * Ce qui part au navigateur ne doit rien porter d'autre que le type lui-même :
 * les paramètres viennent d'un tiers et n'ont aucune raison d'être réémis.
 */
export function canonicalImageContentType(contentType: string): string {
  return contentType.split(";")[0]!.trim().toLowerCase();
}
