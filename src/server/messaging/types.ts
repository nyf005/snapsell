import type { IncomingMessage } from "node:http";

/**
 * Message entrant normalisé (provider-agnostic)
 * Le métier ne dépend jamais des types SDK BSP
 * Note: tenantId peut être null si tenant non résolu (pour traçabilité)
 */
export interface InboundMessage {
  tenantId: string | null;
  providerMessageId: string; // ex. wamid Meta
  from: string; // numéro WhatsApp expéditeur
  body: string;
  mediaUrl?: string;
  correlationId: string; // UUID ou message_sid pour traçabilité
  /** ID du bouton ou de l'option liste cliqué (messages interactifs) */
  interactiveReplyId?: string;
}

/**
 * Message enrichi avec type (vendeur vs client) - Story 2.2
 * Optionnellement liveSessionId (Story 2.6) pour futurs workers Epic 3
 */
export interface EnrichedInboundMessage extends InboundMessage {
  messageType: "seller" | "client";
  liveSessionId?: string | null;
}

/**
 * Payload interactif pour messages WhatsApp avec boutons ou liste déroulante.
 * Stocké en DB (interactivePayload JSON) et transmis au provider à l'envoi.
 */
export type InteractivePayload =
  | {
      type: "buttons";
      /** Max 3 boutons */
      buttons: Array<{
        /** ID reçu dans le webhook quand le client clique (max 256 chars) */
        id: string;
        /** Texte affiché sur le bouton (max 20 chars) */
        title: string;
      }>;
    }
  | {
      type: "list";
      /** Texte du bouton qui ouvre la liste */
      buttonLabel: string;
      /** Max 10 options */
      items: Array<{
        id: string;
        title: string;
        description?: string;
      }>;
    };

/**
 * Message sortant normalisé (provider-agnostic)
 * Le métier ne dépend jamais des types SDK BSP
 */
export interface OutboundMessage {
  tenantId: string;
  to: string; // destinataire (format E.164 normalisé)
  body: string;
  correlationId: string; // UUID ou message_sid pour traçabilité
  mediaUrl?: string; // Story 9.4: URL média ou clé R2 storage (signée à l'envoi par outbox-sender)
  /** Payload interactif optionnel (boutons ou liste). Si absent → texte brut. */
  interactive?: InteractivePayload;
}

/**
 * Résultat d'envoi depuis un provider
 */
export interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string; // ex. wamid Meta
  error?: string;
}

/**
 * Interface pour les adaptateurs de messaging providers (Meta Cloud API, etc.)
 * Architecture provider-agnostic (§7.1) : le métier ne dépend que de cette interface
 */
export interface MessagingProvider {
  /**
   * Parse le webhook du provider et retourne un message normalisé
   * @param req - Requête HTTP du webhook
   * @returns Message normalisé InboundMessage
   */
  parseInbound(req: Request | IncomingMessage): Promise<InboundMessage>;

  /**
   * Vérifie la signature du webhook pour authentifier la requête
   * @param req - Requête HTTP du webhook
   * @param secret - Secret partagé avec le provider (ex. META_APP_SECRET)
   * @param bodyText - Body de la requête en texte (optionnel, pour éviter double lecture)
   * @param fullUrl - URL complète de la requête (optionnel, pour éviter reconstruction)
   * @returns true si signature valide, false sinon
   */
  verifySignature(
    req: Request | IncomingMessage,
    secret: string,
    bodyText?: string,
    fullUrl?: string,
  ): Promise<boolean>;

  /**
   * Envoie un message sortant via le provider
   * @param message - Message normalisé OutboundMessage
   * @returns Résultat d'envoi avec providerMessageId si succès
   */
  send(message: OutboundMessage): Promise<ProviderSendResult>;
}
