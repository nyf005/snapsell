import { db } from "~/server/db";
import { createOrderFromReservation } from "~/server/order/createOrderFromReservation";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";

/**
 * Confirme toutes les réservations "adresse renseignée" du client : une commande
 * par réservation, jamais une commande multi-lignes. Appelée depuis le bouton
 * "Confirmer" et depuis le "oui" texte libre — le même chemin des deux côtés.
 */
export async function confirmCart(
  tenantId: string,
  clientPhoneE164: string,
  correlationId: string,
  requireDeposit: boolean,
): Promise<void> {
  const reservations = await db.reservation.findMany({
    where: { tenantId, clientPhone: clientPhoneE164, status: "address_collected" },
    orderBy: { createdAt: "asc" },
  });
  const confirmed: string[] = [];
  let failed = 0;
  for (const reservation of reservations) {
    const result = await createOrderFromReservation(tenantId, reservation.id, requireDeposit, clientPhoneE164, correlationId);
    if (result.success) confirmed.push(result.order.orderNumber);
    else failed++;
  }
  if (confirmed.length) await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
  await writeToOutbox({ tenantId, to: clientPhoneE164, correlationId, purpose: "order_confirmation",
    ...(requireDeposit ? botMsg.client.orderWithDepositInteractive(15) : botMsg.client.orderConfirmedInteractive()),
    body: confirmed.length
      ? `Commande${confirmed.length > 1 ? "s" : ""} enregistrée${confirmed.length > 1 ? "s" : ""} : ${confirmed.join(", ")}.` +
        (requireDeposit ? " Les acomptes attendus sont indiqués pour chaque commande." : "") +
        (failed ? " Certains articles n’ont pas pu être confirmés. Vérifiez leur disponibilité avant de renvoyer leur code." : "")
      : botMsg.client.orderFailed(),
  });
}
