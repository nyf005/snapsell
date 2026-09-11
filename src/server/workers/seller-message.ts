import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { env } from "~/env";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { createLiveItem, messageCodeAlreadyUsed, normalizeCode } from "~/server/live-item/createLiveItem";
import { logCatalogueItemPhotoLinked, logLiveItemCreated, logLiveItemDuplicateRejected, logLiveItemPhotoLinked } from "~/server/events/eventLog";
import { uploadMediaToCatalogueItem } from "~/server/media/uploadMediaToCatalogueItem";
import { uploadMediaAndLinkToLiveItem } from "~/server/media/uploadMediaToLiveItem";
import { isR2Configured } from "~/server/media/r2-client";
import { upsertCatalogueItemFromWebhook } from "~/server/catalogue/upsertCatalogueItemFromWebhook";
import { parseSellerCreateItemIntent, parseSellerOffLiveCreateItemIntent } from "~/server/catalogue/sellerCreateIntent";
import { isSellerHelpRequest } from "~/server/messaging/seller-help";
import { SELLER_VARIANT_CONFIG_STATE, handleSellerVariantConfigReply } from "~/server/conversation/sellerVariantConfig";
import { getTrustedAIProductIntent, analyzeInboundIntent } from "~/server/messaging/ai-service";
import { clampQuantity } from "~/server/conversation/inbound-intents";

export async function handleSellerMessage(input: {
  tenantId: string; clientPhoneE164: string; body: string; correlationId: string;
  liveSessionId: string | null | undefined; mediaUrl?: string | null;
  aiAnalysis: Awaited<ReturnType<typeof analyzeInboundIntent>> | null;
}) {
  const { tenantId, clientPhoneE164, body, correlationId, liveSessionId, mediaUrl, aiAnalysis } = input;
  const trimmedBody = body.trim();
  const convState = await db.conversationState.findUnique({
    where: { tenantId_phone: { tenantId, phone: clientPhoneE164 } },
  });
  if (convState?.state === SELLER_VARIANT_CONFIG_STATE) {
    await handleSellerVariantConfigReply(tenantId, clientPhoneE164, body, correlationId);
  } else if (isSellerHelpRequest(body)) {
    // Avant le parsing d'intention, sinon « aide » suivrait le chemin des codes
    // et repartirait en « Je n'ai pas compris ce code ».
    //
    // La réponse dépend de l'état du live : les commandes reconnues ne sont pas
    // les mêmes des deux côtés.
    await writeToOutbox({
      tenantId,
      to: clientPhoneE164,
      body: botMsg.seller.help({
        inLive: Boolean(liveSessionId),
        ...(env.NEXT_PUBLIC_APP_URL
          ? { helpUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/aide` }
          : {}),
      }),
      correlationId,
    });
  } else {
    let intent = liveSessionId
      ? parseSellerCreateItemIntent(body)
      : parseSellerOffLiveCreateItemIntent(body);

    // Story 12.1: AI Fallback for seller creation
    const aiSellerIntent = getTrustedAIProductIntent(aiAnalysis, "SELLER_CREATE");
    if (!intent && aiSellerIntent) {
      intent = {
        code: normalizeCode(aiSellerIntent.code),
        quantity: clampQuantity(aiSellerIntent.quantity),
      };
    }

    if (intent) {
      const catRes = await upsertCatalogueItemFromWebhook(tenantId, intent.code, intent.quantity, {
        createdInLive: !!liveSessionId,
        origin: liveSessionId ? "live" : "seller_whatsapp",
      });
      if (!catRes.success) {
        const errorMsg =
          catRes.reason === "no_price"
            ? botMsg.seller.noPriceConfigured(normalizeCode(intent.code).charAt(0).toUpperCase())
            : catRes.reason === "already_in_stock"
              ? botMsg.seller.codeAlreadyInStock(normalizeCode(intent.code), catRes.availableQty ?? 0)
              : botMsg.seller.codeNotInCatalogue(normalizeCode(intent.code));
        await writeToOutbox({ tenantId, to: clientPhoneE164, body: errorMsg, correlationId });
      } else {
        const r2 = isR2Configured();
        if (mediaUrl && r2)
          await uploadMediaToCatalogueItem(
            tenantId,
            catRes.catalogueItemId,
            mediaUrl,
            correlationId,
          )
            .then(() =>
              logCatalogueItemPhotoLinked(
                tenantId,
                catRes.catalogueItemId,
                intent.code,
                correlationId,
              ),
            )
            .catch((err) => {
              workerLogger.error("Journal: photo d'article non tracée", {
                tenantId,
                correlationId,
                err,
              });
            });

        if (liveSessionId) {
          const liveRes = await createLiveItem(tenantId, intent.code, {
            quantity: intent.quantity,
          });
          if (liveRes.success) {
            const bodyMsg = (
              mediaUrl && r2 ? botMsg.seller.itemCreatedWithPhoto : botMsg.seller.itemCreated
            )(liveRes.liveItem.code, liveRes.liveItem.quantity);
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: bodyMsg,
              correlationId,
            });
            await logLiveItemCreated(tenantId, liveRes.liveItem.id, correlationId, {
              code: liveRes.liveItem.code,
              quantity: liveRes.liveItem.quantity,
              live_session_id: liveRes.liveItem.liveSessionId,
            });
            if (mediaUrl && r2) {
              void uploadMediaAndLinkToLiveItem(
                tenantId,
                liveRes.liveItem.id,
                mediaUrl,
                correlationId,
              )
                .then(() =>
                  logLiveItemPhotoLinked(
                    tenantId,
                    liveRes.liveItem.id,
                    liveRes.liveItem.code,
                    correlationId,
                  ),
                )
                .catch((err) => {
                  workerLogger.error("Journal: photo d'article live non tracée", {
                    tenantId,
                    correlationId,
                    err,
                  });
                });
            }
          } else if ("duplicate" in liveRes) {
            await logLiveItemDuplicateRejected(tenantId, intent.code, correlationId).catch(
              () => {},
            );
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: messageCodeAlreadyUsed(intent.code),
              correlationId,
            });
          }
        } else {
          const msg = (
            mediaUrl && r2
              ? botMsg.seller.catalogueAddedWithPhotoInteractive
              : botMsg.seller.catalogueAddedInteractive
          )(normalizeCode(intent.code), intent.quantity);
          await writeToOutbox({ tenantId, to: clientPhoneE164, ...msg, correlationId });
        }
      }
    } else if (mediaUrl) {
      await writeToOutbox({
        tenantId,
        to: clientPhoneE164,
        body: botMsg.seller.photoNoCode(),
        correlationId,
      });
    } else if (trimmedBody.length > 0) {
      await writeToOutbox({
        tenantId,
        to: clientPhoneE164,
        body: liveSessionId ? botMsg.seller.sellerFallback() : botMsg.seller.offLiveCreateInstruction(),
        correlationId,
      });
    }
  }
}
