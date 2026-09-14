import { normalizeCode } from "~/server/live-item/createLiveItem";

/**
 * Délimiteur de mot qui connaît les accents.
 *
 * `\b` du moteur ne considère que `[A-Za-z0-9_]` : pour « où », il n'y a donc
 * aucune frontière entre « ù » et l'espace qui suit, tous deux non-alphanumériques
 * à ses yeux, et `\bo[ùu]\b` ne matche jamais. Ces deux lookarounds tiennent
 * compte des lettres accentuées du français.
 */
const NOT_LETTER_BEFORE = "(?<![a-zà-öø-ÿ0-9])";
const NOT_LETTER_AFTER = "(?![a-zà-öø-ÿ0-9])";

/** Construit un motif « mot entier » sur une alternative déjà en minuscules. */
function word(alternatives: string): RegExp {
  return new RegExp(`${NOT_LETTER_BEFORE}(?:${alternatives})${NOT_LETTER_AFTER}`);
}

/** Deux termes dans la même phrase, dans un ordre ou l'autre. */
function near(a: string, b: string): RegExp {
  return new RegExp(
    `${NOT_LETTER_BEFORE}(?:${a})[^.!?]*${NOT_LETTER_BEFORE}(?:${b})` +
      `|${NOT_LETTER_BEFORE}(?:${b})[^.!?]*${NOT_LETTER_BEFORE}(?:${a})`,
  );
}

/** Mots-clés STOP (case-insensitive, trim) pour détection opt-out. */
const STOP_KEYWORDS = ["stop", "arrêt", "arret", "unsubscribe", "optout", "opt-out"];

/**
 * Phase 5.2 : demandes de mise en relation avec une personne.
 *
 * ── POURQUOI DES LIMITES DE MOT, ET POURQUOI « APPEL » A DISPARU ─────────────
 * La détection était un `includes` sur une liste qui contenait « appel ». Elle
 * attrapait donc « je t'appelle demain », « merci pour le rappel », « c'est pour
 * l'appel de mon mariage » — et un faux positif coupe le bot pour cette cliente.
 *
 * Les limites de mot (`\b`) écartent « appelle » et « rappel ». « appel » seul est
 * retiré : même isolé, le mot désigne rarement une demande de mise en relation en
 * français ivoirien, et l'analyse d'intention par IA (`HUMAN_AGENT`) couvre les
 * formulations indirectes sur les plans payants.
 *
 * Le reste du fichier est délibérément étroit — `isStopMessage` exige l'égalité ou
 * un préfixe suivi d'espace, `isSellerHelpRequest` est ancré. Cette fonction était
 * l'exception.
 * ────────────────────────────────────────────────────────────────────────────
 */
const HANDOFF_PATTERNS = [
  word("agents?"),
  word("humain|humaine|humains"),
  word("conseiller|conseillère|conseillere|conseillers"),
  word("service client"),
  word("parler à quelqu'un|parler a quelqu'un|parler à une personne|parler a une personne"),
  word("vraie personne|vrai humain"),
];

/** Pattern « code » client : lettre(s) + chiffre(s) ex. A12, B7 (Story 2.6 Option A) */

/** Story 4.2 : extrait un candidat code (strict ou typo) depuis le body client */
const CLIENT_CODE_INTENT_PATTERN = /^([A-Za-z]+\d+)(?:\s*[x\s]?\s*(\d+))?/i;

export type ClientCodeIntent = { code: string; quantity: number; isTypo: boolean };

/**
 * Bornes sur ce qui arrive de l'extérieur.
 *
 * `MAX_ORDER_ITEMS` : le panier natif WhatsApp arrivait tel quel, et chaque article
 * coûte deux allers-retours base plus une réservation. Meta ne publie pas de limite
 * de panier, mais plafonne ses propres messages multi-produits à 30 : cent laisse
 * donc une marge large tout en bornant la boucle.
 *
 * `MAX_ITEM_QUANTITY` : la quantité venait du client sans borne haute — le parseur
 * de codes ne posait qu'un `Math.max(1, …)`. Au-delà de mille exemplaires d'un même
 * article, c'est une faute de saisie, pas une commande.
 */
export const MAX_ORDER_ITEMS = 100;
export const MAX_ITEM_QUANTITY = 1000;

/** Ramène une quantité venue de l'extérieur dans des bornes défendables. */
export function clampQuantity(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 1;
  return Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.floor(raw)));
}

/**
 * Parse le body client en intent « code » : strict (A12) ou typo (A12A → A12).
 */
export function parseClientCodeIntent(body: string): ClientCodeIntent | null {
  const trimmed = body.trim();
  if (!trimmed.length) return null;
  const match = trimmed.match(CLIENT_CODE_INTENT_PATTERN);
  if (!match) return null;
  const code = normalizeCode(match[1]!);
  if (!code.length) return null;
  const quantity = match[2] ? clampQuantity(parseInt(match[2], 10)) : 1;
  const matchedText = match[0]!;
  const isStrict = trimmed.toLowerCase() === matchedText.toLowerCase();
  return { code, quantity, isTypo: !isStrict };
}

/** Story 4.5: Détection intent « OUI » pour confirmer réservation (trim, lowercase). */
export function isConfirmOui(body: string): boolean {
  return body.trim().toLowerCase() === "oui";
}

/** Détecte si le corps du message est une demande STOP (opt-out). */
export function isStopMessage(body: string): boolean {
  const trimmed = body.trim().toLowerCase().replace(/[.,!?]+$/, "").trim();
  return STOP_KEYWORDS.some((kw) => trimmed === kw || trimmed.startsWith(kw + " "));
}

export function isHandoffRequest(body: string): boolean {
  const lower = body.toLowerCase().trim();
  return HANDOFF_PATTERNS.some((re) => re.test(lower));
}

/**
 * Durée au bout de laquelle une mise en relation cesse de faire taire le bot.
 *
 * `setHandedOff` n'était jamais appelé avec `false` : rien, nulle part, ne défaisait
 * une mise en relation. Un faux positif de détection coupait donc le service à une
 * cliente **définitivement**, sans que personne le sache et sans moyen de revenir.
 *
 * Vingt-quatre heures, comme la fenêtre de conversation WhatsApp sur laquelle tout
 * le produit est bâti : passé ce délai, si personne n'a repris la main, le bot
 * reprend le relais plutôt que de laisser la cliente sans réponse.
 */
export const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

/** La mise en relation est-elle encore active ? */
export function isHandoffActive(
  state: { handedOff: boolean; updatedAt: Date } | null,
  now: Date = new Date(),
): boolean {
  if (!state?.handedOff) return false;
  return now.getTime() - state.updatedAt.getTime() < HANDOFF_TTL_MS;
}

/**
 * Phase 5.3 : reconnaissance d'une question fréquente, pour servir la réponse que
 * la boutique a écrite.
 *
 * ── DEUX MOTS TROP LARGES ONT ÉTÉ RESSERRÉS ─────────────────────────────────
 * « quand » déclenchait à lui seul la réponse sur les délais de livraison :
 * « c'est quand le live ? » recevait donc les conditions d'expédition. Il ne
 * compte plus que s'il accompagne un mot de livraison.
 *
 * « trouver » déclenchait l'adresse de la boutique : « comment trouver ma taille »
 * y tombait aussi. Il exige désormais « où » ou « vous » à proximité.
 *
 * Les limites de mot (`\b`) évitent par ailleurs qu'un terme se déclenche depuis
 * l'intérieur d'un autre — le défaut qui avait fait basculer la mise en relation
 * sur « je t'appelle demain ».
 * ────────────────────────────────────────────────────────────────────────────
 */
const FAQ_PATTERNS: ReadonlyArray<{
  category: "delivery" | "payment" | "location" | "availability";
  patterns: readonly RegExp[];
}> = [
  {
    category: "delivery",
    patterns: [
      word("livraisons?|livrer|livrez|livré|livrée|livres?"),
      word("expédition|expedition|expéditions|livraison"),
      word("délai|delai|délais|delais"),
      word("recevoir|reçois|recois|reçu|recu"),
      // « quand » seul servait les délais d'expédition à « c'est quand le live ? ».
      near("quand", "livr|reç|rec|arriv|expédi|expedi"),
    ],
  },
  {
    category: "payment",
    patterns: [
      word("paiement|paiements|payer|paie|paye"),
      word("virement|dépôt|depot|acompte"),
      word("mobile money|momo|wave|orange money"),
    ],
  },
  {
    category: "location",
    patterns: [
      word("où|ou se trouve|adresse|boutique|quartier"),
      word("localisation|localisé|localise|située|situee|situé|situe"),
      // « trouver » seul attrapait « comment trouver ma taille ».
      near("où|vous", "trouver"),
    ],
  },
  {
    category: "availability",
    patterns: [
      word("disponibilité|disponibilite|disponible|disponibles|dispo"),
      word("stock|rupture|épuisé|epuise|épuisée"),
      near("reste", "articles?"),
    ],
  },
];

export function detectFaqIntent(
  body: string,
): "delivery" | "payment" | "location" | "availability" | null {
  const lower = body.toLowerCase().trim();
  for (const { category, patterns } of FAQ_PATTERNS) {
    if (patterns.some((re) => re.test(lower))) return category;
  }
  return null;
}

/**
 * Vérifie si l'heure actuelle est en dehors des heures d'ouverture.
 * @param start - Heure d'ouverture "HH:MM"
 * @param end   - Heure de fermeture "HH:MM"
 * @param tz    - Timezone IANA (ex: "Africa/Abidjan")
 */
export function isOutsideBusinessHours(
  start: string,
  end: string,
  tz: string,
  now: Date = new Date(),
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      // `hourCycle: "h23"` et non `hour12: false` : ce dernier laisse certaines
      // versions d'ICU rendre « 24:00 » à minuit, qui compare mal.
      hourCycle: "h23",
    });
    const localTime = formatter.format(now); // "HH:MM"

    // Plage à cheval sur minuit — une boutique ouverte de 18:00 à 02:00.
    // La comparaison simple `< start || >= end` la déclarait fermée en pleine
    // ouverture : à 20:00, `20 < 18` est faux mais `20 >= 02` est vrai.
    // Quand la fermeture précède l'ouverture, on est *dedans* si l'on est après
    // l'ouverture **ou** avant la fermeture.
    if (end <= start) {
      return localTime < start && localTime >= end;
    }

    return localTime < start || localTime >= end;
  } catch {
    return false; // En cas de timezone invalide, on ne bloque pas
  }
}


/** Interruptions must be resolved before treating free text as an address or receipt. */
export function isConversationQuestion(body: string): boolean {
  return /[?？]/.test(body) || /^(?:bonjour[, !]*\s*)?(?:combien|comment|pourquoi|quand|où|est.ce que|puis.je|peux.tu|pouvez.vous|je peux|vous pouvez|c.est combien)(?![a-zà-öø-ÿ])/i.test(body.trim());
}
export function isChangeRequest(body: string): boolean {
  return /\b(?:annul(?:er|e|ez)|chang(?:er|e|ez)|modifi(?:er|e|ez)|corrig(?:er|e|ez))\b/i.test(body);
}
