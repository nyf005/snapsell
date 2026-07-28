/**
 * Traduction des termes techniques et des énumérations externes vers le français métier.
 *
 * Règle : aucun identifiant Meta, aucun nom d'infrastructure et aucune énumération brute
 * ne doit atteindre l'écran d'une vendeuse. Tout ce qui vient de Meta ou de la base passe
 * par ce module.
 *
 * Vocabulaire canonique :
 *   tenant / workspace  → « votre boutique »   (cf. vocabulary.ts)
 *   WABA                → « compte WhatsApp Business »
 *   R2, bucket, webhook → jamais affichés
 *   template            → « modèle de message »
 */

/** Statut d'un modèle de message renvoyé par Meta (APPROVED / PENDING / REJECTED). */
export function templateStatusLabel(status: string | null | undefined): string {
  switch (status?.toUpperCase()) {
    case "APPROVED":
      return "Approuvé";
    case "PENDING":
      return "En attente de Meta";
    case "REJECTED":
      return "Refusé par Meta";
    case "PAUSED":
      return "Suspendu par Meta";
    case "DISABLED":
      return "Désactivé";
    default:
      return "Statut inconnu";
  }
}

/** Catégorie d'un modèle de message Meta (UTILITY / MARKETING / AUTHENTICATION). */
export function templateCategoryLabel(category: string | null | undefined): string {
  switch (category?.toUpperCase()) {
    case "UTILITY":
      return "Service";
    case "MARKETING":
      return "Promotion";
    case "AUTHENTICATION":
      return "Authentification";
    default:
      return "Autre";
  }
}

/** Rôle d'un membre de l'équipe. */
export function roleLabel(role: string | null | undefined): string {
  switch (role?.toUpperCase()) {
    case "OWNER":
      return "Propriétaire";
    case "MANAGER":
      return "Manager";
    case "VENDEUR":
      // La fonction, pas le titre : « Vendeur » est le seul rôle non épicène.
      return "Vente";
    case "AGENT":
      return "Agent";
    case "OPS":
      return "Équipe SnapSell";
    default:
      return "Membre";
  }
}

/** Description de ce que chaque rôle peut faire, pour la page Équipe. */
export function roleDescription(role: string | null | undefined): string {
  switch (role?.toUpperCase()) {
    case "OWNER":
      return "Accès complet, y compris les prix, l’équipe et l’abonnement.";
    case "MANAGER":
      return "Accès complet à la configuration et aux ventes.";
    case "VENDEUR":
      return "Pilote les ventes pendant le live. Ne voit pas les paramètres.";
    case "AGENT":
      return "Traite les commandes et les preuves. Ne voit pas les paramètres.";
    default:
      return "";
  }
}

/**
 * Repli français pour un type d'événement inconnu du journal d'activité.
 * Transforme `deposit_proof_received` en « Deposit proof received » plutôt que
 * de laisser le snake_case brut à l'écran.
 */
export function humanizeEventType(eventType: string): string {
  const spaced = eventType.replace(/[_.]+/g, " ").trim();
  if (spaced.length === 0) return "Événement";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
