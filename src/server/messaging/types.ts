import type { IncomingMessage } from "node:http";

/**
 * Message entrant normalisé (provider-agnostic)
 * Le métier ne dépend jamais des types SDK BSP (ex. Twilio)
 * Note: tenantId peut être null si tenant non résolu (pour traçabilité)
 */
export interface InboundMessage {
  tenantId: string | null;
  providerMessageId: string; // ex. MessageSid Twilio
  from: string; // numéro WhatsApp expéditeur
  body: string;
  mediaUrl?: string;
  correlationId: string; // UUID ou message_sid pour traçabilité
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
 * Message sortant normalisé (provider-agnostic)
 * Le métier ne dépend jamais des types SDK BSP (ex. Twilio)
 */
export interface OutboundMessage {
  tenantId: string;
  to: string; // destinataire (format E.164 normalisé)
  body: string;
  correlationId: string; // UUID ou message_sid pour traçabilité
}

/**
 * Résultat d'envoi depuis un provider
 */
export interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string; // ex. MessageSid Twilio
  error?: string;
}

/**
 * Interface pour les adaptateurs de messaging providers (Twilio, Meta Cloud API, etc.)
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
   * @param secret - Secret partagé avec le provider (ex. TWILIO_WEBHOOK_SECRET)
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
