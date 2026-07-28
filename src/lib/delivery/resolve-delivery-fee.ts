/**
 * Résolution des frais de livraison à partir de la commune annoncée par la cliente.
 *
 * Fonction **pure** : le calcul appliqué par le robot et l'explication affichée dans
 * les paramètres viennent du même endroit.
 *
 * ── LA PRÉSÉANCE ────────────────────────────────────────────────────────────
 *   1. Prix par commune, correspondance exacte sur le nom normalisé   → l'emporte
 *   2. Zone contenant cette commune                                    → ensuite
 *   3. Zone de repli (« Intérieur du pays »)                           → sinon
 *   4. Aucun des trois                                                 → null
 *
 * Le prix par commune l'emporte sur celui de sa zone : c'est ce que dit déjà le
 * schéma (`DeliveryFeeCommune` = « hors zone ou surcharge »). Cette règle doit être
 * citée telle quelle dans l'interface — voir `ui.delivery.precedence`.
 *
 * Quand rien ne correspond, on renvoie `null` et **aucun frais n'est ajouté** : mieux
 * vaut annoncer « à confirmer » que facturer un montant que la vendeuse n'a pas choisi.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Nom de la zone servant de repli quand la commune est inconnue. */
export const FALLBACK_ZONE_NAME = "Intérieur du pays";

export type DeliveryZoneInput = {
  name: string;
  amount: number;
  /** Noms des communes rattachées à la zone. */
  communes: readonly string[];
};

export type DeliveryCommuneInput = {
  communeName: string;
  amount: number;
};

export type DeliveryFeeResolution = {
  /** Montant en centimes, ou null si aucune règle ne s'applique. */
  amount: number | null;
  /** D'où vient le montant — pour l'affichage et les journaux. */
  source: "commune" | "zone" | "fallback-zone" | "none";
  /** Libellé de la règle appliquée (nom de commune ou de zone). */
  label: string | null;
};

/**
 * Normalise un nom de commune pour la comparaison : minuscules, sans accents,
 * sans espaces superflus. « Cocody », « cocody » et « COCODY » sont équivalents,
 * de même que « Abobo » et « Abobô ».
 */
export function normalizeCommuneName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Résout les frais de livraison applicables à une commune.
 *
 * @param commune  Commune extraite de l'adresse de la cliente (peut être null).
 * @param zones    Zones du vendeur, avec leurs communes.
 * @param communes Prix par commune du vendeur.
 */
export function resolveDeliveryFee(
  commune: string | null | undefined,
  zones: readonly DeliveryZoneInput[],
  communes: readonly DeliveryCommuneInput[],
): DeliveryFeeResolution {
  const target = commune ? normalizeCommuneName(commune) : "";

  if (target.length > 0) {
    // 1. Prix par commune — l'emporte sur la zone.
    const exact = communes.find((c) => normalizeCommuneName(c.communeName) === target);
    if (exact) {
      return { amount: exact.amount, source: "commune", label: exact.communeName };
    }

    // 2. Zone contenant cette commune.
    const zone = zones.find((z) =>
      z.communes.some((name) => normalizeCommuneName(name) === target),
    );
    if (zone) {
      return { amount: zone.amount, source: "zone", label: zone.name };
    }
  }

  // 3. Zone de repli.
  const fallback = zones.find(
    (z) => normalizeCommuneName(z.name) === normalizeCommuneName(FALLBACK_ZONE_NAME),
  );
  if (fallback) {
    return { amount: fallback.amount, source: "fallback-zone", label: fallback.name };
  }

  // 4. Rien : aucun frais appliqué.
  return { amount: null, source: "none", label: null };
}

/**
 * Communes présentes à la fois dans une zone et dans la table par commune.
 *
 * Ce n'est pas une erreur — c'est le mécanisme de surcharge prévu — mais la vendeuse
 * doit savoir lequel des deux prix s'applique réellement.
 */
export function findOverriddenCommunes(
  zones: readonly DeliveryZoneInput[],
  communes: readonly DeliveryCommuneInput[],
): { communeName: string; communeAmount: number; zoneName: string; zoneAmount: number }[] {
  const result: {
    communeName: string;
    communeAmount: number;
    zoneName: string;
    zoneAmount: number;
  }[] = [];

  for (const c of communes) {
    const key = normalizeCommuneName(c.communeName);
    const zone = zones.find((z) => z.communes.some((n) => normalizeCommuneName(n) === key));
    if (zone) {
      result.push({
        communeName: c.communeName,
        communeAmount: c.amount,
        zoneName: zone.name,
        zoneAmount: zone.amount,
      });
    }
  }
  return result;
}
