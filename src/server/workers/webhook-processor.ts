import { Worker, type Job } from "bullmq";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { webhookProcessingQueue } from "./queues";
import type { InboundMessage, EnrichedInboundMessage } from "../messaging/types";
import { normalizeAndValidatePhoneNumber } from "~/lib/validations/phone";
import { logOptOutRecorded, logLiveSessionCreated } from "~/server/events/eventLog";
import { getOrCreateCurrentSession } from "~/server/live-session/service";

/**
 * Normalise un numéro de téléphone en enlevant le préfixe "whatsapp:" si présent
 * Les numéros peuvent arriver avec ou sans préfixe (ex. "+33612345678" vs "whatsapp:+33612345678")
 * Note: Ne valide pas le format E.164 (pour compatibilité avec numéros déjà en DB)
 * @param phoneNumber - Numéro à normaliser
 * @returns Numéro normalisé (sans préfixe whatsapp:)
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/^whatsapp:/i, "");
}

/** Mots-clés STOP (case-insensitive, trim) pour détection opt-out Story 2.5 */
const STOP_KEYWORDS = ["stop", "arrêt", "arret", "unsubscribe", "optout", "opt-out"];

/**
 * Détecte si le corps du message est une demande STOP (opt-out)
 * Case-insensitive, trim. Accepte ponctuation finale (stop., STOP!, arrêt.).
 */
export function isStopMessage(body: string): boolean {
  const trimmed = body.trim().toLowerCase().replace(/[.,!?]+$/, "").trim();
  return STOP_KEYWORDS.some((kw) => trimmed === kw || trimmed.startsWith(kw + " "));
}

/** Pattern « code » client : lettre(s) + chiffre(s) ex. A12, B7 (Story 2.6 Option A) */
const CLIENT_CODE_PATTERN = /^[A-Za-z]+\d+$/;

/**
 * Détecte si le message est un signal « live » : vendeur ou client avec body type code.
 * Ne pas créer de session sur STOP, messages vides ou hors contexte.
 */
export function isLiveSignal(messageType: "seller" | "client", body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed.length || isStopMessage(body)) return false;
  if (messageType === "seller") return true;
  return CLIENT_CODE_PATTERN.test(trimmed);
}

/**
 * Détermine le type de message (vendeur vs client) en vérifiant si le numéro expéditeur
 * correspond à un seller_phone du tenant
 * @param tenantId - ID du tenant
 * @param from - Numéro expéditeur (peut contenir préfixe "whatsapp:")
 * @returns "seller" si le numéro correspond à un seller_phone, "client" sinon
 */
export async function determineMessageType(
  tenantId: string | null,
  from: string,
): Promise<"seller" | "client"> {
  // Si tenantId est null, traiter comme client (pas de seller_phone possible)
  if (!tenantId) {
    workerLogger.warn("Cannot determine message type: tenantId is null", {
      from,
    });
    return "client";
  }

  // Normaliser le numéro expéditeur (enlever préfixe "whatsapp:" si présent)
  const normalizedFrom = normalizePhoneNumber(from);

  // Lookup seller_phone(s) pour le tenant
  // Note: On normalise aussi les numéros stockés en DB lors de la comparaison
  // pour gérer le cas où des numéros avec préfixe "whatsapp:" seraient stockés
  const sellerPhones = await db.sellerPhone.findMany({
    where: {
      tenantId,
    },
  });

  // Comparer avec normalisation des deux côtés pour garantir matching
  const sellerPhone = sellerPhones.find((sp) => {
    const normalizedStored = normalizePhoneNumber(sp.phoneNumber);
    return normalizedStored === normalizedFrom;
  });

  // Si seller_phone trouvé → message vendeur, sinon → message client
  return sellerPhone ? "seller" : "client";
}

/**
 * Traite un job webhook : détermine le type de message et enrichit le payload
 * 
 * Routing vendeur vs client : détermine si le message provient d'un vendeur ou d'un client
 * en comparant le numéro expéditeur avec les seller_phone(s) du tenant
 * 
 * Architecture §4.1 : Routing dans worker (pas dans webhook) pour respecter contrainte < 1s
 * Architecture §7.1 : Utilise uniquement types normalisés (InboundMessage)
 * Architecture §255 : Ne jamais traiter un message vendeur comme client
 * 
 * @param job - Job BullMQ avec payload InboundMessage
 * @returns Message enrichi avec messageType
 */
export async function processWebhookJob(
  job: Job<InboundMessage>,
): Promise<EnrichedInboundMessage> {
  const startTime = Date.now();
  const { tenantId, providerMessageId, from, body, mediaUrl, correlationId } = job.data;

  workerLogger.info("Processing webhook job", {
    correlationId,
    jobId: job.id,
    providerMessageId,
    tenantId,
    from,
  });

  try {
    // Déterminer le type de message (vendeur vs client)
    const messageType = await determineMessageType(tenantId, from);

    const processingTime = Date.now() - startTime;

    workerLogger.info("Message type determined", {
      correlationId,
      jobId: job.id,
      messageType,
      tenantId,
      from,
      processingTimeMs: processingTime,
    });

    // Story 2.5 : Détection STOP (scope tenant) — enregistrer OptOut si client envoie STOP
    if (tenantId && messageType === "client" && isStopMessage(body)) {
      try {
        const normalizedFrom = normalizePhoneNumber(from);
        const phoneE164 = normalizeAndValidatePhoneNumber(normalizedFrom);
        const existing = await db.optOut.findUnique({
          where: { tenantId_phoneNumber: { tenantId, phoneNumber: phoneE164 } },
        });
        if (!existing) {
          const optOut = await db.optOut.create({
            data: {
              tenantId,
              phoneNumber: phoneE164,
              optedOutAt: new Date(),
            },
          });
          await logOptOutRecorded(tenantId, optOut.id, correlationId).catch((err) => {
            workerLogger.error("Error logging opt_out_recorded", err, {
              correlationId,
              tenantId,
              optOutId: optOut.id,
            });
          });
          workerLogger.info("OptOut recorded (STOP)", {
            correlationId,
            tenantId,
            optOutId: optOut.id,
          });
        }
        // Idempotence : si OptOut existe déjà, ne pas créer de doublon
      } catch (error) {
        workerLogger.error("Error recording OptOut (STOP)", error, {
          correlationId,
          tenantId,
          from,
        });
        // Ne pas faire échouer le job : le message est quand même traité
      }
    }

    // Story 2.6 : création/réactivation session live au premier signal « live »
    let liveSessionId: string | null = null;
    if (tenantId && isLiveSignal(messageType, body)) {
      try {
        const session = await getOrCreateCurrentSession(tenantId);
        liveSessionId = session.id;
        if (session.created) {
          await logLiveSessionCreated(tenantId, session.id, correlationId).catch((err) => {
            workerLogger.error("Error logging live_session_created", err, {
              correlationId,
              tenantId,
              liveSessionId: session.id,
            });
          });
        }
      } catch (error) {
        workerLogger.error("Error getOrCreateCurrentSession (live session)", error, {
          correlationId,
          tenantId,
        });
        // Ne pas faire échouer le job
      }
    }

    // Enrichir le payload avec messageType et liveSessionId pour les workers suivants
    const enrichedMessage: EnrichedInboundMessage = {
      tenantId,
      providerMessageId,
      from,
      body,
      mediaUrl,
      correlationId,
      messageType,
      liveSessionId: liveSessionId ?? undefined,
    };

    // TODO Story 2.3+: Enqueue dans queue suivante ou traitement métier selon messageType
    // Pour l'instant, on retourne juste le message enrichi

    return enrichedMessage;
  } catch (error) {
    const processingTime = Date.now() - startTime;
    workerLogger.error(
      "Error processing webhook job",
      error,
      {
        correlationId,
        jobId: job.id,
        providerMessageId,
        tenantId,
        from,
        processingTimeMs: processingTime,
      },
    );
    // Re-throw pour que BullMQ gère le retry automatique
    throw error;
  }
}

export function createWebhookProcessorWorker(): Worker<InboundMessage, EnrichedInboundMessage> {
  return new Worker<InboundMessage, EnrichedInboundMessage>(
    "webhook-processing",
    processWebhookJob,
    {
      connection: webhookProcessingQueue.opts.connection,
      concurrency: 5, // Traiter jusqu'à 5 jobs en parallèle
      removeOnComplete: {
        age: 3600, // Garder 1h pour debug
        count: 1000,
      },
      removeOnFail: {
        age: 86400, // Garder 24h pour analyse
      },
    },
  );
}

/**
 * Démarre le worker webhook-processor avec gestion graceful shutdown et métriques
 * À appeler depuis un script Railway ou un processus dédié
 * @returns Objet avec worker et interval de métriques pour nettoyage au shutdown
 */
export function startWebhookProcessorWorker(): {
  worker: Worker<InboundMessage, EnrichedInboundMessage>;
  metricsInterval: NodeJS.Timeout;
} {
  const worker = createWebhookProcessorWorker();

  // Métriques: compteurs pour monitoring
  let completedJobs = 0;
  let failedJobs = 0;
  const startTime = Date.now();

  // Log métriques toutes les 100 jobs ou toutes les 5 minutes
  const METRICS_LOG_INTERVAL = 100;
  const METRICS_LOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  let lastMetricsLog = Date.now();

  const logMetrics = async () => {
    try {
      const queue = webhookProcessingQueue;
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);

      const uptime = Date.now() - startTime;
      const successRate =
        completedJobs + failedJobs > 0
          ? ((completedJobs / (completedJobs + failedJobs)) * 100).toFixed(2)
          : "0.00";

      workerLogger.info("Worker metrics", {
        queueName: "webhook-processing",
        uptimeMs: uptime,
        completedJobs,
        failedJobs,
        successRate: `${successRate}%`,
        queueDepth: {
          waiting,
          active,
          completed,
          failed,
        },
      });

      lastMetricsLog = Date.now();
    } catch (error) {
      workerLogger.error("Error logging metrics", error);
    }
  };

  worker.on("completed", (job) => {
    completedJobs++;
    workerLogger.info("Job completed", {
      jobId: job.id,
      correlationId: job.data.correlationId,
      messageType: job.returnvalue?.messageType,
    });

    // Log métriques périodiquement
    if (
      completedJobs % METRICS_LOG_INTERVAL === 0 ||
      Date.now() - lastMetricsLog > METRICS_LOG_INTERVAL_MS
    ) {
      void logMetrics();
    }
  });

  worker.on("failed", (job, err) => {
    failedJobs++;
    workerLogger.error(
      "Job failed",
      err,
      {
        jobId: job?.id,
        correlationId: job?.data?.correlationId,
        attemptsMade: job?.attemptsMade,
        attemptsRemaining: job?.opts?.attempts
          ? job.opts.attempts - (job.attemptsMade ?? 0)
          : undefined,
      },
    );

    // Log métriques périodiquement
    if (
      failedJobs % METRICS_LOG_INTERVAL === 0 ||
      Date.now() - lastMetricsLog > METRICS_LOG_INTERVAL_MS
    ) {
      void logMetrics();
    }

    // TODO: Intégration Sentry (optionnel MVP)
    // if (env.SENTRY_DSN) {
    //   Sentry.captureException(err, {
    //     tags: { component: "webhook-processor", correlationId: job?.data?.correlationId },
    //     extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
    //   });
    // }
  });

  worker.on("error", (err) => {
    workerLogger.error("Worker error", err);
    // TODO: Intégration Sentry (optionnel MVP)
    // if (env.SENTRY_DSN) {
    //   Sentry.captureException(err, { tags: { component: "webhook-processor" } });
    // }
  });

  // Log métriques au démarrage et périodiquement
  workerLogger.info("Webhook processor worker started", {
    queueName: "webhook-processing",
    concurrency: 5,
  });

  // Log métriques toutes les 5 minutes
  const metricsInterval = setInterval(() => {
    void logMetrics();
  }, METRICS_LOG_INTERVAL_MS);

  return { worker, metricsInterval };
}
