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

      const urlFromRequest = (() => {
        const urlObj = new URL(req.url);
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${urlObj.search}`;
      })();
      const urlToTry = fullUrl ?? urlFromRequest;

      // Parser le body form-urlencoded en objet (Twilio signe avec ces paramètres)
      const body = bodyText ?? (await req.clone().text());
      const params: Record<string, string> = {};
      const urlSearchParams = new URLSearchParams(body);
      for (const [key, value] of urlSearchParams.entries()) {
        params[key] = value;
      }

      // Essayer d'abord l'URL fournie (ex. WEBHOOK_PUBLIC_URL), puis l'URL réelle de la requête
      const urlsToTry = urlToTry === urlFromRequest ? [urlToTry] : [urlToTry, urlFromRequest];
      for (const url of urlsToTry) {
        const isValid = twilio.validateRequest(this.authToken, signature, url, params);
        if (isValid) {
          webhookLogger.debug("Signature valid", { url });
          return true;
        }
      }

      webhookLogger.warn("Invalid signature — set WEBHOOK_PUBLIC_URL on Vercel to the exact Twilio webhook URL", {
        urlTried: urlsToTry,
        paramKeys: Object.keys(params),
      });
      return false;
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
      // Story 9.4: mediaUrl optionnel pour MMS WhatsApp (photo article)
      const createParams: Parameters<typeof this.client.messages.create>[0] = {
        from: `whatsapp:${this.whatsappNumber}`,
        to: `whatsapp:${message.to}`,
        body: message.body,
      };
      if (message.mediaUrl) {
        createParams.mediaUrl = [message.mediaUrl];
      }
      const twilioMessage = await this.client.messages.create(createParams);

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
