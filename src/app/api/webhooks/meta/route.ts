import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { MetaCloudAdapter } from "~/server/messaging/providers/meta/adapter";
import { webhookProcessingQueue } from "~/server/workers/queues";
import { metaWebhookSchema, inboundMessageForQueueSchema } from "~/lib/zod/webhook";
import { env } from "~/env";
import { webhookLogger } from "~/lib/logger";
import { checkWebhookRateLimit, getClientIpFromRequest } from "~/lib/rate-limit";
import { captureException as sendToSentry } from "~/lib/sentry";
import {
  logWebhookReceived,
  logIdempotentIgnored,
} from "~/server/events/eventLog";

/**
 * Verification de signature HMAC-SHA256 inline
 * AVANT resolution tenant (MetaCloudAdapter requiert phoneNumberId+accessToken)
 */
function verifyMetaSignature(bodyText: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const receivedHash = signatureHeader.replace("sha256=", "");
  const calculatedHash = crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
  try {
    const a = Buffer.from(calculatedHash, "hex");
    const b = Buffer.from(receivedHash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * GET /api/webhooks/meta — Challenge verification Meta
 * Story 10.3 AC#1
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!env.META_VERIFY_TOKEN) {
    webhookLogger.error("META_VERIFY_TOKEN not configured", undefined, {});
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (mode === "subscribe" && verifyToken === env.META_VERIFY_TOKEN && challenge) {
    webhookLogger.info("Meta webhook challenge verified", { challenge });
    return new NextResponse(challenge, { status: 200 });
  }

  webhookLogger.warn("Meta webhook challenge failed", { mode: mode ?? "", verifyToken: verifyToken ?? "" });
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST /api/webhooks/meta — Reception messages entrants Meta WhatsApp
 * Story 10.3 AC#2, AC#4
 * Suit le meme pattern que la route Twilio (13 etapes)
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  // 1. Rate limiting par IP
  const maxPerWindow = env.WEBHOOK_RATE_LIMIT_MAX ?? 120;
  const windowMs = env.WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 60_000;
  if (!checkWebhookRateLimit(request, maxPerWindow, windowMs)) {
    const ip = getClientIpFromRequest(request);
    webhookLogger.warn("Meta webhook rate limit exceeded", { correlationId, ip, maxPerWindow, windowMs });
    return new NextResponse("OK", { status: 200 });
  }

  try {
    // 2. Lire le body une seule fois
    const bodyText = await request.text();

    // 3. Verifier signature HMAC-SHA256 AVANT resolution tenant
    if (!env.META_APP_SECRET) {
      webhookLogger.error("META_APP_SECRET not configured", undefined, { correlationId });
      return new NextResponse("OK", { status: 200 });
    }

    const signatureHeader = request.headers.get("X-Hub-Signature-256");
    const signatureValid = verifyMetaSignature(bodyText, signatureHeader, env.META_APP_SECRET);

    const isDevelopment = env.NODE_ENV === "development";

    if (!signatureValid) {
      webhookLogger.warn("Invalid Meta signature", { correlationId, isDevelopment });

      if (!isDevelopment) {
        return new NextResponse("Invalid signature", { status: 401 });
      }

      webhookLogger.debug("Development mode: continuing despite invalid Meta signature", { correlationId });
    }

    // 4. Parser JSON + valider avec metaWebhookSchema
    let payload: ReturnType<typeof metaWebhookSchema.parse>;
    try {
      payload = metaWebhookSchema.parse(JSON.parse(bodyText));
    } catch (parseError) {
      webhookLogger.warn("Invalid Meta webhook payload", { correlationId, error: String(parseError) });
      return new NextResponse("OK", { status: 200 });
    }

    // 5. Extraire phone_number_id pour resolver le tenant
    const phoneNumberId = payload.entry[0]?.changes[0]?.value.metadata.phone_number_id;
    if (!phoneNumberId) {
      webhookLogger.warn("Missing phone_number_id in Meta webhook", { correlationId });
      return new NextResponse("OK", { status: 200 });
    }

    // 6. Resolver tenant via metaPhoneNumberId
    const tenant = await db.tenant.findUnique({
      where: { metaPhoneNumberId: phoneNumberId },
      select: { id: true, metaPhoneNumberId: true, metaAccessToken: true },
    });

    // 7. Si pas de tenant → persist MessageIn avec tenantId null + return 200
    if (!tenant) {
      webhookLogger.warn("Tenant not found for Meta phone_number_id", { correlationId, phoneNumberId });

      // Best-effort persist TOUS les messages pour tracabilite
      const allMessages = payload.entry.flatMap(
        (e) => e.changes.flatMap((c) => c.value.messages ?? []),
      );
      for (const msg of allMessages) {
        try {
          await db.messageIn.create({
            data: {
              tenantId: null,
              providerMessageId: msg.id,
              from: msg.from,
              body: msg.text?.body ?? "",
              correlationId,
            },
          });
        } catch {
          // ignore — tracabilite best-effort (P2002 race condition inclus)
        }
      }

      return new NextResponse("OK", { status: 200 });
    }

    // 8. Creer Request clone pour parseInboundBatch()
    const requestClone = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: bodyText,
    });

    // 9. Instancier adapter + parser batch
    const adapter = new MetaCloudAdapter(tenant.metaPhoneNumberId!, tenant.metaAccessToken!);
    const messages = await adapter.parseInboundBatch(requestClone);

    // 10. Si tableau vide (status-only) → return 200
    if (messages.length === 0) {
      webhookLogger.debug("Meta webhook status-only — no messages", { correlationId });
      return new NextResponse("OK", { status: 200 });
    }

    // 11. Pour CHAQUE message du batch : idempotence → persist → log → validate → enqueue
    // Try/catch per-message pour qu'une erreur sur un message n'avorte pas le reste du batch
    for (const message of messages) {
      try {
        // Idempotence DB check
        const existingMessage = await db.messageIn.findUnique({
          where: {
            tenantId_providerMessageId: {
              tenantId: tenant.id,
              providerMessageId: message.providerMessageId,
            },
          },
        });

        if (existingMessage) {
          webhookLogger.info("Meta duplicate message detected", {
            correlationId,
            providerMessageId: message.providerMessageId,
            tenantId: tenant.id,
          });

          await logIdempotentIgnored(
            tenant.id,
            existingMessage.correlationId ?? correlationId,
            message.providerMessageId,
          ).catch((error) => {
            webhookLogger.error("Error logging idempotent_ignored event", error, { correlationId });
          });

          continue;
        }

        // Generate proper UUID correlationId for tracing (wamid is providerMessageId)
        const messageCorrelationId = crypto.randomUUID();

        // Persist MessageIn
        const messageIn = await db.messageIn.create({
          data: {
            tenantId: tenant.id,
            providerMessageId: message.providerMessageId,
            from: message.from,
            body: message.body,
            mediaUrl: message.mediaUrl,
            correlationId: messageCorrelationId,
          },
        }).catch((error: unknown) => {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2002"
          ) {
            webhookLogger.info("Meta race condition duplicate detected", {
              correlationId,
              providerMessageId: message.providerMessageId,
              tenantId: tenant.id,
            });
            return null;
          }
          throw error;
        });

        if (!messageIn) continue;

        // Log webhook_received
        await logWebhookReceived(
          tenant.id,
          messageIn.id,
          messageIn.correlationId,
          message.providerMessageId,
        ).catch((error) => {
          webhookLogger.error("Error logging webhook_received event", error, { correlationId });
        });

        // Validate + enqueue
        const normalizedMessage = {
          ...message,
          tenantId: tenant.id,
          correlationId: messageCorrelationId,
        };
        const validatedPayload = inboundMessageForQueueSchema.parse(normalizedMessage);

        const jobId = `${tenant.id}-${message.providerMessageId}`;
        await webhookProcessingQueue.add("process-inbound", validatedPayload, { jobId });

        webhookLogger.info("Meta job enqueued", {
          correlationId,
          providerMessageId: message.providerMessageId,
          tenantId: tenant.id,
          jobId,
        });
      } catch (msgError) {
        // Log per-message error but continue processing remaining messages
        webhookLogger.error("Error processing Meta message in batch", msgError, {
          correlationId,
          providerMessageId: message.providerMessageId,
          tenantId: tenant.id,
        });
      }
    }

    // 12. Check temps ecoule
    const elapsed = Date.now() - startTime;
    webhookLogger.info("Meta webhook processed", {
      correlationId,
      elapsedMs: elapsed,
      tenantId: tenant.id,
      messageCount: messages.length,
    });

    if (elapsed >= 1000) {
      webhookLogger.warn("Meta response time exceeds 1s threshold", { correlationId, elapsedMs: elapsed });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    const isCriticalError =
      error instanceof Error &&
      (error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("database") ||
        error.message.includes("redis") ||
        error.message.includes("Redis"));

    if (isCriticalError) {
      webhookLogger.error("Critical error processing Meta webhook", error, {
        correlationId,
        errorType: "critical",
      });
      void sendToSentry(error, {
        correlationId,
        tags: { component: "webhook-meta", errorType: "critical" },
      }).catch(() => {});
    } else {
      webhookLogger.error("Error processing Meta webhook", error, {
        correlationId,
        errorType: "expected",
      });
    }

    return new NextResponse("Error", { status: 200 });
  }
}
