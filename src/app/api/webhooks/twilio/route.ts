import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { TwilioAdapter } from "~/server/messaging/providers/twilio/adapter";
import { webhookProcessingQueue } from "~/server/workers/queues";
import {
  inboundMessageForQueueSchema,
} from "~/lib/zod/webhook";
import { env } from "~/env";
import { webhookLogger } from "~/lib/logger";
import { checkWebhookRateLimit, getClientIpFromRequest } from "~/lib/rate-limit";
import { captureException as sendToSentry } from "~/lib/sentry";
import {
  logWebhookReceived,
  logIdempotentIgnored,
} from "~/server/events/eventLog";

/**
 * Route webhook Twilio pour réception des messages WhatsApp entrants
 * Story 2.1 : Réception, vérification signature, idempotence, persist MessageIn, enqueue job, réponse 200 < 1 s
 *
 * Architecture §4.1 : Webhook léger sur Vercel (< 1 s)
 * Architecture §7.1 : Provider-agnostic via interface MessagingProvider
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  // Rate limiting par IP (éviter retries Twilio : 200 + log si dépassé)
  const maxPerWindow = env.WEBHOOK_RATE_LIMIT_MAX ?? 120;
  const windowMs = env.WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 60_000;
  if (!checkWebhookRateLimit(request, maxPerWindow, windowMs)) {
    const ip = getClientIpFromRequest(request);
    webhookLogger.warn("Webhook rate limit exceeded", {
      correlationId,
      ip,
      maxPerWindow,
      windowMs,
    });
    return new NextResponse("OK", { status: 200 });
  }

  webhookLogger.debug("Webhook request received", {
    correlationId,
    userAgent: request.headers.get("user-agent"),
    url: request.url,
    hasSignature: !!request.headers.get("X-Twilio-Signature"),
  });

  try {
    // 1. Lire le body une seule fois (Request ne peut être lu qu'une fois)
    const bodyText = await request.text();
    webhookLogger.debug("Body received", {
      correlationId,
      bodyLength: bodyText.length,
    });

    // Récupérer l'URL complète pour la vérification de signature
    // IMPORTANT: Twilio utilise l'URL EXACTE configurée dans la console
    // Si vous utilisez ngrok, utiliser les headers x-forwarded-* pour reconstruire l'URL réelle
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    
    let fullUrl: string;
    if (forwardedHost) {
      // Utiliser l'URL ngrok réelle (celle que Twilio voit)
      // Ne pas inclure le port pour HTTPS (443) ou HTTP (80) - ngrok expose directement
      const url = new URL(request.url);
      fullUrl = `${forwardedProto}://${forwardedHost}${url.pathname}${url.search}`;
    } else {
      // Fallback sur l'URL locale si pas de proxy
      const url = new URL(request.url);
      fullUrl = `${url.protocol}//${url.host}${url.pathname}${url.search}`;
    }
    
    webhookLogger.debug("URL for signature verification", {
      correlationId,
      fullUrl,
    });

    // 2. Vérifier la signature Twilio (avant parsing)
    if (!env.TWILIO_AUTH_TOKEN) {
      webhookLogger.error("TWILIO_AUTH_TOKEN not configured", undefined, {
        correlationId,
      });
      // Retourner 200 pour éviter retries Twilio même en cas d'erreur config
      return new NextResponse("Configuration error", { status: 200 });
    }

    const adapter = new TwilioAdapter(
      env.TWILIO_AUTH_TOKEN ?? "",
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_WHATSAPP_NUMBER,
    );
    const signatureValid = await adapter.verifySignature(
      request,
      env.TWILIO_WEBHOOK_SECRET ?? "",
      bodyText,
      fullUrl,
    );

    // En développement, permettre de continuer même si signature invalide (pour tester)
    // En production, cette vérification doit être stricte
    const isDevelopment = env.NODE_ENV === "development";
    
    if (!signatureValid) {
      webhookLogger.warn("Invalid signature", {
        correlationId,
        isDevelopment,
      });
      
      if (!isDevelopment) {
        // En production, rejeter les requêtes avec signature invalide
        webhookLogger.error("Invalid signature in production - request rejected", undefined, {
          correlationId,
        });
        return new NextResponse("Invalid signature", { status: 401 });
      }
      
      // En développement, continuer pour tester le reste du flux
      webhookLogger.debug("Development mode: continuing despite invalid signature", {
        correlationId,
      });
    } else {
      webhookLogger.debug("Signature valid", { correlationId });
    }

    // 3. Parser le body en URLSearchParams (Twilio envoie form-urlencoded)
    const formData = new URLSearchParams(bodyText);
    const normalizedMessage = adapter.parseInboundFromUrlSearchParams(formData);

    // 4. Résoudre tenantId depuis le champ "To" du webhook
    const toNumber = formData.get("To")?.toString();
    webhookLogger.debug("To number received", { correlationId, toNumber });

    if (!toNumber) {
      webhookLogger.warn("Missing To field in webhook", { correlationId });
      // Log + 200 (éviter retries)
      return new NextResponse("Missing To field", { status: 200 });
    }

    // Chercher tenant depuis whatsappPhoneNumber (Story 1.6)
    // Normaliser le numéro (enlever "whatsapp:" si présent)
    const normalizedToNumber = toNumber.replace(/^whatsapp:/, "");
    webhookLogger.debug("Resolving tenant", {
      correlationId,
      normalizedToNumber,
      originalToNumber: toNumber,
    });
    
    // Chercher avec le numéro normalisé (sans préfixe whatsapp:)
    let tenant = await db.tenant.findUnique({
      where: { whatsappPhoneNumber: normalizedToNumber },
      select: { id: true },
    });
    
    // Si pas trouvé, essayer avec le format original (avec préfixe whatsapp:)
    if (!tenant) {
      webhookLogger.debug("Trying original format with whatsapp: prefix", {
        correlationId,
        toNumber,
      });
      tenant = await db.tenant.findUnique({
        where: { whatsappPhoneNumber: toNumber },
        select: { id: true },
      });
    }

    // Mettre à jour tenantId dans le message normalisé (peut être null)
    normalizedMessage.tenantId = tenant?.id ?? null;

    if (!tenant) {
      webhookLogger.warn("Tenant not found for WhatsApp number", {
        correlationId,
        normalizedToNumber,
        toNumber,
      });
      
      // Vérifier idempotence pour messages avec tenantId null
      const existingMessageNullTenant = await db.messageIn.findFirst({
        where: {
          providerMessageId: normalizedMessage.providerMessageId,
          tenantId: null,
        },
      });

      if (existingMessageNullTenant) {
        // Doublon détecté : retourner 200 sans retraitement (FR8)
        webhookLogger.info("Duplicate message detected (null tenantId)", {
          correlationId,
          providerMessageId: normalizedMessage.providerMessageId,
        });
        
        // Logger événement idempotent_ignored (tenantId null, donc pas d'écriture event_log)
        // logIdempotentIgnored gère déjà le cas tenantId null
        await logIdempotentIgnored(
          null,
          correlationId,
          normalizedMessage.providerMessageId,
        ).catch((error) => {
          // Ne pas bloquer le webhook si event_log échoue
          webhookLogger.error("Error logging idempotent_ignored event (null tenant)", error, {
            correlationId,
          });
        });
        
        return new NextResponse("OK", { status: 200 });
      }
      
      // Persister MessageIn avec tenantId null pour traçabilité
      // Ne pas enqueuer le job car tenantId est requis pour traitement métier
      try {
        await db.messageIn.create({
          data: {
            tenantId: null,
            providerMessageId: normalizedMessage.providerMessageId,
            from: normalizedMessage.from,
            body: normalizedMessage.body,
            mediaUrl: normalizedMessage.mediaUrl,
            correlationId: normalizedMessage.correlationId,
          },
        });
        webhookLogger.info("MessageIn persisted with null tenantId for traceability", {
          correlationId,
          providerMessageId: normalizedMessage.providerMessageId,
        });
      } catch (error) {
        // Si erreur unique constraint (doublon race condition), retourner 200
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ) {
          webhookLogger.debug("Race condition duplicate with null tenantId", {
            correlationId,
            providerMessageId: normalizedMessage.providerMessageId,
          });
        } else {
          webhookLogger.error("Error persisting MessageIn with null tenantId", error, {
            correlationId,
          });
        }
      }
      
      return new NextResponse("Tenant not found", { status: 200 });
    }
    
    webhookLogger.debug("Tenant resolved", {
      correlationId,
      tenantId: tenant.id,
    });

    // 5. Vérifier idempotence : lookup (tenantId, providerMessageId)
    // À ce point, tenant est garanti non-null (on a déjà retourné si null)
    const existingMessage = await db.messageIn.findUnique({
      where: {
        tenantId_providerMessageId: {
          tenantId: tenant.id,
          providerMessageId: normalizedMessage.providerMessageId,
        },
      },
    });

    if (existingMessage) {
      // Doublon détecté : retourner 200 sans retraitement (FR8)
      webhookLogger.info("Duplicate message detected", {
        correlationId,
        providerMessageId: normalizedMessage.providerMessageId,
        tenantId: tenant.id,
      });
      
      // Logger événement idempotent_ignored (Story 2.3)
      await logIdempotentIgnored(
        tenant.id,
        correlationId,
        normalizedMessage.providerMessageId,
      ).catch((error) => {
        // Ne pas bloquer le webhook si event_log échoue
        webhookLogger.error("Error logging idempotent_ignored event", error, {
          correlationId,
        });
      });
      
      return new NextResponse("OK", { status: 200 });
    }

    // 6. Persister MessageIn
    // Utiliser correlationId = providerMessageId (ou UUID généré dans adapter)
    const messageIn = await db.messageIn.create({
      data: {
        tenantId: tenant.id,
        providerMessageId: normalizedMessage.providerMessageId,
        from: normalizedMessage.from,
        body: normalizedMessage.body,
        mediaUrl: normalizedMessage.mediaUrl,
        correlationId: normalizedMessage.correlationId,
      },
    }).catch((error: unknown) => {
      // Si erreur unique constraint (doublon race condition), retourner 200
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        webhookLogger.info("Race condition duplicate detected", {
          correlationId,
          providerMessageId: normalizedMessage.providerMessageId,
          tenantId: tenant.id,
        });
        return null; // Message déjà persisté par autre requête
      }
      throw error; // Autre erreur : propager
    });

    // Si null (doublon race condition), retourner 200
    if (!messageIn) {
      // Récupérer le message existant pour obtenir son correlationId (traçabilité correcte)
      const existingMessage = await db.messageIn.findUnique({
        where: {
          tenantId_providerMessageId: {
            tenantId: tenant.id,
            providerMessageId: normalizedMessage.providerMessageId,
          },
        },
        select: { correlationId: true },
      });

      // Logger événement idempotent_ignored pour race condition avec le correlationId du message existant
      await logIdempotentIgnored(
        tenant.id,
        existingMessage?.correlationId ?? correlationId, // Utiliser correlationId du message existant si disponible
        normalizedMessage.providerMessageId,
      ).catch((error) => {
        webhookLogger.error("Error logging idempotent_ignored event (race condition)", error, {
          correlationId: existingMessage?.correlationId ?? correlationId,
        });
      });
      return new NextResponse("OK", { status: 200 });
    }

    // 6.5. Logger événement webhook_received (Story 2.3)
    // Utiliser correlationId du MessageIn pour traçabilité bout en bout
    await logWebhookReceived(
      tenant.id,
      messageIn.id,
      messageIn.correlationId,
      normalizedMessage.providerMessageId,
    ).catch((error) => {
      // Ne pas bloquer le webhook si event_log échoue (< 1 s contrainte)
      webhookLogger.error("Error logging webhook_received event", error, {
        correlationId,
      });
    });

    // 7. Valider payload avant enqueue (tenantId requis pour traitement métier)
    const validatedPayload = inboundMessageForQueueSchema.parse(normalizedMessage);

    // 8. Enqueue job BullMQ (payload normalisé)
    // JobId pour idempotence : format tenantId-providerMessageId (BullMQ n'accepte pas : dans jobId)
    const jobId = `${tenant.id}-${normalizedMessage.providerMessageId}`;
    await webhookProcessingQueue.add("process-inbound", validatedPayload, {
      jobId, // Idempotence au niveau queue
    });
    webhookLogger.info("Job enqueued in BullMQ", {
      correlationId,
      providerMessageId: normalizedMessage.providerMessageId,
      tenantId: tenant.id,
      jobId,
    });

    // 9. Retourner 200 < 1 s
    const elapsed = Date.now() - startTime;
    webhookLogger.info("Webhook processed successfully", {
      correlationId,
      elapsedMs: elapsed,
      tenantId: tenant.id,
      providerMessageId: normalizedMessage.providerMessageId,
    });
    
    if (elapsed >= 1000) {
      webhookLogger.warn("Response time exceeds 1s threshold", {
        correlationId,
        elapsedMs: elapsed,
      });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    // Gestion erreurs : différencier erreurs attendues vs erreurs critiques
    const isCriticalError =
      error instanceof Error &&
      (error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("database") ||
        error.message.includes("redis") ||
        error.message.includes("Redis"));

    if (isCriticalError) {
      // Erreur critique système (DB down, Redis down) : logger + Sentry
      webhookLogger.error("Critical error processing webhook", error, {
        correlationId,
        errorType: "critical",
      });
      void sendToSentry(error, {
        correlationId,
        tags: { component: "webhook-twilio", errorType: "critical" },
      }).catch(() => {});
    } else {
      // Erreur attendue (validation, parsing, etc.) : logger seulement
      webhookLogger.error("Error processing webhook", error, {
        correlationId,
        errorType: "expected",
      });
    }

    // Toujours retourner 200 pour éviter retries Twilio (même pour erreurs critiques)
    // Le système d'alerte notifiera les ops pour les erreurs critiques
    return new NextResponse("Error", { status: 200 });
  }
}
