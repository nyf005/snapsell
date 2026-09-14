import { handleSellerMessage } from "./seller-message";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { formatXof } from "~/lib/copy";
import { captureException } from "~/lib/sentry";
import { boss, QUEUE, type PgBossJob } from "./queues";
import type { InboundMessage, EnrichedInboundMessage } from "../messaging/types";
import { normalizeIncomingPhone } from "~/lib/validations/phone";
import { checkAndConsumeCredit } from "~/server/credits/service";
import {
  logOptOutRecorded,
} from "~/server/events/eventLog";
import {
  createReservation,
  getActiveReservationForClient,
  collectAddress,
} from "~/server/reservation/service";
import { addToWaitlist } from "~/server/waitlist/addToWaitlist";
import { getCurrentSessionReadOnly } from "~/server/live-session/service";
import {
  normalizeCode,
} from "~/server/live-item/createLiveItem";
import { findOrderableItemByCode } from "~/server/catalogue/findOrderableItemByCode";
import { handlePendingPayment, hasPaymentReference } from "~/server/conversation/payment-proof";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { getDeliveryFee } from "~/server/delivery/getDeliveryFee";
import { createOrderFromReservation } from "~/server/order/createOrderFromReservation";
import { getConversationState, setHandedOff } from "~/server/conversation/conversationState";
import {
  startVariantSelection,
  handleVariantChoice,
} from "~/server/conversation/variantSelection";
import {
  startSellerVariantConfig,
} from "~/server/conversation/sellerVariantConfig";
import {
  analyzeInboundIntent,
  getTrustedAIFaqCategory,
  getTrustedAIProductIntent,
  hasTrustedAIIntent,
} from "../messaging/ai-service";

import { isConversationQuestion, isChangeRequest, isStopMessage, isHandoffRequest, isHandoffActive, isOutsideBusinessHours, MAX_ORDER_ITEMS, clampQuantity, parseClientCodeIntent, isConfirmOui, detectFaqIntent } from "~/server/conversation/inbound-intents";
export * from "~/server/conversation/inbound-intents";

/** Traite un job webhook : détermine le type de message et enrichit le payload. */
export async function processWebhookJob(
  job: PgBossJob<InboundMessage>,
): Promise<EnrichedInboundMessage> {
  const { tenantId, from, body, providerMessageId, mediaUrl, correlationId, interactiveReplyId, orderPayload } =
    job.data;

  if (!tenantId) {
    workerLogger.warn("Webhook processing aborted: tenantId is null", { providerMessageId, from });
    return { ...job.data, tenantId: null, messageType: "client" };
  }

  let clientPhoneE164: string;
  try {
    clientPhoneE164 = normalizeIncomingPhone(from);
  } catch (err) {
    workerLogger.warn("Webhook processing aborted: invalid phone format", { 
      from, 
      tenantId, 
      providerMessageId 
    });
    return { ...job.data, tenantId, messageType: "client" };
  }

  try {
    // 1. Déterminer le type de message (vendeur vs client)
    const sellerPhones = await db.sellerPhone.findMany({ where: { tenantId } });
    const isSeller = sellerPhones.some(
      (sp) => normalizeIncomingPhone(sp.phoneNumber) === clientPhoneE164,
    );
    const messageType = isSeller ? "seller" : "client";

    const buildEnrichedMessage = (liveSessionId?: string | null): EnrichedInboundMessage => ({
      ...job.data,
      tenantId,
      messageType,
      liveSessionId: liveSessionId ?? null,
    });

    /**
     * ── LE STOP PASSE AVANT LE CONTRÔLE DE CRÉDIT ─────────────────────────────
     * La détection du STOP venait après `checkAndConsumeCredit` : se désabonner
     * ouvrait donc une fenêtre de conversation facturée. La boutique payait pour
     * un désabonnement.
     *
     * Elle venait aussi après le message d'absence, qu'une cliente recevait donc
     * en réponse à son « STOP ».
     *
     * On sort tout de suite : en aval, un corps « stop » ne déclenchait plus rien
     * de toute façon — l'IA, la mise en relation, la lecture de session et les
     * intentions client l'excluent tous explicitement. Sortir ne retire donc aucun
     * comportement, et évite d'en ajouter par accident plus tard.
     * ──────────────────────────────────────────────────────────────────────────
     */
    if (messageType === "client" && isStopMessage(body)) {
      const existing = await db.optOut.findUnique({
        where: { tenantId_phoneNumber: { tenantId, phoneNumber: clientPhoneE164 } },
      });
      if (!existing) {
        const optOut = await db.optOut.create({
          data: { tenantId, phoneNumber: clientPhoneE164, optedOutAt: new Date() },
        });
        // Un échec d'écriture au journal ne doit pas faire échouer le STOP, mais il
        // laisse un trou dans la trace : sans log, personne ne le saurait.
        await logOptOutRecorded(tenantId, optOut.id, correlationId).catch((err) => {
          workerLogger.error("Journal: opt-out non tracé", { tenantId, correlationId, err });
        });
      }
      return buildEnrichedMessage();
    }

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        subscriptionPlan: true,
        requireDeposit: true,
        assistantEnabled: true,
        faqDelivery: true,
        faqPayment: true,
        faqLocation: true,
        faqAvailability: true,
        businessHoursStart: true,
        businessHoursEnd: true,
        businessTimezone: true,
        awayMessage: true,
      },
    });

    // La pause globale passe avant les crédits, l'IA et toute automatisation.
    // Les messages vendeurs restent actifs : ils servent à préparer le catalogue
    // et le live, ils ne sont pas des réponses automatiques à la clientèle.
    if (messageType === "client" && tenant?.assistantEnabled === false) {
      workerLogger.info("Assistant paused, inbound client message stored without reply", {
        tenantId,
        correlationId,
      });
      return buildEnrichedMessage();
    }

    if (messageType === "client") {
      const state = await getConversationState(tenantId, clientPhoneE164);
      if (isHandoffActive(state)) return buildEnrichedMessage();
      if (state?.handedOff) {
        // Passé le délai, on rend la main au bot plutôt que de laisser la cliente
        // sans réponse : rien ni personne ne remettait `handedOff` à false.
        await setHandedOff(tenantId, clientPhoneE164, false);
        workerLogger.info("Mise en relation expirée, le bot reprend", {
          tenantId,
          correlationId,
        });
      }
    }

    // 2. Pour les clients: vérifier les credits (Story Credits)
    if (messageType === "client") {
      const creditCheck = await checkAndConsumeCredit(tenantId, clientPhoneE164);
      if (!creditCheck.allowed) {
        // Crédits épuisés : on abandonne silencieusement — le client ne doit pas
        // savoir que le vendeur a atteint sa limite. Aucun message envoyé.
        workerLogger.info("Credits exhausted, message silently dropped", {
          tenantId,
          correlationId,
        });
        return { ...job.data, tenantId, messageType, liveSessionId: null };
      }
    }

    // 3. Away message — réponse automatique hors horaires (Phase 4)
    // Envoyé uniquement aux clients, une seule fois par heure
    if (
      messageType === "client" &&
      tenant?.businessHoursStart &&
      tenant.businessHoursEnd &&
      isOutsideBusinessHours(tenant.businessHoursStart, tenant.businessHoursEnd, tenant.businessTimezone ?? "UTC")
    ) {
      const recentAwayMessage = await db.messageOut.findFirst({
        where: {
          tenantId,
          to: clientPhoneE164,
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          // Identifier les away messages via correlationId préfixé
          correlationId: { startsWith: "away:" },
        },
        select: { id: true },
      });

      if (!recentAwayMessage) {
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          ...botMsg.client.awayMessageInteractive(
            tenant.awayMessage ?? "",
            tenant.name ?? "",
          ),
          correlationId: `away:${correlationId}`,
        });
      }
      // On continue le traitement normal — le bot répond quand même si possible
    }

    // 4. AI Intent Analysis - only for paid plans (Starter/Pro)
    let aiAnalysis = null;
    const hasAI = tenant?.subscriptionPlan !== "free";
    if (hasAI && !isStopMessage(body) && body.trim().length > 0) {
      aiAnalysis = await analyzeInboundIntent(body);
      workerLogger.info("AI Analysis result", { tenantId, intent: aiAnalysis?.intent, confidence: aiAnalysis?.confidence });
    } else if (!hasAI && !isStopMessage(body) && body.trim().length > 0) {
      workerLogger.debug("AI skipped for FREE plan", { tenantId, body: body.substring(0, 50) });
    }

    // 5. Handoff management
    if (messageType === "client" && !isStopMessage(body) && body.trim().length > 0) {
      if (isHandoffRequest(body) || hasTrustedAIIntent(aiAnalysis, "HUMAN_AGENT")) {
        await setHandedOff(tenantId, clientPhoneE164, true);
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          body: botMsg.client.handedOff(),
          correlationId,
        });
        return buildEnrichedMessage();
      }

    }

    if (messageType === "client" && !interactiveReplyId && body.trim()) {
      const changing = isChangeRequest(body) || hasTrustedAIIntent(aiAnalysis, "CHANGE_REQUEST");
      const question = isConversationQuestion(body) || hasTrustedAIIntent(aiAnalysis, "QUESTION") || hasTrustedAIIntent(aiAnalysis, "FAQ");
      if (changing || question) {
        const category = getTrustedAIFaqCategory(aiAnalysis) ?? detectFaqIntent(body);
        const answer = !changing && category ? ({ delivery: tenant?.faqDelivery, payment: tenant?.faqPayment, location: tenant?.faqLocation, availability: tenant?.faqAvailability })[category] : null;
        // Do not promise an exception (payment tomorrow, cancellation, etc.) based on a generic FAQ.
        if (answer && !/\b(?:demain|plus tard|annul|chang|modifi)/i.test(body)) {
          await writeToOutbox({ tenantId, to: clientPhoneE164, body: answer, correlationId });
        } else {
          await setHandedOff(tenantId, clientPhoneE164, true);
          await writeToOutbox({ tenantId, to: clientPhoneE164, body: botMsg.client.handedOff(), correlationId });
        }
        return buildEnrichedMessage();
      }
    }

    // 6. Commande via panier WA natif (P1 — message type "order")
    if (orderPayload?.items.length) {
      const reserved: Array<{ code: string; qty: number; prix: string }> = [];
      const failed: string[] = [];
      const unknown: string[] = [];

      // Le panier arrivait tel quel de Meta, sans borne : chaque article coûte deux
      // allers-retours base plus une réservation. Meta ne publie pas de limite de
      // panier mais plafonne ses messages multi-produits à 30 ; cent laisse donc
      // large tout en bornant la boucle.
      const orderItems = orderPayload.items.slice(0, MAX_ORDER_ITEMS);
      if (orderPayload.items.length > MAX_ORDER_ITEMS) {
        workerLogger.warn("Panier tronqué au plafond", {
          tenantId,
          correlationId,
          received: orderPayload.items.length,
          kept: MAX_ORDER_ITEMS,
        });
      }

      for (const item of orderItems) {
        const code = item.productRetailerId.toUpperCase();
        const quantity = clampQuantity(item.quantity);
        const result = await findOrderableItemByCode(tenantId, code);
        if (!result) {
          unknown.push(code);
          continue;
        }
        const reservation = await createReservation(tenantId, null, null, clientPhoneE164, correlationId, { catalogueItemId: result.id, quantity });
        if (reservation.success) {
          reserved.push({
            code,
            qty: quantity,
            // `formatXof` et non un `toLocaleString` à la main : `amount` est en
            // centimes (`amount_cents`), et cette ligne ne divisait pas par 100.
            // Le panier natif affichait donc des montants cent fois trop grands.
            prix: formatXof((result.amount ?? 0) * quantity),
          });
        } else {
          failed.push(code);
        }
      }

      if (reserved.length > 0) {
        // Demander l'adresse de livraison après confirmation
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          ...botMsg.client.orderSummaryInteractive(
            reserved,
            "À renseigner",
            reserved.map((r) => r.prix).join(" + "),
          ),
          correlationId,
        });
      }

      if (failed.length > 0) {
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          body: botMsg.client.itemsUnavailable(failed),
          correlationId: `${correlationId}:order_partial`,
        });
      }

      if (unknown.length > 0) {
        await setHandedOff(tenantId, clientPhoneE164, true);
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          body: botMsg.client.unknownArticleHandedOff(),
          correlationId: `${correlationId}:order_unknown`,
        });
      }

      return buildEnrichedMessage();
    }

    // 7. Interactive Replies Handler
    if (interactiveReplyId) {
      if (interactiveReplyId === "cancel_order") {
        const active = await getActiveReservationForClient(tenantId, clientPhoneE164);
        if (active)
          await db.reservation.update({ where: { id: active.id }, data: { status: "expired" } });
        await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          body: botMsg.client.reservationCancelled(),
          correlationId,
        });
      } else if (interactiveReplyId === "confirm_order") {
        // Les trois issues répondent quelque chose. Avant, appuyer sur « Confirmer »
        // hors du bon état — ou une création de commande en échec — ne renvoyait
        // rien du tout : la cliente restait devant un bouton muet.
        const active = await getActiveReservationForClient(tenantId, clientPhoneE164);
        if (active?.status !== "address_collected") {
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.orderNotReady(),
            correlationId,
          });
        } else {
          const res = await createOrderFromReservation(
            tenantId,
            active.id,
            tenant?.requireDeposit ?? false,
            clientPhoneE164,
            correlationId,
          );
          if (res.success) {
            await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              correlationId,
              purpose: "order_confirmation",
              ...(tenant?.requireDeposit
                ? botMsg.client.orderWithDepositInteractive(15)
                : botMsg.client.orderConfirmedInteractive()),
            });
          } else {
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: botMsg.client.orderFailed(),
              correlationId,
            });
          }
        }
      } else if (interactiveReplyId.startsWith("retry_code:")) {
        const code = interactiveReplyId.slice("retry_code:".length).toUpperCase();
        const item = await findOrderableItemByCode(tenantId, code);
        if (!item) {
          await setHandedOff(tenantId, clientPhoneE164, true);
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.unknownArticleHandedOff(),
            correlationId,
          });
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
          if (item.hasVariants)
            await startVariantSelection(tenantId, clientPhoneE164, item, 1, correlationId);
          else {
            await createReservation(tenantId, session?.id ?? null, null, clientPhoneE164, correlationId, {
              catalogueItemId: item.id,
              liveSessionId: session?.id ?? null,
            });
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: botMsg.client.reserved(code),
              correlationId,
            });
          }
        }
      } else if (interactiveReplyId === "contact_agent") {
        await setHandedOff(tenantId, clientPhoneE164, true);
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          body: botMsg.client.handedOff(),
          correlationId,
        });
      } else if (interactiveReplyId === "send_proof") {
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          body: botMsg.client.sendProofNow(),
          correlationId,
        });
      } else if (interactiveReplyId === "track_order") {
        const order = await db.order.findFirst({
          where: { tenantId, reservation: { clientPhone: clientPhoneE164 } },
          orderBy: { createdAt: "desc" },
        });
        await writeToOutbox({
          tenantId,
          to: clientPhoneE164,
          body: order
            ? botMsg.client.orderStatus(order.orderNumber)
            : botMsg.client.noOrderYet(),
          correlationId,
        });
      } else if (interactiveReplyId === "add_item" || interactiveReplyId === "fallback_no") {
        await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
        const bodyMsg =
          interactiveReplyId === "add_item"
            ? botMsg.client.sendNextCode()
            : botMsg.client.resendCode();
        await writeToOutbox({ tenantId, to: clientPhoneE164, body: bodyMsg, correlationId });
      } else if (
        interactiveReplyId === "no_variants" ||
        interactiveReplyId === "cancel_variant_config"
      ) {
        await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
        const bodyMsg =
          interactiveReplyId === "no_variants"
            ? botMsg.seller.variantsSkipped()
            : botMsg.seller.variantConfigCancelled();
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
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.seller.codeNotFoundForVariants(code),
            correlationId,
          });
        }
      } else if (interactiveReplyId.startsWith("select_val:")) {
        await handleVariantChoice(
          tenantId,
          clientPhoneE164,
          interactiveReplyId.split(":")[1]!,
          correlationId,
        );
      }
      return buildEnrichedMessage();
    }

    // 8. Session Lookup
    const trimmedBody = body.trim();
    const isClient = messageType === "client";
    const shouldRead =
      trimmedBody.length > 0 &&
      !isStopMessage(body);
    const liveSessionId = shouldRead ? (await getCurrentSessionReadOnly(tenantId))?.id : null;

    // 9. Client intent
    if (isClient) {
      if (mediaUrl || hasPaymentReference(body) || /\bSS-\d+\b/i.test(body)) {
        if (await handlePendingPayment({ tenantId, phone: clientPhoneE164, body, mediaUrl, correlationId })) return buildEnrichedMessage(liveSessionId);
      }
      let clientCodeIntent = parseClientCodeIntent(body);

      // Story 12.1: AI Fallback for buying intent
      const aiBuyIntent = getTrustedAIProductIntent(aiAnalysis, "BUY");
      if (!clientCodeIntent && aiBuyIntent) {
        clientCodeIntent = {
          code: normalizeCode(aiBuyIntent.code),
          // Bornée comme celle du parseur strict : l'IA renvoyait un nombre libre.
          quantity: clampQuantity(aiBuyIntent.quantity),
          isTypo: false,
        };
      }

      if (clientCodeIntent) {
        // Une grille de prix ne prouve pas que l'article existe. Le chemin client
        // ne crée donc jamais un article implicitement, même pendant un live.
        const item = await findOrderableItemByCode(tenantId, clientCodeIntent.code);

        if (!item) {
          await setHandedOff(tenantId, clientPhoneE164, true);
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.unknownArticleHandedOff(),
            correlationId,
          });
        } else if (clientCodeIntent.isTypo) {
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            correlationId,
            ...botMsg.client.codeSuggestionInteractive(item.code),
          });
        } else {
          const free = item.availableQty - item.reservedQty;
          if (free < clientCodeIntent.quantity) {
            const wait = await addToWaitlist(
              tenantId,
              null,
              null,
              clientPhoneE164,
              correlationId,
              { table: "catalogue_items", catalogueItemId: item.id },
            );
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: wait.ok
                ? botMsg.client.waitlist(clientCodeIntent.code, wait.position)
                : botMsg.client.exhausted(),
              correlationId,
            });
          } else if (item.hasVariants) {
            await startVariantSelection(
              tenantId,
              clientPhoneE164,
              item,
              clientCodeIntent.quantity,
              correlationId,
              liveSessionId,
            );
          } else {
            const res = await createReservation(tenantId, liveSessionId ?? null, null, clientPhoneE164, correlationId, {
              catalogueItemId: item.id,
              liveSessionId: liveSessionId ?? null,
              quantity: clientCodeIntent.quantity,
            });
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: res.success
                ? botMsg.client.reserved(
                    `${clientCodeIntent.code}${
                      clientCodeIntent.quantity > 1 ? ` (x${clientCodeIntent.quantity})` : ""
                    }`,
                  )
                : botMsg.client.exhausted(),
              correlationId,
            });
          }
        }
        return buildEnrichedMessage(liveSessionId);
      }

      if (trimmedBody.length > 0 && !isStopMessage(body)) {
        const active = await getActiveReservationForClient(tenantId, clientPhoneE164);
        if (active?.status === "reserved" && (isConfirmOui(body) || /^(?:ok|d[’']accord|merci|bonjour|salut|bonsoir)[.! ]*$/i.test(body.trim()))) {
          // « oui » alors qu'on attend l'adresse : `collectAddress` ne vérifie que
          // le non-vide, l'adresse de livraison devenait donc littéralement « oui ».
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.addressStillNeeded(),
            correlationId,
          });
          return buildEnrichedMessage(liveSessionId);
        } else if (active?.status === "reserved") {
          const collect = await collectAddress(tenantId, clientPhoneE164, body);
          if (collect.success) {
            const { code, amount, quantity, variantLabel, mediaStorageKey } =
              collect.reservation.item;

            // Frais de livraison : commune > zone > « Intérieur du pays » > aucun.
            // Voir src/lib/delivery/resolve-delivery-fee.ts.
            const deliveryFee = await getDeliveryFee(
              tenantId,
              collect.reservation.addressCommune,
            );

            // Formateur unique : `formatFcfa` était défini ici, un second
            // formateur ad hoc dans le même fichier — c'est par là que l'oubli de
            // division du panier natif est passé.
            const displayPrice = amount ? formatXof(amount) : "—";
            const displayDelivery =
              deliveryFee.amount !== null ? formatXof(deliveryFee.amount) : null;
            const displayTotal = amount
              ? formatXof(amount * quantity + (deliveryFee.amount ?? 0))
              : "—";
            const label = `${code}${variantLabel ? ` [${variantLabel}]` : ""}${
              quantity > 1 ? ` (x${quantity})` : ""
            }`;
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              correlationId,
              ...botMsg.client.recapInteractive(
                label,
                displayPrice,
                displayTotal,
                trimmedBody,
                displayDelivery,
              ),
              mediaUrl: mediaStorageKey || undefined,
            });
            return buildEnrichedMessage(liveSessionId);
          }
        } else if (isConfirmOui(body) && active?.status === "address_collected") {
          const order = await createOrderFromReservation(
            tenantId,
            active.id,
            tenant?.requireDeposit ?? false,
            clientPhoneE164,
            correlationId,
          );
          if (order.success) {
            await db.conversationState.deleteMany({ where: { tenantId, phone: clientPhoneE164 } });
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              correlationId,
              purpose: "order_confirmation",
              ...(tenant?.requireDeposit
                ? botMsg.client.orderWithDepositInteractive(15)
                : botMsg.client.orderConfirmedInteractive()),
            });
            return buildEnrichedMessage(liveSessionId);
          }
          // Un « oui » resté sans réponse laissait la cliente sans savoir si sa
          // commande était passée.
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.orderFailed(),
            correlationId,
          });
          return buildEnrichedMessage(liveSessionId);
        }

        if (await handlePendingPayment({ tenantId, phone: clientPhoneE164, body, correlationId })) return buildEnrichedMessage(liveSessionId);

        const faqCategory = detectFaqIntent(body) ?? getTrustedAIFaqCategory(aiAnalysis);
        const faqAnswer = faqCategory
          ? faqCategory === "delivery"
            ? tenant?.faqDelivery
            : faqCategory === "payment"
              ? tenant?.faqPayment
              : faqCategory === "location"
                ? tenant?.faqLocation
                : tenant?.faqAvailability
          : null;

        if (faqAnswer) {
          await writeToOutbox({ tenantId, to: clientPhoneE164, body: faqAnswer, correlationId });
        } else {
          // Un `count` sur tout l'historique tournait à chaque message non reconnu,
          // et grossissait indéfiniment. Deux lignes suffisent pour savoir si
          // c'est le premier message.
          const firstMessages = await db.messageIn.findMany({
            where: { tenantId, from: clientPhoneE164 },
            select: { id: true },
            take: 2,
          });
          if (firstMessages.length <= 1) {
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: botMsg.client.welcome(tenant?.name || "la boutique"),
              correlationId,
            });
          } else {
            const recentOrder = await db.order.findFirst({
              where: {
                tenantId,
                reservation: { clientPhone: clientPhoneE164 },
                status: {
                  in: ["confirmed", "confirmed_pending_deposit", "preparing", "in_delivery"],
                },
              },
              orderBy: { createdAt: "desc" },
            });
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              correlationId,
              ...(recentOrder
                ? { body: botMsg.client.orderStatus(recentOrder.orderNumber) }
                : botMsg.client.fallbackInteractive()),
            });
          }
        }
      }
    }

    if (isSeller) {
      await handleSellerMessage({ tenantId, clientPhoneE164, body, correlationId, liveSessionId, mediaUrl, aiAnalysis });
    }

    return buildEnrichedMessage(liveSessionId);
  } catch (error) {
    workerLogger.error("Error processing webhook job", error, { correlationId, tenantId });
    throw error;
  }
}

export async function startWebhookProcessorWorker(): Promise<string> {
  workerLogger.info("Webhook processor worker started", {
    queueName: QUEUE.WEBHOOK_PROCESSING,
    concurrency: 5,
  });
  return boss.work<InboundMessage>(
    QUEUE.WEBHOOK_PROCESSING,
    { localConcurrency: 5, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0]!;
      try {
        await processWebhookJob(job);
      } catch (error) {
        void captureException(error instanceof Error ? error : new Error(String(error)), {
          correlationId: job.data.correlationId,
          tags: { component: "webhook-processor" },
        });
        throw error;
      }
    },
  );
}
