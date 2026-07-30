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
  normalizeCode,
} from "~/server/live-item/createLiveItem";
import { findOrderableItemByCode } from "~/server/catalogue/findOrderableItemByCode";
import { findOrCreateOrderableItemByCode } from "~/server/catalogue/findOrCreateOrderableItemByCode";
import { uploadMediaAndLinkToLiveItem } from "~/server/media/uploadMediaToLiveItem";
import { uploadMediaToCatalogueItem } from "~/server/media/uploadMediaToCatalogueItem";
import { uploadProofMedia } from "~/server/media/uploadProofMedia";
import { isR2Configured } from "~/server/media/r2-client";
import { createPaymentProof } from "~/server/proof/createPaymentProof";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { getDeliveryFee } from "~/server/delivery/getDeliveryFee";
import { createOrderFromReservation } from "~/server/order/createOrderFromReservation";
import { upsertCatalogueItemFromWebhook } from "~/server/catalogue/upsertCatalogueItemFromWebhook";
import { getConversationState, setHandedOff } from "~/server/conversation/conversationState";
import {
  parseSellerCreateItemIntent,
  parseSellerOffLiveCreateItemIntent,
} from "~/server/catalogue/sellerCreateIntent";
import { isSellerHelpRequest } from "~/server/messaging/seller-help";
import { env } from "~/env";
import {
  startVariantSelection,
  handleVariantChoice,
} from "~/server/conversation/variantSelection";
import {
  SELLER_VARIANT_CONFIG_STATE,
  startSellerVariantConfig,
  handleSellerVariantConfigReply,
} from "~/server/conversation/sellerVariantConfig";
import {
  analyzeInboundIntent,
  getTrustedAIFaqCategory,
  getTrustedAIProductIntent,
  hasTrustedAIIntent,
} from "../messaging/ai-service";

/**
 * Délimiteur de mot qui connaît les accents.
 *
 * `\b` du moteur ne considère que `[A-Za-z0-9_]` : pour « où », il n'y a donc
 * aucune frontière entre « ù » et l'espace qui suit, tous deux non-alphanumériques
 * à ses yeux, et `\bo[ùu]\b` ne matche jamais. Ces deux lookarounds tiennent
 * compte des lettres accentuées du français.
 */
const NOT_LETTER_BEFORE = "(?<![a-zà-öø-ÿ0-9])";
const NOT_LETTER_AFTER = "(?![a-zà-öø-ÿ0-9])";

/** Construit un motif « mot entier » sur une alternative déjà en minuscules. */
function word(alternatives: string): RegExp {
  return new RegExp(`${NOT_LETTER_BEFORE}(?:${alternatives})${NOT_LETTER_AFTER}`);
}

/** Deux termes dans la même phrase, dans un ordre ou l'autre. */
function near(a: string, b: string): RegExp {
  return new RegExp(
    `${NOT_LETTER_BEFORE}(?:${a})[^.!?]*${NOT_LETTER_BEFORE}(?:${b})` +
      `|${NOT_LETTER_BEFORE}(?:${b})[^.!?]*${NOT_LETTER_BEFORE}(?:${a})`,
  );
}

/** Mots-clés STOP (case-insensitive, trim) pour détection opt-out. */
const STOP_KEYWORDS = ["stop", "arrêt", "arret", "unsubscribe", "optout", "opt-out"];

/**
 * Phase 5.2 : demandes de mise en relation avec une personne.
 *
 * ── POURQUOI DES LIMITES DE MOT, ET POURQUOI « APPEL » A DISPARU ─────────────
 * La détection était un `includes` sur une liste qui contenait « appel ». Elle
 * attrapait donc « je t'appelle demain », « merci pour le rappel », « c'est pour
 * l'appel de mon mariage » — et un faux positif coupe le bot pour cette cliente.
 *
 * Les limites de mot (`\b`) écartent « appelle » et « rappel ». « appel » seul est
 * retiré : même isolé, le mot désigne rarement une demande de mise en relation en
 * français ivoirien, et l'analyse d'intention par IA (`HUMAN_AGENT`) couvre les
 * formulations indirectes sur les plans payants.
 *
 * Le reste du fichier est délibérément étroit — `isStopMessage` exige l'égalité ou
 * un préfixe suivi d'espace, `isSellerHelpRequest` est ancré. Cette fonction était
 * l'exception.
 * ────────────────────────────────────────────────────────────────────────────
 */
const HANDOFF_PATTERNS = [
  word("agents?"),
  word("humain|humaine|humains"),
  word("conseiller|conseillère|conseillere|conseillers"),
  word("service client"),
  word("parler à quelqu'un|parler a quelqu'un|parler à une personne|parler a une personne"),
  word("vraie personne|vrai humain"),
];

/** Pattern « code » client : lettre(s) + chiffre(s) ex. A12, B7 (Story 2.6 Option A) */

/** Story 4.2 : extrait un candidat code (strict ou typo) depuis le body client */
const CLIENT_CODE_INTENT_PATTERN = /^([A-Za-z]+\d+)(?:\s*[x\s]?\s*(\d+))?/i;

export type ClientCodeIntent = { code: string; quantity: number; isTypo: boolean };

/**
 * Bornes sur ce qui arrive de l'extérieur.
 *
 * `MAX_ORDER_ITEMS` : le panier natif WhatsApp arrivait tel quel, et chaque article
 * coûte deux allers-retours base plus une réservation. Meta ne publie pas de limite
 * de panier, mais plafonne ses propres messages multi-produits à 30 : cent laisse
 * donc une marge large tout en bornant la boucle.
 *
 * `MAX_ITEM_QUANTITY` : la quantité venait du client sans borne haute — le parseur
 * de codes ne posait qu'un `Math.max(1, …)`. Au-delà de mille exemplaires d'un même
 * article, c'est une faute de saisie, pas une commande.
 */
export const MAX_ORDER_ITEMS = 100;
export const MAX_ITEM_QUANTITY = 1000;

/** Ramène une quantité venue de l'extérieur dans des bornes défendables. */
export function clampQuantity(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 1;
  return Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.floor(raw)));
}

/**
 * Parse le body client en intent « code » : strict (A12) ou typo (A12A → A12).
 */
export function parseClientCodeIntent(body: string): ClientCodeIntent | null {
  const trimmed = body.trim();
  if (!trimmed.length) return null;
  const match = trimmed.match(CLIENT_CODE_INTENT_PATTERN);
  if (!match) return null;
  const code = normalizeCode(match[1]!);
  if (!code.length) return null;
  const quantity = match[2] ? clampQuantity(parseInt(match[2], 10)) : 1;
  const matchedText = match[0]!;
  const isStrict = trimmed.toLowerCase() === matchedText.toLowerCase();
  return { code, quantity, isTypo: !isStrict };
}

/** Story 4.5: Détection intent « OUI » pour confirmer réservation (trim, lowercase). */
export function isConfirmOui(body: string): boolean {
  return body.trim().toLowerCase() === "oui";
}

/** Détecte si le corps du message est une demande STOP (opt-out). */
export function isStopMessage(body: string): boolean {
  const trimmed = body.trim().toLowerCase().replace(/[.,!?]+$/, "").trim();
  return STOP_KEYWORDS.some((kw) => trimmed === kw || trimmed.startsWith(kw + " "));
}

export function isHandoffRequest(body: string): boolean {
  const lower = body.toLowerCase().trim();
  return HANDOFF_PATTERNS.some((re) => re.test(lower));
}

/**
 * Durée au bout de laquelle une mise en relation cesse de faire taire le bot.
 *
 * `setHandedOff` n'était jamais appelé avec `false` : rien, nulle part, ne défaisait
 * une mise en relation. Un faux positif de détection coupait donc le service à une
 * cliente **définitivement**, sans que personne le sache et sans moyen de revenir.
 *
 * Vingt-quatre heures, comme la fenêtre de conversation WhatsApp sur laquelle tout
 * le produit est bâti : passé ce délai, si personne n'a repris la main, le bot
 * reprend le relais plutôt que de laisser la cliente sans réponse.
 */
export const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

/** La mise en relation est-elle encore active ? */
export function isHandoffActive(
  state: { handedOff: boolean; updatedAt: Date } | null,
  now: Date = new Date(),
): boolean {
  if (!state?.handedOff) return false;
  return now.getTime() - state.updatedAt.getTime() < HANDOFF_TTL_MS;
}

/**
 * Phase 5.3 : reconnaissance d'une question fréquente, pour servir la réponse que
 * la boutique a écrite.
 *
 * ── DEUX MOTS TROP LARGES ONT ÉTÉ RESSERRÉS ─────────────────────────────────
 * « quand » déclenchait à lui seul la réponse sur les délais de livraison :
 * « c'est quand le live ? » recevait donc les conditions d'expédition. Il ne
 * compte plus que s'il accompagne un mot de livraison.
 *
 * « trouver » déclenchait l'adresse de la boutique : « comment trouver ma taille »
 * y tombait aussi. Il exige désormais « où » ou « vous » à proximité.
 *
 * Les limites de mot (`\b`) évitent par ailleurs qu'un terme se déclenche depuis
 * l'intérieur d'un autre — le défaut qui avait fait basculer la mise en relation
 * sur « je t'appelle demain ».
 * ────────────────────────────────────────────────────────────────────────────
 */
const FAQ_PATTERNS: ReadonlyArray<{
  category: "delivery" | "payment" | "location" | "availability";
  patterns: readonly RegExp[];
}> = [
  {
    category: "delivery",
    patterns: [
      word("livraisons?|livrer|livrez|livré|livrée|livres?"),
      word("expédition|expedition|expéditions|livraison"),
      word("délai|delai|délais|delais"),
      word("recevoir|reçois|recois|reçu|recu"),
      // « quand » seul servait les délais d'expédition à « c'est quand le live ? ».
      near("quand", "livr|reç|rec|arriv|expédi|expedi"),
    ],
  },
  {
    category: "payment",
    patterns: [
      word("paiement|paiements|payer|paie|paye"),
      word("virement|dépôt|depot|acompte"),
      word("mobile money|momo|wave|orange money"),
    ],
  },
  {
    category: "location",
    patterns: [
      word("où|ou se trouve|adresse|boutique|quartier"),
      word("localisation|localisé|localise|située|situee|situé|situe"),
      // « trouver » seul attrapait « comment trouver ma taille ».
      near("où|vous", "trouver"),
    ],
  },
  {
    category: "availability",
    patterns: [
      word("disponibilité|disponibilite|disponible|disponibles|dispo"),
      word("stock|rupture|épuisé|epuise|épuisée"),
      near("reste", "articles?"),
    ],
  },
];

export function detectFaqIntent(
  body: string,
): "delivery" | "payment" | "location" | "availability" | null {
  const lower = body.toLowerCase().trim();
  for (const { category, patterns } of FAQ_PATTERNS) {
    if (patterns.some((re) => re.test(lower))) return category;
  }
  return null;
}

/**
 * Vérifie si l'heure actuelle est en dehors des heures d'ouverture.
 * @param start - Heure d'ouverture "HH:MM"
 * @param end   - Heure de fermeture "HH:MM"
 * @param tz    - Timezone IANA (ex: "Africa/Abidjan")
 */
export function isOutsideBusinessHours(
  start: string,
  end: string,
  tz: string,
  now: Date = new Date(),
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      // `hourCycle: "h23"` et non `hour12: false` : ce dernier laisse certaines
      // versions d'ICU rendre « 24:00 » à minuit, qui compare mal.
      hourCycle: "h23",
    });
    const localTime = formatter.format(now); // "HH:MM"

    // Plage à cheval sur minuit — une boutique ouverte de 18:00 à 02:00.
    // La comparaison simple `< start || >= end` la déclarait fermée en pleine
    // ouverture : à 20:00, `20 < 18` est faux mais `20 >= 02` est vrai.
    // Quand la fermeture précède l'ouverture, on est *dedans* si l'on est après
    // l'ouverture **ou** avant la fermeture.
    if (end <= start) {
      return localTime < start && localTime >= end;
    }

    return localTime < start || localTime >= end;
  } catch {
    return false; // En cas de timezone invalide, on ne bloque pas
  }
}

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

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        subscriptionPlan: true,
        requireDeposit: true,
        faqDelivery: true,
        faqPayment: true,
        faqLocation: true,
        faqAvailability: true,
        // Away message
        businessHoursStart: true,
        businessHoursEnd: true,
        businessTimezone: true,
        awayMessage: true,
      },
    });

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

    // 6. Commande via panier WA natif (P1 — message type "order")
    if (orderPayload?.items.length) {
      const reserved: Array<{ code: string; qty: number; prix: string }> = [];
      const failed: string[] = [];

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
        const result = await findOrCreateOrderableItemByCode(tenantId, code);
        if (!result) {
          failed.push(code);
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
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.codeUnknown(code),
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
        const item = liveSessionId
          ? await findOrCreateOrderableItemByCode(tenantId, clientCodeIntent.code)
          : await findOrderableItemByCode(tenantId, clientCodeIntent.code);

        if (!item) {
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: messageCodeUnknown(clientCodeIntent.code),
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

      // 9b. Deposit proof — image sans texte (body vide, mediaUrl présent)
      if (mediaUrl && !trimmedBody) {
        const pendingDepositOrder = await db.order.findFirst({
          where: {
            tenantId,
            depositStatus: "deposit_pending",
            reservation: { clientPhone: clientPhoneE164 },
          },
          select: { id: true, orderNumber: true },
          orderBy: { createdAt: "desc" },
        });
        if (pendingDepositOrder) {
          // L'échec était avalé sans trace, et la preuve enregistrée en « [image
          // reçue] » : une panne R2 restait invisible côté boutique comme côté logs.
          const key = await uploadProofMedia(tenantId, pendingDepositOrder.id, mediaUrl, correlationId).catch((err) => {
            workerLogger.error("Preuve : upload du média échoué", {
              tenantId,
              correlationId,
              orderId: pendingDepositOrder.id,
              err,
            });
            return null;
          });
          await createPaymentProof(
            tenantId,
            pendingDepositOrder.id,
            key ? { mediaStorageKey: key } : { textPayload: "[image reçue]" },
            correlationId,
          ).catch((err) => {
            workerLogger.warn("createPaymentProof (image-only) failed", { orderId: pendingDepositOrder.id, err });
          });
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.proofReceived(pendingDepositOrder.orderNumber),
            correlationId,
          });
          return buildEnrichedMessage(liveSessionId);
        }
      }

      if (trimmedBody.length > 0 && !isStopMessage(body)) {
        const active = await getActiveReservationForClient(tenantId, clientPhoneE164);
        if (active?.status === "reserved" && isConfirmOui(body)) {
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

        // 9c. Deposit proof — texte (référence paiement) ou image + texte (caption)
        const pendingDepositOrder = await db.order.findFirst({
          where: {
            tenantId,
            depositStatus: "deposit_pending",
            reservation: { clientPhone: clientPhoneE164 },
          },
          select: { id: true, orderNumber: true },
          orderBy: { createdAt: "desc" },
        });
        if (pendingDepositOrder) {
          const key = mediaUrl
            ? await uploadProofMedia(tenantId, pendingDepositOrder.id, mediaUrl, correlationId).catch((err) => {
                workerLogger.error("Preuve : upload du média échoué", {
                  tenantId,
                  correlationId,
                  orderId: pendingDepositOrder.id,
                  err,
                });
                return null;
              })
            : null;
          await createPaymentProof(
            tenantId,
            pendingDepositOrder.id,
            key ? { mediaStorageKey: key } : { textPayload: trimmedBody },
            correlationId,
          ).catch((err) => {
            workerLogger.warn("createPaymentProof (text) failed", { orderId: pendingDepositOrder.id, err });
          });
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: botMsg.client.proofReceived(pendingDepositOrder.orderNumber),
            correlationId,
          });
          return buildEnrichedMessage(liveSessionId);
        }

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

    // 10. Seller intent
    if (isSeller) {
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
