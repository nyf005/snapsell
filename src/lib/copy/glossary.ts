/**
 * Registre centralisé des chaînes de l'interface vendeur.
 *
 * Jumeau web de `src/server/messaging/templates.ts` (`botMsg`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RÈGLE DE REGISTRE — à respecter dans tout nouveau texte :
 *
 *   • Le bot dit **tu** à la personne qui achète  → src/server/messaging/templates.ts
 *     Chaleureux, court, une seule prochaine étape.
 *
 *   • L'application web dit **vous** à la boutique → ce fichier
 *     Professionnel, direct, sans jargon technique ni ton infantilisant.
 *
 * Les deux registres sont délibérés. Ne pas les mélanger.
 * ────────────────────────────────────────────────────────────────────────────
 * RÈGLE DE GENRE — les textes ne genrent pas les personnes.
 *
 * Par reformulation, jamais par point médian (`client·e` est proscrit).
 *
 * Genre grammatical n'est pas genre social : « une personne », « la clientèle »,
 * « un numéro », « une boutique » portent un genre fixe qui ne dit rien de l'humain
 * désigné. La règle n'est donc pas d'éviter le féminin, mais d'éviter :
 *   1. les mots dont le genre est **choisi pour coller à quelqu'un**
 *      (« la vendeuse », « une cliente ») ;
 *   2. les participes qui **s'accordent avec `vous`**
 *      (« Vous êtes connecté », « Vous serez notifiée »).
 *
 * Six sorties, par ordre de préférence :
 *   supprimer le nom      « ceux de la vendeuse »  → « les vôtres »
 *   remplacer par l'objet « vos clientes »         → « votre clientèle »
 *   passif → actif        « Vous serez notifiée »  → « Je te préviens »
 *   nominaliser           « Vous êtes connecté »   → « Connexion active »
 *   participe invariable  « Vous avez été invité » → « Vous avez reçu une invitation »
 *   épicènes              personne, contact, membre, responsable, équipe, clientèle
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Vocabulaire canonique : voir `vocabulary.ts`, qui fait autorité, et DESIGN.md
 * § « Vocabulaire du produit ». Rappels les plus utilisés :
 *   monnaie          → « FCFA » (jamais FCA, jamais euros)      cf. format.ts
 *   unité de crédit  → « conversation client »                   cf. vocabulary.ts
 *   tenant/workspace → « votre boutique »                        cf. terms.ts
 */

export const ui = {
  /** Unité de facturation — définie une seule fois pour tout le produit. */
  credits: {
    unit: "conversation client",
    unitPlural: "conversations client",
    definition:
      "Une conversation client = 24 h d’échanges illimités avec un même numéro sur WhatsApp.",
    lowTitle: "Vos conversations client sont presque épuisées",
    lowDetail:
      "Quand le solde atteint zéro, l’assistant cesse de répondre aux nouvelles conversations.",
    renewalLabel: "Renouvellement le",
  },

  /** Parcours de mise en route. */
  setup: {
    title: "Mettez votre boutique en route",
    subtitle:
      "Ces étapes conditionnent le fonctionnement de l’assistant. Vous pouvez les faire dans l’ordre qui vous arrange.",
    progress: (done: number, total: number) =>
      done > 1
        ? `${done} étapes sur ${total} terminées`
        : `${done} étape sur ${total} terminée`,
    remaining: (n: number) =>
      n > 1 ? `${n} étapes restantes` : "1 étape restante",
    allDone: "Votre boutique est prête",

    whatsapp: {
      title: "Connecter WhatsApp",
      description:
        "Sans cette étape, personne ne peut vous écrire et rien ne fonctionne.",
      action: "Connecter WhatsApp",
    },
    prices: {
      title: "Définir vos prix",
      description:
        "Le début du code d’un article détermine son prix. Par exemple, A12 prend le prix de la catégorie A.",
      action: "Définir les prix",
    },
    delivery: {
      title: "Définir vos frais de livraison",
      description:
        "L’assistant ajoute automatiquement ces frais au total annoncé sur WhatsApp.",
      action: "Définir la livraison",
    },
    replies: {
      title: "Préparer vos réponses automatiques",
      description:
        "Livraison, paiement, adresse, disponibilité : l’assistant répond à votre place.",
      action: "Écrire les réponses",
    },
    sellerPhone: {
      title: "Déclarer votre numéro",
      description:
        "Vos propres messages sont ainsi reconnus comme les vôtres, pas comme une demande d’achat.",
      action: "Ajouter mon numéro",
    },
    firstSale: {
      title: "Faire votre première vente",
      description:
        "Annoncez un code pendant un live, ou préparez d’abord un catalogue d’articles réutilisables.",
      actionLive: "Ouvrir le live",
      actionCatalogue: "Ouvrir le catalogue",
    },
  },

  /** Bandeau affiché quand WhatsApp n'est pas connecté. */
  notConnected: {
    title: "WhatsApp n’est pas connecté",
    detail:
      "Votre clientèle ne peut pas encore vous écrire. Vous pouvez continuer à préparer votre boutique.",
    action: "Connecter WhatsApp",
  },

  /** Connexion WhatsApp. */
  whatsapp: {
    connectedTitle: "WhatsApp est connecté",
    disconnectedTitle: "WhatsApp n’est pas connecté",
    connectedDetail: (phone: string) =>
      `Votre clientèle vous écrit au ${phone}.`,
    disconnectedDetail:
      "Connectez le numéro qui recevra les codes envoyés sur WhatsApp et enverra les confirmations.",
    connect: "Connecter WhatsApp",
    reconnect: "Reconnecter",
    test: "Tester la connexion",
    testOk: "La connexion fonctionne.",
    advanced: "Configuration avancée",
    advancedHint:
      "Réservé au dépannage. En temps normal, le bouton de connexion suffit.",
    sellerPhonesTitle: "Vos numéros",
    sellerPhonesDetail:
      "Les messages venant de ces numéros sont reconnus comme les vôtres, pas comme une demande d’achat.",
    sellerPhonesEmpty: "Vous n’avez pas encore déclaré de numéro.",
    phoneFormatHint: "Avec l’indicatif du pays, par exemple +225 07 01 02 03 04.",
  },

  /** Prix et codes. */
  pricing: {
    rule:
      "Le prix d’un article vient de la catégorie qui commence son code. A12 prend le prix de la catégorie A ; Premium3 celui de la catégorie Premium.",
    testTitle: "Tester un code",
    testHint: "Tapez un code pour voir le prix qui sera annoncé sur WhatsApp.",
    noMatch: (code: string, categories: string[]) =>
      categories.length > 0
        ? `Aucune catégorie ne correspond au début de « ${code} ». Vos catégories : ${categories.join(", ")}.`
        : `Vous n’avez pas encore de catégorie de prix.`,
    emptyGrid: "Vous n’avez pas encore de catégorie de prix.",
  },

  /** Livraison. */
  delivery: {
    precedence:
      "Si une commune a son propre prix, ce prix l’emporte sur celui de sa zone.",
    duplicateWarning: (commune: string, communePrice: string, zonePrice: string) =>
      `${commune} : le prix par commune (${communePrice}) est appliqué, pas le prix de zone (${zonePrice}).`,
  },

  /** Accès refusé sur les pages de paramètres. */
  accessDenied: {
    title: "Page réservée",
    detail:
      "Seuls le propriétaire et les managers peuvent modifier ces réglages. Demandez à la personne qui gère la boutique.",
    action: "Retour à l’accueil",
  },

  /** Retours d'action génériques. */
  feedback: {
    saved: "Enregistré.",
    deleted: "Supprimé.",
    sent: "Envoyé.",
    copied: "Copié.",
  },
} as const;

/**
 * Messages d'erreur adressés à la personne qui vend, indexés par `userKey`.
 *
 * C'est la liste blanche de `formatError()` : une erreur serveur ne peut afficher
 * un texte que si sa clé figure ici. Tout le reste tombe sur un message générique.
 *
 * Convention de clé : `<domaine>.<cas>`.
 */
export const errorCopy: Record<
  string,
  { title: string; detail?: string; action?: { label: string; href: string } }
> = {
  // --- Session / accès ---
  "session.expired": {
    title: "Votre session a expiré",
    detail: "Reconnectez-vous pour continuer.",
    action: { label: "Se reconnecter", href: "/login" },
  },
  "session.forbidden": {
    title: "Action réservée",
    detail: "Seuls le propriétaire et les managers peuvent faire cela.",
  },
  "session.rateLimited": {
    title: "Trop d’actions d’un coup",
    detail: "Patientez quelques secondes, puis réessayez.",
  },

  // --- WhatsApp ---
  "whatsapp.notConnected": {
    title: "WhatsApp n’est pas connecté",
    detail: "Connectez votre numéro pour recevoir les messages WhatsApp.",
    action: { label: "Connecter WhatsApp", href: "/parametres/whatsapp" },
  },
  "whatsapp.invalidCredentials": {
    title: "La connexion WhatsApp a été refusée",
    detail:
      "Le lien avec votre compte WhatsApp Business n’est plus valide. Reconnectez-vous à WhatsApp.",
    action: { label: "Reconnecter", href: "/parametres/whatsapp" },
  },
  "whatsapp.metaRefused": {
    title: "WhatsApp a refusé la demande",
    detail: "Réessayez dans quelques minutes. Si cela persiste, reconnectez votre numéro.",
    action: { label: "Ouvrir la connexion WhatsApp", href: "/parametres/whatsapp" },
  },
  "whatsapp.unavailable": {
    title: "La connexion WhatsApp est momentanément indisponible",
    detail: "Réessayez dans quelques minutes.",
  },
  "whatsapp.missingPermissions": {
    title: "Autorisations WhatsApp insuffisantes",
    detail:
      "Reconnectez votre compte WhatsApp Business en acceptant toutes les autorisations demandées.",
    action: { label: "Reconnecter", href: "/parametres/whatsapp" },
  },

  // --- Prix ---
  "pricing.noCategory": {
    title: "Aucun prix ne correspond à ce code",
    detail:
      "Ajoutez la catégorie correspondante dans vos prix, ou saisissez un prix pour cet article.",
    action: { label: "Ouvrir les prix", href: "/parametres" },
  },
  "pricing.descriptionRequired": {
    title: "Description manquante",
    detail: "Décrivez la catégorie pour que les articles soient nommés automatiquement.",
  },

  // --- Catalogue ---
  "catalogue.duplicateCode": {
    title: "Ce code existe déjà",
    detail: "Chaque article doit avoir un code unique. Choisissez-en un autre.",
  },
  "catalogue.photoUnavailable": {
    title: "L’envoi de photos n’est pas encore activé",
    detail: "Vous pouvez créer l’article sans photo et l’ajouter plus tard.",
  },
  "catalogue.quantityFromVariants": {
    title: "La quantité vient des variantes",
    detail:
      "Tant que des variantes sont actives, la quantité totale est la somme de leurs stocks.",
  },

  // --- Commandes / réservations ---
  "orders.invalidTransition": {
    title: "Ce changement d’état n’est pas possible",
    detail: "Rafraîchissez la page : la commande a peut-être déjà avancé.",
  },
  "reservation.invalid": {
    title: "Cette réservation n’est plus valide",
    detail: "Rafraîchissez la page pour voir son état actuel.",
  },

  // --- Abonnement ---
  "subscription.creditsExhausted": {
    title: "Vos conversations client sont épuisées",
    detail: "Achetez un pack ou changez de plan pour que l’assistant continue à répondre.",
    action: { label: "Voir l’abonnement", href: "/parametres/abonnement" },
  },
  "subscription.limitReached": {
    title: "Vous avez atteint la limite de votre plan",
    action: { label: "Voir l’abonnement", href: "/parametres/abonnement" },
  },

  // --- Équipe ---
  "team.seatsExhausted": {
    title: "Vous n’avez plus de place dans l’équipe",
    detail: "Passez à un plan supérieur pour inviter davantage de personnes.",
    action: { label: "Voir l’abonnement", href: "/parametres/abonnement" },
  },
  "team.alreadyMember": {
    title: "Cette personne fait déjà partie de l’équipe",
  },

  // --- Journal ---
  "eventLog.tooManyResults": {
    title: "Trop de résultats",
    detail: "Réduisez la période ou choisissez un type d’activité.",
  },
};
