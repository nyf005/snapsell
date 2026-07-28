/**
 * Accès base pour les frais de livraison.
 *
 * La règle de préséance vit dans `src/lib/delivery/resolve-delivery-fee.ts`, fonction
 * pure partagée avec l'interface : le montant annoncé à la cliente et l'explication
 * affichée à la vendeuse viennent du même code.
 */

import { db } from "~/server/db";
import {
  resolveDeliveryFee,
  type DeliveryFeeResolution,
} from "~/lib/delivery/resolve-delivery-fee";

/**
 * Résout les frais de livraison applicables à une commune, pour un vendeur donné.
 *
 * @param tenantId Vendeur concerné.
 * @param commune  Commune extraite de l'adresse de la cliente (peut être null).
 */
export async function getDeliveryFee(
  tenantId: string,
  commune: string | null | undefined,
): Promise<DeliveryFeeResolution> {
  if (!tenantId?.trim()) {
    return { amount: null, source: "none", label: null };
  }

  const [zones, communes] = await Promise.all([
    db.deliveryZone.findMany({
      where: { tenantId },
      select: { name: true, amount: true, communes: { select: { communeName: true } } },
    }),
    db.deliveryFeeCommune.findMany({
      where: { tenantId },
      select: { communeName: true, amount: true },
    }),
  ]);

  return resolveDeliveryFee(
    commune,
    zones.map((z) => ({
      name: z.name,
      amount: z.amount,
      communes: z.communes.map((c) => c.communeName),
    })),
    communes,
  );
}
