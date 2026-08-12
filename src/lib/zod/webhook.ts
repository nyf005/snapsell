import { z } from "zod";

/**
 * Schéma Zod pour validation du message entrant normalisé
 * Utilisé avant enqueue dans pg-boss
 * Note: tenantId peut être null si tenant non résolu (pour traçabilité)
 */
export const inboundMessageSchema = z.object({
  tenantId: z.string().min(1).nullable(),
  providerMessageId: z.string().min(1),
  from: z.string().min(1),
  body: z.string(),
  mediaUrl: z.string().url().optional(),
  correlationId: z.string().min(1),
  interactiveReplyId: z.string().optional(),
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
  correlationId: z.string().min(1),
  interactiveReplyId: z.string().optional(),
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
  interactive: z.object({
    type: z.string().optional(),
    button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }).optional(),
  }).passthrough().optional(),
  button: z.object({ text: z.string().optional(), payload: z.string().optional() }).passthrough().optional(),
  image: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string(), caption: z.string().optional() }).optional(),
  video: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string(), caption: z.string().optional() }).optional(),
  document: z.object({ mime_type: z.string(), sha256: z.string(), id: z.string(), filename: z.string().optional(), caption: z.string().optional() }).optional(),
});

/**
 * ── L'ENVELOPPE SE VALIDE SANS PRÉJUGER DU CONTENU ──────────────────────────
 *
 * `metaWebhookSchema` ci-dessous exige `field: "messages"`. C'est juste pour un
 * message entrant, mais c'était **le seul** schéma appliqué : tout webhook
 * portant un autre champ échouait à la validation et était jeté, avec un simple
 * avertissement et un `200` renvoyé à Meta.
 *
 * Ça n'avait pas de conséquence tant que SnapSell ne recevait que des messages.
 * Ça en aurait à l'activation de la Coexistence, qui ajoute `history`,
 * `smb_app_state_sync` et `smb_message_echoes` : les réponses envoyées par la
 * vendeuse depuis son téléphone auraient disparu sans que rien ne le signale
 * clairement.
 *
 * Cette enveloppe-ci ne valide que ce qui est commun à tous les évènements, et
 * laisse `field` libre. C'est elle qui permet d'aiguiller vers le bon
 * traitement — et de dire précisément ce qu'on ignore, plutôt que de tout
 * refuser en bloc.
 * ────────────────────────────────────────────────────────────────────────────
 */
export const metaWebhookEnvelopeSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
    }),
  ),
});

export type MetaWebhookEnvelope = z.infer<typeof metaWebhookEnvelopeSchema>;

/** Les `field` distincts portés par un payload, dans l'ordre d'apparition. */
export function extractMetaWebhookFields(envelope: MetaWebhookEnvelope): string[] {
  const seen = new Set<string>();
  for (const entry of envelope.entry) {
    for (const change of entry.changes) {
      seen.add(change.field);
    }
  }
  return [...seen];
}

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
