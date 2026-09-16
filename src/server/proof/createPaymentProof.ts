/**
 * Story 5.3: Créer une preuve d'acompte (pending).
 * Utilisé par les tests et, à terme, par le worker quand le client envoie une image/message
 * en réponse à une commande en deposit_pending.
 *
 * Flux WhatsApp → preuve (à brancher dans webhook-processor) :
 * 1. Message entrant : from (client), body, mediaUrl (optionnel), correlationId.
 * 2. Trouver une Order du tenant où reservation.clientPhone = from et depositStatus = deposit_pending.
 * 3. Si mediaUrl : fetch média → upload R2 (ex. key: tenants/{tenantId}/payment-proofs/{orderId}/{messageId}) → createPaymentProof(tenantId, orderId, { mediaStorageKey: key }, correlationId).
 * 4. Si texte seul : createPaymentProof(tenantId, orderId, { textPayload: body }, correlationId).
 * 5. Optionnel : répondre au client "Preuve reçue, le vendeur va vérifier."
 *
 * Story 7A.2: Vérifie le quota preuves (maxProofsPerMonth) avant création.
 */

import { db } from "~/server/db";
import { checkProofsQuota } from "~/server/subscription/usage";

export class ProofsQuotaExceededError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly currentUsage: number,
    public readonly quota: number,
  ) {
    super(`Proofs quota exceeded for tenant ${tenantId}: ${currentUsage}/${quota}`);
    this.name = "ProofsQuotaExceededError";
  }
}

export type CreatePaymentProofPayload = {
  mediaStorageKey?: string;
  textPayload?: string;
};

/**
 * Crée une preuve d'acompte en statut pending pour une commande.
 * Vérifie le quota preuves du plan, puis que la commande appartient au tenant et est en deposit_pending.
 * @throws ProofsQuotaExceededError si la limite du cycle est atteinte
 */
export async function createPaymentProof(
  tenantId: string,
  orderId: string,
  payload: CreatePaymentProofPayload,
  correlationId: string,
): Promise<{ id: string } | null> {
  const proofsQuota = await checkProofsQuota(tenantId);
  if (!proofsQuota.allowed) {
    throw new ProofsQuotaExceededError(tenantId, proofsQuota.currentUsage, proofsQuota.quota);
  }

  if (!payload.mediaStorageKey && !payload.textPayload) return null;
  return db.$transaction(async (tx) => {
    const order = await tx.order.updateMany({
      where: { id: orderId, tenantId, status: "confirmed_pending_deposit", depositStatus: "deposit_pending" },
      data: { updatedAt: new Date() },
    });
    if (!order.count) return null;
    const existing = await tx.paymentProof.findFirst({ where: { orderId, tenantId, correlationId } });
    if (existing) return { id: existing.id };
    const proof = await tx.paymentProof.create({
      data: { orderId, tenantId, mediaStorageKey: payload.mediaStorageKey ?? null,
        textPayload: payload.textPayload ?? null, status: "pending", correlationId },
    });
    return { id: proof.id };
  });
}
