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
  /**
   * Un seul libellé d'action, partout.
   *
   * « Créer ma boutique » décrivait la MÉCANIQUE (ouvrir un compte, remplir un
   * catalogue) là où le visiteur évalue encore le RISQUE. « Commencer
   * gratuitement » lève l'objection dans le libellé lui-même : le cerveau n'a
   * plus à chercher plus bas si l'inscription engage à quelque chose.
   *
   * Le mot « gratuitement » est tenable sans astérisque — le plan Gratuit est
   * permanent, pas un essai (voir `BANNED_TERMS`).
   */
  cta: {
    signup: "Commencer gratuitement",
    signupHint: "Sans carte bancaire",
    pricing: "Voir les tarifs",
    login: "Se connecter",
    how: "Voir comment ça marche",
  },

  /**
   * Les objections, gardées pour le bas de page.
   *
   * Elles vivaient sous les boutons du hero. Une objection ne se lève que chez
   * quelqu'un qui a déjà envie : à hauteur de premier écran, le visiteur se
   * demande encore « pourquoi j'utiliserais ça ? », pas « faut-il une carte
   * bancaire ? ». À côté du DERNIER bouton, l'ordre est le bon — il est
   * convaincu et cherche ce qui pourrait le bloquer.
   *
   * Une liste `benefits` les a brièvement remplacées dans le hero (« Répond
   * aux clients à votre place », etc.). Elle disait, en trois fragments
   * détachés, exactement les gestes que la phrase d'explication du hero
   * enchaîne — sans le lien de cause à effet qui les rend compréhensibles.
   * Elle a été supprimée plutôt que réécrite.
   */
  objections: [
    "Sans carte bancaire",
    "Plan gratuit permanent",
    "Votre numéro WhatsApp actuel",
  ],

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

    /**
     * L'article de la conversation jouée dans le hero.
     *
     * Volontairement le même que celui d'Aïcha dans `CoreSection` : le hero
     * montre la conversation, la section suivante montre la commande qui en
     * sort. Deux vues du même mardi, pas deux exemples.
     */
    itemLabel: "Sac bandoulière",
    itemCode: "B12",
    itemPrice: "22 000 FCFA",

    /**
     * La boîte de réception qui déborde — le premier écran du téléphone.
     *
     * Ce ne sont pas les messages d'UNE conversation mais de plusieurs, ce qui
     * est la situation réelle : la charge ne vient pas d'un client bavard,
     * elle vient de six conversations ouvertes en même temps. Chaque entrée
     * fait remonter sa conversation en haut de la liste et incrémente son
     * compteur de non-lus.
     *
     * Les tournures sont celles qu'on reçoit vraiment : minuscules, sans
     * ponctuation, relances sèches.
     */
    inbox: [
      { name: "Aïcha", text: "Bonjour, le sac bleu est encore dispo ?", time: "14:02" },
      { name: "Mariam", text: "c’est combien celui-là ?", time: "14:03" },
      { name: "Fatou", text: "Je prends la robe taille M", time: "14:05" },
      { name: "Aïcha", text: "Allô ?", time: "14:06" },
      { name: "Kouassi", text: "Livraison à Yopougon ?", time: "14:07" },
      { name: "Mariam", text: "?", time: "14:08" },
      { name: "Adjoua", text: "Bonsoir, taille 40 ?", time: "14:09" },
      { name: "Fatou", text: "j’ai payé", time: "14:11" },
      { name: "Aïcha", text: "Disponible ?", time: "14:14" },
      { name: "Kouassi", text: "Allô", time: "14:16" },
    ],
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
