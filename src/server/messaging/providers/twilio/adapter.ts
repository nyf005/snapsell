import twilio from "twilio";
import type { MessagingProvider, InboundMessage, OutboundMessage, ProviderSendResult } from "../../types";
import { twilioWebhookSchema } from "~/lib/zod/webhook";
import { randomUUID } from "node:crypto";
import { webhookLogger, workerLogger } from "~/lib/logger";
import { env } from "~/env";

/**
 * Adapteur Twilio pour MessagingProvider
 * Implémente l'interface provider-agnostic (§7.1)
 * Le métier ne dépend jamais des types SDK Twilio directement
 */
export class TwilioAdapter implements MessagingProvider {
  private readonly authToken: string;
  private readonly accountSid: string;
  private readonly whatsappNumber: string;
  private readonly client: twilio.Twilio;

  constructor(authToken: string, accountSid?: string, whatsappNumber?: string) {
    this.authToken = authToken;
    this.accountSid = accountSid ?? env.TWILIO_ACCOUNT_SID ?? "";
    this.whatsappNumber = whatsappNumber ?? env.TWILIO_WHATSAPP_NUMBER ?? "";
    
    if (!this.accountSid) {
      throw new Error("TWILIO_ACCOUNT_SID is required for TwilioAdapter");
    }
    if (!this.whatsappNumber) {
      throw new Error("TWILIO_WHATSAPP_NUMBER is required for TwilioAdapter");
    }
    
    this.client = new twilio.Twilio(this.accountSid, this.authToken);
  }

  /**
   * Vérifie la signature du webhook Twilio
   * Utilise twilio.validateRequest() avec TWILIO_AUTH_TOKEN
   * @param req - Requête HTTP
   * @param secret - Secret partagé (non utilisé pour Twilio, mais requis par interface)
   * @param bodyText - Body de la requête en texte (optionnel, sera lu si non fourni)
   * @param fullUrl - URL complète de la requête (optionnel, sera construite si non fourni)
   */
  async verifySignature(
    req: Request,
    secret: string,
    bodyText?: string,
    fullUrl?: string,
  ): Promise<boolean> {
    try {
      // Twilio envoie la signature dans le header X-Twilio-Signature
      const signature = req.headers.get("X-Twilio-Signature");
      if (!signature) {
        webhookLogger.debug("Missing X-Twilio-Signature header");
        return false;
      }

      // Construire fullUrl si non fourni
      const url =
        fullUrl ??
        (() => {
          const urlObj = new URL(req.url);
          return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${urlObj.search}`;
        })();

      // Pour validateRequest(), on doit parser le body form-urlencoded en objet
      // Twilio signe avec les paramètres parsés, pas le body brut
      const body = bodyText ?? (await req.clone().text());
      const params: Record<string, string> = {};
      
      // Parser le body form-urlencoded en objet
      const urlSearchParams = new URLSearchParams(body);
      for (const [key, value] of urlSearchParams.entries()) {
        params[key] = value;
      }

      webhookLogger.debug("Verifying signature", {
        url,
        paramCount: Object.keys(params).length,
        signaturePrefix: signature.substring(0, 20) + "...",
      });

      // Valider avec twilio.validateRequest() pour form-urlencoded standard
      // Note: validateRequestWithBody() est uniquement pour URLs avec bodySHA256
      // Pour form-urlencoded standard, utiliser validateRequest() avec params parsés
      const isValid = twilio.validateRequest(this.authToken, signature, url, params);
      
      if (!isValid) {
        webhookLogger.warn("Invalid signature", {
          url,
          hint: "Check: 1) URL in Twilio Console matches exactly, 2) TWILIO_AUTH_TOKEN is correct, 3) Body matches Twilio's",
        });
      } else {
        webhookLogger.debug("Signature valid");
      }
      
      return isValid;
    } catch (error) {
      webhookLogger.error("Error verifying signature", error);
      return false;
    }
  }

  /**
   * Parse le webhook Twilio et retourne un message normalisé
   * @param formData - FormData déjà parsé depuis la requête
   * @returns Message normalisé InboundMessage
   */
  parseInboundFromFormData(formData: FormData): InboundMessage {
    const rawPayload: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      // FormDataEntryValue peut être string ou File, convertir en string
      rawPayload[key] =
        typeof value === "string" ? value : value instanceof File ? value.name : String(value);
    }

    // Valider le payload minimum
    const payload = twilioWebhookSchema.parse(rawPayload);

    // Extraire mediaUrl si présent (Twilio peut envoyer MediaUrl0, MediaUrl1, etc.)
    const mediaUrl =
      payload.MediaUrl0 && payload.NumMedia && parseInt(payload.NumMedia) > 0
        ? payload.MediaUrl0
        : undefined;

    // Générer correlationId (UUID) pour traçabilité
    const correlationId = randomUUID();

    // Retourner message normalisé
    // Note: tenantId sera résolu dans la route webhook depuis payload.To
    return {
      tenantId: null, // Sera résolu dans la route depuis Tenant.whatsappPhoneNumber
      providerMessageId: payload.MessageSid,
      from: payload.From,
      body: payload.Body ?? "",
      mediaUrl,
      correlationId,
    };
  }

  /**
   * Parse le webhook Twilio depuis une Request (pour compatibilité interface)
   */
  async parseInbound(req: Request): Promise<InboundMessage> {
    const formData = await req.formData();
    return this.parseInboundFromFormData(formData);
  }

  /**
   * Parse depuis URLSearchParams (form-urlencoded string)
   */
  parseInboundFromUrlSearchParams(params: URLSearchParams): InboundMessage {
    const rawPayload: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      rawPayload[key] = value;
    }

    // Valider le payload minimum
    const payload = twilioWebhookSchema.parse(rawPayload);

    // Extraire mediaUrl si présent (Twilio peut envoyer MediaUrl0, MediaUrl1, etc.)
    const mediaUrl =
      payload.MediaUrl0 && payload.NumMedia && parseInt(payload.NumMedia) > 0
        ? payload.MediaUrl0
        : undefined;

    // Générer correlationId (UUID) pour traçabilité
    const correlationId = randomUUID();

    // Retourner message normalisé
    // Note: tenantId sera résolu dans la route webhook depuis payload.To
    return {
      tenantId: null, // Sera résolu dans la route depuis Tenant.whatsappPhoneNumber
      providerMessageId: payload.MessageSid,
      from: payload.From,
      body: payload.Body ?? "",
      mediaUrl,
      correlationId,
    };
  }

  /**
   * Envoie un message sortant via Twilio
   * @param message - Message normalisé OutboundMessage
   * @returns Résultat d'envoi avec providerMessageId si succès
   */
  async send(message: OutboundMessage): Promise<ProviderSendResult> {
    try {
      workerLogger.debug("Sending outbound message via Twilio", {
        tenantId: message.tenantId,
        to: message.to,
        correlationId: message.correlationId,
      });

      // Envoyer via Twilio WhatsApp API
      // Format: whatsapp:+14155238886 (from) vers whatsapp:+33612345678 (to)
      const twilioMessage = await this.client.messages.create({
        from: `whatsapp:${this.whatsappNumber}`,
        to: `whatsapp:${message.to}`,
        body: message.body,
      });

      workerLogger.info("Message sent successfully via Twilio", {
        tenantId: message.tenantId,
        to: message.to,
        correlationId: message.correlationId,
        providerMessageId: twilioMessage.sid,
      });

      return {
        success: true,
        providerMessageId: twilioMessage.sid,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      workerLogger.error("Error sending message via Twilio", error, {
        tenantId: message.tenantId,
        to: message.to,
        correlationId: message.correlationId,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
