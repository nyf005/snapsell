import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { captureException } from "~/lib/sentry";
import { boss, QUEUE, type PgBossJob } from "./queues";
import type { InboundMessage, EnrichedInboundMessage } from "../messaging/types";
import {
  normalizeAndValidateMessagingPhoneNumber,
  normalizeAndValidatePhoneNumber,
  migrateCIPhoneNumber,
} from "~/lib/validations/phone";
import {
  logOptOutRecorded,
  logLiveItemCreated,
  logLiveItemDuplicateRejected,
  logLiveItemPhotoLinked,
  logCatalogueItemPhotoLinked,
} from "~/server/events/eventLog";
import {
  createReservation,
  getActiveReservationForClient,
  collectAddress,
} from "~/server/reservation/service";
import { addToWaitlist } from "~/server/waitlist/addToWaitlist";
import { getCurrentSessionReadOnly } from "~/server/live-session/service";
import {
  createLiveItem,
  messageCodeAlreadyUsed,
  messageCodeUnknown,
  messageCodeUnknownSuggestion,
  normalizeCode,
} from "~/server/live-item/createLiveItem";
import { findLiveItemByCode } from "~/server/live-item/findLiveItemByCode";
import { findOrderableItemByCode } from "~/server/catalogue/findOrderableItemByCode";
import { findOrCreateOrderableItemByCode } from "~/server/catalogue/findOrCreateOrderableItemByCode";
import { uploadMediaAndLinkToLiveItem } from "~/server/media/uploadMediaToLiveItem";
import { uploadMediaToCatalogueItem } from "~/server/media/uploadMediaToCatalogueItem";
import { isR2Configured } from "~/server/media/r2-client";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { createOrderFromReservation } from "~/server/order/createOrderFromReservation";
import { upsertCatalogueItemFromWebhook } from "~/server/catalogue/upsertCatalogueItemFromWebhook";
import { getConversationState, setHandedOff } from "~/server/conversation/conversationState";
import {
  looksLikeImplicitSellerCreateItem,
  parseSellerCreateItemIntent,
  parseSellerOffLiveCreateItemIntent,
} from "~/server/catalogue/sellerCreateIntent";
import { 
  startVariantSelection, 
  handleVariantChoice 
} from "~/server/conversation/variantSelection";
import {
  SELLER_VARIANT_CONFIG_STATE,
  startSellerVariantConfig,
  handleSellerVariantConfigReply,
} from "~/server/conversation/sellerVariantConfig";

export {
  parseSellerCreateItemIntent as parseCreateItemIntent,
  parseSellerOffLiveCreateItemIntent as parseOffLiveCreateItemIntent,
};

/**
 * Normalise un numéro de téléphone en enlevant le préfixe "whatsapp:" si présent
 * Les numéros peuvent arriver avec ou sans préfixe (ex. "+33612345678" vs "whatsapp:+33612345678")
 * Note: Ne valide pas le format E.164 (pour compatibilité avec numéros déjà en DB)
 * @param phoneNumber - Numéro à normaliser
 * @returns Numéro normalisé (sans préfixe whatsapp:)
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/^whatsapp:/i, "");
}

function normalizeInboundMessagingPhone(phoneNumber: string): string {
  return normalizeAndValidateMessagingPhoneNumber(normalizePhoneNumber(phoneNumber));
}

/** Mots-clés STOP (case-insensitive, trim) pour détection opt-out (Story 2.5, 7B.3 FR46). Scope = tenant. Voir docs/stop-policy.md. */
const STOP_KEYWORDS = ["stop", "arrêt", "arret", "unsubscribe", "optout", "opt-out"];

/** Story 4.5: Détection intent « OUI » pour confirmer réservation (trim, lowercase). */
export function isConfirmOui(body: string): boolean {
  const trimmed = body.trim().toLowerCase();
  return trimmed === "oui";
}

/**
 * Détecte si le corps du message est une demande STOP (opt-out)
 * Case-insensitive, trim. Accepte ponctuation finale (stop., STOP!, arrêt.).
 */
export function isStopMessage(body: string): boolean {
  const trimmed = body.trim().toLowerCase().replace(/[.,!?]+$/, "").trim();
  return STOP_KEYWORDS.some((kw) => trimmed === kw || trimmed.startsWith(kw + " "));
}

/** Pattern « code » client : lettre(s) + chiffre(s) ex. A12, B7 (Story 2.6 Option A) */
const CLIENT_CODE_PATTERN = /^[A-Za-z]+\d+$/;

/** Story 4.2 : extrait un candidat code (strict ou typo) depuis le body client */
/** Plan Variantes: supporte aussi la quantité (ex: A12 x3) */
const CLIENT_CODE_INTENT_PATTERN = /^([A-Za-z]+\d+)(?:\s*[x\s]?\s*(\d+))?/i;

export type ClientCodeIntent = { code: string; quantity: number; isTypo: boolean };

/**
 * Parse le body client en intent « code » : strict (A12) ou typo (A12A → A12).
 * Retourne { code normalisé, isTypo } ou null si pas un candidat code.
 */
export function parseClientCodeIntent(body: string): ClientCodeIntent | null {
  const trimmed = body.trim();
  if (!trimmed.length) return null;
  const match = trimmed.match(CLIENT_CODE_INTENT_PATTERN);
  if (!match) return null;
  const code = normalizeCode(match[1]!);
  if (!code.length) return null;
  const quantity = match[2] ? Math.max(1, parseInt(match[2], 10)) : 1;
  const matchedText = match[0];
  const isStrict = trimmed.toLowerCase() === matchedText.toLowerCase();
  return { code, quantity, isTypo: !isStrict };
}

/** Phase 5.2: Keywords that trigger handoff to human agent. */
const HANDOFF_KEYWORDS = ["agent", "humain", "appel", "parler à quelqu'un", "parler a quelqu'un", "conseiller", "service client"];

export function isHandoffRequest(body: string): boolean {
  const lower = body.toLowerCase().trim();
  return HANDOFF_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Phase 5.3: FAQ keyword detection. Returns the FAQ category or null. */
export function detectFaqIntent(body: string): "delivery" | "payment" | "location" | "availability" | null {
  const lower = body.toLowerCase().trim();
  if (/livrai?s(on)?|expéditi?on|délai|recevoir|arrive|quand/.test(lower)) return "delivery";
  if (/paiement|payer|virement|dépôt|acompte|moyen.*(paiement|payer)|bank|mobile money|momo|wave|orange money/.test(lower)) return "payment";
  if (/où|adresse|boutique|localisa|situé|trouver|localisation|quartier/.test(lower)) return "location";
  if (/disponible|disponibilité|stock|reste.*article|encore.*dispo|rupture|épuisé/.test(lower)) return "availability";
  return null;
}

/**
 * Story 8.3: Détermine si le message nécessite la lecture de la session live (read-only).
 * Vendeur : oui pour tout body non vide et non STOP.
 * Client : oui si le body ressemble à un code (lettres + chiffres).
 */
export function shouldReadSession(messageType: "seller" | "client", body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed.length || isStopMessage(body)) return false;
  if (messageType === "seller") return true;
  return CLIENT_CODE_PATTERN.test(trimmed);
}

/**
 * Détermine le type de message (vendeur vs client) en vérifiant si le numéro expéditeur
 * correspond à un seller_phone du tenant
 * @param tenantId - ID du tenant
 * @param from - Numéro expéditeur (peut contenir préfixe "whatsapp:")
 * @returns "seller" si le numéro correspond à un seller_phone, "client" sinon
 */
export async function determineMessageType(
  tenantId: string | null,
  from: string,
): Promise<"seller" | "client"> {
  // Si tenantId est null, traiter comme client (pas de seller_phone possible)
  if (!tenantId) {
    workerLogger.warn("Cannot determine message type: tenantId is null", {
      from,
    });
    return "client";
  }

  // Normaliser le numéro expéditeur : enlever "whatsapp:" + migration CI 8→10 chiffres
  const normalizedFrom = migrateCIPhoneNumber(normalizePhoneNumber(from));

  // Lookup seller_phone(s) pour le tenant
  const sellerPhones = await db.sellerPhone.findMany({
    where: { tenantId },
  });

  // Comparer avec migration CI des deux côtés : fonctionne que le numéro stocké
  // soit en ancien format (8 chiffres) ou nouveau format (10 chiffres)
  const sellerPhone = sellerPhones.find((sp) => {
    const normalizedStored = migrateCIPhoneNumber(normalizePhoneNumber(sp.phoneNumber));
    return normalizedStored === normalizedFrom;
  });

  // Si seller_phone trouvé → message vendeur, sinon → message client
  return sellerPhone ? "seller" : "client";
}

/**
 * Traite un job webhook : détermine le type de message et enrichit le payload
 * 
 * Routing vendeur vs client : détermine si le message provient d'un vendeur ou d'un client
 * en comparant le numéro expéditeur avec les seller_phone(s) du tenant
 * 
 * Architecture §4.1 : Routing dans worker (pas dans webhook) pour respecter contrainte < 1s
 * Architecture §7.1 : Utilise uniquement types normalisés (InboundMessage)
 * Architecture §255 : Ne jamais traiter un message vendeur comme client
 * 
 * @param job - Job pg-boss avec payload InboundMessage
 * @returns Message enrichi avec messageType
 */
export async function processWebhookJob(
  job: PgBossJob<InboundMessage>,
): Promise<EnrichedInboundMessage> {
  const startTime = Date.now();
  const { tenantId, providerMessageId, from, body, mediaUrl, correlationId, interactiveReplyId } = job.data;

  workerLogger.info("Processing webhook job", {
    correlationId,
    jobId: job.id,
    providerMessageId,
    tenantId,
    from,
    interactiveReplyId,
    body: body.slice(0, 50),
    mediaUrl,
  });

  try {
    // Déterminer le type de message (vendeur vs client)
    const messageType = await determineMessageType(tenantId, from);

    const processingTime = Date.now() - startTime;

    workerLogger.info("Message type determined", {
      correlationId,
      jobId: job.id,
      messageType,
      tenantId,
      from,
      processingTimeMs: processingTime,
    });

    // Story 2.5 : Détection STOP (scope tenant) — enregistrer OptOut si client envoie STOP
    if (tenantId && messageType === "client" && isStopMessage(body)) {
      try {
        const phoneE164 = normalizeInboundMessagingPhone(from);
        const existing = await db.optOut.findUnique({
          where: { tenantId_phoneNumber: { tenantId, phoneNumber: phoneE164 } },
        });
        if (!existing) {
          const optOut = await db.optOut.create({
            data: {
              tenantId,
              phoneNumber: phoneE164,
              optedOutAt: new Date(),
            },
          });
          await logOptOutRecorded(tenantId, optOut.id, correlationId).catch((err) => {
            workerLogger.error("Error logging opt_out_recorded", err, {
              correlationId,
              tenantId,
              optOutId: optOut.id,
            });
          });
          workerLogger.info("OptOut recorded (STOP)", {
            correlationId,
            tenantId,
            optOutId: optOut.id,
          });
        }
        // Idempotence : si OptOut existe déjà, ne pas créer de doublon
      } catch (error) {
        workerLogger.error("Error recording OptOut (STOP)", error, {
          correlationId,
          tenantId,
          from,
        });
        // Ne pas faire échouer le job : le message est quand même traité
      }
    }

    // Phase 5.2: Handoff detection — detect keywords and suspend auto-replies when handed off.
    let isHandedOff = false;
    if (tenantId && messageType === "client" && !isStopMessage(body) && body.trim().length > 0) {
      try {
        const clientPhoneE164 = normalizeInboundMessagingPhone(from);

        if (isHandoffRequest(body)) {
          await setHandedOff(tenantId, clientPhoneE164, true);
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.handedOff(),
            correlationId,
          });
          isHandedOff = true;
        } else {
          const state = await getConversationState(tenantId, clientPhoneE164);
          isHandedOff = state?.handedOff ?? false;
        }

        if (isHandedOff && !isHandoffRequest(body)) {
          // Conversation is handed off — skip all auto-replies, return early.
          return {
            tenantId,
            providerMessageId,
            from,
            body,
            mediaUrl,
            correlationId,
            messageType,
            liveSessionId: undefined,
          };
        }
      } catch (error) {
        workerLogger.error("Error checking/setting handoff state (Phase 5.2)", error, {
          correlationId,
          tenantId,
          from,
        });
      }
    }

    // Réponses interactives (boutons/liste) : mapper l'ID vers le comportement équivalent
    if (tenantId && (messageType === "client" || messageType === "seller") && interactiveReplyId) {
      try {
        const clientPhoneE164 = normalizeInboundMessagingPhone(from);

        // Annulation : libérer la réservation active
        if (interactiveReplyId === "cancel_order") {
          const active = await getActiveReservationForClient(tenantId, clientPhoneE164);
          if (active) {
            await db.reservation.update({
              where: { id: active.id },
              data: { status: "expired" },
            });
          }
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // Confirmation commande (équivalent "OUI" en état address_collected)
        if (interactiveReplyId === "confirm_order") {
          const active = await getActiveReservationForClient(tenantId, clientPhoneE164);
          if (active?.status === "address_collected") {
            const tenant = await db.tenant.findUnique({
              where: { id: tenantId },
              select: { requireDeposit: true },
            });
            const requireDeposit = tenant?.requireDeposit ?? false;
            const orderResult = await createOrderFromReservation(
              tenantId, active.id, requireDeposit, clientPhoneE164, correlationId,
            );
            if (orderResult.success) {
              await writeToOutbox({
                tenantId,
                to: clientPhoneE164,
                ...(requireDeposit ? botMsg.client.orderWithDepositInteractive(15) : botMsg.client.orderConfirmedInteractive()),
                correlationId,
              });
            }
          }
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // Retry code (ex: "retry_code:A12") — traiter le code extrait
        if (interactiveReplyId.startsWith("retry_code:")) {
          const code = interactiveReplyId.slice("retry_code:".length).toUpperCase();
          if (code) {
            const catalogueItem = await findOrderableItemByCode(tenantId, code);
            if (!catalogueItem) {
              await writeToOutbox({
                tenantId,
                to: clientPhoneE164,
                body: botMsg.client.codeUnknown(code),
                correlationId,
              });
            } else {
              const free = catalogueItem.availableQty - catalogueItem.reservedQty;
              if (free <= 0) {
                const waitResult = await addToWaitlist(
                  tenantId, null, null, clientPhoneE164, correlationId,
                  { table: "catalogue_items", catalogueItemId: catalogueItem.id },
                );
                await writeToOutbox({
                  tenantId,
                  to: clientPhoneE164,
                  body: waitResult.ok
                    ? botMsg.client.waitlist(code, waitResult.position)
                    : botMsg.client.exhausted(),
                  correlationId,
                });
              } else {
                const session = await getCurrentSessionReadOnly(tenantId);
                
                if (catalogueItem.hasVariants) {
                  await startVariantSelection(tenantId, clientPhoneE164, catalogueItem, 1, correlationId);
                } else {
                  await createReservation(
                    tenantId, session?.id ?? null, null, clientPhoneE164, correlationId,
                    { catalogueItemId: catalogueItem.id, liveSessionId: session?.id ?? null },
                  );
                  await writeToOutbox({
                    tenantId,
                    to: clientPhoneE164,
                    body: botMsg.client.reserved(code),
                    correlationId,
                  });
                }
              }
            }
          }
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // Demande agent humain via bouton
        if (interactiveReplyId === "contact_agent") {
          await setHandedOff(tenantId, clientPhoneE164, true);
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.handedOff(),
            correlationId,
          });
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // Suivi commande via bouton
        if (interactiveReplyId === "track_order") {
          const order = await db.order.findFirst({
            where: { tenantId, reservation: { clientPhone: clientPhoneE164 } },
            orderBy: { createdAt: "desc" },
          });
          if (order) {
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: botMsg.client.orderStatus(order.orderNumber),
              correlationId,
            });
          }
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // send_proof : aucune action côté bot, le client va envoyer une photo
        // On laisse simplement passer sans réponse
        if (interactiveReplyId === "send_proof") {
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // Story 8.2: Configuration des variantes par le vendeur
        if (interactiveReplyId.startsWith("configure_variants:")) {
          const rawCode = interactiveReplyId.slice("configure_variants:".length);
          const code = normalizeCode(rawCode);

          workerLogger.info("Seller requested variant configuration", {
            correlationId,
            tenantId,
            from: clientPhoneE164,
            rawCode,
            normalizedCode: code,
          });

          const catalogueItem = code
            ? await db.catalogueItem.findUnique({
                where: { tenantId_code: { tenantId, code } },
                select: { id: true, attributes: true },
              })
            : null;

          if (!catalogueItem) {
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: `Article *${code || rawCode || "inconnu"}* introuvable dans le catalogue.`,
              correlationId,
            });
            return {
              tenantId, providerMessageId, from, body, mediaUrl, correlationId,
              messageType, liveSessionId: null,
            };
          }

          await startSellerVariantConfig(
            tenantId,
            clientPhoneE164,
            catalogueItem.id,
            code,
            correlationId,
            Array.isArray(catalogueItem.attributes) ? (catalogueItem.attributes as string[]) : [],
          );
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // Le vendeur indique que l'article n'a pas de variante
        if (interactiveReplyId === "no_variants") {
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: `✅ D'accord, l'article reste sans variantes. Prêt pour la vente !`,
            correlationId,
          });
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // Le vendeur annule le workflow de config variante via le bouton interactif
        if (interactiveReplyId === "cancel_variant_config") {
          await db.conversationState.deleteMany({
            where: { tenantId_phone: { tenantId, phone: clientPhoneE164 } },
          });
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: `❌ Configuration des variantes annulée.`,
            correlationId,
          });
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

        // --- Variantes ---
        if (interactiveReplyId.startsWith("select_val:")) {
          const val = interactiveReplyId.split(":")[1]!;
          await handleVariantChoice(tenantId, clientPhoneE164, val, correlationId);
          return {
            tenantId, providerMessageId, from, body, mediaUrl, correlationId,
            messageType, liveSessionId: null,
          };
        }

      } catch (error) {
        workerLogger.error("Error handling interactive reply", error, {
          correlationId, tenantId, interactiveReplyId,
        });
      }
    }

    // Story 8.3: Session live lecture seule pour vendeur et client (getCurrentSessionReadOnly).
    // La session n'est plus créée implicitement par le webhook ; elle est créée explicitement
    // par le clic sur "Lancer le live" dans le dashboard (via live.startLive).
    let liveSessionId: string | null = null;
    if (tenantId && messageType === "seller" && shouldReadSession(messageType, body)) {
      try {
        const session = await getCurrentSessionReadOnly(tenantId);
        liveSessionId = session?.id ?? null;
      } catch (error) {
        workerLogger.error("Error getCurrentSessionReadOnly (seller live session)", error, {
          correlationId,
          tenantId,
        });
      }
    }
    // Pour le client, on lit la session en read-only (pas de création)
    if (tenantId && messageType === "client" && !isStopMessage(body) && body.trim().length > 0) {
      try {
        const session = await getCurrentSessionReadOnly(tenantId);
        liveSessionId = session?.id ?? null;
      } catch (error) {
        workerLogger.error("Error getCurrentSessionReadOnly (client live session)", error, {
          correlationId,
          tenantId,
        });
      }
    }

    // Story 8.1 + 4.1 + 4.2 : intent client « code » → lookup catalogue
    // Si session active → findOrCreateOrderableItemByCode (création à la volée si code absent).
    // Si pas de session → findOrderableItemByCode seul ; absent → Code inconnu (pas de création).
    const clientCodeIntent = parseClientCodeIntent(body);
    if (tenantId && messageType === "client" && clientCodeIntent) {
      try {
        const clientPhoneE164 = normalizeInboundMessagingPhone(from);

        const catalogueItem = liveSessionId
          ? await findOrCreateOrderableItemByCode(tenantId, clientCodeIntent.code)
          : await findOrderableItemByCode(tenantId, clientCodeIntent.code);

        if (!catalogueItem) {
          // Code inconnu (absent du catalogue, ou invalide — lettre non configurée)
          const msg = messageCodeUnknown(clientCodeIntent.code);
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: msg,
            correlationId,
          });
        } else if (clientCodeIntent.isTypo) {
          // Story 4.2 : typo (ex. A12A) mais code extrait (A12) existe → suggestion, pas de réservation
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            ...botMsg.client.codeSuggestionInteractive(catalogueItem.code),
            correlationId,
          });
        } else {
          // Code strict et trouvé dans le catalogue → flux réservation (Réservé / File #N / Épuisé)
          const free = catalogueItem.availableQty - catalogueItem.reservedQty;
          if (free < clientCodeIntent.quantity) {
            // Pas assez de stock pour la quantité demandée
            // Story 8.1 + 4.3 + 9.1: file d'attente (position stock global)
            const waitResult = await addToWaitlist(
              tenantId,
              null,
              null,
              clientPhoneE164,
              correlationId,
              { table: "catalogue_items", catalogueItemId: catalogueItem.id },
            );
            const bodyMsg =
              waitResult.ok === true
                ? botMsg.client.waitlist(clientCodeIntent.code, waitResult.position)
                : botMsg.client.exhausted();
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: bodyMsg,
              correlationId,
            });
          } else {
            // Story 8.1: createReservation avec catalogueItemId et quantity
            if (catalogueItem.hasVariants) {
              await startVariantSelection(tenantId, clientPhoneE164, catalogueItem, clientCodeIntent.quantity, correlationId, liveSessionId);
            } else {
              const resResult = await createReservation(
                tenantId,
                liveSessionId,
                null,
                clientPhoneE164,
                correlationId,
                { catalogueItemId: catalogueItem.id, liveSessionId, quantity: clientCodeIntent.quantity },
              );
              if (!resResult.success && resResult.reason === "exhausted") {
                await writeToOutbox({
                  tenantId,
                  to: clientPhoneE164,
                  body: botMsg.client.exhausted(),
                  correlationId,
                });
              } else {
                // Confirmation avec mention de la quantité si > 1
                const qtyLabel = clientCodeIntent.quantity > 1 ? ` (x${clientCodeIntent.quantity})` : "";
                await writeToOutbox({
                  tenantId,
                  to: clientPhoneE164,
                  body: botMsg.client.reserved(`${clientCodeIntent.code}${qtyLabel}`),
                  correlationId,
                });
              }
            }
          }
        }
      } catch (error) {
        workerLogger.error("Error catalogue lookup / createReservation (Story 8.1)", error, {
          correlationId,
          tenantId,
          body: body.trim(),
        });
      }
    }

    // Story 4.1, 8.1 : intent client « adresse » (réservation en reserved → address_collected + récap + OUI)
    // Story 8.1: ne plus exiger liveSessionId — la réservation catalogue peut avoir liveSessionId null
    if (
      tenantId &&
      messageType === "client" &&
      !clientCodeIntent &&
      body.trim().length > 0
    ) {
      try {
        const clientPhoneE164 = normalizeInboundMessagingPhone(from);
        const active = await getActiveReservationForClient(
          tenantId,
          clientPhoneE164,
        );
        if (active?.status === "reserved") {
          const collectResult = await collectAddress(
            tenantId,
            clientPhoneE164,
            body,
          );
          if (collectResult.success) {
            const { code, amount, quantity, variantLabel, mediaStorageKey } = collectResult.reservation.item;
            const prix =
              amount !== null
                ? `${Math.round(amount / 100).toLocaleString("fr-FR")} FCFA`
                : "—";
            const totalAmount = amount !== null ? amount * quantity : null;
            const totalDisplay =
              totalAmount !== null
                ? `${Math.round(totalAmount / 100).toLocaleString("fr-FR")} FCFA`
                : "—";
            
            const variantSuffix = variantLabel ? ` [${variantLabel}]` : "";
            const qtyLabel = quantity > 1 ? ` (x${quantity})` : "";
            const fullCodeLabel = `${code}${variantSuffix}${qtyLabel}`;

            const recap = botMsg.client.recapInteractive(fullCodeLabel, prix, totalDisplay, body.trim());

            // Story 9.4: passer storageKey brut (signé à l'envoi par outbox-sender, AC #1, #2, #4, #5)
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              ...recap,
              correlationId,
              ...(mediaStorageKey ? { mediaUrl: mediaStorageKey } : {}),
            });
          }
        }
      } catch (error) {
        workerLogger.error("Error collectAddress / récap (Story 4.1, 8.1)", error, {
          correlationId,
          tenantId,
        });
      }
    }

    // Story 4.5, 8.1 : intent client « OUI » (réservation en address_collected → confirmation + Order)
    // Story 8.1: ne plus exiger liveSessionId
    if (
      tenantId &&
      messageType === "client" &&
      !clientCodeIntent &&
      isConfirmOui(body)
    ) {
      try {
        const clientPhoneE164 = normalizeInboundMessagingPhone(from);
        const active = await getActiveReservationForClient(
          tenantId,
          clientPhoneE164,
        );
        if (active?.status === "address_collected") {
          const tenant = await db.tenant.findUnique({
            where: { id: tenantId },
            select: { requireDeposit: true },
          });
          const requireDeposit = tenant?.requireDeposit ?? false;
          const orderResult = await createOrderFromReservation(
            tenantId,
            active.id,
            requireDeposit,
            clientPhoneE164,
            correlationId,
          );
          if (orderResult.success) {
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: requireDeposit ? botMsg.client.orderWithDeposit(15) : botMsg.client.orderConfirmed(),
              correlationId,
            });
          }
        }
      } catch (error) {
        workerLogger.error("Error confirm OUI / createOrder (Story 4.5, 8.1)", error, {
          correlationId,
          tenantId,
        });
      }
    }

    // Story 3.2 + 8.2 : intent vendeur « créer item » (code ou code x qte) → upsert catalogue (+ LiveItem si session active)
    if (tenantId && messageType === "seller") {
      // Variantes : si le vendeur est en train de répondre au flow de config, intercepter ici
      const convState = await db.conversationState.findUnique({
        where: { tenantId_phone: { tenantId, phone: normalizeInboundMessagingPhone(from) } },
        select: { state: true },
      }).catch(() => null);

      if (convState?.state === SELLER_VARIANT_CONFIG_STATE) {
        await handleSellerVariantConfigReply(
          tenantId,
          normalizeInboundMessagingPhone(from),
          body,
          correlationId,
        );
        return {
          tenantId, providerMessageId, from, body, mediaUrl, correlationId,
          messageType, liveSessionId: null,
        };
      }

      const activeSession = liveSessionId ? { id: liveSessionId } : null;
      const createItem = activeSession
        ? parseSellerCreateItemIntent(body)
        : parseSellerOffLiveCreateItemIntent(body);
      if (createItem) {
        try {
          const to = normalizeInboundMessagingPhone(from);

          // Story 8.2: Upsert catalogue (toujours, session active ou non)
          const catalogueResult = await upsertCatalogueItemFromWebhook(
            tenantId,
            createItem.code,
            createItem.quantity,
            { createdInLive: Boolean(activeSession), origin: activeSession ? "live" : "seller_whatsapp" },
          );

          if (!catalogueResult.success) {
            // Code invalide, pas de prix configuré, ou stock existant non nul
            workerLogger.warn("Cannot upsert catalogue item from webhook", {
              tenantId,
              code: createItem.code,
              reason: catalogueResult.reason,
            });
            // Toujours notifier le vendeur de l'échec (avec ou sans photo)
            const normalizedCode = normalizeCode(createItem.code);
            const errorMsg =
              catalogueResult.reason === "no_price"
                ? botMsg.seller.noPriceConfigured(normalizedCode.charAt(0).toUpperCase())
                : catalogueResult.reason === "already_in_stock"
                  ? botMsg.seller.codeAlreadyInStock(normalizedCode, catalogueResult.availableQty ?? 0)
                  : botMsg.seller.codeNotInCatalogue(normalizedCode);
            await writeToOutbox({
              tenantId,
              to,
              body: errorMsg,
              correlationId,
            });
            // Continue sans créer de session ni de LiveItem - retourner message enrichi
            return {
              tenantId,
              providerMessageId,
              from,
              body,
              mediaUrl,
              correlationId,
              messageType,
              liveSessionId: liveSessionId ?? undefined,
            };
          }

          // Story 9.3: photo upload fire-and-forget (seulement si R2 configuré)
          const r2Available = isR2Configured();
          if (mediaUrl && r2Available) {
            void uploadMediaToCatalogueItem(
              tenantId,
              catalogueResult.catalogueItemId,
              mediaUrl,
              correlationId,
            ).catch((err) => {
              workerLogger.error("Error uploading catalogue photo (Story 9.3)", err, {
                correlationId,
                tenantId,
                catalogueItemId: catalogueResult.catalogueItemId,
              });
            });
            void logCatalogueItemPhotoLinked(
              tenantId,
              catalogueResult.catalogueItemId,
              createItem.code,
              correlationId,
            ).catch((err) => {
              workerLogger.error("Error logging catalogue_item.photo_linked", err, {
                correlationId,
                tenantId,
                catalogueItemId: catalogueResult.catalogueItemId,
              });
            });
          }

          // Si session active : créer LiveItem en plus du catalogue
          if (activeSession) {
            const result = await createLiveItem(tenantId, createItem.code, {
              quantity: createItem.quantity,
            });

            if (result.success) {
              // M1 fix: message consolidé (photo + création) au lieu de deux messages séparés
              const createdMsg =
                mediaUrl && r2Available
                  ? botMsg.seller.itemCreatedWithPhoto(result.liveItem.code, result.liveItem.quantity)
                  : botMsg.seller.itemCreated(result.liveItem.code, result.liveItem.quantity);
              await writeToOutbox({
                tenantId,
                to,
                body: createdMsg,
                correlationId,
              });
              await logLiveItemCreated(tenantId, result.liveItem.id, correlationId, {
                code: result.liveItem.code,
                live_session_id: result.liveItem.liveSessionId,
                quantity: result.liveItem.quantity,
                available_qty: result.liveItem.availableQty,
                has_media: Boolean(mediaUrl),
              }).catch((err) => {
                workerLogger.error("Error logging live_item_created", err, {
                  correlationId,
                  tenantId,
                  liveItemId: result.success ? result.liveItem.id : undefined,
                });
              });
              // Story 3.4: photo optionnelle — upload async (ne pas bloquer le worker)
              if (mediaUrl) {
                void uploadMediaAndLinkToLiveItem(
                  tenantId,
                  result.liveItem.id,
                  mediaUrl,
                  correlationId,
                ).catch((err) => {
                  workerLogger.error("Error uploading media to R2 (Story 3.4)", err, {
                    correlationId,
                    tenantId,
                    liveItemId: result.liveItem.id,
                  });
                });
              }
            } else if ("duplicate" in result && result.duplicate) {
              await writeToOutbox({
                tenantId,
                to,
                body: messageCodeAlreadyUsed(createItem.code),
                correlationId,
              });
              await logLiveItemDuplicateRejected(tenantId, createItem.code, correlationId).catch(
                (err) => {
                  workerLogger.error("Error logging live_item_duplicate_rejected", err, {
                    correlationId,
                    tenantId,
                    code: createItem.code,
                  });
                },
              );
            }
          } else {
            // Pas de session active : catalogue upsert uniquement, réponse outbox
            workerLogger.info("Catalogue item upserted without active session", {
              tenantId,
              catalogueItemId: catalogueResult.catalogueItemId,
              code: createItem.code,
              quantity: createItem.quantity,
            });
            const noSessionMsg =
              mediaUrl && r2Available
                ? botMsg.seller.catalogueAddedWithPhotoInteractive(normalizeCode(createItem.code), createItem.quantity)
                : botMsg.seller.catalogueAddedInteractive(normalizeCode(createItem.code), createItem.quantity);
            await writeToOutbox({
              tenantId,
              to,
              ...noSessionMsg,
              correlationId,
            });
          }
        } catch (error) {
          workerLogger.error("Error processing seller create item intent (Story 3.2 + 8.2)", error, {
            correlationId,
            tenantId,
            code: createItem.code,
          });
          // Ne pas faire échouer le job
        }
      } else if (!activeSession && looksLikeImplicitSellerCreateItem(body)) {
        try {
          const to = normalizeInboundMessagingPhone(from);
          await writeToOutbox({
            tenantId,
            to,
            body: botMsg.seller.offLiveCreateInstruction(),
            correlationId,
          });
        } catch (error) {
          workerLogger.error("Error sending off-live create instruction", error, {
            correlationId,
            tenantId,
          });
        }
      } else if (mediaUrl) {
        // Photo sans caption — demander au vendeur d'utiliser le caption pour lier l'article
        try {
          const to = normalizeInboundMessagingPhone(from);
          await writeToOutbox({
            tenantId,
            to,
            body: botMsg.seller.photoNoCode(),
            correlationId,
          });
        } catch (error) {
          workerLogger.error("Error photo sans caption (vendeur)", error, {
            correlationId,
            tenantId,
          });
        }
      } else if (activeSession && body.trim().length > 0) {
        // Story 3.2: Fallback vendeur en live (syntaxe incorrecte)
        try {
          const to = normalizePhoneNumber(from);
          const isTryingOffLivePayload = body.trim().toLowerCase().startsWith("ajout");
          await writeToOutbox({
            tenantId,
            to,
            body: isTryingOffLivePayload
              ? botMsg.seller.liveCreateInstruction()
              : botMsg.seller.sellerFallback(),
            correlationId,
          });
        } catch (error) {
          workerLogger.error("Error sending seller live fallback", error, {
            correlationId,
            tenantId,
          });
        }
      }
    }

    // Phase 5.3: FAQ auto-reply — detect FAQ keywords and respond with tenant-configured answers.
    if (tenantId && messageType === "client" && !clientCodeIntent && !isStopMessage(body) && body.trim().length > 0) {
      try {
        const clientPhoneE164 = normalizeInboundMessagingPhone(from);
        const faqIntent = detectFaqIntent(body);

        if (faqIntent) {
          const tenant = await db.tenant.findUnique({
            where: { id: tenantId },
            select: { faqDelivery: true, faqPayment: true, faqLocation: true, faqAvailability: true },
          });

          const faqAnswer =
            faqIntent === "delivery" ? tenant?.faqDelivery :
            faqIntent === "payment" ? tenant?.faqPayment :
            faqIntent === "location" ? tenant?.faqLocation :
            tenant?.faqAvailability;

          if (faqAnswer) {
            await writeToOutbox({ tenantId, to: clientPhoneE164, body: faqAnswer, correlationId });
            // Skip Phase 2 fallback since we already responded.
            const enrichedMessage: EnrichedInboundMessage = {
              tenantId,
              providerMessageId,
              from,
              body,
              mediaUrl,
              correlationId,
              messageType,
              liveSessionId: liveSessionId ?? undefined,
            };
            return enrichedMessage;
          }
        }
      } catch (error) {
        workerLogger.error("Error FAQ handler (Phase 5.3)", error, { correlationId, tenantId });
      }
    }

    // Phase 2: Welcome / Fallback / Post-order auto-reply
    // Fires for client messages that did not match any intent above (no code, no active reservation).
    if (tenantId && messageType === "client" && !clientCodeIntent && !isStopMessage(body) && body.trim().length > 0) {
      try {
        const clientPhoneE164 = normalizeInboundMessagingPhone(from);
        const active = await getActiveReservationForClient(tenantId, clientPhoneE164);
        const alreadyHandled = active && (active.status === "reserved" || active.status === "address_collected");

        if (!alreadyHandled) {
          const msgCount = await db.messageIn.count({ where: { tenantId, from: clientPhoneE164 } });

          if (msgCount <= 1) {
            // Phase 2.1: First contact — send welcome (list si live actif avec articles, texte sinon)
            const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
            const shopName = tenant?.name ?? "la boutique";

            // Si live actif, charger les articles disponibles pour un list message
            let welcomeMsg: { body: string; interactive?: import("~/server/messaging/types").InteractivePayload };
            if (liveSessionId) {
              const liveItems = await db.liveItem.findMany({
                where: {
                  liveSessionId,
                  availableQty: { gt: 0 },
                },
                select: { code: true, amount: true },
                take: 10,
                orderBy: { createdAt: "asc" },
              });

              if (liveItems.length > 0) {
                welcomeMsg = {
                  body: `Bonjour ! 👋 Bienvenue chez *${shopName}*.\nVoici les articles disponibles en ce moment :`,
                  interactive: {
                    type: "list",
                    buttonLabel: "Voir les articles",
                    items: liveItems.map((item) => ({
                      id: `retry_code:${item.code}`,
                      title: item.code,
                      description: item.amount != null
                        ? `${Math.round(item.amount / 100).toLocaleString("fr-FR")} FCFA`
                        : undefined,
                    })),
                  },
                };
              } else {
                welcomeMsg = { body: botMsg.client.welcome(shopName) };
              }
            } else {
              welcomeMsg = { body: botMsg.client.welcome(shopName) };
            }

            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              ...welcomeMsg,
              correlationId,
            });
          } else {
            // Phase 2.4: Post-order auto-reply if client has a recent active order
            const recentOrder = await db.order.findFirst({
              where: {
                tenantId,
                reservation: { clientPhone: clientPhoneE164 },
                status: { in: ["confirmed", "confirmed_pending_deposit", "preparing", "in_delivery"] },
              },
              orderBy: { createdAt: "desc" },
            });

            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              ...(recentOrder
                ? { body: botMsg.client.orderStatus(recentOrder.orderNumber) }
                : botMsg.client.fallbackInteractive()), // Phase 2.2
              correlationId,
            });
          }
        }
      } catch (error) {
        workerLogger.error("Error fallback/welcome/post-order handler (Phase 2)", error, {
          correlationId,
          tenantId,
        });
      }
    }

    // Enrichir le payload avec messageType et liveSessionId pour les workers suivants
    const enrichedMessage: EnrichedInboundMessage = {
      tenantId,
      providerMessageId,
      from,
      body,
      mediaUrl,
      correlationId,
      messageType,
      liveSessionId: liveSessionId ?? undefined,
    };

    return enrichedMessage;
  } catch (error) {
    const processingTime = Date.now() - startTime;
    workerLogger.error(
      "Error processing webhook job",
      error,
      {
        correlationId,
        jobId: job.id,
        providerMessageId,
        tenantId,
        from,
        processingTimeMs: processingTime,
      },
    );
    // Re-throw pour que pg-boss gère le retry automatique
    throw error;
  }
}

/**
 * Enregistre le handler pg-boss pour la queue webhook-processing.
 * À appeler après boss.start() dans le worker.
 */
export async function startWebhookProcessorWorker(): Promise<string> {
  workerLogger.info("Webhook processor worker started", {
    queueName: QUEUE.WEBHOOK_PROCESSING,
    concurrency: 5,
  });

  // batchSize par défaut = 1 : chaque batch contient un seul job.
  // Le throw dans le catch marque le job comme failed pour retry pg-boss.
  return boss.work<InboundMessage>(
    QUEUE.WEBHOOK_PROCESSING,
    { localConcurrency: 5, batchSize: 1 },
    async (jobs: PgBossJob<InboundMessage>[]) => {
      const job = jobs[0]!;
      try {
        await processWebhookJob(job);
      } catch (error) {
        workerLogger.error("Job failed", error, {
          jobId: job.id,
          correlationId: job.data.correlationId,
        });
        void captureException(error instanceof Error ? error : new Error(String(error)), {
          correlationId: job.data.correlationId,
          tags: { component: "webhook-processor" },
        });
        throw error;
      }
    },
  );
}
