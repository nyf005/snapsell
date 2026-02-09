/**
 * Story 5.3: Créer une preuve d'acompte (pending).
 * Utilisé par les tests et, à terme, par le worker quand le client envoie une image/message
 * en réponse à une commande en deposit_pending.
 *
 * Flux WhatsApp → preuve (à brancher dans webhook-processor) :
 * 1. Message entrant : from (client), body, mediaUrl (optionnel), correlationId.
 * 2. Trouver une Order du tenant où reservation.clientPhone = from et depositStatus = deposit_pending.
 * 3. Si mediaUrl : fetch média Twilio → upload R2 (ex. key: tenants/{tenantId}/payment-proofs/{orderId}/{messageId}) → createPaymentProof(tenantId, orderId, { mediaStorageKey: key }, correlationId).
 * 4. Si texte seul : createPaymentProof(tenantId, orderId, { textPayload: body }, correlationId).
 * 5. Optionnel : répondre au client "Preuve reçue, le vendeur va vérifier."
 */

import { db } from "~/server/db";

export type CreatePaymentProofPayload = {
  mediaStorageKey?: string;
  textPayload?: string;
};

/**
 * Crée une preuve d'acompte en statut pending pour une commande.
 * Vérifie que la commande appartient au tenant et est en deposit_pending.
 */
export async function createPaymentProof(
  tenantId: string,
  orderId: string,
  payload: CreatePaymentProofPayload,
  correlationId: string,
): Promise<{ id: string } | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, tenantId, depositStatus: "deposit_pending" },
  });
  if (!order || order.depositStatus !== "deposit_pending") return null;
  if (!payload.mediaStorageKey && !payload.textPayload) return null;

  const proof = await db.paymentProof.create({
    data: {
      orderId,
      tenantId,
      mediaStorageKey: payload.mediaStorageKey ?? null,
      textPayload: payload.textPayload ?? null,
      status: "pending",
      correlationId,
    },
  });
  return { id: proof.id };
}
