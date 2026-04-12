/**
 * Worker outbox-sender pour envoi de messages sortants (Story 2.4, 10.4, 11.1)
 *
 * Architecture §4.5: Outbound messaging via outbox + retries + DLQ
 * Architecture §7.1: Provider-agnostic — MetaCloudAdapter per-tenant (credentials en DB)
 *
 * Story 11.1: Migré de polling setInterval vers pg-boss queue "outbox-send"
 * pg-boss gère retries (retryLimit: 5, retryBackoff) et DLQ (deadLetter: "outbox-dlq")
 */

import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { logMessageSent, logMessageBlockedOptOut } from "~/server/events/eventLog";
import { checkOptOut } from "~/server/messaging/optout";
import { getProviderForTenant } from "~/server/messaging/service";
import type { OutboundMessage, ProviderSendResult, InteractivePayload } from "~/server/messaging/types";
import { generateSignedR2Url } from "~/server/media/r2-signed-url";
import { boss, QUEUE, type PgBossJob } from "./queues";

/** Payload du job outbox-send */
export interface OutboundSendPayload {
  messageOutId: string;
}

/**
 * Traite un message sortant depuis l'outbox
 * @param messageOut - MessageOut à traiter
 * @returns true si succès, false si échec (pour retry)
 */
export async function processOutboundMessage(messageOut: {
  id: string;
  tenantId: string;
  to: string;
  body?: string | null;
  mediaUrl?: string | null;
  interactivePayload?: unknown;
  isTypingIndicator?: boolean;
  status: string;
  attempts: number;
  correlationId: string;
}): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  const { id, tenantId, to, body, correlationId } = messageOut;

  workerLogger.info("Processing outbound message", {
    messageOutId: id,
    tenantId,
    to,
    correlationId,
    attempts: messageOut.attempts,
  });

  try {
    // Story 2.5 + 7B.3 (FR46) : Politique STOP explicite — scope = tenant (tenant_id, phone_number).
    const optedOut = await checkOptOut(tenantId, to);
    if (optedOut) {
      await db.messageOut.update({
        where: { id },
        data: {
          status: "blocked",
          updatedAt: new Date(),
        },
      });
      await logMessageBlockedOptOut(tenantId, id, correlationId).catch((err) => {
        workerLogger.error("Error logging message_blocked_optout", err, {
          correlationId,
          tenantId,
          messageOutId: id,
        });
      });
      workerLogger.info("Message blocked (opt-out)", {
        messageOutId: id,
        tenantId,
        to,
        correlationId,
      });
      return { success: true }; // Traité (bloqué), pas de retry
    }

    // Story 10.4: Résolution per-tenant du provider Meta
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { metaPhoneNumberId: true, metaAccessToken: true },
    });

    if (!tenant?.metaPhoneNumberId || !tenant?.metaAccessToken) {
      const errorMsg = !tenant
        ? "tenant_not_found"
        : "meta_config_missing";

      workerLogger.error("Cannot send message: tenant Meta config missing", new Error(errorMsg), {
        messageOutId: id,
        tenantId,
        correlationId,
      });

      await db.messageOut.update({
        where: { id },
        data: {
          status: "failed",
          attempts: messageOut.attempts + 1,
          lastError: errorMsg,
          updatedAt: new Date(),
        },
      });

      return { success: false, error: errorMsg };
    }

    const adapter = await getProviderForTenant(tenant);
    if (!adapter) {
      const errorMsg = "Failed to instanciate messaging provider";
      await db.messageOut.update({
        where: { id },
        data: {
          status: "failed",
          attempts: messageOut.attempts + 1,
          lastError: errorMsg,
          updatedAt: new Date(),
        },
      });
      return { success: false, error: errorMsg };
    }

    // Story 9.4: si mediaUrl est une clé R2 (pas une URL), signer juste avant l'envoi
    let resolvedMediaUrl: string | undefined;
    if (messageOut.mediaUrl) {
      if (messageOut.mediaUrl.startsWith("http")) {
        resolvedMediaUrl = messageOut.mediaUrl;
      } else {
        const signedUrl = await generateSignedR2Url(messageOut.mediaUrl, correlationId);
        resolvedMediaUrl = signedUrl ?? undefined;
      }
    }

    const outboundMessage: OutboundMessage = {
      tenantId,
      to,
      body: body ?? undefined,
      correlationId,
      isTypingIndicator: !!messageOut.isTypingIndicator,
      ...(resolvedMediaUrl ? { mediaUrl: resolvedMediaUrl } : {}),
      ...(messageOut.interactivePayload
        ? { interactive: messageOut.interactivePayload as InteractivePayload }
        : {}),
    };

    // Envoyer via MessagingProvider
    const result: ProviderSendResult = await adapter.send(outboundMessage);

    if (result.success && result.providerMessageId) {
      await db.messageOut.update({
        where: { id },
        data: {
          status: "sent",
          providerMessageId: result.providerMessageId,
          updatedAt: new Date(),
        },
      });

      await logMessageSent(
        tenantId,
        id,
        correlationId,
        result.providerMessageId,
      ).catch((error) => {
        workerLogger.error("Error logging message_sent event", error, {
          correlationId,
          tenantId,
          messageOutId: id,
        });
      });

      workerLogger.info("Message sent successfully", {
        messageOutId: id,
        tenantId,
        to,
        correlationId,
        providerMessageId: result.providerMessageId,
      });

      return { success: true, providerMessageId: result.providerMessageId };
    } else {
      const newAttempts = messageOut.attempts + 1;

      await db.messageOut.update({
        where: { id },
        data: {
          status: "failed",
          attempts: newAttempts,
          lastError: result.error ?? "Unknown error",
          updatedAt: new Date(),
        },
      });

      workerLogger.warn("Message send failed", {
        messageOutId: id,
        tenantId,
        to,
        correlationId,
        attempts: newAttempts,
        error: result.error,
      });

      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const newAttempts = messageOut.attempts + 1;

    await db.messageOut.update({
      where: { id },
      data: {
        status: "failed",
        attempts: newAttempts,
        lastError: errorMessage,
        updatedAt: new Date(),
      },
    });

    workerLogger.error("Error processing outbound message", error, {
      messageOutId: id,
      tenantId,
      to,
      correlationId,
      attempts: newAttempts,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Enregistre le handler pg-boss pour la queue outbox-send.
 * À appeler après boss.start() dans le worker.
 *
 * pg-boss gère les retries (retryLimit: 5, retryBackoff: true)
 * et la DLQ (deadLetter: "outbox-dlq") automatiquement.
 */
export async function startOutboxSenderWorker(): Promise<string> {
  workerLogger.info("Outbox sender worker started (pg-boss)", {
    queueName: QUEUE.OUTBOX_SEND,
  });

  // batchSize: 1 — un seul job par batch pour isolation des erreurs/retries
  return boss.work<OutboxSendPayload>(
    QUEUE.OUTBOX_SEND,
    { localConcurrency: 3, batchSize: 1 },
    async (jobs: PgBossJob<OutboxSendPayload>[]) => {
      const job = jobs[0]!;
      const { messageOutId } = job.data;

      const messageOut = await db.messageOut.findUnique({
        where: { id: messageOutId },
      });

      if (!messageOut) {
        workerLogger.warn("MessageOut not found, skipping", {
          messageOutId,
          jobId: job.id,
        });
        return;
      }

      // Skip si déjà envoyé ou bloqué (idempotence)
      if (messageOut.status === "sent" || messageOut.status === "blocked") {
        workerLogger.debug("MessageOut already processed, skipping", {
          messageOutId,
          status: messageOut.status,
          jobId: job.id,
        });
        return;
      }

      const result = await processOutboundMessage(messageOut);

      if (!result.success) {
        // Throw pour que pg-boss gère le retry automatique
        throw new Error(result.error ?? "Outbound message failed");
      }
    },
  );
}
