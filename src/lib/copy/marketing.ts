/**
 * Textes de la partie publique — landing, tarifs, pages d'authentification.
 *
 * Registre distinct de `glossary.ts` : on s'adresse à quelqu'un qui n'a pas encore
 * de boutique. Persuasif, mais **jamais invérifiable**.
 *
 * ── CE QUI VIT ICI ──────────────────────────────────────────────────────────
 * Les chaînes **partagées entre plusieurs fichiers**. Elles divergeaient :
 *   • quatre libellés pour la même action (« Créer mon compte vendeur »,
 *     « Démarrer gratuitement », « Commencer l'essai gratuit », « Commencer
 *     gratuitement ») ;
 *   • quatre promesses de délai différentes ;
 *   • deux années de copyright (2026 dans le pied de page, 2024 côté connexion).
 *
 * Une phrase propre à un seul écran peut rester dans son composant : la garde
 * `vocabulary.guard.test.ts` balaie le code source et attrape les dérives de
 * vocabulaire où qu'elles soient.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── CE QUI EST INTERDIT ─────────────────────────────────────────────────────
 * Aucun chiffre d'adoption inventé, aucun avatar fictif, aucun indicateur d'état
 * qu'aucune page de statut ne soutient, et jamais « essai gratuit » : le plan
 * Gratuit est **permanent**, il n'y a pas d'essai.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const marketing = {
  /** Un seul libellé d'action, partout. */
  cta: {
    signup: "Créer ma boutique",
    signupHint: "Sans carte bancaire",
    pricing: "Voir les tarifs",
    login: "Se connecter",
    how: "Voir comment ça marche",
  },

  /**
   * À qui la page s'adresse, dit explicitement.
   *
   * Sans cette ligne, la personne qui arrive doit deviner si le produit la
   * concerne. Elle ne mentionne pas le live : le live est un moment de vente
   * parmi d'autres, pas une condition d'usage.
   */
  audience: "Pour les boutiques qui vendent sur WhatsApp",

  /**
   * Une seule promesse de délai, et elle est vraie sans conditions.
   *
   * L'ancienne — « Opérationnel dès votre prochain live » — conditionnait le
   * produit à la tenue d'un live. Une boutique qui vend au fil de la journée en
   * concluait que ce n'était pas pour elle.
   */
  promise: {
    setup: "Votre boutique répond dès aujourd’hui",
  },

  /**
   * L'avant / l'après.
   *
   * La page décrivait le produit sans jamais décrire la corvée qu'il enlève.
   * Ces deux listes se lisent en vis-à-vis : même ordre, même sujet, ligne à
   * ligne. Aucune n'invente de chiffre.
   */
  contrast: {
    beforeTitle: "La vente au quotidien",
    before: [
      "Messages dans tous les sens",
      "Commandes notées à la main",
      "Paiements à confirmer un par un",
      "Demandes qui se perdent dans le fil",
    ],
    afterTitle: "La vente avec SnapSell",
    after: [
      "Conversations centralisées",
      "Commandes enregistrées toutes seules",
      "Preuves de paiement horodatées",
      "Chaque demande a une suite",
    ],
    closing: "Moins de désordre. Plus de ventes.",
  },

  /** Données de la démonstration — Côte d'Ivoire, comme la clientèle visée. */
  demo: {
    shopName: "Boutique Awa",
    address: "Cocody Angré 7e tranche, Abidjan",
    customerName: "Aïcha",
    typing: "écrit…",
  },

  /** Exemples de saisie dans les formulaires. */
  placeholder: {
    email: "awa@maboutique.ci",
    name: "Awa Koné",
    phone: "+225 07 01 02 03 04",
  },

  /** Une seule source pour l'année : elle divergeait entre deux pieds de page. */
  footer: {
    copyright: `© ${new Date().getFullYear()} SnapSell. Tous droits réservés.`,
  },
} as const;
