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

/**
 * Schema Zod pour un message individuel dans le payload webhook Meta WhatsApp Cloud API
 * Story 10.3 AC#3
 */
export const metaWebhookMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string() }).optional(),
  video: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string() }).optional(),
  document: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string(), filename: z.string().optional() }).optional(),
});

/**
 * Schema Zod pour le payload complet du webhook Meta WhatsApp Cloud API
 * Valide la structure: object "whatsapp_business_account", entry[].changes[].value
 * messages[] est optionnel (payloads status-only possibles)
 * Story 10.3 AC#3
 */
export const metaWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.literal("whatsapp"),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }),
        messages: z.array(metaWebhookMessageSchema).optional(),
        statuses: z.array(z.unknown()).optional(),
        contacts: z.array(z.unknown()).optional(),
      }),
      field: z.literal("messages"),
    })),
  })),
});
