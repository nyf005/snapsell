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

/**
 * Rôle d'un membre de l'équipe.
 *
 * Trois rôles de boutique, plus OPS pour la console interne. VENDEUR a été retiré
 * de l'enum Prisma : aucun contrôle de permission ne le distinguait d'AGENT. Le
 * repli « Membre » couvre donc aussi les jetons de session émis avant la migration.
 */
export function roleLabel(role: string | null | undefined): string {
  switch (role?.toUpperCase()) {
    case "OWNER":
      return "Propriétaire";
    case "MANAGER":
      return "Manager";
    case "AGENT":
      return "Agent";
    case "OPS":
      return "Équipe SnapSell";
    default:
      return "Membre";
  }
}

/**
 * Description de ce que chaque rôle peut faire, pour la page Équipe.
 *
 * Celle de l'Agent énumère ce qu'il fait, sans prétendre à une cloison. « Traite
 * les commandes et les preuves » se lisait comme une limite face au « Pilote les
 * ventes pendant le live » de l'ancien VENDEUR, alors que les deux rôles pouvaient
 * tout faire l'un de l'autre. La seule frontière réellement appliquée — les
 * réglages — reste énoncée.
 */
export function roleDescription(role: string | null | undefined): string {
  switch (role?.toUpperCase()) {
    case "OWNER":
      return "Accès complet, y compris les prix, l’équipe et l’abonnement.";
    case "MANAGER":
      return "Accès complet à la configuration et aux ventes.";
    case "AGENT":
      return "Tient le live, le catalogue, les commandes et les preuves. Ne voit pas les réglages.";
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
