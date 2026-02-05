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
  | "live_session_closed";

/**
 * Types d'entités pour Event Log
 */
export type EntityType =
  | "message_in"
  | "message_out"
  | "reservation"
  | "order"
  | "session"
  | "opt_out";

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
  ]),
  entityType: z.enum([
    "message_in",
    "message_out",
    "reservation",
    "order",
    "session",
    "opt_out",
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
