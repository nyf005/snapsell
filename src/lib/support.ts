/**
 * Lien de contact du support.
 *
 * Le canal est WhatsApp, et ce n'est pas un choix esthétique : les vendeuses
 * vivent dedans. Un e-mail ou un formulaire de ticket ne serait pas utilisé.
 *
 * Ce qui compte n'est pas le lien mais **ce qu'il pré-remplit**. Une vendeuse
 * qui écrit est en plein live, sur son téléphone, et n'écrira pas un rapport :
 * elle écrira « ça marche pas ». Le contexte doit donc voyager tout seul, sinon
 * le support commence par trois allers-retours pour savoir de quoi on parle.
 */

/** Ce qu'on sait de la situation au moment où la vendeuse demande de l'aide. */
export type SupportContext = {
  /** Nom de la boutique, pour la retrouver dans la console interne. */
  shopName?: string | null;
  /** Écran d'où part la demande (chemin), pour situer sans deviner. */
  screen?: string | null;
  /**
   * Référence d'erreur, quand la demande part d'un échec.
   *
   * C'est la pièce qui change tout : elle retrouve la trace complète dans les
   * journaux et dans Sentry, où elle est posée en étiquette.
   */
  reference?: string | null;
};

/**
 * Compose le message pré-rempli.
 *
 * Laissé volontairement court et en français courant : il s'affiche dans la
 * zone de saisie WhatsApp de la vendeuse, qui doit pouvoir écrire à la suite
 * sans avoir à effacer un pavé technique.
 */
export function buildSupportMessage(context: SupportContext = {}): string {
  const lines = ["Bonjour, j'ai besoin d'aide sur SnapSell."];

  if (context.shopName) lines.push(`Boutique : ${context.shopName}`);
  if (context.screen) lines.push(`Page : ${context.screen}`);
  if (context.reference) lines.push(`Référence : ${context.reference}`);

  lines.push("", "Ce qui se passe :");
  return lines.join("\n");
}

/**
 * Construit la destination du bouton d'aide.
 *
 * Sans numéro configuré, on renvoie vers le centre d'aide plutôt que vers un
 * lien mort : une vendeuse bloquée ne doit jamais tomber dans le vide.
 */
export function buildSupportHref(
  supportNumber: string | undefined,
  context: SupportContext = {},
): string {
  if (!supportNumber) return "/aide";

  const text = encodeURIComponent(buildSupportMessage(context));
  return `https://wa.me/${supportNumber}?text=${text}`;
}

/** Vrai quand le lien ouvre une conversation, faux quand il renvoie à l'aide. */
export function isDirectSupport(supportNumber: string | undefined): boolean {
  return !!supportNumber;
}
