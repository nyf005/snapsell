/**
 * Le contenu de l'aide — source unique.
 *
 * Pourquoi ce module existe : le produit savait *mettre une boutique en route*
 * (`src/server/api/routers/onboarding.ts` dérive la checklist de l'état réel) mais
 * n'expliquait nulle part *comment on s'en sert*. Aucune page d'aide, aucun dépannage,
 * et l'étape la plus difficile — connecter WhatsApp — n'avait pas une ligne de notice.
 * DESIGN.md § « Genre » annonçait déjà cette surface : « Le jargon *fenêtre de
 * conversation 24 h* n'apparaît que dans l'aide. » Elle n'avait jamais été écrite.
 *
 * ── POURQUOI DE LA DONNÉE ET NON DU JSX ─────────────────────────────────────
 * Le même article est rendu sur trois surfaces : la page publique `/aide`, le panneau
 * contextuel ouvert depuis un écran de tâche, et — pour les plus courts — un message
 * WhatsApp. Un article écrit en JSX aurait dû être réécrit pour chacune.
 *
 * Second effet, au moins aussi important : `vocabulary.guard.test.ts` sait aplatir un
 * objet de chaînes. Tout ce qui est écrit ici passe donc par `BANNED_TERMS` et
 * `BANNED_AGREEMENTS`, comme les libellés de l'interface et les messages du robot.
 * L'aide ne peut pas dériver du vocabulaire du produit.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── CE QUI EST GARDÉ PAR `help.test.ts` ─────────────────────────────────────
 * Chaque `route` déclarée existe dans `NAV_ITEMS`, chaque `related` pointe vers un
 * slug réel, et **chaque écran de tâche a au moins un article rattaché**. C'est ce
 * dernier test qui empêche l'aide de prendre du retard sur le produit : ajouter un
 * écran sans l'expliquer fait échouer la suite.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Registre : le tableau de bord dit « vous », le robot dit « tu » (voir `glossary.ts`).
 * Les blocs `chat` citent donc le robot au tutoiement — c'est bien ce que reçoit la
 * clientèle.
 */

/** Rôles d'une boutique. `OPS` est exclu : la console interne n'a pas d'aide vendeur. */
export type HelpRole = "OWNER" | "MANAGER" | "AGENT";

/** Un fragment d'article. Chaque forme a un rendu propre, sur les trois surfaces. */
export type HelpBlock =
  | { kind: "text"; text: string }
  /** Une suite ordonnée. Une phrase par étape, jamais deux. */
  | { kind: "steps"; steps: readonly string[] }
  /** Deux colonnes : le cas, puis ce qu'il faut en retenir. */
  | {
      kind: "table";
      head: readonly [string, string];
      rows: readonly (readonly [string, string])[];
    }
  /** Précision utile. */
  | { kind: "note"; text: string }
  /** Ce qui coûte cher si on l'ignore. */
  | { kind: "warning"; text: string }
  /** Renvoi vers un écran du tableau de bord. `href` doit exister dans NAV_ITEMS. */
  | { kind: "screen"; href: string; label: string }
  /** Extrait de conversation WhatsApp — on comprend le produit en le lisant. */
  | {
      kind: "chat";
      turns: readonly { from: "client" | "assistant"; text: string }[];
    };

export type HelpFamily = "comprendre" | "faire" | "depanner";

export const HELP_FAMILIES: readonly {
  id: HelpFamily;
  title: string;
  subtitle: string;
}[] = [
  {
    id: "comprendre",
    title: "Comprendre",
    subtitle: "Ce qui se passe, et pourquoi.",
  },
  {
    id: "faire",
    title: "Faire",
    subtitle: "Les gestes du quotidien, étape par étape.",
  },
  {
    id: "depanner",
    title: "Quand ça ne va pas",
    subtitle: "Les pannes courantes et leur cause.",
  },
];

export type HelpTopic = {
  slug: string;
  family: HelpFamily;
  /** Titre court. */
  title: string;
  /** La question telle qu'elle se pose vraiment. Sous-titre, et cible de la recherche. */
  question: string;
  /** Une ou deux phrases. Sert à l'index, au panneau contextuel et aux résultats. */
  summary: string;
  body: readonly HelpBlock[];
  /** Écran auquel l'article se rattache. C'est ce champ qui câble l'aide contextuelle. */
  route?: string;
  /** Rôles pour qui l'article est utile. Absent = tout le monde. */
  roles?: readonly HelpRole[];
  related?: readonly string[];
};

export const HELP_TOPICS: readonly HelpTopic[] = [
  // ── Comprendre ────────────────────────────────────────────────────────────
  {
    slug: "comment-ca-marche",
    family: "comprendre",
    title: "Comment SnapSell fonctionne",
    question: "Qu’est-ce qui se passe entre mon live et ma commande ?",
    summary:
      "Vous annoncez un code, votre clientèle l’envoie sur WhatsApp, l’assistant réserve l’article, réclame l’adresse puis l’acompte. Vous ne voyez que le résultat : une commande à préparer.",
    route: "/dashboard",
    body: [
      {
        kind: "text",
        text: "Pendant que quelqu’un commande, vous n’avez rien à faire. L’échange se passe entièrement sur WhatsApp, entre l’assistant et le numéro qui vous écrit.",
      },
      {
        kind: "steps",
        steps: [
          "Vous annoncez un code pendant votre live, par exemple A12.",
          "La personne intéressée envoie ce code à votre numéro WhatsApp.",
          "L’assistant vérifie le stock et réserve l’article à ce numéro, pour quelques minutes.",
          "Il demande l’adresse de livraison, puis calcule les frais correspondants.",
          "Il envoie un récapitulatif — article, prix, livraison, total — avec un bouton pour confirmer.",
          "Si votre boutique demande un acompte, il réclame la preuve de paiement et garde l’article le temps de la recevoir.",
          "La commande arrive dans « Commandes », et la preuve à vérifier dans « Preuves de paiement ».",
        ],
      },
      {
        kind: "chat",
        turns: [
          { from: "client", text: "A12" },
          {
            from: "assistant",
            text: "✅ A12 est réservé pour toi. Prochaine étape : envoie ton adresse de livraison 📍",
          },
          { from: "client", text: "Cocody Angré, 7e tranche" },
          {
            from: "assistant",
            text: "🧾 Commande prête à confirmer. Article A12, prix 15 000 FCFA, livraison 1 000 FCFA, total 16 000 FCFA.",
          },
        ],
      },
      {
        kind: "text",
        text: "Votre travail commence à la fin : vérifier les preuves de paiement, puis faire avancer les commandes jusqu’à la livraison. L’écran « Aujourd’hui » met toujours en avant ce qui attend une décision.",
      },
      {
        kind: "note",
        text: "Quand une cliente demande à parler à quelqu’un, l’assistant se met en retrait sur ce numéro et vous laissez la main. La conversation apparaît alors sur « Aujourd’hui » : rendez-la à l’assistant quand vous avez terminé, sinon il la reprend seul au bout de vingt-quatre heures.",
      },
      { kind: "screen", href: "/dashboard", label: "Ouvrir « Aujourd’hui »" },
    ],
    related: ["le-code", "reservation-file-expiration", "mettre-en-route"],
  },
  {
    slug: "le-code",
    family: "comprendre",
    title: "Le code, et le prix qu’il porte",
    question: "Pourquoi un code, et comment il choisit son prix ?",
    summary:
      "Un code désigne un article. Le début du code désigne sa catégorie de prix : c’est la catégorie la plus longue qui correspond au début du code qui gagne.",
    body: [
      {
        kind: "text",
        text: "Le code est le seul mot que votre clientèle a besoin de retenir. Elle l’envoie, l’assistant sait quel article réserver et à quel prix.",
      },
      {
        kind: "text",
        text: "Vous ne fixez pas un prix par article, mais un prix par catégorie. Le début du code désigne la catégorie. La règle exacte : parmi vos catégories, celle qui correspond au plus long début du code l’emporte.",
      },
      {
        kind: "table",
        head: ["Code envoyé", "Prix appliqué"],
        rows: [
          ["A12, vos catégories étant A et B", "le prix de la catégorie A"],
          ["AB12, vos catégories étant A et AB", "le prix de AB, plus long que A"],
          ["PREMIUM1, vos catégories étant P et PREMIUM", "le prix de PREMIUM"],
          ["A1, votre seule catégorie étant AB", "aucun prix : rien ne correspond"],
        ],
      },
      {
        kind: "note",
        text: "Une catégorie n’est pas forcément une lettre seule. Vous pouvez nommer vos catégories comme vous parlez : PAGNE, SAC, PREMIUM.",
      },
      {
        kind: "warning",
        text: "Un code dont aucune catégorie ne couvre le début n’a pas de prix. L’assistant ne peut alors ni le créer ni l’annoncer, et vous verrez une réservation manquante plutôt qu’une vente.",
      },
      { kind: "screen", href: "/parametres/prix", label: "Voir mes catégories de prix" },
    ],
    related: ["prix-et-livraison", "un-code-na-pas-ete-reconnu", "creer-un-article"],
  },
  {
    slug: "reservation-file-expiration",
    family: "comprendre",
    title: "Réservation, file d’attente, expiration",
    question: "Réservée, en file d’attente, expirée : qu’est-ce que ça change ?",
    summary:
      "Une réservation met l’article de côté pour quelques minutes seulement. Passé ce délai, il repart, et la personne suivante dans la file d’attente est prévenue.",
    // Pas de `route` : l'écran du live est porté par « tenir-un-live », qui explique
    // le geste. Celui-ci explique les états, et s'atteint depuis ses renvois.
    body: [
      {
        kind: "text",
        text: "Une réservation est temporaire, et c’est volontaire : sans délai, un article resterait bloqué par quelqu’un qui ne répond plus, et vous perdriez la vente.",
      },
      {
        kind: "table",
        head: ["État", "Ce que ça veut dire"],
        rows: [
          ["Réservée", "L’article est mis de côté. L’adresse n’est pas encore arrivée."],
          ["En file d’attente", "L’article était déjà pris. La place est gardée, avec un numéro d’ordre."],
          ["Adresse reçue", "L’adresse est connue, les frais sont calculés, le récapitulatif est parti."],
          ["Confirmée", "La commande existe. Elle apparaît dans « Commandes »."],
          ["Expirée", "Le délai est passé sans réponse. L’article est de nouveau disponible."],
        ],
      },
      {
        kind: "text",
        text: "Un rappel automatique part deux minutes avant l’expiration, avec un bouton pour envoyer l’adresse tout de suite. Quand la réservation expire, la première place de la file d’attente est prévenue à son tour.",
      },
      {
        kind: "text",
        text: "Vous pouvez libérer une réservation à la main depuis « Live du moment » — utile quand quelqu’un vous dit de vive voix qu’il renonce, sans attendre la fin du délai.",
      },
      { kind: "screen", href: "/dashboard/live", label: "Suivre les réservations" },
    ],
    related: ["tenir-un-live", "de-la-reservation-a-la-livraison"],
  },
  {
    slug: "de-la-reservation-a-la-livraison",
    family: "comprendre",
    title: "De la réservation à la livraison",
    question: "Par quels états passe une commande ?",
    summary:
      "Une commande confirmée traverse cinq états. Chaque passage à l’état suivant prévient automatiquement le numéro concerné sur WhatsApp.",
    // Pas de `route` : l'écran des commandes est porté par « preparer-et-livrer ».
    body: [
      {
        kind: "table",
        head: ["État de la commande", "Ce qu’il reste à faire"],
        rows: [
          ["En attente d’acompte", "La preuve de paiement n’est pas encore validée."],
          ["Confirmée", "Rien ne bloque. La préparation peut commencer."],
          ["En préparation", "Vous rassemblez les articles."],
          ["En livraison", "Le colis est parti."],
          ["Livrée", "Terminé."],
          ["Annulée", "La commande ne se fera pas."],
        ],
      },
      {
        kind: "note",
        text: "Chaque changement d’état envoie un message. Faire passer une commande en livraison prévient donc le numéro sans que vous ayez à écrire.",
      },
      {
        kind: "text",
        text: "Ne confondez pas ces états avec ceux d’une réservation : une réservation précède la commande et peut expirer, une commande non.",
      },
      { kind: "screen", href: "/dashboard/orders", label: "Ouvrir les commandes" },
    ],
    related: ["preparer-et-livrer", "reservation-file-expiration"],
  },
  {
    slug: "conversations-client",
    family: "comprendre",
    title: "Les conversations client",
    question: "Qu’est-ce qui m’est facturé au juste ?",
    summary:
      "Une conversation client, c’est vingt-quatre heures d’échanges illimités avec un même numéro. C’est l’unité facturée : ni le message, ni la commande.",
    route: "/parametres/abonnement",
    roles: ["OWNER", "MANAGER"],
    body: [
      {
        kind: "text",
        text: "Ce que WhatsApp facture, et ce que SnapSell compte à son tour, ce n’est pas le message : c’est la fenêtre de vingt-quatre heures pendant laquelle vous échangez avec un numéro.",
      },
      {
        kind: "table",
        head: ["Ce qui se passe", "Ce qui est compté"],
        rows: [
          ["Un nouveau numéro vous écrit", "Une conversation client"],
          ["Cette personne envoie quarante messages dans la journée", "Rien de plus"],
          ["Elle revient le lendemain", "Une nouvelle conversation client"],
          ["Vous envoyez trois confirmations à ce même numéro dans la fenêtre", "Rien de plus"],
        ],
      },
      {
        kind: "text",
        text: "Un live qui attire cinquante numéros consomme donc cinquante conversations, quel que soit le nombre de messages échangés avec chacun.",
      },
      {
        kind: "warning",
        text: "Quand le solde atteint zéro, l’assistant cesse de répondre aux nouvelles conversations. Les échanges déjà ouverts continuent. Le solde se voit sur « Aujourd’hui » et sur l’abonnement.",
      },
      { kind: "screen", href: "/parametres/abonnement", label: "Voir mon solde" },
    ],
    related: ["personne-ne-recoit-mes-messages"],
  },
  {
    slug: "qui-voit-quoi",
    family: "comprendre",
    title: "Qui voit quoi dans l’équipe",
    question: "Qu’est-ce que voient les personnes que j’invite ?",
    summary:
      "Trois rôles, du plus large au plus étroit. Les réglages — prix, livraison, WhatsApp, équipe, abonnement — restent réservés aux rôles Propriétaire et Manager.",
    route: "/parametres/team",
    roles: ["OWNER", "MANAGER"],
    body: [
      {
        kind: "table",
        head: ["Rôle", "Ce qu’il peut faire"],
        rows: [
          ["Propriétaire", "Tout, y compris les prix, l’équipe et l’abonnement."],
          ["Manager", "Toute la configuration et toutes les ventes."],
          ["Agent", "Le live, le catalogue, les commandes et les preuves de paiement. Ne voit pas les réglages."],
        ],
      },
      {
        kind: "note",
        text: "Les trois rôles traitent les commandes et les preuves. Restent réservés aux rôles Propriétaire et Manager : les réglages, le chiffre d’affaires sur « Aujourd’hui », et l’export du fichier des commandes.",
      },
      {
        kind: "text",
        text: "Une invitation part par courrier électronique. La personne choisit son mot de passe elle-même, et arrive directement sur « Aujourd’hui ».",
      },
      { kind: "screen", href: "/parametres/team", label: "Gérer l’équipe" },
    ],
    related: ["mes-messages-creent-des-reservations"],
  },

  // ── Faire ─────────────────────────────────────────────────────────────────
  {
    slug: "mettre-en-route",
    family: "faire",
    title: "Mettre votre boutique en route",
    question: "Par où je commence ?",
    summary:
      "Trois réglages conditionnent le fonctionnement de l’assistant : WhatsApp, vos prix, vos frais de livraison. Trois autres sont utiles mais peuvent attendre.",
    route: "/parametres",
    body: [
      {
        kind: "text",
        text: "La liste apparaît d’elle-même sur « Aujourd’hui » tant qu’il reste une étape, et disparaît quand tout est fait. Vous pouvez les traiter dans l’ordre qui vous arrange.",
      },
      {
        kind: "table",
        head: ["Étape", "Pourquoi"],
        rows: [
          ["Connecter WhatsApp", "Nécessaire. Sans elle, personne ne peut vous écrire."],
          ["Définir vos prix", "Nécessaire. Un code sans catégorie n’a pas de prix."],
          ["Définir vos frais de livraison", "Nécessaire. Sinon la livraison est annoncée « à confirmer »."],
          ["Préparer vos réponses automatiques", "Utile. L’assistant répond à votre place aux questions courantes."],
          ["Déclarer votre numéro", "Utile. Vos propres messages ne seront plus lus comme des achats."],
          ["Faire votre première vente", "Le reste suit tout seul."],
        ],
      },
      {
        kind: "note",
        text: "Préparer votre catalogue et vos prix avant de connecter WhatsApp est parfaitement possible. Rien n’est bloqué, mais rien ne part non plus.",
      },
      { kind: "screen", href: "/parametres", label: "Ouvrir les paramètres" },
    ],
    related: ["connecter-whatsapp", "prix-et-livraison", "creer-un-article"],
  },
  {
    slug: "connecter-whatsapp",
    family: "faire",
    title: "Connecter WhatsApp",
    question: "Comment je branche mon numéro ?",
    summary:
      "Un seul bouton, qui ouvre la fenêtre de Meta. Prévoyez un numéro qui n’est pas déjà utilisé sur l’application WhatsApp, et de quoi recevoir un code de vérification.",
    route: "/parametres/whatsapp",
    roles: ["OWNER", "MANAGER"],
    body: [
      {
        kind: "text",
        text: "C’est l’étape la plus exigeante, et la seule vraiment bloquante : tant qu’elle n’est pas faite, aucun message n’arrive et tous vos indicateurs restent à zéro.",
      },
      {
        kind: "text",
        text: "À prévoir avant de commencer :",
      },
      {
        kind: "steps",
        steps: [
          "Un numéro de téléphone qui n’est pas déjà utilisé dans l’application WhatsApp ordinaire. Si c’est le cas, supprimez d’abord ce compte, ou prenez un autre numéro.",
          "L’accès à ce numéro pour recevoir le code de vérification, par message ou par appel.",
          "Un compte Facebook, qui servira à créer votre compte WhatsApp Business.",
        ],
      },
      {
        kind: "text",
        text: "Ensuite, le parcours tient en trois gestes : ouvrez « Connexion WhatsApp », appuyez sur « Connecter WhatsApp », puis suivez la fenêtre de Meta jusqu’au bout sans la fermer. Au retour, la page affiche « Connecté » et le numéro que votre clientèle utilisera.",
      },
      {
        kind: "note",
        text: "Le bouton « Tester la connexion » confirme que l’envoi fonctionne réellement. À utiliser au moindre doute : il coûte un message, pas une conversation.",
      },
      {
        kind: "text",
        text: "La section « Configuration avancée » sert au dépannage, quand la fenêtre de Meta n’aboutit pas. Elle attend trois identifiants qui se trouvent dans votre espace Meta pour développeurs, sur la page WhatsApp de l’application : l’identifiant du numéro, celui du compte WhatsApp Business, et un jeton d’accès permanent. Si vous n’avez jamais ouvert cet espace, reprenez plutôt le bouton.",
      },
      { kind: "screen", href: "/parametres/whatsapp", label: "Connecter WhatsApp" },
    ],
    related: ["personne-ne-recoit-mes-messages", "mettre-en-route"],
  },
  {
    slug: "creer-un-article",
    family: "faire",
    title: "Créer un article dans le catalogue",
    question: "Comment je crée un article, avec photo, tailles et quantité ?",
    summary:
      "Le catalogue garde vos articles d’un live à l’autre. Un code, un nom, une quantité, une photo si vous voulez, et des variantes quand il existe des tailles ou des couleurs.",
    route: "/dashboard/catalogue",
    body: [
      {
        kind: "text",
        text: "Un article du catalogue est permanent : vous le réutilisez d’un live à l’autre sans le ressaisir. Les articles improvisés pendant un live, eux, sont suivis dans « Live du moment ».",
      },
      {
        kind: "steps",
        steps: [
          "Ouvrez « Catalogue », puis « Ajouter un article permanent ».",
          "Donnez le code que vous annoncerez, par exemple A12. Il doit être unique.",
          "Nommez l’article — « Robe fleurie bleue » — pour le reconnaître dans vos listes.",
          "Indiquez la quantité en stock. C’est elle qui déclenche la file d’attente quand elle tombe à zéro.",
          "Ajoutez une photo si vous en avez une : elle part avec la fiche envoyée sur WhatsApp.",
          "S’il existe des tailles ou des couleurs, saisissez chaque variante, par exemple « Rouge / S ».",
        ],
      },
      {
        kind: "note",
        text: "Le prix n’est pas demandé : il vient de la catégorie que porte le début du code. Un aperçu vous montre le prix qui sera annoncé au moment où vous saisissez le code.",
      },
      {
        kind: "warning",
        text: "Si l’aperçu n’affiche aucun prix, c’est qu’aucune de vos catégories ne couvre le début de ce code. Créez la catégorie d’abord, sinon l’article existera sans pouvoir être vendu.",
      },
      { kind: "screen", href: "/dashboard/catalogue", label: "Ouvrir le catalogue" },
    ],
    related: ["le-code", "creer-un-article-par-whatsapp", "prix-et-livraison"],
  },
  {
    slug: "creer-un-article-par-whatsapp",
    family: "faire",
    title: "Créer un article depuis votre téléphone",
    question: "Comment j’ajoute un article sans ouvrir le tableau de bord ?",
    summary:
      "Depuis un numéro déclaré, écrivez le code à votre propre numéro WhatsApp. Pendant un live, le code seul suffit ; hors live, faites-le précéder du mot « ajout ».",
    body: [
      {
        kind: "text",
        text: "Pendant un live, vous avez les mains prises. Vous pouvez créer un article en écrivant à votre propre numéro WhatsApp, depuis un téléphone déclaré dans vos réglages.",
      },
      {
        kind: "table",
        head: ["Ce que vous écrivez", "Ce qui se passe"],
        rows: [
          ["A12", "Pendant un live : crée l’article A12 avec une unité."],
          ["A12 x3", "Pendant un live : crée l’article avec trois unités."],
          ["ajout A12 x3", "Hors live : ajoute trois unités de A12 au catalogue."],
          ["Une photo avec A12 en légende", "Rattache la photo à l’article A12."],
          ["aide", "Renvoie ce rappel, adapté selon qu’un live est ouvert ou non."],
        ],
      },
      {
        kind: "warning",
        text: "Cela ne fonctionne que depuis un numéro déclaré. Un numéro inconnu qui écrit « A12 » est traité comme un achat, et l’assistant lui réserve l’article.",
      },
      {
        kind: "text",
        text: "L’assistant répond à chaque fois : article créé, quantité en stock, photo rattachée, ou la raison exacte du refus — code déjà utilisé dans ce live, ou catégorie de prix absente.",
      },
      { kind: "screen", href: "/parametres/whatsapp", label: "Déclarer mon numéro" },
    ],
    related: ["mes-messages-creent-des-reservations", "creer-un-article", "tenir-un-live"],
  },
  {
    slug: "tenir-un-live",
    family: "faire",
    title: "Tenir un live",
    question: "Comment se déroule un live, du début à la fin ?",
    summary:
      "Ouvrez le live, annoncez vos codes, laissez l’assistant réserver. « Live du moment » vous montre en direct qui a réservé quoi et ce qui va expirer.",
    route: "/dashboard/live",
    body: [
      {
        kind: "steps",
        steps: [
          "Ouvrez « Live du moment » et démarrez le live. À partir de là, un code envoyé par un numéro déclaré crée un article.",
          "Annoncez vos codes à voix haute pendant votre diffusion, un par article présenté.",
          "Piochez dans le catalogue pour les articles déjà connus : le code, le prix et la photo suivent, sans ressaisie.",
          "Surveillez les réservations qui arrivent, et libérez celles qui n’aboutiront pas.",
          "Fermez le live quand vous avez terminé.",
        ],
      },
      {
        kind: "note",
        text: "Si vous oubliez de fermer, le live se ferme tout seul après une longue période sans activité. Rien n’est perdu : les commandes déjà confirmées restent dans « Commandes ».",
      },
      {
        kind: "text",
        text: "Après la fermeture, votre numéro déclaré reçoit un résumé : commandes confirmées, réservations restées en attente, articles non vendus et chiffre d’affaires.",
      },
      { kind: "screen", href: "/dashboard/live", label: "Ouvrir le live" },
    ],
    related: [
      "reservation-file-expiration",
      "creer-un-article-par-whatsapp",
      "valider-une-preuve",
    ],
  },
  {
    slug: "valider-une-preuve",
    family: "faire",
    title: "Valider une preuve de paiement",
    question: "Qu’est-ce que je regarde avant de valider ?",
    summary:
      "La preuve est la capture ou la photo du versement. Vous la validez ou la refusez, et le numéro concerné est prévenu du résultat dans les deux cas.",
    route: "/dashboard/proofs",
    body: [
      {
        kind: "text",
        text: "Quand votre boutique demande un acompte, l’assistant réclame une preuve de paiement et garde l’article de côté le temps de la recevoir. La preuve arrive dans « Preuves de paiement », en attente de votre décision.",
      },
      {
        kind: "text",
        text: "Ce qu’il faut vérifier sur l’image : le montant, la date, et le nom ou le numéro du destinataire. Une capture illisible ou tronquée se refuse — une nouvelle sera demandée automatiquement.",
      },
      {
        kind: "table",
        head: ["Votre décision", "Ce qui se passe ensuite"],
        rows: [
          ["Valider", "L’acompte est acquis, la commande peut être préparée."],
          ["Refuser", "Le numéro est invité à envoyer une preuve lisible, ou à demander de l’aide."],
        ],
      },
      {
        kind: "warning",
        text: "Sans décision de votre part, la commande reste en attente d’acompte et finit par expirer. C’est la première chose que met en avant l’écran « Aujourd’hui ».",
      },
      {
        kind: "note",
        text: "Une preuve ne disparaît pas quand vous l’avez traitée. Les vues « Validées » et « Refusées » de cet écran gardent tout.",
      },
      {
        kind: "text",
        text: "Cet écran est la file d’attente : ce qui reste à décider, et le seul endroit où traiter plusieurs preuves d’un coup. Pour une commande précise, cliquez sur son acompte depuis « Commandes » : la preuve s’y affiche, et vous pouvez la valider ou la refuser sans quitter la liste.",
      },
      { kind: "screen", href: "/dashboard/proofs", label: "Vérifier les preuves" },
    ],
    related: ["une-cliente-dit-avoir-paye", "de-la-reservation-a-la-livraison"],
  },
  {
    slug: "preparer-et-livrer",
    family: "faire",
    title: "Préparer et livrer une commande",
    question: "Comment je fais avancer une commande ?",
    summary:
      "Vous faites passer la commande d’un état au suivant, et chaque passage prévient le numéro concerné. Aucun message à écrire.",
    route: "/dashboard/orders",
    // Pas de `roles` : tous les rôles tenant traitent les commandes, cf. l'en-tête
    // de `routers/orders.ts`. Restreindre cet article privait l'Agent de l'aide
    // contextuelle de son propre écran de travail.
    body: [
      {
        kind: "steps",
        steps: [
          "Ouvrez « Commandes » et triez sur ce qui est à traiter.",
          "Passez en préparation les commandes dont l’acompte est acquis.",
          "Passez en livraison quand le colis part : le numéro est prévenu qu’il est en route.",
          "Marquez livrée à la remise. La commande quitte votre travail du jour.",
        ],
      },
      {
        kind: "note",
        text: "Cochez plusieurs commandes pour les faire avancer ensemble : une barre apparaît au-dessus de la liste. Seuls les états possibles pour toute la sélection sont proposés — après un gros live, cela évite de répéter le même geste.",
      },
      {
        kind: "text",
        text: "Le numéro d’une commande ouvre son détail : l’article, la quantité, l’adresse complète et les preuves de paiement reçues. Quand un acompte a été demandé, son état est cliquable dans la liste et mène directement à la preuve — sans passer par l’écran des preuves.",
      },
      {
        kind: "text",
        text: "En cas de contestation, « Historique de l’activité » garde la trace de chaque étape, du code envoyé jusqu’à la livraison, avec l’heure exacte. Le détail de la commande, lui, garde l’image de la preuve.",
      },
      { kind: "screen", href: "/dashboard/audit", label: "Ouvrir l’historique" },
    ],
    related: ["de-la-reservation-a-la-livraison", "une-cliente-dit-avoir-paye", "valider-une-preuve"],
  },
  {
    slug: "reponses-automatiques",
    family: "faire",
    title: "Vos réponses automatiques",
    question: "Que dit l’assistant quand je ne suis pas là ?",
    summary:
      "Quatre questions reviennent sans cesse : la livraison, le paiement, votre adresse et la disponibilité. Écrivez la réponse une fois, l’assistant la donne à votre place.",
    route: "/parametres/reponses",
    roles: ["OWNER", "MANAGER"],
    body: [
      {
        kind: "text",
        text: "L’assistant reconnaît le sujet d’une question et sert la réponse que vous avez écrite. Un champ laissé vide ne déclenche rien du tout : mieux vaut ne pas répondre que répondre à côté.",
      },
      {
        kind: "table",
        head: ["Sujet reconnu", "Exemples de questions"],
        rows: [
          ["Livraison", "« vous livrez quand », « quel délai », « je reçois quand »"],
          ["Paiement", "« comment je paie », « vous prenez le mobile money », « acompte »"],
          ["Adresse", "« vous êtes où », « quel quartier », « votre localisation »"],
          ["Disponibilité", "« c’est encore disponible », « il reste du stock »"],
        ],
      },
      {
        kind: "text",
        text: "Vous pouvez aussi déclarer vos horaires et un message d’absence. En dehors de ces heures, ce message part d’abord, pour que personne n’attende une réponse qui ne viendra pas avant demain.",
      },
      {
        kind: "note",
        text: "Ces réponses s’adressent à votre clientèle sur WhatsApp. Elles n’ont rien à voir avec la présente aide, qui s’adresse à votre équipe.",
      },
      { kind: "screen", href: "/parametres/reponses", label: "Écrire mes réponses" },
    ],
    related: ["conversations-client"],
  },
  {
    slug: "prix-et-livraison",
    family: "faire",
    title: "Vos prix et vos frais de livraison",
    question: "Comment je fixe mes prix et mes frais ?",
    summary:
      "Les prix se règlent par catégorie, jamais article par article. Les frais de livraison se règlent par commune, ou par zone regroupant plusieurs communes.",
    route: "/parametres/prix",
    roles: ["OWNER", "MANAGER"],
    body: [
      {
        kind: "text",
        text: "Côté prix, vous déclarez des catégories — A, PAGNE, PREMIUM — et le montant de chacune. Tout code commençant par le nom d’une catégorie prend son prix. Vous réglez ainsi cent articles en cinq lignes.",
      },
      {
        kind: "text",
        text: "Côté livraison, deux façons de faire, qui se complètent : un prix par commune, ou une zone regroupant plusieurs communes sous un même prix. Quand les deux existent pour une commune, voici l’ordre appliqué :",
      },
      {
        kind: "steps",
        steps: [
          "Le prix fixé pour cette commune précise, s’il existe.",
          "Sinon, le prix de la zone qui contient cette commune.",
          "Sinon, le prix de la zone de repli « Intérieur du pays ».",
          "Sinon rien : la livraison est annoncée « à confirmer » et aucun frais n’est ajouté.",
        ],
      },
      {
        kind: "note",
        text: "Le dernier cas est un choix, pas un oubli : mieux vaut annoncer une incertitude que facturer un montant que vous n’avez pas fixé.",
      },
      { kind: "screen", href: "/parametres/livraison", label: "Régler la livraison" },
    ],
    related: ["le-code", "un-code-na-pas-ete-reconnu"],
  },

  // ── Quand ça ne va pas ────────────────────────────────────────────────────
  {
    slug: "personne-ne-recoit-mes-messages",
    family: "depanner",
    title: "Personne ne reçoit mes messages",
    question: "L’assistant ne répond plus à personne, pourquoi ?",
    summary:
      "Trois causes, dans cet ordre : WhatsApp n’est pas connecté, le solde de conversations est à zéro, ou la connexion a été révoquée du côté de Meta.",
    body: [
      {
        kind: "steps",
        steps: [
          "Ouvrez « Connexion WhatsApp ». Si l’état affiche « Non connecté », c’est là que tout s’arrête : reprenez la connexion.",
          "Si l’état affiche « Connecté », appuyez sur « Tester la connexion ». Un échec signale que l’accès a été révoqué du côté de Meta : reconnectez.",
          "Vérifiez votre solde de conversations. À zéro, l’assistant cesse de répondre aux nouvelles conversations, sans autre signe visible.",
          "Regardez « Historique de l’activité » : si les messages entrants y apparaissent bien, le problème est à l’envoi, pas à la réception.",
        ],
      },
      {
        kind: "note",
        text: "Un bandeau non masquable s’affiche sur le live et le catalogue tant que WhatsApp n’est pas connecté. C’est le seul indice, et il est volontairement impossible à cacher.",
      },
      { kind: "screen", href: "/parametres/whatsapp", label: "Vérifier la connexion" },
    ],
    related: ["connecter-whatsapp", "conversations-client"],
  },
  {
    slug: "un-code-na-pas-ete-reconnu",
    family: "depanner",
    title: "Un code n’a pas été reconnu",
    question: "J’ai annoncé un code et rien ne s’est passé",
    summary:
      "Presque toujours la catégorie de prix : aucune de vos catégories ne couvre le début du code. Sinon, l’article n’existe pas encore, ou son stock est épuisé.",
    body: [
      {
        kind: "table",
        head: ["Ce que le message dit", "La cause"],
        rows: [
          [
            "Aucun prix configuré pour la catégorie",
            "Aucune de vos catégories ne correspond au début du code. Créez-la, puis reprenez.",
          ],
          [
            "Ce code n’existe pas dans votre catalogue",
            "Hors live, un code inconnu n’est pas créé tout seul. Envoyez-le avec une quantité, ou créez l’article.",
          ],
          [
            "Ce code est déjà utilisé dans ce live",
            "Deux articles ne peuvent pas porter le même code. Choisissez A12B, ou libérez le stock existant.",
          ],
          [
            "Cet article a encore des unités en stock",
            "Épuisez-le d’abord, ou prenez un autre code.",
          ],
        ],
      },
      {
        kind: "text",
        text: "Du côté de votre clientèle, un code introuvable reçoit une réponse claire, et parfois une suggestion quand le code ressemble à un code existant. Personne ne reste sans réponse.",
      },
      { kind: "screen", href: "/parametres/prix", label: "Vérifier mes catégories" },
    ],
    related: ["le-code", "creer-un-article", "prix-et-livraison"],
  },
  {
    slug: "une-cliente-dit-avoir-paye",
    family: "depanner",
    title: "Un versement annoncé mais introuvable",
    question: "On me dit avoir payé et je ne vois aucune preuve",
    summary:
      "Vérifiez d’abord depuis quel numéro la preuve est partie : une image envoyée depuis un autre téléphone que celui de la commande n’est rattachée à rien.",
    body: [
      {
        kind: "steps",
        steps: [
          "Ouvrez « Preuves de paiement » et cherchez le numéro concerné.",
          "S’il n’y est pas, demandez depuis quel numéro l’image est partie : la preuve se rattache à la commande du numéro qui l’envoie, pas au nom de la personne.",
          "Vérifiez que la commande est bien en attente d’acompte. Une preuve envoyée alors qu’aucune commande n’attend n’est rattachée à rien.",
          "Ouvrez « Historique de l’activité » et cherchez le numéro : tout message reçu y figure, avec l’heure.",
        ],
      },
      {
        kind: "note",
        text: "Une preuve peut aussi être un texte, par exemple une référence de transaction. Elle apparaît alors sans image, et se valide de la même façon.",
      },
      {
        kind: "warning",
        text: "Si la commande a expiré faute de preuve dans le délai, elle ne revient pas d’elle-même. Le numéro peut renvoyer le code pour recommencer.",
      },
      { kind: "screen", href: "/dashboard/proofs", label: "Ouvrir les preuves" },
    ],
    related: ["valider-une-preuve", "de-la-reservation-a-la-livraison"],
  },
  {
    slug: "mes-messages-creent-des-reservations",
    family: "depanner",
    title: "Mes propres messages créent des réservations",
    question: "Quand j’écris un code, l’assistant me réserve l’article",
    summary:
      "Votre numéro n’est pas déclaré. L’assistant le prend pour un numéro qui achète. Déclarez-le, et vos messages seront reconnus comme les vôtres.",
    body: [
      {
        kind: "text",
        text: "L’assistant distingue vos messages de ceux de votre clientèle sur un seul critère : le numéro qui écrit est-il déclaré dans vos réglages. Tant qu’il ne l’est pas, écrire « A12 » revient à commander A12.",
      },
      {
        kind: "steps",
        steps: [
          "Ouvrez « Connexion WhatsApp » et ajoutez votre numéro à la liste des numéros déclarés.",
          "Ajoutez aussi celui de chaque personne qui annonce des codes pendant vos lives.",
          "Écrivez « aide » depuis ce numéro pour vérifier : une réponse d’aide confirme que le numéro est reconnu.",
        ],
      },
      {
        kind: "note",
        text: "Déclarer un numéro lui donne aussi le résumé de fin de live et la possibilité de créer des articles depuis un téléphone.",
      },
      { kind: "screen", href: "/parametres/whatsapp", label: "Déclarer un numéro" },
    ],
    related: ["creer-un-article-par-whatsapp", "qui-voit-quoi"],
  },
];

/** Un article par son slug, ou `undefined` s'il n'existe pas. */
export function helpTopic(slug: string): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.slug === slug);
}

/**
 * L'article rattaché à un écran.
 *
 * C'est ce que `TaskPageHeader` appelle avec son `href` : un article gagne son bouton
 * d'aide contextuelle en déclarant `route`, sans qu'aucune page soit modifiée.
 */
export function helpForRoute(href: string): HelpTopic | undefined {
  return HELP_TOPICS.find((t) => t.route === href);
}

/**
 * Les articles utiles à un rôle.
 *
 * Un article sans `roles` sert à tout le monde. Filtrer ne cache rien : la page reste
 * publique et un article réservé aux managers se lit quand même par son adresse — il
 * décrit un écran, il n'y donne pas accès.
 */
export function helpTopicsFor(role: string | null | undefined): HelpTopic[] {
  const upper = role?.toUpperCase();
  return HELP_TOPICS.filter(
    (t) => !t.roles || !upper || t.roles.includes(upper as HelpRole),
  );
}

/** Les articles groupés par famille, dans l'ordre d'affichage de `HELP_FAMILIES`. */
export function helpTopicsByFamily(
  topics: readonly HelpTopic[] = HELP_TOPICS,
): { family: (typeof HELP_FAMILIES)[number]; topics: HelpTopic[] }[] {
  return HELP_FAMILIES.map((family) => ({
    family,
    topics: topics.filter((t) => t.family === family.id),
  }));
}
