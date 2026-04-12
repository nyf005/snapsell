/**
 * Helper pour écrire dans l'outbox (MessageOut)
 * Story 2.4: Fonction utilisée par les workers métier pour préparer messages sortants
 * 
 * Architecture §4.5: Tout envoi sortant écrit d'abord dans MessageOut (outbox) avec statut pending
 */

import { z } from "zod";
import { Client as QStashClient } from "@upstash/qstash";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { boss, QUEUE } from "~/server/workers/queues";
import { env } from "~/env";
import type { OutboundMessage } from "./types";
import { appendBranding } from "./render";

/**
 * Enqueue via QStash (production) ou pg-boss (dev/fallback).
 * QStash est event-driven, serverless-native, et gère les retries automatiquement.
 * pg-boss est utilisé comme fallback en développement local.
 */
async function enqueueOutboxSend(messageOutId: string): Promise<void> {
  if (env.QSTASH_TOKEN && env.NEXT_PUBLIC_APP_URL) {
    const client = new QStashClient({ token: env.QSTASH_TOKEN });
    const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/qstash/outbox-send`;
    const failureCallbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/qstash/outbox-dlq`;
    await client.publishJSON({
      url: callbackUrl,
      body: { messageOutId },
      retries: 5,
      failureCallback: failureCallbackUrl,
    });
  } else {
    // Fallback : pg-boss (développement local sans QStash configuré)
    await boss.send(QUEUE.OUTBOX_SEND, { messageOutId }, { singletonKey: messageOutId });
  }
}

/**
 * Schéma Zod pour validation OutboundMessage
 */
const interactiveButtonSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(20),
});

const interactivePayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("buttons"),
    buttons: z.array(interactiveButtonSchema).min(1).max(3),
  }),
  z.object({
    type: z.literal("list"),
    buttonLabel: z.string().min(1).max(20),
    items: z.array(z.object({
      id: z.string().min(1),
      title: z.string().min(1).max(24),
      description: z.string().max(72).optional(),
    })).min(1).max(10),
  }),
]);

const outboundMessageSchema = z.object({
  tenantId: z.string().min(1),
  to: z.string().min(1), // Format E.164 normalisé
  body: z.string().min(1),
  correlationId: z.string().min(1), // UUID ou message_sid pour traçabilité
  mediaUrl: z.string().min(1).optional(), // Story 9.4: clé R2 storage ou URL média
  interactive: interactivePayloadSchema.optional(),
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
  // Préserver le destinataire tel qu'il a été fourni par le flux métier.
  // Pour les réponses WhatsApp, cela évite de réécrire le wa_id reçu du provider.
  const normalizedMessage = { ...message };

  // Branding : plan Free → ajouter signature en pied de message
  const tenant = await db.tenant.findUnique({
    where: { id: normalizedMessage.tenantId },
    select: { showBranding: true },
  });
  if (tenant?.showBranding) {
    normalizedMessage.body = appendBranding(normalizedMessage.body, true);
  }

  // Valider le message avec Zod
  const validatedMessage = outboundMessageSchema.parse(normalizedMessage);

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
        mediaUrl: validatedMessage.mediaUrl ?? null,
        interactivePayload: validatedMessage.interactive ?? undefined,
        status: "pending",
        attempts: 0,
        correlationId: validatedMessage.correlationId,
      },
      select: {
        id: true,
        tenantId: true,
        to: true,
        body: true,
        status: true,
        attempts: true,
        correlationId: true,
        createdAt: true,
      },
    });

    // Enqueue via QStash (prod) ou pg-boss (dev) pour traitement immédiat
    // Si enqueueOutboxSend() échoue, le MessageOut reste en `pending` (sera traité au prochain cycle)
    try {
      await enqueueOutboxSend(messageOut.id);
    } catch (enqueueError) {
      workerLogger.warn("Failed to enqueue outbox-send job, MessageOut remains pending", {
        messageOutId: messageOut.id,
        tenantId: validatedMessage.tenantId,
        correlationId: validatedMessage.correlationId,
        error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
      });
    }

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
