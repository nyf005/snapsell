/**
 * Formateurs partagés — monnaie, quantités, dates.
 *
 * Règle unique : la monnaie s'écrit **FCFA**, jamais « FCA » ni « euros ».
 * Les montants sont stockés en centimes partout dans le schéma (amount, priceCents,
 * revenueCents) ; ces helpers sont la seule frontière autorisée entre centimes et affichage.
 */

const XOF_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

/**
 * Formate un montant en centimes vers une chaîne FCFA lisible.
 *
 * @example formatXof(500_000) → "5 000 FCFA"
 * @example formatXof(null)    → "—"
 */
export function formatXof(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return `${XOF_FORMATTER.format(Math.round(cents / 100))} FCFA`;
}

/**
 * Formate un montant déjà exprimé en francs (pas en centimes).
 * Utile pour les tarifs d'abonnement, saisis en unités entières.
 *
 * @example formatXofUnits(25_000) → "25 000 FCFA"
 */
export function formatXofUnits(units: number | null | undefined): string {
  if (units == null || !Number.isFinite(units)) return "—";
  return `${XOF_FORMATTER.format(Math.round(units))} FCFA`;
}

/**
 * Même montant que `formatXofUnits`, mais découpé en deux morceaux.
 *
 * Sur les cartes de tarifs, le prix est en très gros : « FCFA » à la même taille
 * que le nombre écrase la lecture. Le découpage se fait ici plutôt que dans le
 * composant, pour que le mot « FCFA » reste écrit à un seul endroit.
 *
 * @example formatXofUnitsParts(25_000) → { amount: "25 000", currency: "FCFA" }
 * @example formatXofUnitsParts(null)   → { amount: "—", currency: null }
 */
export function formatXofUnitsParts(units: number | null | undefined): {
  amount: string;
  currency: string | null;
} {
  if (units == null || !Number.isFinite(units)) return { amount: "—", currency: null };
  return { amount: XOF_FORMATTER.format(Math.round(units)), currency: "FCFA" };
}

/**
 * Accord singulier/pluriel générique, pour remplacer les ternaires `${n > 1 ? "s" : ""}`
 * disséminés dans les composants.
 *
 * @example pluralize(1, "preuve")  → "1 preuve"
 * @example pluralize(3, "preuve")  → "3 preuves"
 * @example pluralize(2, "cheval", "chevaux") → "2 chevaux"
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count > 1 ? (plural ?? `${singular}s`) : singular;
  return `${count} ${word}`;
}

/**
 * Formate un solde de conversations client.
 * « conversation client » est le nom canonique de l'unité de crédit — voir glossary.credits.
 */
export function formatCreditCount(count: number): string {
  return pluralize(count, "conversation client", "conversations client");
}

/** Formate une date courte en français. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Formate une date sans l'année, pour les libellés courts (« 12 août »). */
export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
  }).format(d);
}

/** Date compacte avec année (« 9 févr. 2026 ») — colonnes de tableau. */
export function formatDateCompact(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Date et heure (« 9 févr. 2026, 14:30 ») — journaux, commandes, preuves. */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Temps relatif en français (« À l'instant », « Il y a 3 h », « Il y a 2 j »).
 * Remplace les implémentations manuelles dupliquées dans les composants.
 */
export function formatRelativeDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatDateShort(d);

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;

  // Au-delà d'une semaine, « Il y a 400j » n'aide personne.
  return formatDateCompact(d);
}
