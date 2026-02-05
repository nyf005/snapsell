import { z } from "zod";

/**
 * Schéma Zod pour validation du payload webhook Twilio (minimum requis)
 */
export const twilioWebhookSchema = z.object({
  MessageSid: z.string(),
  From: z.string(),
  Body: z.string().optional(),
  MediaUrl0: z.string().url().optional(),
  To: z.string(),
  AccountSid: z.string().optional(),
  NumMedia: z.string().optional(),
});

/**
 * Schéma Zod pour validation du message entrant normalisé
 * Utilisé avant enqueue dans BullMQ
 * Note: tenantId peut être null si tenant non résolu (pour traçabilité)
 */
export const inboundMessageSchema = z.object({
  tenantId: z.string().min(1).nullable(),
  providerMessageId: z.string().min(1),
  from: z.string().min(1),
  body: z.string(),
  mediaUrl: z.string().url().optional(),
  correlationId: z.string().uuid(),
});

/**
 * Schéma Zod pour validation avant enqueue (tenantId requis)
 * Utilisé pour valider que le message peut être traité par le worker
 */
export const inboundMessageForQueueSchema = z.object({
  tenantId: z.string().min(1), // Requis pour enqueue
  providerMessageId: z.string().min(1),
  from: z.string().min(1),
  body: z.string(),
  mediaUrl: z.string().url().optional(),
  correlationId: z.string().uuid(),
});

export type InboundMessageInput = z.infer<typeof inboundMessageSchema>;
