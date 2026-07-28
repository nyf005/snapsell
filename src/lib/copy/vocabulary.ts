/**
 * Vocabulaire canonique du produit — la source de vérité.
 *
 * Un mot par concept, **sur les deux surfaces** : le tableau de bord et les messages
 * WhatsApp. Le registre change (le bot dit « tu », le web dit « vous »), le mot non.
 *
 * Pourquoi ce module existe : le même objet portait deux noms selon l'écran. Le bot
 * demandait une « preuve de paiement », le menu affichait « Preuves d'acompte ». Le
 * mot « session » désignait tantôt une diffusion, tantôt l'unité facturée. Une cliente
 * était « cliente », « client » ou « clientèle » selon le fichier.
 *
 * `vocabulary.guard.test.ts` lit `BANNED_TERMS` et fait échouer la suite si un terme
 * écarté réapparaît. Ajouter une entrée ici, c'est interdire son synonyme partout.
 *
 * Voir DESIGN.md § « Vocabulaire du produit » pour la table lisible.
 */

/** Les mots retenus. Utilisez-les plutôt que de réécrire le concept. */
export const term = {
  /** L'objet vendu. Jamais « produit ». */
  item: "article",
  /** L'identifiant annoncé pendant le live (A12, Premium3). */
  code: "code",

  /** La mise de côté temporaire. Jamais « verrouillage ». */
  hold: "réservation",
  /** Le temps avant expiration. Jamais « TTL ». */
  holdExpiry: "délai de réservation",
  /** L'attente quand l'article est déjà pris. Jamais « liste d'attente ». */
  waitlist: "file d’attente",

  /** L'argent versé d'avance. */
  deposit: "acompte",
  /** La photo envoyée pour prouver le versement. Jamais « preuve d'acompte ». */
  proof: "preuve de paiement",

  order: "commande",
  deliveryFee: "frais de livraison",

  /** La diffusion. Jamais « session » ni « session live ». */
  live: "live",
  /** Le stock permanent. Jamais « catalogue permanent » ni « catalogue produit ». */
  catalogue: "catalogue",

  /**
   * Les personnes qui achètent.
   * `customers` est possessif (« votre clientèle ») ; `customerBase` ne l'est pas,
   * pour les phrases où le possessif force une tournure bancale.
   * Au singulier technique, préférez `contact` — l'accord tombe alors sur un objet.
   */
  customers: "votre clientèle",
  customerBase: "la clientèle",
  contact: "numéro",

  /** L'entreprise de la personne qui utilise le tableau de bord. */
  shop: "votre boutique",

  /** L'automatisation, vue du web. Le bot, lui, dit « je ». Jamais « SnapSell Bot ». */
  assistant: "l’assistant",

  /** L'unité facturée. Jamais « session client ». */
  billingUnit: "conversation client",
  billingUnitPlural: "conversations client",

  /** L'application vendeur. Jamais « Dashboard ». */
  dashboard: "tableau de bord",
  /** Le canal. Jamais « DM ». */
  channel: "message WhatsApp",
} as const;

/**
 * Termes écartés, lus par `vocabulary.guard.test.ts`.
 *
 * Chaque motif est choisi pour un taux de faux positifs quasi nul. En particulier
 * `/\bclientes?\b/` ne vise que les formes féminines : `/\bclients?\b/` frapperait
 * « conversation client », qui est le terme canonique.
 */
export const BANNED_TERMS: ReadonlyArray<{
  pattern: RegExp;
  use: string;
  why: string;
}> = [
  {
    pattern: /\bvendeuses?\b/i,
    use: term.shop,
    why: "genre la personne ; préférez « la boutique » ou « vous »",
  },
  {
    pattern: /\bclientes\b/i,
    use: term.customers,
    why: "genre la personne ; « votre clientèle » est collectif",
  },
  {
    pattern: /·[a-zà-ÿ]/,
    use: "une reformulation",
    why: "le point médian est proscrit ; on contourne le genre",
  },
  {
    pattern: /\bTTL\b/,
    use: term.holdExpiry,
    why: "sigle jamais développé pour la personne qui vend",
  },
  {
    pattern: /\bDM\b/,
    use: term.channel,
    why: "anglicisme ; le canal a un nom",
  },
  {
    pattern: /\bDashboard\b/,
    use: term.dashboard,
    why: "majuscule = usage produit ; le segment de route reste `dashboard`",
  },
  {
    pattern: /\bessai gratuit\b/i,
    use: "le plan Gratuit",
    why: "il n’existe aucun essai : le plan Gratuit est permanent",
  },
  {
    pattern: /\bliste d[’']attente\b/i,
    use: term.waitlist,
    why: "deux noms pour la même file",
  },
  {
    pattern: /\bpreuves? d[’']acompte\b/i,
    use: term.proof,
    why: "la cliente reçoit « preuve de paiement » ; même objet, même mot",
  },
  {
    pattern: /\bCatalogue (permanent|produit)\b/i,
    use: term.catalogue,
    why: "trois noms pour un seul catalogue",
  },
  {
    pattern: /\bsessions? live\b/i,
    use: term.live,
    why: "« session » désigne aussi l’unité facturée ; on réserve « live » à la diffusion",
  },
  {
    pattern: /\bsessions? client\b/i,
    use: term.billingUnit,
    why: "l’unité facturée s’appelle « conversation client »",
  },
  {
    pattern: /\bProofs?\s+inbox\b/i,
    use: term.proof,
    why: "moitié anglais",
  },
  {
    pattern: /\bTyping\b/,
    use: "« écrit… »",
    why: "anglais dans une interface française",
  },
];

/**
 * Tournures qui accordent un participe avec `vous`, donc genrent la personne.
 * Liste d'expressions exactes : zéro faux positif, contrairement à une regex sur
 * les participes nus (« connecté » est légitime dans « WhatsApp est connecté »).
 */
export const BANNED_AGREEMENTS: ReadonlyArray<{ phrase: string; use: string }> = [
  { phrase: "Vous êtes connecté", use: "Connexion active" },
  { phrase: "Vous serez notifiée", use: "Je te préviens" },
  { phrase: "Vous serez notifié", use: "Je te préviens" },
  { phrase: "Vous avez été invité", use: "Vous avez reçu une invitation" },
  { phrase: "Vous allez être connecté", use: "La connexion se fait automatiquement" },
  { phrase: "Cliente désabonnée", use: "Désabonnement" },
  { phrase: "Client promu", use: "Place libérée" },
];
