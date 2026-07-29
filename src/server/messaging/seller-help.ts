/**
 * Reconnaissance de la demande d'aide d'un numéro déclaré.
 *
 * Pourquoi côté messagerie : pendant un live, le tableau de bord n'est pas ouvert —
 * le téléphone sert à filmer. La seule aide atteignable est celle qui répond dans la
 * conversation WhatsApp.
 *
 * ── LE MOTIF EST VOLONTAIREMENT ÉTROIT ──────────────────────────────────────
 * Seul un message qui ne contient *que* la demande déclenche l'aide. « aide » suffit,
 * « il me faut de l'aide pour A12 » non — ce dernier ressemble trop à une intention
 * de création pour être détourné. Un motif large aurait avalé des messages utiles, et
 * un code annoncé en live perdu coûte une vente.
 *
 * Le point d'interrogation seul est inclus : c'est ce qu'on envoie quand on ne sait
 * même pas quoi demander.
 * ────────────────────────────────────────────────────────────────────────────
 */

const SELLER_HELP_PATTERN = /^(?:aide|help|\?|aide\s*\?)$/i;

/** Le message est-il une demande d'aide, et rien d'autre ? */
export function isSellerHelpRequest(body: string): boolean {
  return SELLER_HELP_PATTERN.test(body.trim());
}
