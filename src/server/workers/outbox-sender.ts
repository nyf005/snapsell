/**
 * Worker outbox-sender pour envoi de messages sortants (Story 2.4)
 * 
 * Architecture §4.5: Outbound messaging via outbox + retries + DLQ
 * Architecture §11.2: Workers sur Railway consomment l'outbox et envoient via Twilio
 * 
 * Pattern: Polling DB pour lire MessageOut avec status = 'pending' ou 'failed' avec next_attempt_at <= now
 * Alternative: BullMQ queue (mais polling DB plus adapté pour outbox pattern)
 */

import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { logMessageSent, logMessageBlockedOptOut } from "~/server/events/eventLog";
import { checkOptOut } from "~/server/messaging/optout";
import { TwilioAdapter } from "~/server/messaging/providers/twilio/adapter";
import type { OutboundMessage, ProviderSendResult } from "~/server/messaging/types";
import { env } from "~/env";

/**
 * Nombre maximum de retries avant DLQ (env OUTBOX_MAX_RETRIES ou défaut 5)
 */
function getMaxRetries(): number {
  return env.OUTBOX_MAX_RETRIES ?? 5;
}

/**
 * Cap backoff en ms (env OUTBOX_BACKOFF_MAX_MS ou défaut 30000)
 */
const DEFAULT_BACKOFF_MAX_MS = 30000;
function getBackoffMaxMs(): number {
  return env.OUTBOX_BACKOFF_MAX_MS ?? DEFAULT_BACKOFF_MAX_MS;
}

/**
 * Calcule le prochain attempt_at avec backoff exponentiel
 * Exemples: 1s, 2s, 4s, 8s, 16s (cap configurable, défaut 30s)
 * @param newAttempts - Nombre de tentatives après incrément (1-based)
 * @returns Date du prochain attempt
 */
function calculateNextAttemptAt(newAttempts: number): Date {
  const capMs = getBackoffMaxMs();
  const backoffMs = Math.min(
    1000 * Math.pow(2, Math.max(0, newAttempts - 1)),
    capMs,
  );
  return new Date(Date.now() + backoffMs);
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
  body: string;
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
    // Story 2.5 : Vérification STOP avant envoi — ne pas envoyer si OptOut existe (scope tenant).
    // Messages transactionnels stricts après STOP : non géré en MVP (tous bloqués) ; à définir en FR46/7B.3.
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

    // Créer adapteur Twilio
    const adapter = new TwilioAdapter(
      env.TWILIO_AUTH_TOKEN ?? "",
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_WHATSAPP_NUMBER,
    );

    // Préparer message normalisé
    const outboundMessage: OutboundMessage = {
      tenantId,
      to,
      body,
      correlationId,
    };

    // Envoyer via MessagingProvider
    const result: ProviderSendResult = await adapter.send(outboundMessage);

    if (result.success && result.providerMessageId) {
      // Succès: mettre à jour status = 'sent' et providerMessageId
      await db.messageOut.update({
        where: { id },
        data: {
          status: "sent",
          providerMessageId: result.providerMessageId,
          updatedAt: new Date(),
        },
      });

      // Logger événement message_sent (Story 2.3)
      await logMessageSent(
        tenantId,
        id,
        correlationId,
        result.providerMessageId,
      ).catch((error) => {
        // Ne pas bloquer l'envoi si event_log échoue
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
      // Échec: incrémenter attempts et calculer next_attempt_at
      const newAttempts = messageOut.attempts + 1;
      const nextAttemptAt = calculateNextAttemptAt(newAttempts);

      await db.messageOut.update({
        where: { id },
        data: {
          status: "failed",
          attempts: newAttempts,
          nextAttemptAt,
          lastError: result.error ?? "Unknown error",
          updatedAt: new Date(),
        },
      });

      workerLogger.warn("Message send failed, will retry", {
        messageOutId: id,
        tenantId,
        to,
        correlationId,
        attempts: newAttempts,
        nextAttemptAt,
        error: result.error,
      });

      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Échec: incrémenter attempts et calculer next_attempt_at
    const newAttempts = messageOut.attempts + 1;
    const nextAttemptAt = calculateNextAttemptAt(newAttempts);

    await db.messageOut.update({
      where: { id },
      data: {
        status: "failed",
        attempts: newAttempts,
        nextAttemptAt,
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
      nextAttemptAt,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Crée un DeadLetterJob après N échecs
 * @param messageOut - MessageOut qui a échoué N fois
 */
export async function createDeadLetterJob(messageOut: {
  id: string;
  tenantId: string;
  to: string;
  body: string;
  status: string;
  attempts: number;
  lastError: string | null;
  correlationId: string;
}): Promise<void> {
  const { id, tenantId, to, body, lastError, correlationId } = messageOut;

  workerLogger.warn("Creating DeadLetterJob after max retries", {
    messageOutId: id,
    tenantId,
    to,
    correlationId,
    attempts: messageOut.attempts,
  });

  try {
    await db.$transaction(async (tx) => {
      await tx.deadLetterJob.create({
        data: {
          tenantId,
          jobType: "message_out",
          payload: {
            message_out_id: id,
            to,
            body,
            correlation_id: correlationId,
          },
          errorMessage: lastError ?? "Max retries exceeded",
          attempts: messageOut.attempts,
        },
      });
      await tx.messageOut.update({
        where: { id },
        data: {
          status: "failed",
          updatedAt: new Date(),
        },
      });
    });

    workerLogger.info("DeadLetterJob created", {
      messageOutId: id,
      tenantId,
      correlationId,
    });
  } catch (error) {
    workerLogger.error("Error creating DeadLetterJob", error, {
      messageOutId: id,
      tenantId,
      correlationId,
    });
    // Ne pas re-throw: on ne veut pas bloquer le worker si DLQ échoue
  }
}

/**
 * Traite un batch de messages depuis l'outbox
 * Lit les MessageOut avec status = 'pending' ou 'failed' avec next_attempt_at <= now
 * @param batchSize - Nombre de messages à traiter par batch
 * @internal Exporté pour les tests d'intégration
 */
export async function processOutboxBatch(batchSize: number = 10): Promise<number> {
  const now = new Date();

  // Lire les messages pending ou failed avec next_attempt_at <= now
  const messagesToProcess = await db.messageOut.findMany({
    where: {
      OR: [
        { status: "pending" },
        {
          status: "failed",
          nextAttemptAt: { lte: now },
        },
      ],
    },
    take: batchSize,
    orderBy: {
      createdAt: "asc", // Traiter les plus anciens en premier
    },
  });

  if (messagesToProcess.length === 0) {
    return 0;
  }

  workerLogger.debug("Processing outbox batch", {
    batchSize: messagesToProcess.length,
  });

  let processedCount = 0;

  for (const messageOut of messagesToProcess) {
    try {
      // Claim atomique : update seulement si encore pending/failed éligible (évite double envoi en concurrence)
      const claimed = await db.messageOut.updateMany({
        where: {
          id: messageOut.id,
          OR: [
            { status: "pending" },
            { status: "failed", nextAttemptAt: { lte: now } },
          ],
        },
        data: {
          status: "sending",
          updatedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        continue; // Déjà pris par un autre worker ou plus éligible
      }

      // Traiter le message
      const result = await processOutboundMessage(messageOut);

      if (!result.success) {
        // Échec: vérifier si on a atteint MAX_RETRIES
        const updatedMessage = await db.messageOut.findUnique({
          where: { id: messageOut.id },
        });

        if (updatedMessage && updatedMessage.attempts >= getMaxRetries()) {
          // Créer DeadLetterJob après N échecs
          await createDeadLetterJob(updatedMessage);
        }
      }

      processedCount++;
    } catch (error) {
      workerLogger.error("Error processing message in batch", error, {
        messageOutId: messageOut.id,
        tenantId: messageOut.tenantId,
        correlationId: messageOut.correlationId,
      });

      // En cas d'erreur critique, remettre status = 'failed' pour retry
      await db.messageOut.update({
        where: { id: messageOut.id },
        data: {
          status: "failed",
          updatedAt: new Date(),
        },
      }).catch((updateError) => {
        workerLogger.error("Error updating message status after error", updateError, {
          messageOutId: messageOut.id,
        });
      });
    }
  }

  return processedCount;
}

/**
 * Démarre le worker outbox-sender avec polling périodique
 * @param pollIntervalMs - Intervalle de polling en millisecondes (défaut: 5s)
 * @param batchSize - Nombre de messages à traiter par batch (défaut: 10)
 * @returns Interval ID pour nettoyage au shutdown
 */
export function startOutboxSenderWorker(
  pollIntervalMs: number = 5000,
  batchSize: number = 10,
): NodeJS.Timeout {
  workerLogger.info("Outbox sender worker started", {
    pollIntervalMs,
    batchSize,
    maxRetries: getMaxRetries(),
  });

  // Traiter immédiatement au démarrage
  void processOutboxBatch(batchSize).then((count) => {
    if (count > 0) {
      workerLogger.debug("Initial batch processed", { count });
    }
  });

  // Polling périodique
  const interval = setInterval(async () => {
    try {
      const count = await processOutboxBatch(batchSize);
      if (count > 0) {
        workerLogger.debug("Batch processed", { count });
      }
    } catch (error) {
      workerLogger.error("Error in outbox polling cycle", error);
    }
  }, pollIntervalMs);

  return interval;
}

/**
 * Arrête le worker outbox-sender
 * @param interval - Interval ID retourné par startOutboxSenderWorker
 */
export function stopOutboxSenderWorker(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  workerLogger.info("Outbox sender worker stopped");
}
