import { db } from "~/server/db";
import { uploadProofMedia } from "~/server/media/uploadProofMedia";
import { createPaymentProof } from "~/server/proof/createPaymentProof";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { workerLogger } from "~/lib/logger";

/** A textual receipt must contain a reference, not just a promise or a question. */
export function hasPaymentReference(body: string): boolean {
  const withoutOrder = body.replace(/\bSS-\d+\b/gi, "");
  return /\b(?:r[ée]f[ée]rence|r[ée]f|transaction|transfert|reçu|recu)\s*[:#-]?\s*[a-z0-9-]*\d[a-z0-9-]{4,}\b/i.test(withoutOrder)
    || /^\d{6,}$/.test(withoutOrder.trim());
}

/** Returns false when there is no outstanding deposit; never guesses between orders. */
export async function handlePendingPayment(input: { tenantId: string; phone: string; body: string; mediaUrl?: string; correlationId: string }): Promise<boolean> {
  const { tenantId, phone, body, mediaUrl, correlationId } = input;
  const references = [...new Set(body.match(/\bSS-\d+\b/gi)?.map(value => value.toUpperCase()) ?? [])];
  const orders = await db.order.findMany({
    where: { tenantId, depositStatus: "deposit_pending", status: "confirmed_pending_deposit", reservation: { clientPhone: phone }, ...(references.length === 1 ? { orderNumber: references[0] } : {}) },
    select: { id: true, orderNumber: true }, orderBy: { createdAt: "desc" }, take: 6,
  });
  const reply = (text: string) => writeToOutbox({ tenantId, to: phone, body: text, correlationId });
  if (!orders.length) {
    if (references.length || mediaUrl) { await reply("Je ne trouve pas de commande avec un acompte attendu pour ce justificatif. Vérifiez le numéro de commande ou demandez à parler à la boutique."); return true; }
    return false;
  }
  if (orders.length !== 1 || references.length > 1) {
    await reply(`Pour quelle commande envoyez-vous ce paiement ? ${orders.slice(0, 5).map(order => order.orderNumber).join(", ")}. Renvoyez la preuve avec le numéro de commande dans la légende, ou avec la référence du paiement.`);
    return true;
  }
  const order = orders[0]!;
  if (!mediaUrl && !hasPaymentReference(body)) {
    await reply(`Pour ${order.orderNumber}, envoyez une photo du justificatif ou la référence de transaction. Un message comme « j’ai payé » ne permet pas de vérifier le paiement.`);
    return true;
  }
  try {
    const key = mediaUrl ? await uploadProofMedia(tenantId, order.id, mediaUrl, correlationId) : null;
    if (mediaUrl && !key) throw new Error("Proof image was not stored");
    const proof = await createPaymentProof(tenantId, order.id, key ? { mediaStorageKey: key } : { textPayload: body }, correlationId);
    if (!proof) throw new Error("Proof was not recorded");
  } catch (error) {
    workerLogger.error("Payment proof could not be recorded", { tenantId, orderId: order.id, correlationId, error });
    await reply("Je n’ai pas pu enregistrer votre justificatif. Renvoyez-le avec le numéro de commande. Ne refaites pas le paiement ; si le problème persiste, demandez à parler à la boutique.");
    return true;
  }
  await reply(botMsg.client.proofReceived(order.orderNumber));
  return true;
}
