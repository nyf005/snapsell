import { z } from "zod";
import { db } from "~/server/db";
import { webhookLogger, workerLogger } from "~/lib/logger";
import type { Prisma } from "../../../generated/prisma";

/**
 * Types d'événements pour Event Log (Story 2.3)
 * Architecture §426-430: event_type verbe ou nom explicite
 */
export type EventType =
  | "webhook_received"
  | "message_sent"
  | "idempotent_ignored"
  | "opt_out_recorded"
  | "message_blocked_optout"
  | "live_session_created"
  | "live_session_closed"
  | "live_item_created"
  | "live_item_duplicate_rejected"
  | "live_item_photo_linked"
  | "reservation_hold"
  | "reservation_released"
  | "reservation_confirmed"
  | "reservation_started"
  | "reservation_expired"
  | "waitlist_promoted"
  | "reservation_reminder_sent"
  | "order_created"
  | "deposit_requested"
  | "order.status_changed"
  | "deposit_approved"
  | "deposit_rejected";

/**
 * Types d'entités pour Event Log
 */
export type EntityType =
  | "message_in"
  | "message_out"
  | "reservation"
  | "order"
  | "session"
  | "opt_out"
  | "live_item"
  | "payment_proof";

/**
 * Types d'acteurs pour Event Log
 */
export type ActorType = "system" | "seller" | "client";

/**
 * Schéma Zod pour validation du payload event_log
 * Architecture §430: payload JSON structuré sans PII (pas de données sensibles brutes)
 * 
 * Règles:
 * - Pas de numéros complets (logger uniquement IDs)
 * - Pas d'adresses complètes
 * - Pas de corps de message complet
 * - Uniquement IDs (message_in_id, tenant_id) et métadonnées (event_type, entity_type, provider_message_id)
 */
const eventLogPayloadSchema = z.record(z.unknown()).refine(
  (payload) => {
    // Vérifier qu'on ne logge pas de données sensibles brutes
    const payloadStr = JSON.stringify(payload).toLowerCase();
    
    // Liste de patterns à éviter (PII) - patterns plus spécifiques pour éviter faux positifs
    const sensitivePatterns = [
      // Numéros de téléphone E.164: doit commencer par + suivi de 1-3 chiffres (code pays) puis 8-15 chiffres
      // Exclure les IDs qui commencent par des lettres (ex: "msg12345678" est OK)
      /\+\d{1,3}\d{8,15}(?![a-z0-9])/,
      // Numéros de téléphone sans + mais format suspect (10+ chiffres consécutifs sans préfixe texte)
      // Exclure si précédé d'une lettre (ex: "id1234567890" est OK)
      /(?<![a-z])\d{10,}(?![a-z0-9])/,
      // Numéros de carte bancaire: format 4 groupes de 4 chiffres
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/,
      // Emails complets: format user@domain.tld (mais domain seul est OK)
      // Plus spécifique: doit avoir @ suivi d'un nom de domaine valide
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
    ];
    
    // Vérifier qu'aucun pattern sensible n'est présent
    return !sensitivePatterns.some((pattern) => pattern.test(payloadStr));
  },
  {
    message: "Payload ne doit pas contenir de données sensibles brutes (PII)",
  }
);

/**
 * Schéma Zod pour validation des paramètres logEvent()
 */
const logEventInputSchema = z.object({
  tenantId: z.string().min(1),
  eventType: z.enum([
    "webhook_received",
    "message_sent",
    "idempotent_ignored",
    "opt_out_recorded",
    "message_blocked_optout",
    "live_session_created",
    "live_session_closed",
    "live_item_created",
    "live_item_duplicate_rejected",
    "live_item_photo_linked",
    "reservation_hold",
    "reservation_released",
    "reservation_confirmed",
    "reservation_started",
    "reservation_expired",
    "waitlist_promoted",
    "reservation_reminder_sent",
    "order_created",
    "deposit_requested",
    "order.status_changed",
    "deposit_approved",
    "deposit_rejected",
  ]),
  entityType: z.enum([
    "message_in",
    "message_out",
    "reservation",
    "order",
    "session",
    "opt_out",
    "live_item",
    "payment_proof",
  ]),
  entityId: z.string().optional(),
  correlationId: z.string().min(1), // UUID ou message_sid
  actorType: z.enum(["system", "seller", "client"]),
  payload: eventLogPayloadSchema,
});

type LogEventInput = z.infer<typeof logEventInputSchema>;

/**
 * Fonction principale pour écrire un événement dans event_log
 * Architecture §9: Event Log avec correlationId pour diagnostic bout en bout
 * Architecture §11.2: Écriture rapide (< 100ms) pour ne pas bloquer webhook
 * 
 * @param input - Paramètres de l'événement à logger
 * @returns Promise<Prisma.EventLogGetPayload<{}>> - L'enregistrement créé avec types Prisma
 */
export async function logEvent(input: LogEventInput): Promise<Prisma.EventLogGetPayload<{}>> {
  // Valider les paramètres d'entrée
  const validatedInput = logEventInputSchema.parse(input);

  try {
    // Écrire dans event_log
    const eventLog = await db.eventLog.create({
      data: {
        tenantId: validatedInput.tenantId,
        eventType: validatedInput.eventType,
        entityType: validatedInput.entityType,
        entityId: validatedInput.entityId ?? null,
        correlationId: validatedInput.correlationId,
        actorType: validatedInput.actorType,
        payload: validatedInput.payload as Prisma.InputJsonValue,
      },
    });

    // Logger l'écriture pour debug (utiliser logger approprié selon contexte)
    const logger = validatedInput.eventType === "webhook_received" || validatedInput.eventType === "idempotent_ignored"
      ? webhookLogger
      : workerLogger;
    
    logger.debug("Event logged", {
      correlationId: validatedInput.correlationId,
      eventType: validatedInput.eventType,
      entityType: validatedInput.entityType,
      entityId: validatedInput.entityId,
      tenantId: validatedInput.tenantId,
    });

    return eventLog;
  } catch (error) {
    // Logger l'erreur mais ne pas faire crasher le webhook/worker
    // Architecture §11.2: gestion erreurs non bloquante
    const logger = validatedInput.eventType === "webhook_received" || validatedInput.eventType === "idempotent_ignored"
      ? webhookLogger
      : workerLogger;
    
    logger.error("Error logging event", error, {
      correlationId: validatedInput.correlationId,
      eventType: validatedInput.eventType,
      tenantId: validatedInput.tenantId,
    });

    // Re-throw pour que l'appelant puisse décider de la gestion
    throw error;
  }
}

/**
 * Helper pour logger événement webhook_received
 * Utilisé après persist MessageIn dans webhook route
 * 
 * @param tenantId - ID du tenant
 * @param messageInId - ID du MessageIn créé
 * @param correlationId - correlationId du message (propagé depuis MessageIn)
 * @param providerMessageId - MessageSid Twilio (métadonnée, pas PII)
 */
export async function logWebhookReceived(
  tenantId: string,
  messageInId: string,
  correlationId: string,
  providerMessageId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "webhook_received",
    entityType: "message_in",
    entityId: messageInId,
    correlationId,
    actorType: "system",
    payload: {
      message_in_id: messageInId,
      provider_message_id: providerMessageId, // MessageSid Twilio (métadonnée)
    },
  });
}

/**
 * Helper pour logger événement message_sent
 * Utilisé après envoi message sortant réussi dans worker outbox
 * 
 * @param tenantId - ID du tenant
 * @param messageOutId - ID du message sortant (si disponible)
 * @param correlationId - correlationId du message original (propagé depuis MessageIn)
 * @param providerMessageId - MessageSid Twilio du message sortant (métadonnée)
 */
export async function logMessageSent(
  tenantId: string,
  messageOutId: string | undefined,
  correlationId: string,
  providerMessageId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "message_sent",
    entityType: "message_out",
    entityId: messageOutId,
    correlationId,
    actorType: "system",
    payload: {
      message_out_id: messageOutId,
      provider_message_id: providerMessageId, // MessageSid Twilio (métadonnée)
    },
  });
}

/**
 * Helper pour logger événement idempotent_ignored
 * Utilisé quand doublon détecté dans webhook route (idempotence)
 * 
 * @param tenantId - ID du tenant (peut être null si tenant non résolu)
 * @param correlationId - correlationId du message dupliqué
 * @param providerMessageId - MessageSid Twilio du message dupliqué (métadonnée)
 */
export async function logIdempotentIgnored(
  tenantId: string | null,
  correlationId: string,
  providerMessageId: string,
): Promise<void> {
  // Si tenantId est null, on ne peut pas logger (contrainte NOT NULL)
  // Logger uniquement dans les logs applicatifs pour traçabilité
  if (!tenantId) {
    webhookLogger.warn("Cannot log idempotent_ignored event: tenantId is null", {
      correlationId,
      providerMessageId,
    });
    return;
  }

  await logEvent({
    tenantId,
    eventType: "idempotent_ignored",
    entityType: "message_in",
    entityId: undefined, // Pas d'entité créée (doublon ignoré)
    correlationId,
    actorType: "system",
    payload: {
      provider_message_id: providerMessageId, // MessageSid Twilio (métadonnée)
      reason: "duplicate_detected",
    },
  });
}

/**
 * Helper pour logger événement opt_out_recorded (Story 2.5)
 * Utilisé après création OptOut dans webhook-processor (détection STOP)
 *
 * @param tenantId - ID du tenant
 * @param optOutId - ID de l'OptOut créé
 * @param correlationId - correlationId du message STOP
 */
export async function logOptOutRecorded(
  tenantId: string,
  optOutId: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "opt_out_recorded",
    entityType: "opt_out",
    entityId: optOutId,
    correlationId,
    actorType: "system",
    payload: {
      opt_out_id: optOutId,
    },
  });
}

/**
 * Helper pour logger événement message_blocked_optout (Story 2.5)
 * Utilisé dans outbox-sender quand un message n'est pas envoyé car OptOut existe
 *
 * @param tenantId - ID du tenant
 * @param messageOutId - ID du MessageOut bloqué
 * @param correlationId - correlationId du message
 */
export async function logMessageBlockedOptOut(
  tenantId: string,
  messageOutId: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "message_blocked_optout",
    entityType: "message_out",
    entityId: messageOutId,
    correlationId,
    actorType: "system",
    payload: {
      message_out_id: messageOutId,
      reason: "opt_out",
    },
  });
}

/**
 * Helper pour logger événement live_session_created (Story 2.6)
 * Optionnel : appelé quand une nouvelle LiveSession est créée
 */
export async function logLiveSessionCreated(
  tenantId: string,
  liveSessionId: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "live_session_created",
    entityType: "session",
    entityId: liveSessionId,
    correlationId,
    actorType: "system",
    payload: {
      live_session_id: liveSessionId,
    },
  });
}

/**
 * Helper pour logger événement live_session_closed (Story 2.6)
 * Utilisé par le job close-inactive-live-sessions à la fermeture
 */
export async function logLiveSessionClosed(
  tenantId: string,
  liveSessionId: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "live_session_closed",
    entityType: "session",
    entityId: liveSessionId,
    correlationId,
    actorType: "system",
    payload: {
      live_session_id: liveSessionId,
    },
  });
}

/**
 * Helper pour logger événement live_item_created (Story 3.2, 3.3, 3.4)
 * Architecture §3: EventLog — création item (vendeur ou client-triggered)
 * Story 3.4: payload peut inclure quantity, available_qty, has_media pour stock préparé
 */
export async function logLiveItemCreated(
  tenantId: string,
  liveItemId: string,
  correlationId: string,
  payload: {
    code: string;
    live_session_id: string;
    quantity?: number;
    available_qty?: number;
    has_media?: boolean;
  },
  options?: { actorType?: "seller" | "client" },
): Promise<void> {
  const eventPayload: Record<string, unknown> = {
    live_item_id: liveItemId,
    code: payload.code,
    live_session_id: payload.live_session_id,
  };
  if (payload.quantity !== undefined) eventPayload.quantity = payload.quantity;
  if (payload.available_qty !== undefined) eventPayload.available_qty = payload.available_qty;
  if (payload.has_media !== undefined) eventPayload.has_media = payload.has_media;

  await logEvent({
    tenantId,
    eventType: "live_item_created",
    entityType: "live_item",
    entityId: liveItemId,
    correlationId,
    actorType: options?.actorType ?? "seller",
    payload: eventPayload,
  });
}

/**
 * Helper pour logger événement live_item_duplicate_rejected (Story 3.2)
 * Quand le vendeur renvoie un code déjà utilisé en session
 */
export async function logLiveItemDuplicateRejected(
  tenantId: string,
  code: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "live_item_duplicate_rejected",
    entityType: "live_item",
    entityId: undefined,
    correlationId,
    actorType: "seller",
    payload: {
      code,
      reason: "duplicate_in_session",
    },
  });
}

/**
 * Story 4.1: Réservation créée (Epic 4 audit trail)
 */
export async function logReservationStarted(
  tenantId: string,
  reservationId: string,
  correlationId: string,
  payload?: { live_item_id?: string; live_session_id?: string },
): Promise<void> {
  const eventPayload: Record<string, unknown> = {
    reservation_id: reservationId,
  };
  if (payload?.live_item_id) eventPayload.live_item_id = payload.live_item_id;
  if (payload?.live_session_id) eventPayload.live_session_id = payload.live_session_id;

  await logEvent({
    tenantId,
    eventType: "reservation_started",
    entityType: "reservation",
    entityId: reservationId,
    correlationId,
    actorType: "client",
    payload: eventPayload,
  });
}

/**
 * Story 3.5: Photo seule liée au dernier code dans la fenêtre 2 min
 */
export async function logLiveItemPhotoLinked(
  tenantId: string,
  liveItemId: string,
  code: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "live_item_photo_linked",
    entityType: "live_item",
    entityId: liveItemId,
    correlationId,
    actorType: "seller",
    payload: {
      live_item_id: liveItemId,
      code,
      source: "photo_alone",
    },
  });
}

/**
 * Story 4.3: Réservation expirée (TTL T=0) — job expiration
 * Payload sans PII (ids uniquement).
 */
export async function logReservationExpired(
  tenantId: string,
  reservationId: string,
  correlationId: string,
  payload?: { live_item_id?: string; live_session_id?: string },
): Promise<void> {
  const eventPayload: Record<string, unknown> = { reservation_id: reservationId };
  if (payload?.live_item_id) eventPayload.live_item_id = payload.live_item_id;
  if (payload?.live_session_id) eventPayload.live_session_id = payload.live_session_id;

  await logEvent({
    tenantId,
    eventType: "reservation_expired",
    entityType: "reservation",
    entityId: reservationId,
    correlationId,
    actorType: "system",
    payload: eventPayload,
  });
}

/**
 * Story 4.3: Premier en file promu — job promotion
 * Payload sans PII (ids uniquement).
 */
export async function logWaitlistPromoted(
  tenantId: string,
  reservationId: string,
  liveItemId: string,
  correlationId: string,
  payload?: { live_session_id?: string },
): Promise<void> {
  const eventPayload: Record<string, unknown> = {
    reservation_id: reservationId,
    live_item_id: liveItemId,
  };
  if (payload?.live_session_id) eventPayload.live_session_id = payload.live_session_id;

  await logEvent({
    tenantId,
    eventType: "waitlist_promoted",
    entityType: "reservation",
    entityId: reservationId,
    correlationId,
    actorType: "system",
    payload: eventPayload,
  });
}

/**
 * Story 4.4: Rappel T-2 min envoyé au client
 * Payload sans PII (ids uniquement).
 */
export async function logReservationReminderSent(
  tenantId: string,
  reservationId: string,
  correlationId: string,
  payload?: { live_item_id?: string; live_session_id?: string },
): Promise<void> {
  const eventPayload: Record<string, unknown> = { reservation_id: reservationId };
  if (payload?.live_item_id) eventPayload.live_item_id = payload.live_item_id;
  if (payload?.live_session_id) eventPayload.live_session_id = payload.live_session_id;

  await logEvent({
    tenantId,
    eventType: "reservation_reminder_sent",
    entityType: "reservation",
    entityId: reservationId,
    correlationId,
    actorType: "system",
    payload: eventPayload,
  });
}

/**
 * Story 4.5: Commande créée à la confirmation (OUI)
 */
export async function logOrderCreated(
  tenantId: string,
  orderId: string,
  reservationId: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "order_created",
    entityType: "order",
    entityId: orderId,
    correlationId,
    actorType: "system",
    payload: { order_id: orderId, reservation_id: reservationId },
  });
}

/**
 * Story 4.5: Demande de preuve d'acompte envoyée au client (optionnel)
 */
export async function logDepositRequested(
  tenantId: string,
  orderId: string,
  correlationId: string,
  payload?: { deposit_expires_minutes?: number },
): Promise<void> {
  const eventPayload: Record<string, unknown> = { order_id: orderId };
  if (payload?.deposit_expires_minutes != null)
    eventPayload.deposit_expires_minutes = payload.deposit_expires_minutes;
  await logEvent({
    tenantId,
    eventType: "deposit_requested",
    entityType: "order",
    entityId: orderId,
    correlationId,
    actorType: "system",
    payload: eventPayload,
  });
}

/**
 * Story 5.2: Changement de statut de commande (audit trail FR45)
 */
export async function logOrderStatusChanged(
  tenantId: string,
  orderId: string,
  correlationId: string,
  payload: { from: string; to: string },
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "order.status_changed",
    entityType: "order",
    entityId: orderId,
    correlationId,
    actorType: "seller",
    payload: { order_id: orderId, from: payload.from, to: payload.to },
  });
}

/**
 * Story 5.3: Preuve d'acompte validée (dashboard)
 */
export async function logDepositApproved(
  tenantId: string,
  orderId: string,
  proofId: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "deposit_approved",
    entityType: "order",
    entityId: orderId,
    correlationId,
    actorType: "seller",
    payload: { order_id: orderId, proof_id: proofId, decision: "approved" },
  });
}

/**
 * Story 5.3: Preuve d'acompte refusée (dashboard)
 */
export async function logDepositRejected(
  tenantId: string,
  orderId: string,
  proofId: string,
  correlationId: string,
): Promise<void> {
  await logEvent({
    tenantId,
    eventType: "deposit_rejected",
    entityType: "order",
    entityId: orderId,
    correlationId,
    actorType: "seller",
    payload: { order_id: orderId, proof_id: proofId, decision: "rejected" },
  });
}
