import { db } from "~/server/db";
import { formatXof } from "~/lib/copy";
import { cancelActiveReservations } from "~/server/reservation/cancel";
import {
  createReservation,
  getActiveReservationForClient,
} from "~/server/reservation/service";
import { addToWaitlist } from "~/server/waitlist/addToWaitlist";
import { getCurrentSessionReadOnly } from "~/server/live-session/service";
import { normalizeCode } from "~/server/live-item/createLiveItem";
import { findOrderableItemByCode } from "~/server/catalogue/findOrderableItemByCode";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import {
  startVariantSelection,
  handleVariantChoice,
} from "~/server/conversation/variantSelection";
import { setHandedOff } from "~/server/conversation/conversationState";
import { startSellerVariantConfig } from "~/server/conversation/sellerVariantConfig";
import { confirmCart } from "./confirm-cart";

export type InteractiveReplyContext = {
  tenantId: string;
  clientPhoneE164: string;
  correlationId: string;
  providerMessageId: string;
  interactiveReplyId: string;
  requireDeposit: boolean;
  messageType: "client" | "seller";
};

/**
 * Un seul bouton à la fois : chaque branche répond quelque chose, même en échec
 * ou hors du bon état — un bouton muet est pire qu'un message d'erreur.
 */
export async function handleInteractiveReply(ctx: InteractiveReplyContext): Promise<void> {
  const { tenantId, clientPhoneE164, correlationId, providerMessageId, interactiveReplyId, requireDeposit, messageType } = ctx;

  if (interactiveReplyId === "allow_order_updates") {
    if (messageType !== "client") return;
    await db.messagingConsent.upsert({
      where: { tenantId_phone_scope: { tenantId, phone: clientPhoneE164, scope: "order_updates" } },
      create: { tenantId, phone: clientPhoneE164, scope: "order_updates", sourceMessageId: providerMessageId },
      update: { sourceMessageId: providerMessageId, grantedAt: new Date() },
    });
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: "Vous recevrez les mises à jour de vos commandes sur WhatsApp. Envoyez STOP pour ne plus recevoir de messages.", correlationId });
  } else if (interactiveReplyId === "cancel_order") {
    await cancelActiveReservations(tenantId, clientPhoneE164);
    await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: botMsg.client.reservationCancelled(), correlationId });
  } else if (interactiveReplyId === "confirm_order") {
    const active = await getActiveReservationForClient(tenantId, clientPhoneE164);
    if (active?.status !== "address_collected") {
      await writeToOutbox({ tenantId, to: clientPhoneE164, body: botMsg.client.orderNotReady(), correlationId });
    } else {
      await confirmCart(tenantId, clientPhoneE164, correlationId, requireDeposit);
    }
  } else if (interactiveReplyId.startsWith("retry_code:")) {
    const code = interactiveReplyId.slice("retry_code:".length).toUpperCase();
    const item = await findOrderableItemByCode(tenantId, code);
    if (!item) {
      await writeToOutbox({ tenantId, to: clientPhoneE164, body: botMsg.client.unknownArticleHandedOff(), correlationId });
    } else if (item.availableQty - item.reservedQty <= 0) {
      const wait = await addToWaitlist(tenantId, null, null, clientPhoneE164, correlationId, {
        table: "catalogue_items",
        catalogueItemId: item.id,
      });
      await writeToOutbox({
        tenantId,
        to: clientPhoneE164,
        body: wait.ok ? botMsg.client.waitlist(code, wait.position) : botMsg.client.exhausted(),
        correlationId,
      });
    } else {
      const session = await getCurrentSessionReadOnly(tenantId);
      if (item.hasVariants) {
        await startVariantSelection(tenantId, clientPhoneE164, item, 1, correlationId);
      } else {
        const reservation = await createReservation(tenantId, session?.id ?? null, null, clientPhoneE164, correlationId, {
          catalogueItemId: item.id,
          liveSessionId: session?.id ?? null,
        });
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          body: reservation.success ? botMsg.client.reserved(code) : botMsg.client.exhausted(),
          correlationId,
        });
      }
    }
  } else if (interactiveReplyId === "contact_agent") {
    await setHandedOff(tenantId, clientPhoneE164, true);
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: botMsg.client.handedOff(), correlationId });
  } else if (interactiveReplyId === "send_address") {
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: botMsg.client.addressStillNeeded(), correlationId });
  } else if (interactiveReplyId === "leave_message") {
    await setHandedOff(tenantId, clientPhoneE164, true);
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: "Écrivez votre message ici. La boutique pourra le consulter et vous répondre.", correlationId });
  } else if (interactiveReplyId === "view_catalogue") {
    const items = await db.catalogueItem.findMany({ where: { tenantId, availableQty: { gt: 0 } }, take: 20, orderBy: { createdAt: "desc" } });
    const available = items.filter((item) => item.availableQty > item.reservedQty);
    const text = available.length
      ? available.map((item) => `${item.code} — ${item.name ?? "Article"} — ${formatXof(item.amount)}`).join("\n") + "\nEnvoyez le code de l’article souhaité."
      : "Aucun article disponible pour le moment. Revenez un peu plus tard.";
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: text, correlationId });
  } else if (interactiveReplyId === "send_proof") {
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: botMsg.client.sendProofNow(), correlationId });
  } else if (interactiveReplyId === "track_order") {
    const order = await db.order.findFirst({
      where: { tenantId, reservation: { clientPhone: clientPhoneE164 } },
      orderBy: { createdAt: "desc" },
    });
    await writeToOutbox({
      tenantId,
      to: clientPhoneE164,
      body: order ? botMsg.client.orderStatus(order.orderNumber, order.status) : botMsg.client.noOrderYet(),
      correlationId,
    });
  } else if (interactiveReplyId === "add_item" || interactiveReplyId === "fallback_no") {
    await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
    const bodyMsg = interactiveReplyId === "add_item" ? botMsg.client.sendNextCode() : botMsg.client.resendCode();
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: bodyMsg, correlationId });
  } else if (interactiveReplyId === "no_variants" || interactiveReplyId === "cancel_variant_config") {
    await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
    const bodyMsg = interactiveReplyId === "no_variants" ? botMsg.seller.variantsSkipped() : botMsg.seller.variantConfigCancelled();
    await writeToOutbox({ tenantId, to: clientPhoneE164, body: bodyMsg, correlationId });
  } else if (interactiveReplyId.startsWith("configure_variants:")) {
    const code = normalizeCode(interactiveReplyId.slice("configure_variants:".length));
    const item = await db.catalogueItem.findUnique({
      where: { tenantId_code: { tenantId, code } },
      select: { id: true, attributes: true },
    });
    if (item) {
      await startSellerVariantConfig(
        tenantId,
        clientPhoneE164,
        item.id,
        code,
        correlationId,
        Array.isArray(item.attributes) ? (item.attributes as string[]) : [],
      );
    } else {
      await writeToOutbox({ tenantId, to: clientPhoneE164, body: botMsg.seller.codeNotFoundForVariants(code), correlationId });
    }
  } else if (interactiveReplyId.startsWith("select_val:")) {
    await handleVariantChoice(tenantId, clientPhoneE164, interactiveReplyId.split(":")[1]!, correlationId);
  }
  // Aucun `else` : un id de bouton non reconnu ne déclenche rien, comme avant
  // l'extraction — un futur avatar de bouton ne doit pas faire échouer le job.
}
