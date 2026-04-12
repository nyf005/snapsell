/**
 * Adaptateur Meta WhatsApp Business API pour MessagingProvider
 * Architecture §7.1: Provider-agnostic via interface MessagingProvider
 *
 * Credentials per-tenant: phoneNumberId + accessToken (DB)
 * Secret global: META_APP_SECRET (env var, passe via verifySignature)
 */

import type { MessagingProvider, InboundMessage, OutboundMessage, ProviderSendResult } from "../../types";
import { webhookLogger, workerLogger } from "~/lib/logger";
import crypto from "node:crypto";
import { normalizeIncomingPhone } from "~/lib/validations/phone";

const API_VERSION = "v21.0";

const DOCUMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt"]);

function isDocumentUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return DOCUMENT_EXTENSIONS.has(pathname.slice(pathname.lastIndexOf(".")));
  } catch {
    return false;
  }
}

/**
 * MetaCloudAdapter implements MessagingProvider
 * Per-tenant: phoneNumberId + accessToken proviennent de la DB (model Tenant)
 */
export class MetaCloudAdapter implements MessagingProvider {
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor(phoneNumberId: string, accessToken: string) {
    if (!phoneNumberId) {
      throw new Error("phoneNumberId is required for MetaCloudAdapter");
    }
    if (!accessToken) {
      throw new Error("accessToken is required for MetaCloudAdapter");
    }
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
  }

  /**
   * Verifie la signature HMAC-SHA256 du webhook Meta
   * Header: X-Hub-Signature-256 = "sha256=<hex>"
   * Utilise timingSafeEqual pour eviter les timing attacks
   */
  async verifySignature(
    req: Request,
    secret: string,
    bodyText?: string,
    _fullUrl?: string,
  ): Promise<boolean> {
    try {
      const signature = req.headers.get("X-Hub-Signature-256");
      if (!signature) {
        webhookLogger.debug("Missing X-Hub-Signature-256 header");
        return false;
      }

      const receivedHash = signature.replace("sha256=", "");
      const body = bodyText ?? (await req.clone().text());

      const calculatedHash = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");

      // timingSafeEqual pour eviter timing attacks
      const a = Buffer.from(calculatedHash, "hex");
      const b = Buffer.from(receivedHash, "hex");

      if (a.length !== b.length) {
        webhookLogger.warn("Invalid Meta signature (length mismatch)");
        return false;
      }

      const isValid = crypto.timingSafeEqual(a, b);

      if (!isValid) {
        webhookLogger.warn("Invalid Meta signature");
      } else {
        webhookLogger.debug("Meta signature valid");
      }

      return isValid;
    } catch (error) {
      webhookLogger.error("Error verifying Meta signature", error);
      return false;
    }
  }

  /**
   * Parse le webhook Meta et retourne un message normalise
   * Gere batch (plusieurs messages dans 1 POST) — retourne le premier message
   * Gere les payloads status-only (pas de messages[]) — retourne InboundMessage vide
   *
   * Pour le batch complet, utiliser parseInboundBatch()
   */
  async parseInbound(req: Request): Promise<InboundMessage> {
    const messages = await this.parseInboundBatch(req);
    if (messages.length === 0) {
      // Status-only payload — pas de message utilisable
      // La route 10-3 devrait utiliser parseInboundBatch() et ignorer les tableaux vides
      webhookLogger.debug("Meta webhook status-only — no messages to parse");
      return {
        tenantId: null,
        providerMessageId: "",
        from: "",
        body: "",
        correlationId: "",
      };
    }
    return messages[0]!;
  }

  /**
   * Parse le webhook Meta et retourne TOUS les messages (batch support)
   * Meta peut envoyer N messages dans un seul POST webhook
   * Retourne [] si payload status-only (pas de messages[])
   */
  async parseInboundBatch(req: Request): Promise<InboundMessage[]> {
    try {
      const payload = await req.json();

      if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
        webhookLogger.warn("Meta webhook unexpected payload structure", {
          object: payload.object,
          hasEntry: !!payload.entry,
        });
        return [];
      }

      const results: InboundMessage[] = [];

      for (const entry of payload.entry) {
        for (const change of entry.changes ?? []) {
          const messages = change.value?.messages;
          if (!messages || !Array.isArray(messages)) {
            // Status-only ou autre notification — pas de messages
            continue;
          }

          for (const message of messages) {
            const rawFrom = (message.from as string | undefined) ?? "";
            const messageId = (message.id as string | undefined) ?? "";

            if (!rawFrom || !messageId) {
              webhookLogger.warn("Meta webhook message missing from or id", {
                from: rawFrom,
                id: messageId,
              });
              continue;
            }

            // Prefixer + pour E.164, guard double prefix
            const from = rawFrom.startsWith("+") ? rawFrom : `+${rawFrom}`;

            // Réponse interactive (bouton ou liste) — extraire l'ID et le titre
            let body = (message.text?.body as string) ?? "";
            let interactiveReplyId: string | undefined;
            if (message.type === "interactive") {
              const buttonReply = message.interactive?.button_reply as { id?: string; title?: string } | undefined;
              const listReply = message.interactive?.list_reply as { id?: string; title?: string } | undefined;
              interactiveReplyId = buttonReply?.id ?? listReply?.id;
              // body = titre affiché (pour logs) ; le routing se fait sur interactiveReplyId
              body = buttonReply?.title ?? listReply?.title ?? "";
            } else if (message.type === "button") {
              const button = message.button as { payload?: string; text?: string } | undefined;
              interactiveReplyId = button?.payload;
              body = button?.text ?? body;
            }

            // Media entrant: stocker le MEDIA_ID avec prefixe meta-media://
            // Caption (texte accompagnant la photo) → utilisé comme body si présent
            let mediaUrl: string | undefined;
            if (message.type === "image" && message.image?.id) {
              mediaUrl = `meta-media://${message.image.id}`;
              if (!body && message.image.caption) body = message.image.caption as string;
            } else if (message.type === "video" && message.video?.id) {
              mediaUrl = `meta-media://${message.video.id}`;
              if (!body && message.video.caption) body = message.video.caption as string;
            } else if (message.type === "document" && message.document?.id) {
              mediaUrl = `meta-media://${message.document.id}`;
              if (!body && message.document.caption) body = message.document.caption as string;
            }

            results.push({
              tenantId: null,
              providerMessageId: messageId,
              from,
              body,
              mediaUrl,
              correlationId: messageId,
              ...(interactiveReplyId ? { interactiveReplyId } : {}),
            });
          }
        }
      }

      return results;
    } catch (error) {
      webhookLogger.error("Error parsing Meta webhook", error);
      throw error;
    }
  }

  /**
   * Envoie un message sortant via Meta WhatsApp Business API
   * Support text + media (image avec URL publique)
   */
  /**
   * Story 9.3: Résolution d'un media ID Meta (préfixe meta-media://) en URL HTTPS téléchargeable.
   * L'API Graph Meta retourne une URL temporaire valide ~5 minutes.
   * 
   * @param mediaUrl - URL brute (meta-media://<id> ou https://...)
   * @param correlationId - Pour la traçabilité des logs
   * @returns URL HTTPS téléchargeable, ou null en cas d'échec
   */
  async resolveMediaUrl(mediaUrl: string, correlationId?: string): Promise<string | null> {
    if (!mediaUrl.startsWith("meta-media://")) {
      return mediaUrl;
    }

    const mediaId = mediaUrl.slice("meta-media://".length);
    if (!mediaId) return null;

    try {
      const res = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${mediaId}`,
        { headers: { Authorization: `Bearer ${this.accessToken}` } },
      );

      if (!res.ok) {
        return null;
      }

      const data = await res.json() as { url?: string };
      return data.url ?? null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Retourne le token d'accès brute (utilisé pour les téléchargements de fichiers Direct Fetch)
   */
  getAccessToken(): string {
    return this.accessToken;
  }

  async send(message: OutboundMessage): Promise<ProviderSendResult> {
    try {
      const recipientForMeta = normalizeIncomingPhone(message.to);
      const rawCorrelationId = message.correlationId.replace(/^typing:/, "");

      workerLogger.debug("Sending outbound message via Meta", {
        tenantId: message.tenantId,
        to: recipientForMeta,
        correlationId: rawCorrelationId,
      });

      // Update message correlationId to raw version for payload building
      const messageToShip = { ...message, correlationId: rawCorrelationId };

      return await this.sendToRecipient(messageToShip, recipientForMeta);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      workerLogger.error("Error sending message via Meta", error, {
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

  private buildRequestBody(message: OutboundMessage, recipient: string): Record<string, unknown> {
    const toNumber = recipient.replace(/^\+/, "");

    if (message.isTypingIndicator) {
      // Story 11.2: Format spécifique pour WhatsApp Cloud API
      // Note: L'indicateur est une mise à jour de statut d'un message reçu.
      // On utilise le correlationId (wamid) comme message_id.
      return {
        messaging_product: "whatsapp",
        status: "read",
        message_id: message.correlationId,
        typing_indicator: {
          type: "text",
        },
      };
    }

    if (message.mediaUrl) {
      const mediaType = isDocumentUrl(message.mediaUrl) ? "document" : "image";
      return {
        messaging_product: "whatsapp",
        to: toNumber,
        type: mediaType,
        [mediaType]: {
          link: message.mediaUrl,
          caption: message.body,
        },
      };
    }

    if (message.interactive?.type === "buttons") {
      return {
        messaging_product: "whatsapp",
        to: toNumber,
        type: "interactive",
        interactive: {
          type: "button",
          ...(message.interactive.header ? { header: { type: "text", text: message.interactive.header } } : {}),
          body: { text: message.body },
          ...(message.interactive.footer ? { footer: { text: message.interactive.footer } } : {}),
          action: {
            buttons: message.interactive.buttons.map((btn) => ({
              type: "reply",
              reply: { id: btn.id, title: btn.title },
            })),
          },
        },
      };
    }

    if (message.interactive?.type === "list") {
      return {
        messaging_product: "whatsapp",
        to: toNumber,
        type: "interactive",
        interactive: {
          type: "list",
          ...(message.interactive.header ? { header: { type: "text", text: message.interactive.header } } : {}),
          body: { text: message.body },
          ...(message.interactive.footer ? { footer: { text: message.interactive.footer } } : {}),
          action: {
            button: message.interactive.buttonLabel,
            sections: [
              {
                rows: message.interactive.items.map((item) => ({
                  id: item.id,
                  title: item.title,
                  ...(item.description ? { description: item.description } : {}),
                })),
              },
            ],
          },
        },
      };
    }

    return {
      messaging_product: "whatsapp",
      to: toNumber,
      type: "text",
      text: {
        body: message.body,
      },
    };
  }

  private async sendToRecipient(
    message: OutboundMessage,
    recipient: string,
  ): Promise<ProviderSendResult> {
    const apiUrl = `https://graph.facebook.com/${API_VERSION}/${this.phoneNumberId}/messages`;
    const requestBody = this.buildRequestBody(message, recipient);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
      const errorMessage = errorData.error?.message ?? `HTTP ${response.status}`;

      workerLogger.error("Error sending message via Meta", new Error(errorMessage), {
        tenantId: message.tenantId,
        to: recipient,
        correlationId: message.correlationId,
        status: response.status,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json() as { messages?: Array<{ id?: string }> };
    const messageId = result.messages?.[0]?.id;

    if (!messageId) {
      workerLogger.warn("No message ID in Meta response", {
        tenantId: message.tenantId,
        to: recipient,
        correlationId: message.correlationId,
      });

      return {
        success: false,
        error: "No message ID in Meta response",
      };
    }

    workerLogger.info("Message sent successfully via Meta", {
      tenantId: message.tenantId,
      to: recipient,
      correlationId: message.correlationId,
      providerMessageId: messageId,
    });

    return {
      success: true,
      providerMessageId: messageId,
    };
  }

  /**
   * Envoie un message template (hors fenetre 24h)
   * Hors scope MessagingProvider — methode bonus
   */
  async sendTemplate(
    message: OutboundMessage,
    templateName: string,
    templateParams: string[] = [],
  ): Promise<ProviderSendResult> {
    try {
      const toNumber = message.to.replace(/^\+/, "");
      const apiUrl = `https://graph.facebook.com/${API_VERSION}/${this.phoneNumberId}/messages`;

      const requestBody = {
        messaging_product: "whatsapp",
        to: toNumber,
        type: "template",
        template: {
          name: templateName,
          language: { code: "fr" },
          components: templateParams.length > 0
            ? [{
                type: "body",
                parameters: templateParams.map((param) => ({
                  type: "text",
                  text: param,
                })),
              }]
            : undefined,
        },
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        const errorMessage = errorData.error?.message ?? `HTTP ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const result = await response.json() as { messages?: Array<{ id?: string }> };
      const messageId = result.messages?.[0]?.id;

      return { success: true, providerMessageId: messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }
}
