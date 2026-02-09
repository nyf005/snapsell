import { Worker, type Job } from "bullmq";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { webhookProcessingQueue } from "./queues";
import type { InboundMessage, EnrichedInboundMessage } from "../messaging/types";
import { normalizeAndValidatePhoneNumber } from "~/lib/validations/phone";
import {
  logOptOutRecorded,
  logLiveSessionCreated,
  logLiveItemCreated,
  logLiveItemDuplicateRejected,
  logLiveItemPhotoLinked,
} from "~/server/events/eventLog";
import {
  createReservation,
  getActiveReservationForClient,
  collectAddress,
} from "~/server/reservation/service";
import { addToWaitlist } from "~/server/waitlist/addToWaitlist";
import { getOrCreateCurrentSession } from "~/server/live-session/service";
import {
  createLiveItem,
  messageCodeAlreadyUsed,
  messageCodeUnknown,
  messageCodeUnknownSuggestion,
  normalizeCode,
} from "~/server/live-item/createLiveItem";
import { findLiveItemByCode } from "~/server/live-item/findLiveItemByCode";
import { getLastEditedLiveItemInWindow } from "~/server/live-item/getLastEditedLiveItemInWindow";
import { uploadMediaAndLinkToLiveItem } from "~/server/media/uploadMediaToLiveItem";
import { writeToOutbox } from "~/server/messaging/outbox";
import { createOrderFromReservation } from "~/server/order/createOrderFromReservation";

/** Story 3.5: fenêtre (2 min) pour lier une photo seule au dernier code créé/édité (export pour tests/doc) */
export const PHOTO_TO_LAST_CODE_WINDOW_MS = 2 * 60 * 1000;

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

/** Story 4.5: Détection intent « OUI » pour confirmer réservation (trim, lowercase). */
export function isConfirmOui(body: string): boolean {
  const trimmed = body.trim().toLowerCase();
  return trimmed === "oui";
}

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

/** Story 4.2 : extrait un candidat code (strict ou typo) depuis le body client */
const CLIENT_CODE_PREFIX = /^([A-Za-z]+\d+)/i;

export type ClientCodeIntent = { code: string; isTypo: boolean };

/**
 * Parse le body client en intent « code » : strict (A12) ou typo (A12A → A12).
 * Retourne { code normalisé, isTypo } ou null si pas un candidat code.
 */
export function parseClientCodeIntent(body: string): ClientCodeIntent | null {
  const trimmed = body.trim();
  if (!trimmed.length) return null;
  const match = trimmed.match(CLIENT_CODE_PREFIX);
  if (!match) return null;
  const code = normalizeCode(match[1]!);
  if (!code.length) return null;
  const isStrict = trimmed === match[1]! || trimmed === code;
  return { code, isTypo: !isStrict };
}

/** Pattern vendeur « créer item » : code seul ou "code x qte" (Story 3.2) ex. A12, A12 x1, B7 x 2 */
const SELLER_CREATE_ITEM_PATTERN = /^([A-Za-z]+\d+)(?:\s*x\s*(\d+))?$/i;

/**
 * Parse le body vendeur pour intent « créer item ».
 * @returns { code, quantity } ou null si pas un message créer item
 */
export function parseCreateItemIntent(body: string): { code: string; quantity: number } | null {
  const trimmed = body.trim();
  if (!trimmed.length) return null;
  const match = trimmed.match(SELLER_CREATE_ITEM_PATTERN);
  if (!match) return null;
  const code = match[1]!;
  const quantity = match[2] ? Math.max(1, parseInt(match[2], 10)) : 1;
  return { code, quantity };
}

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

    // Story 2.6 + 4.1 : création/réactivation session live au signal « live » ou message client non vide (pour récap/adresse)
    let liveSessionId: string | null = null;
    const clientNonEmpty =
      messageType === "client" && !isStopMessage(body) && body.trim().length > 0;
    if (tenantId && (isLiveSignal(messageType, body) || clientNonEmpty)) {
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

    // Story 3.3 + 4.1 + 4.2 : intent client « code » → lookup seul ; si trouvé → réservation ; si non → Code inconnu (pas de création)
    const clientCodeIntent = parseClientCodeIntent(body);
    if (tenantId && messageType === "client" && liveSessionId && clientCodeIntent) {
      try {
        const to = normalizePhoneNumber(from);
        const clientPhoneE164 = normalizeAndValidatePhoneNumber(to);
        const liveItem = await findLiveItemByCode(tenantId, liveSessionId, clientCodeIntent.code);

        if (!liveItem) {
          // Story 4.2 : code inexistant ou typo non résolu → message clair, ne jamais créer de LiveItem
          const msg = messageCodeUnknown(clientCodeIntent.code);
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: msg,
            correlationId,
          });
        } else if (clientCodeIntent.isTypo) {
          // Story 4.2 : typo (ex. A12A) mais code extrait (A12) existe en session → suggestion, pas de réservation
          const msg = messageCodeUnknownSuggestion(liveItem.code);
          await writeToOutbox({
            tenantId,
            to: clientPhoneE164,
            body: msg,
            correlationId,
          });
        } else {
          // Code strict et trouvé → flux 4.1/4.3 (Réservé / File #N / Épuisé)
          const free = liveItem.availableQty - liveItem.reservedQty;
          if (free <= 0) {
            const waitResult = await addToWaitlist(
              tenantId,
              liveSessionId,
              liveItem.id,
              clientPhoneE164,
              correlationId,
            );
            const body =
              waitResult.ok === true
                ? `Tu es en file #${waitResult.position}. On te prévient quand une place se libère.`
                : "Épuisé.";
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body,
              correlationId,
            });
          } else {
            const resResult = await createReservation(
              tenantId,
              liveSessionId,
              liveItem.id,
              clientPhoneE164,
              correlationId,
            );
            if (!resResult.success && resResult.reason === "exhausted") {
              await writeToOutbox({
                tenantId,
                to: clientPhoneE164,
                body: "Épuisé.",
                correlationId,
              });
            } else {
              await writeToOutbox({
                tenantId,
                to: clientPhoneE164,
                body: "Réservé. Envoie ton adresse.",
                correlationId,
              });
            }
          }
        }
      } catch (error) {
        workerLogger.error("Error findLiveItemByCode / createReservation (Story 4.1 / 4.2)", error, {
          correlationId,
          tenantId,
          body: body.trim(),
        });
      }
    }

    // Story 4.1 : intent client « adresse » (réservation en reserved → address_collected + récap + OUI)
    // Exclure tout intent code (strict ou typo) pour ne pas traiter A12 / A12A comme adresse
    if (
      tenantId &&
      messageType === "client" &&
      liveSessionId &&
      !clientCodeIntent &&
      body.trim().length > 0
    ) {
      try {
        const to = normalizePhoneNumber(from);
        const clientPhoneE164 = normalizeAndValidatePhoneNumber(to);
        const active = await getActiveReservationForClient(
          tenantId,
          liveSessionId,
          clientPhoneE164,
        );
        if (active?.status === "reserved") {
          const collectResult = await collectAddress(
            tenantId,
            liveSessionId,
            clientPhoneE164,
            body,
          );
          if (collectResult.success) {
            const { code, amountCents } = collectResult.reservation.liveItem;
            const prix =
              amountCents !== null
                ? `${Math.round(amountCents / 100).toLocaleString("fr-FR")} FCFA`
                : "—";
            const total =
              amountCents !== null
                ? `${Math.round(amountCents / 100).toLocaleString("fr-FR")} FCFA`
                : "—";
            const recap = `Récap : ${code} — ${prix} — Total : ${total}. Réponds OUI pour confirmer.`;
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: recap,
              correlationId,
            });
          }
        }
      } catch (error) {
        workerLogger.error("Error collectAddress / récap (Story 4.1)", error, {
          correlationId,
          tenantId,
        });
      }
    }

    // Story 4.5 : intent client « OUI » (réservation en address_collected → confirmation + Order + message preuve si acompte)
    if (
      tenantId &&
      messageType === "client" &&
      liveSessionId &&
      !clientCodeIntent &&
      isConfirmOui(body)
    ) {
      try {
        const to = normalizePhoneNumber(from);
        const clientPhoneE164 = normalizeAndValidatePhoneNumber(to);
        const active = await getActiveReservationForClient(
          tenantId,
          liveSessionId,
          clientPhoneE164,
        );
        if (active?.status === "address_collected") {
          const tenant = await db.tenant.findUnique({
            where: { id: tenantId },
            select: { requireDeposit: true },
          });
          const requireDeposit = tenant?.requireDeposit ?? false;
          const orderResult = await createOrderFromReservation(
            tenantId,
            active.id,
            requireDeposit,
            clientPhoneE164,
            correlationId,
          );
          if (orderResult.success) {
            const msg =
              requireDeposit
                ? "Commande enregistrée."
                : "Commande confirmée. Merci !";
            await writeToOutbox({
              tenantId,
              to: clientPhoneE164,
              body: msg,
              correlationId,
            });
          }
        }
      } catch (error) {
        workerLogger.error("Error confirm OUI / createOrder (Story 4.5)", error, {
          correlationId,
          tenantId,
        });
      }
    }

    // Story 3.2 : intent vendeur « créer item » (code ou code x qte) → createLiveItem puis réponse outbox
    if (tenantId && messageType === "seller") {
      const createItem = parseCreateItemIntent(body);
      if (createItem) {
        try {
          const result = await createLiveItem(tenantId, createItem.code, {
            quantity: createItem.quantity,
          });
          const to = normalizePhoneNumber(from);
          if (result.success) {
            await writeToOutbox({
              tenantId,
              to,
              body: `Créé : ${result.liveItem.code} (x${result.liveItem.quantity}).`,
              correlationId,
            });
            await logLiveItemCreated(tenantId, result.liveItem.id, correlationId, {
              code: result.liveItem.code,
              live_session_id: result.liveItem.liveSessionId,
              quantity: result.liveItem.quantity,
              available_qty: result.liveItem.availableQty,
              has_media: Boolean(mediaUrl),
            }).catch((err) => {
              workerLogger.error("Error logging live_item_created", err, {
                correlationId,
                tenantId,
                liveItemId: result.success ? result.liveItem.id : undefined,
              });
            });
            // Story 3.4: photo optionnelle — upload async (ne pas bloquer le worker)
            if (mediaUrl) {
              void uploadMediaAndLinkToLiveItem(
                tenantId,
                result.liveItem.id,
                mediaUrl,
                correlationId,
              ).catch((err) => {
                workerLogger.error("Error uploading media to R2 (Story 3.4)", err, {
                  correlationId,
                  tenantId,
                  liveItemId: result.liveItem.id,
                });
              });
            }
          } else if ("duplicate" in result && result.duplicate) {
            await writeToOutbox({
              tenantId,
              to,
              body: messageCodeAlreadyUsed(createItem.code),
              correlationId,
            });
            await logLiveItemDuplicateRejected(tenantId, createItem.code, correlationId).catch(
              (err) => {
                workerLogger.error("Error logging live_item_duplicate_rejected", err, {
                  correlationId,
                  tenantId,
                  code: createItem.code,
                });
              },
            );
          }
          // invalid_code : pas de réponse outbox (code vide après normalisation)
        } catch (error) {
          workerLogger.error("Error createLiveItem (Story 3.2)", error, {
            correlationId,
            tenantId,
            code: createItem.code,
          });
          // Ne pas faire échouer le job
        }
      } else if (mediaUrl) {
        // Story 3.5: photo seule — body vide ou non parseable en CODE/CODE xQTE + mediaUrl
        try {
          const lastItem = await getLastEditedLiveItemInWindow(
            tenantId,
            PHOTO_TO_LAST_CODE_WINDOW_MS,
          );
          const to = normalizePhoneNumber(from);
          if (lastItem) {
            void uploadMediaAndLinkToLiveItem(
              tenantId,
              lastItem.id,
              mediaUrl,
              correlationId,
            ).catch((err) => {
              workerLogger.error("Error uploading media to last code (Story 3.5)", err, {
                correlationId,
                tenantId,
                liveItemId: lastItem.id,
              });
            });
            await writeToOutbox({
              tenantId,
              to,
              body: `Photo ajoutée à ${lastItem.code}.`,
              correlationId,
            });
            // Event log avant fin upload (async) : si l'upload R2 échoue, l'item n'aura pas de mediaStorageKey mais l'event reste cohérent avec l'intent (story 3.4 même choix).
            await logLiveItemPhotoLinked(
              tenantId,
              lastItem.id,
              lastItem.code,
              correlationId,
            ).catch((err) => {
              workerLogger.error("Error logging live_item_photo_linked", err, {
                correlationId,
                tenantId,
                liveItemId: lastItem.id,
              });
            });
          } else {
            await writeToOutbox({
              tenantId,
              to,
              body: "Envoie d'abord CODE PRIX",
              correlationId,
            });
          }
        } catch (error) {
          workerLogger.error("Error photo seule → dernier code (Story 3.5)", error, {
            correlationId,
            tenantId,
          });
        }
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
