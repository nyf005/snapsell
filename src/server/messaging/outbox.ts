/**
 * Helper pour écrire dans l'outbox (MessageOut)
 * Story 2.4: Fonction utilisée par les workers métier pour préparer messages sortants
 * 
 * Architecture §4.5: Tout envoi sortant écrit d'abord dans MessageOut (outbox) avec statut pending
 */

import { z } from "zod";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import type { OutboundMessage } from "./types";

/**
 * Schéma Zod pour validation OutboundMessage
 */
const outboundMessageSchema = z.object({
  tenantId: z.string().min(1),
  to: z.string().min(1), // Format E.164 normalisé
  body: z.string().min(1),
  correlationId: z.string().min(1), // UUID ou message_sid pour traçabilité
});

/**
 * Écrit un message dans l'outbox (MessageOut) avec status pending
 * Le worker outbox-sender traitera ce message et l'enverra via MessagingProvider
 * 
 * @param message - Message normalisé OutboundMessage
 * @returns MessageOut créé avec id, status = 'pending'
 */
export async function writeToOutbox(message: OutboundMessage): Promise<{
  id: string;
  tenantId: string;
  to: string;
  body: string;
  status: string;
  attempts: number;
  correlationId: string;
  createdAt: Date;
}> {
  // Valider le message avec Zod
  const validatedMessage = outboundMessageSchema.parse(message);

  workerLogger.debug("Writing message to outbox", {
    tenantId: validatedMessage.tenantId,
    to: validatedMessage.to,
    correlationId: validatedMessage.correlationId,
  });

  try {
    // Créer MessageOut avec status pending
    const messageOut = await db.messageOut.create({
      data: {
        tenantId: validatedMessage.tenantId,
        to: validatedMessage.to,
        body: validatedMessage.body,
        status: "pending",
        attempts: 0,
        correlationId: validatedMessage.correlationId,
      },
    });

    workerLogger.info("Message written to outbox", {
      messageOutId: messageOut.id,
      tenantId: validatedMessage.tenantId,
      to: validatedMessage.to,
      correlationId: validatedMessage.correlationId,
    });

    return {
      id: messageOut.id,
      tenantId: messageOut.tenantId,
      to: messageOut.to,
      body: messageOut.body,
      status: messageOut.status,
      attempts: messageOut.attempts,
      correlationId: messageOut.correlationId,
      createdAt: messageOut.createdAt,
    };
  } catch (error) {
    workerLogger.error("Error writing message to outbox", error, {
      tenantId: validatedMessage.tenantId,
      to: validatedMessage.to,
      correlationId: validatedMessage.correlationId,
    });
    throw error;
  }
}
